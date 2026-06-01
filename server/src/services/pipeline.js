/**
 * Pipeline 服务 — 工作流编排引擎
 *
 * 类似 CI/CD Harness 的概念，将小说创作的各个步骤串接为可编辑、可执行的自动化流水线。
 *
 * 核心概念：
 * - Pipeline：一条完整的工作流定义（JSON 配置）
 * - Stage：流水线中的一个阶段（如"架构生成"）
 * - Step：阶段中的一个具体步骤（如"生成故事前提"）
 * - Run：一次流水线执行实例
 *
 * 数据存储：
 * - 系统级流水线模板：data/pipelines/{name}.json
 * - 项目级流水线：projects/{id}/.good/pipelines/{name}.json
 * - 执行记录：projects/{id}/.good/pipeline-runs/{runId}.json
 */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_ROOT, PROJECTS_ROOT } from '../config.js';
import { readJson, writeJson, listDir, ensureDir, exists } from '../utils/fs.js';

const SYSTEM_PIPELINES_DIR = path.join(DATA_ROOT, 'pipelines');

// ─── 内置流水线模板（供用户参考，可直接使用或复制修改） ─────

export const BUILTIN_PIPELINES = [
  {
    name: 'full-novel-generation',
    displayName: '全书自动生成',
    description: '从零开始，自动完成配置→架构→蓝图→正文→精修→定稿的全流程',
    version: '1.0.0',
    stages: [
      {
        id: 'config',
        name: '全局配置',
        description: '基于一句话灵感，AI 生成完整的小说全局配置（类型、受众、大纲、金手指等）',
        steps: [
          { id: 'generate-config', name: '一键生成配置', action: 'workflow/generate-config', params: { userIdea: '{{input.userIdea}}' }, skipIfDone: true },
        ],
      },
      {
        id: 'architecture',
        name: '架构生成',
        description: '四步流水线：故事前提→角色图谱→世界观→情节大纲，逐步构建故事骨架',
        steps: [
          { id: 'premise', name: '故事前提', action: 'workflow/architecture/premise', params: {}, skipIfDone: true },
          { id: 'characters', name: '角色图谱', action: 'workflow/architecture/characters', params: {}, dependsOn: ['premise'], skipIfDone: true },
          { id: 'worldbuilding', name: '世界观构建', action: 'workflow/architecture/worldbuilding', params: {}, dependsOn: ['premise'], skipIfDone: true },
          { id: 'synopsis', name: '情节大纲', action: 'workflow/architecture/synopsis', params: {}, dependsOn: ['characters', 'worldbuilding'], skipIfDone: true },
        ],
      },
      {
        id: 'blueprints',
        name: '章节蓝图',
        description: '按批次生成每章的细纲蓝图（标题、目的、关键事件、悬念钩子），并自动创建草稿文件',
        steps: [
          { id: 'generate-blueprints', name: '批量生成蓝图', action: 'workflow/blueprints', params: { startChapter: '{{input.startChapter || 1}}', endChapter: '{{input.endChapter || config.chapterCount}}' }, loop: { type: 'batch', batchSize: 10, from: '{{input.startChapter || 1}}', to: '{{input.endChapter || config.chapterCount}}' } },
        ],
      },
      {
        id: 'drafting',
        name: '正文生成',
        description: '逐章调用 LLM 生成正文草稿，自动衔接前文、注入蓝图指导',
        steps: [
          { id: 'draft-chapter', name: '生成草稿', action: 'workflow/draft', params: { chapterNumber: '{{loop.current}}' }, loop: { type: 'sequential', from: '{{input.startChapter || 1}}', to: '{{input.endChapter || config.chapterCount}}' } },
        ],
      },
      {
        id: 'refinement',
        name: '精修润色',
        description: '逐章对草稿进行精修：强化画面感、设定咬合、情绪张力、词汇升级',
        steps: [
          { id: 'refine-chapter', name: '精修章节', action: 'workflow/refine', params: { chapterNumber: '{{loop.current}}' }, loop: { type: 'sequential', from: '{{input.startChapter || 1}}', to: '{{input.endChapter || config.chapterCount}}' } },
        ],
      },
      {
        id: 'finalization',
        name: '定稿发布',
        description: '审稿检查一致性 → 生成章节要点 → 更新角色卡状态 → 移动为定稿 .txt',
        steps: [
          { id: 'review-chapter', name: '审稿检查', action: 'workflow/review', params: { chapterNumber: '{{loop.current}}' }, loop: { type: 'sequential', from: '{{input.startChapter || 1}}', to: '{{input.endChapter || config.chapterCount}}' }, continueOnError: true },
          { id: 'finalize-chapter', name: '定稿', action: 'workflow/finalize', params: { chapterNumber: '{{loop.current}}' }, dependsOn: ['review-chapter'], loop: { type: 'sequential', from: '{{input.startChapter || 1}}', to: '{{input.endChapter || config.chapterCount}}' } },
        ],
      },
    ],
    inputs: [
      { key: 'userIdea', label: '一句话灵感', type: 'text', required: false },
      { key: 'startChapter', label: '起始章节', type: 'number', default: 1 },
      { key: 'endChapter', label: '结束章节', type: 'number', default: null },
    ],
    settings: { pauseBetweenStages: true, pauseBetweenChapters: false, maxRetries: 2, retryDelay: 3000 },
  },
  {
    name: 'chapter-batch',
    displayName: '批量章节生成',
    description: '对指定范围的章节执行：草稿→精修→定稿',
    version: '1.0.0',
    stages: [
      {
        id: 'drafting',
        name: '正文生成',
        description: '逐章生成正文草稿',
        steps: [
          { id: 'draft-chapter', name: '生成草稿', action: 'workflow/draft', params: { chapterNumber: '{{loop.current}}' }, loop: { type: 'sequential', from: '{{input.startChapter}}', to: '{{input.endChapter}}' } },
        ],
      },
      {
        id: 'refinement',
        name: '精修',
        description: '逐章精修润色',
        steps: [
          { id: 'refine-chapter', name: '精修章节', action: 'workflow/refine', params: { chapterNumber: '{{loop.current}}' }, loop: { type: 'sequential', from: '{{input.startChapter}}', to: '{{input.endChapter}}' } },
        ],
      },
      {
        id: 'finalization',
        name: '定稿',
        description: '生成要点、更新角色卡、移动为定稿文件',
        steps: [
          { id: 'finalize-chapter', name: '定稿', action: 'workflow/finalize', params: { chapterNumber: '{{loop.current}}' }, loop: { type: 'sequential', from: '{{input.startChapter}}', to: '{{input.endChapter}}' } },
        ],
      },
    ],
    inputs: [
      { key: 'startChapter', label: '起始章节', type: 'number', required: true },
      { key: 'endChapter', label: '结束章节', type: 'number', required: true },
    ],
    settings: { pauseBetweenStages: false, maxRetries: 2, retryDelay: 3000 },
  },
  {
    name: 'architecture-only',
    displayName: '架构生成',
    description: '仅执行四步架构生成：前提→角色→世界观→大纲',
    version: '1.0.0',
    stages: [
      {
        id: 'architecture',
        name: '架构生成',
        description: '依次生成故事前提、角色图谱、世界观矩阵、情节大纲',
        steps: [
          { id: 'premise', name: '故事前提', action: 'workflow/architecture/premise', params: {} },
          { id: 'characters', name: '角色图谱', action: 'workflow/architecture/characters', params: {}, dependsOn: ['premise'] },
          { id: 'worldbuilding', name: '世界观', action: 'workflow/architecture/worldbuilding', params: {}, dependsOn: ['premise'] },
          { id: 'synopsis', name: '情节大纲', action: 'workflow/architecture/synopsis', params: {}, dependsOn: ['characters', 'worldbuilding'] },
        ],
      },
    ],
    inputs: [],
    settings: { pauseBetweenStages: false, maxRetries: 1 },
  },
];

