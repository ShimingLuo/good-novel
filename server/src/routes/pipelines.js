/**
 * Pipeline 路由 — 工作流管线管理与执行
 *
 * API:
 * GET    /pipelines                    列出所有流水线模板
 * GET    /pipelines/:name              获取单个流水线定义
 * POST   /pipelines                    创建/更新流水线
 * DELETE /pipelines/:name              删除流水线
 *
 * POST   /pipelines/run                启动一次执行
 * GET    /pipelines/runs/:projectId    列出项目的执行记录
 * GET    /pipelines/runs/:projectId/:runId  获取执行详情
 * POST   /pipelines/runs/:runId/pause  暂停
 * POST   /pipelines/runs/:runId/resume 恢复
 * POST   /pipelines/runs/:runId/cancel 取消
 * DELETE /pipelines/runs/:projectId/:runId  删除记录
 * GET    /pipelines/active             列出活跃执行
 */
import { Router } from 'express';
import {
  loadAllPipelines,
  getPipeline,
  savePipeline,
  deletePipeline,
  createRun,
  saveRun,
  getRun,
  listRuns,
  deleteRun,
} from '../services/pipeline.js';
import executor from '../services/pipeline-executor.js';

const router = Router();

// ─── 流水线模板 CRUD ─────────────────────────────────────────

/** 列出所有流水线 */
router.get('/', async (req, res, next) => {
  try {
    const { projectId } = req.query;
    const pipelines = await loadAllPipelines(projectId);
    res.json(pipelines);
  } catch (err) { next(err); }
});

/** 获取单个流水线 */
router.get('/detail/:name', async (req, res, next) => {
  try {
    const { projectId } = req.query;
    const pipeline = await getPipeline(req.params.name, projectId);
    if (!pipeline) return res.status(404).json({ error: '流水线不存在' });
    res.json(pipeline);
  } catch (err) { next(err); }
});

/** 创建/更新流水线 */
router.post('/', async (req, res, next) => {
  try {
    const { pipeline, scope, projectId } = req.body;
    if (!pipeline || !pipeline.name) {
      return res.status(400).json({ error: 'pipeline.name required' });
    }
    const saved = await savePipeline(pipeline, scope || 'system', projectId);
    res.json(saved);
  } catch (err) { next(err); }
});

/** 删除流水线 */
router.delete('/:name', async (req, res, next) => {
  try {
    const { scope, projectId } = req.query;
    const ok = await deletePipeline(req.params.name, scope || 'system', projectId);
    res.json({ deleted: ok });
  } catch (err) { next(err); }
});

// ─── 执行管理 ────────────────────────────────────────────────

/** 启动执行 */
router.post('/run', async (req, res, next) => {
  try {
    const { pipelineName, projectId, inputs } = req.body;
    if (!pipelineName || !projectId) {
      return res.status(400).json({ error: 'pipelineName and projectId required' });
    }

    const pipeline = await getPipeline(pipelineName, projectId);
    if (!pipeline) {
      return res.status(404).json({ error: `流水线 "${pipelineName}" 不存在` });
    }

    const run = createRun(pipeline, projectId, inputs || {});
    await saveRun(run);

    // 异步启动执行（不阻塞响应）
    executor.start(run).catch(err => {
      console.error(`[pipeline] run ${run.id} error:`, err);
    });

    res.json({ runId: run.id, status: run.status });
  } catch (err) { next(err); }
});

/** 列出项目的执行记录 */
router.get('/runs/:projectId', async (req, res, next) => {
  try {
    const runs = await listRuns(req.params.projectId);
    res.json(runs);
  } catch (err) { next(err); }
});

/** 获取执行详情 */
router.get('/runs/:projectId/:runId', async (req, res, next) => {
  try {
    // 优先从活跃执行中获取（实时状态）
    const active = executor.getActiveRun(req.params.runId);
    if (active) return res.json(active);

    const run = await getRun(req.params.projectId, req.params.runId);
    if (!run) return res.status(404).json({ error: '执行记录不存在' });
    res.json(run);
  } catch (err) { next(err); }
});

/** 暂停 */
router.post('/runs/:runId/pause', (req, res) => {
  executor.pause(req.params.runId);
  res.json({ ok: true });
});

/** 恢复 */
router.post('/runs/:runId/resume', async (req, res) => {
  await executor.resume(req.params.runId);
  res.json({ ok: true });
});

/** 取消 */
router.post('/runs/:runId/cancel', (req, res) => {
  executor.cancel(req.params.runId);
  res.json({ ok: true });
});

/** 删除执行记录 */
router.delete('/runs/:projectId/:runId', async (req, res, next) => {
  try {
    const ok = await deleteRun(req.params.projectId, req.params.runId);
    res.json({ deleted: ok });
  } catch (err) { next(err); }
});

/** 继续执行（从中断处恢复已持久化的 run） */
router.post('/runs/:projectId/:runId/continue', async (req, res, next) => {
  try {
    const { projectId, runId } = req.params;

    // 检查是否已在活跃执行中
    const active = executor.getActiveRun(runId);
    if (active) {
      // 如果是暂停状态，直接恢复
      if (active.status === 'paused') {
        await executor.resume(runId);
        return res.json({ ok: true, action: 'resumed' });
      }
      return res.status(400).json({ error: '该执行正在运行中' });
    }

    // 从磁盘加载 run 记录
    const run = await getRun(projectId, runId);
    if (!run) return res.status(404).json({ error: '执行记录不存在' });

    // 只允许继续 paused / failed / running（意外中断）状态的 run
    if (!['paused', 'failed', 'running'].includes(run.status)) {
      return res.status(400).json({ error: `状态为 "${run.status}" 的执行无法继续` });
    }

    // 重新启动执行（executor 会从 currentStageIndex 继续）
    run.status = 'running';
    run.completedAt = null;
    await saveRun(run);

    executor.start(run).catch(err => {
      console.error(`[pipeline] continue run ${run.id} error:`, err);
    });

    res.json({ ok: true, action: 'continued', runId: run.id });
  } catch (err) { next(err); }
});

/** 列出活跃执行 */
router.get('/active', (_req, res) => {
  res.json(executor.listActiveRuns());
});

export default router;