// ─── Pipeline 加载 ───────────────────────────────────────────

function getProjectPipelinesDir(projectId) {
  return path.join(PROJECTS_ROOT, projectId, '.good', 'pipelines');
}

function getProjectRunsDir(projectId) {
  return path.join(PROJECTS_ROOT, projectId, '.good', 'pipeline-runs');
}

async function loadPipelinesFromDir(dirPath, source) {
  const pipelines = [];
  try {
    await ensureDir(dirPath);
    const entries = await listDir(dirPath);
    for (const entry of entries) {
      if (!entry.name.endsWith('.json')) continue;
      const pipeline = await readJson(path.join(dirPath, entry.name), null);
      if (pipeline && pipeline.name) {
        pipelines.push({ ...pipeline, source });
      }
    }
  } catch {}
  return pipelines;
}

/** 加载所有可用流水线（内置 + 系统自定义 + 项目级） */
export async function loadAllPipelines(projectId) {
  const systemPipelines = await loadPipelinesFromDir(SYSTEM_PIPELINES_DIR, 'system');

  // 内置作为基础，系统级可覆盖同名
  const merged = [...BUILTIN_PIPELINES.map(p => ({ ...p, source: 'builtin' }))];
  for (const sp of systemPipelines) {
    const idx = merged.findIndex(p => p.name === sp.name);
    if (idx >= 0) merged[idx] = sp;
    else merged.push(sp);
  }

  // 项目级可覆盖同名
  if (projectId) {
    const projectPipelines = await loadPipelinesFromDir(getProjectPipelinesDir(projectId), 'project');
    for (const pp of projectPipelines) {
      const idx = merged.findIndex(p => p.name === pp.name);
      if (idx >= 0) merged[idx] = pp;
      else merged.push(pp);
    }
  }

  return merged;
}

/** 获取单个流水线定义 */
export async function getPipeline(name, projectId) {
  const all = await loadAllPipelines(projectId);
  return all.find(p => p.name === name) || null;
}

/** 保存流水线（系统级或项目级） */
export async function savePipeline(pipeline, scope, projectId) {
  const dir = scope === 'project' && projectId
    ? getProjectPipelinesDir(projectId)
    : SYSTEM_PIPELINES_DIR;
  await ensureDir(dir);
  await writeJson(path.join(dir, `${pipeline.name}.json`), pipeline);
  return pipeline;
}

/** 删除流水线 */
export async function deletePipeline(name, scope, projectId) {
  const dir = scope === 'project' && projectId
    ? getProjectPipelinesDir(projectId)
    : SYSTEM_PIPELINES_DIR;
  const filePath = path.join(dir, `${name}.json`);
  if (await exists(filePath)) {
    const { unlink } = await import('node:fs/promises');
    await unlink(filePath);
    return true;
  }
  return false;
}

// ─── Pipeline Run 管理 ───────────────────────────────────────

/**
 * 创建一次新的执行实例
 */
export function createRun(pipeline, projectId, inputs = {}) {
  const runId = randomUUID();
  const now = new Date().toISOString();

  // 展开所有 stages/steps 为执行状态
  const stageStates = pipeline.stages.map(stage => ({
    id: stage.id,
    name: stage.name,
    status: 'pending', // pending | running | success | failed | skipped | paused
    steps: stage.steps.map(step => ({
      id: step.id,
      name: step.name,
      status: 'pending',
      attempts: 0,
      result: null,
      error: null,
      startedAt: null,
      completedAt: null,
      loopProgress: step.loop ? { current: null, total: null, completed: [] } : null,
    })),
    startedAt: null,
    completedAt: null,
  }));

  return {
    id: runId,
    pipelineName: pipeline.name,
    pipelineDisplayName: pipeline.displayName,
    projectId,
    status: 'pending', // pending | running | paused | success | failed | cancelled
    inputs,
    settings: { ...pipeline.settings },
    stages: stageStates,
    currentStageIndex: 0,
    currentStepIndex: 0,
    createdAt: now,
    startedAt: null,
    completedAt: null,
    logs: [],
  };
}

/** 保存执行记录 */
export async function saveRun(run) {
  const dir = getProjectRunsDir(run.projectId);
  await ensureDir(dir);
  await writeJson(path.join(dir, `${run.id}.json`), run);
  return run;
}

/** 读取执行记录 */
export async function getRun(projectId, runId) {
  const dir = getProjectRunsDir(projectId);
  return await readJson(path.join(dir, `${runId}.json`), null);
}

/** 列出项目的所有执行记录 */
export async function listRuns(projectId) {
  const dir = getProjectRunsDir(projectId);
  const runs = [];
  try {
    await ensureDir(dir);
    const entries = await listDir(dir);
    for (const entry of entries) {
      if (!entry.name.endsWith('.json')) continue;
      const run = await readJson(path.join(dir, entry.name), null);
      if (run) {
        // 返回摘要信息，不含完整 logs
        runs.push({
          id: run.id,
          pipelineName: run.pipelineName,
          pipelineDisplayName: run.pipelineDisplayName,
          status: run.status,
          currentStageIndex: run.currentStageIndex,
          totalStages: run.stages.length,
          createdAt: run.createdAt,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
        });
      }
    }
  } catch {}
  return runs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/** 删除执行记录 */
export async function deleteRun(projectId, runId) {
  const dir = getProjectRunsDir(projectId);
  const filePath = path.join(dir, `${runId}.json`);
  if (await exists(filePath)) {
    const { unlink } = await import('node:fs/promises');
    await unlink(filePath);
    return true;
  }
  return false;
}

// ─── 工具函数 ────────────────────────────────────────────────

/** 向 run 添加日志 */
export function addRunLog(run, level, message, data = null) {
  run.logs.push({
    time: new Date().toISOString(),
    level, // info | warn | error | step
    message,
    data,
  });
  // 保留最近 200 条
  if (run.logs.length > 200) {
    run.logs = run.logs.slice(-200);
  }
}

export { SYSTEM_PIPELINES_DIR, getProjectPipelinesDir, getProjectRunsDir };
