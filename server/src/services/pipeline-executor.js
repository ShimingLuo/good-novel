/**
 * Pipeline 执行器 — 负责实际运行流水线
 *
 * 执行逻辑：
 * 1. 按 stage 顺序执行
 * 2. stage 内按 step 顺序执行（尊重 dependsOn）
 * 3. 支持 loop（批量/顺序循环）
 * 4. 支持暂停/恢复/取消
 * 5. 支持重试
 * 6. 通过 EventEmitter 发送实时状态更新
 */
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { readJson, readText, writeText, ensureDir } from '../utils/fs.js';
import { callLLM, streamLLM } from './llm.js';
import { renderProjectPrompt } from './prompts.js';
import {
  getProjectDir,
  getDraftsDir,
  getNotesDir,
  getMetaPath,
  listAllChapters,
} from '../utils/paths.js';
import { saveRun, addRunLog, BUILTIN_PIPELINES } from './pipeline.js';

class PipelineExecutor extends EventEmitter {
  constructor() {
    super();
    this.activeRuns = new Map(); // runId -> { run, controller }
    this._builtinPipelines = BUILTIN_PIPELINES;
  }

  /** 启动一次流水线执行 */
  async start(run) {
    const controller = { paused: false, cancelled: false };
    this.activeRuns.set(run.id, { run, controller });

    // 加载完整 pipeline 定义以便查找 step 配置
    const { getPipeline } = await import('./pipeline.js');
    const pipelineDef = await getPipeline(run.pipelineName, run.projectId);
    if (pipelineDef) {
      run._pipelineDef = pipelineDef;
    }

    const isResume = run.startedAt != null;
    run.status = 'running';
    if (!run.startedAt) run.startedAt = new Date().toISOString();

    if (isResume) {
      const currentStage = run.stages[run.currentStageIndex];
      addRunLog(run, 'info', `🔄 流水线继续执行: ${run.pipelineDisplayName}（从阶段 ${run.currentStageIndex + 1}/${run.stages.length}「${currentStage?.name || ''}」恢复）`);
    } else {
      addRunLog(run, 'info', `🚀 流水线开始执行: ${run.pipelineDisplayName}（共 ${run.stages.length} 个阶段）`);
    }
    await saveRun(run);
    this.emit('update', run);

    try {
      await this._executeStages(run, controller);

      if (controller.cancelled) {
        run.status = 'cancelled';
        addRunLog(run, 'info', '⊘ 流水线已取消');
      } else if (run.stages.some(s => s.status === 'failed')) {
        run.status = 'failed';
        const failedStage = run.stages.find(s => s.status === 'failed');
        addRunLog(run, 'error', `✗ 流水线执行失败（失败阶段: ${failedStage?.name || '未知'}）`);
      } else {
        run.status = 'success';
        const elapsed = run.startedAt ? Math.round((Date.now() - new Date(run.startedAt).getTime()) / 1000) : 0;
        addRunLog(run, 'info', `✓ 流水线执行完成，总耗时 ${elapsed}s`);
      }
    } catch (err) {
      run.status = 'failed';
      addRunLog(run, 'error', `流水线异常: ${err.message}`);
    }

    run.completedAt = new Date().toISOString();
    await saveRun(run);
    this.emit('update', run);
    this.emit('complete', run);
    this.activeRuns.delete(run.id);
    return run;
  }

  /** 暂停执行 */
  pause(runId) {
    const entry = this.activeRuns.get(runId);
    if (entry) {
      entry.controller.paused = true;
      entry.run.status = 'paused';
      const currentStage = entry.run.stages[entry.run.currentStageIndex];
      addRunLog(entry.run, 'info', `⏸ 流水线已暂停（当前阶段: ${currentStage?.name || '未知'}）`);
      saveRun(entry.run);
      this.emit('update', entry.run);
    }
  }

  /** 恢复执行 */
  async resume(runId) {
    const entry = this.activeRuns.get(runId);
    if (entry && entry.controller.paused) {
      entry.controller.paused = false;
      entry.run.status = 'running';
      const currentStage = entry.run.stages[entry.run.currentStageIndex];
      addRunLog(entry.run, 'info', `▶ 流水线已恢复（继续阶段: ${currentStage?.name || '未知'}）`);
      await saveRun(entry.run);
      this.emit('update', entry.run);
    }
  }

  /** 取消执行 */
  cancel(runId) {
    const entry = this.activeRuns.get(runId);
    if (entry) {
      entry.controller.cancelled = true;
      entry.controller.paused = false; // 解除暂停以便退出循环
      entry.run.status = 'cancelled';
      const currentStage = entry.run.stages[entry.run.currentStageIndex];
      addRunLog(entry.run, 'info', `⊘ 流水线取消中...（当前阶段: ${currentStage?.name || '未知'}）`);
      saveRun(entry.run);
      this.emit('update', entry.run);
    }
  }

  /** 获取活跃执行状态 */
  getActiveRun(runId) {
    const entry = this.activeRuns.get(runId);
    return entry ? entry.run : null;
  }

  /** 列出所有活跃执行 */
  listActiveRuns() {
    return Array.from(this.activeRuns.values()).map(e => ({
      id: e.run.id,
      pipelineName: e.run.pipelineName,
      status: e.run.status,
      projectId: e.run.projectId,
    }));
  }

  // ─── 内部执行逻辑 ────────────────────────────────────────

  async _executeStages(run, controller) {
    for (let i = run.currentStageIndex; i < run.stages.length; i++) {
      if (controller.cancelled) return;
      await this._waitIfPaused(controller);

      run.currentStageIndex = i;
      const stage = run.stages[i];

      // 如果是恢复执行且该阶段已完成，跳过
      if (stage.status === 'success') {
        addRunLog(run, 'info', `⏭ 阶段跳过（已完成）: [${i + 1}/${run.stages.length}] ${stage.name}`);
        continue;
      }

      stage.status = 'running';
      stage.startedAt = stage.startedAt || new Date().toISOString();
      addRunLog(run, 'info', `▶ 阶段开始: [${i + 1}/${run.stages.length}] ${stage.name}（${stage.steps.length} 个步骤）`);
      await saveRun(run);
      this.emit('update', run);

      try {
        await this._executeSteps(run, stage, controller);
        stage.status = stage.steps.some(s => s.status === 'failed') ? 'failed' : 'success';
      } catch (err) {
        stage.status = 'failed';
        addRunLog(run, 'error', `✗ 阶段异常: [${i + 1}/${run.stages.length}] ${stage.name} - ${err.message}`);
      }

      stage.completedAt = new Date().toISOString();
      const elapsed = Math.round((new Date(stage.completedAt) - new Date(stage.startedAt)) / 1000);
      addRunLog(run, 'info', `${stage.status === 'success' ? '✓' : '✗'} 阶段完成: [${i + 1}/${run.stages.length}] ${stage.name}（耗时 ${elapsed}s）`);
      await saveRun(run);
      this.emit('update', run);

      // 阶段间暂停
      if (run.settings.pauseBetweenStages && i < run.stages.length - 1 && !controller.cancelled) {
        run.status = 'paused';
        controller.paused = true;
        const nextStage = run.stages[i + 1];
        addRunLog(run, 'info', `⏸ 阶段间暂停（下一阶段: [${i + 2}/${run.stages.length}] ${nextStage?.name || ''}），等待手动恢复`);
        await saveRun(run);
        this.emit('update', run);
        await this._waitIfPaused(controller);
        if (controller.cancelled) return;
        run.status = 'running';
      }

      // 如果阶段失败且不允许继续，终止
      if (stage.status === 'failed') return;
    }
  }

  async _executeSteps(run, stage, controller) {
    for (let j = 0; j < stage.steps.length; j++) {
      if (controller.cancelled) return;
      await this._waitIfPaused(controller);

      const step = stage.steps[j];

      // 如果是恢复执行且该步骤已完成，跳过
      if (step.status === 'success') {
        addRunLog(run, 'info', `  ⏭ 步骤跳过（已完成）: ${step.name}`);
        continue;
      }

      step.status = 'running';
      step.startedAt = step.startedAt || new Date().toISOString();
      step.attempts++;

      const stepDef = this._findStepDef(run, step.id);
      const actionLabel = stepDef?.action || '未知';
      addRunLog(run, 'step', `  → [${stage.name}] 步骤 ${j + 1}/${stage.steps.length}: ${step.name}（action: ${actionLabel}）`);
      await saveRun(run);
      this.emit('update', run);

      try {
        if (step.loopProgress) {
          await this._executeStepWithLoop(run, step, controller);
        } else {
          const result = await this._executeAction(run, step);
          step.result = result;
        }
        step.status = 'success';
        const elapsed = Math.round((Date.now() - new Date(step.startedAt).getTime()) / 1000);
        addRunLog(run, 'info', `  ✓ [${stage.name}] 步骤完成: ${step.name}（耗时 ${elapsed}s）`);
      } catch (err) {
        step.error = err.message;
        // 重试逻辑
        const maxRetries = run.settings.maxRetries || 0;
        if (step.attempts <= maxRetries) {
          addRunLog(run, 'warn', `  ⟳ [${stage.name}] 步骤重试 (${step.attempts}/${maxRetries}): ${step.name} - ${err.message}`);
          const delay = run.settings.retryDelay || 3000;
          await this._sleep(delay);
          j--; // 重试当前步骤
          continue;
        }
        step.status = 'failed';
        addRunLog(run, 'error', `  ✗ [${stage.name}] 步骤失败: ${step.name} - ${err.message}`);

        if (!step.continueOnError) {
          throw err;
        }
      }

      step.completedAt = new Date().toISOString();
      await saveRun(run);
      this.emit('update', run);
    }
  }

  async _executeStepWithLoop(run, step, controller) {
    const config = await readJson(getMetaPath(run.projectId, 'config'), {});
    const inputs = run.inputs || {};

    // 解析 loop 范围
    const loopConfig = this._findStepDef(run, step.id)?.loop;
    if (!loopConfig) return;

    const from = this._resolveValue(loopConfig.from, { input: inputs, config });
    const to = this._resolveValue(loopConfig.to, { input: inputs, config });
    const batchSize = loopConfig.batchSize || 1;

    step.loopProgress.total = to - from + 1;
    addRunLog(run, 'info', `  📋 [循环] ${step.name}: 范围 ${from}→${to}，共 ${step.loopProgress.total} 项（模式: ${loopConfig.type}）`);

    if (loopConfig.type === 'batch') {
      for (let start = from; start <= to; start += batchSize) {
        if (controller.cancelled) return;
        await this._waitIfPaused(controller);
        const end = Math.min(start + batchSize - 1, to);
        step.loopProgress.current = `${start}-${end}`;
        addRunLog(run, 'step', `    📦 [${step.name}] 批次: ${start}-${end}（已完成 ${step.loopProgress.completed.length} 批）`);
        await this._executeAction(run, step, { startChapter: start, endChapter: end });
        step.loopProgress.completed.push(`${start}-${end}`);
        await saveRun(run);
        this.emit('update', run);
      }
    } else {
      // sequential
      for (let current = from; current <= to; current++) {
        if (controller.cancelled) return;
        await this._waitIfPaused(controller);

        // 如果是恢复执行，跳过已完成的项
        if (step.loopProgress.completed.includes(current)) {
          addRunLog(run, 'info', `    ⏭ [${step.name}] 第${current}章 已完成，跳过`);
          continue;
        }

        step.loopProgress.current = current;
        addRunLog(run, 'step', `    📝 [${step.name}] 第${current}章（进度 ${step.loopProgress.completed.length + 1}/${step.loopProgress.total}）`);
        await this._executeAction(run, step, { chapterNumber: current });
        step.loopProgress.completed.push(current);
        await saveRun(run);
        this.emit('update', run);

        if (run.settings.pauseBetweenChapters) {
          controller.paused = true;
          run.status = 'paused';
          addRunLog(run, 'info', `    ⏸ [${step.name}] 章节间暂停（第${current}章完成）`);
          await saveRun(run);
          this.emit('update', run);
          await this._waitIfPaused(controller);
          if (controller.cancelled) return;
          run.status = 'running';
        }
      }
    }
    addRunLog(run, 'info', `  ✓ [循环] ${step.name}: 全部完成（${step.loopProgress.completed.length} 项）`);
  }

  /**
   * 执行具体的 action — 调用对应的工作流逻辑
   */
  async _executeAction(run, step, loopParams = {}) {
    const stepDef = this._findStepDef(run, step.id);
    if (!stepDef) throw new Error(`Step definition not found: ${step.id}`);

    const action = stepDef.action;
    const projectId = run.projectId;
    const config = await readJson(getMetaPath(projectId, 'config'), {});
    const inputs = run.inputs || {};
    const params = { ...stepDef.params, ...loopParams };

    // 根据 action 路由到对应的工作流逻辑
    switch (action) {
      case 'workflow/generate-config':
        return await this._actionGenerateConfig(projectId, params, inputs);
      case 'workflow/architecture/premise':
      case 'workflow/architecture/characters':
      case 'workflow/architecture/worldbuilding':
      case 'workflow/architecture/synopsis':
        const archStep = action.split('/').pop();
        return await this._actionArchitecture(projectId, archStep);
      case 'workflow/blueprints':
        return await this._actionBlueprints(projectId, params);
      case 'workflow/draft':
        return await this._actionDraft(projectId, params);
      case 'workflow/refine':
        return await this._actionRefine(projectId, params);
      case 'workflow/review':
        return await this._actionReview(projectId, params);
      case 'workflow/finalize':
        return await this._actionFinalize(projectId, params);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  // ─── Action 实现 ─────────────────────────────────────────

  async _actionGenerateConfig(projectId, params, inputs) {
    const config = await readJson(getMetaPath(projectId, 'config'), {});
    const userIdea = inputs.userIdea || config.coreOutline || '';

    const { systemRole, content } = await renderProjectPrompt('generate_global_config', projectId, {
      user_idea: userIdea,
      number_of_chapters: String(config.chapterCount || 100),
      word_number: String(config.wordsPerChapter || 3000),
    });

    const result = await callLLM([
      { role: 'system', content: systemRole },
      { role: 'user', content },
    ], { maxTokens: 4000, task: 'generate_config' });

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('配置生成失败：无法解析 JSON');
    const parsed = JSON.parse(jsonMatch[0]);

    const { writeJson: wj } = await import('../utils/fs.js');
    const updatedConfig = { ...config, ...parsed };
    await wj(getMetaPath(projectId, 'config'), updatedConfig);
    return { config: updatedConfig };
  }

  async _actionArchitecture(projectId, step) {
    const config = await readJson(getMetaPath(projectId, 'config'), {});
    const arch = await readJson(getMetaPath(projectId, 'architecture'), {});

    const varMap = {
      premise: {
        key: 'premise',
        vars: {
          genre: config.genre, sub_genre: config.subGenre,
          topic: config.coreOutline, target_audience: config.audience,
          number_of_chapters: String(config.chapterCount),
          word_number: String(config.wordsPerChapter),
          core_setting: config.worldSetting, golden_finger: config.goldenFinger,
          protagonist_profile: config.protagonistProfile,
          global_guidance: config.globalGuidance, step_guidance: '',
        },
      },
      characters: {
        key: 'character_dynamics',
        vars: {
          genre: config.genre, premise: arch.premise,
          protagonist_profile: config.protagonistProfile,
          golden_finger: config.goldenFinger,
          world_building: config.worldSetting,
          number_of_chapters: String(config.chapterCount),
          global_guidance: config.globalGuidance, step_guidance: '',
        },
      },
      worldbuilding: {
        key: 'world_building',
        vars: {
          genre: config.genre, premise: arch.premise,
          core_setting: config.worldSetting, golden_finger: config.goldenFinger,
          protagonist_profile: config.protagonistProfile,
          global_guidance: config.globalGuidance, step_guidance: '',
        },
      },
      synopsis: {
        key: 'synopsis',
        vars: {
          genre: config.genre, narrative_pov: config.pov,
          premise: arch.premise, character_dynamics: arch.characters,
          world_building: arch.worldBuilding,
          global_guidance: config.globalGuidance,
          number_of_chapters: String(config.chapterCount),
          word_number: String(config.wordsPerChapter), step_guidance: '',
        },
      },
    };

    const mapping = varMap[step];
    if (!mapping) throw new Error(`Unknown architecture step: ${step}`);

    const { systemRole, content } = await renderProjectPrompt(mapping.key, projectId, mapping.vars);
    const result = await callLLM([
      { role: 'system', content: systemRole },
      { role: 'user', content },
    ], { maxTokens: 6000, task: `architecture_${step}` });

    const fieldMap = { premise: 'premise', characters: 'characters', worldbuilding: 'worldBuilding', synopsis: 'synopsis' };
    arch[fieldMap[step]] = result;
    const { writeJson: wj } = await import('../utils/fs.js');
    await wj(getMetaPath(projectId, 'architecture'), arch);
    return { step, content: result.slice(0, 200) + '...' };
  }

  async _actionBlueprints(projectId, params) {
    const config = await readJson(getMetaPath(projectId, 'config'), {});
    const arch = await readJson(getMetaPath(projectId, 'architecture'), {});
    const existingBps = await readJson(getMetaPath(projectId, 'blueprints'), []);

    const startChapter = params.startChapter || 1;
    const endChapter = params.endChapter || config.chapterCount;

    const novelArchitecture = `【故事前提】\n${arch.premise}\n\n【角色图谱】\n${arch.characters}\n\n【世界观】\n${arch.worldBuilding}\n\n【情节大纲】\n${arch.synopsis}`;
    const chapterList = existingBps.slice(-20).map(bp =>
      `第${bp.chapterNumber}章「${bp.title}」: ${bp.keyEvents?.slice(0, 50)}...`
    ).join('\n');

    const { systemRole, content } = await renderProjectPrompt('chapter_blueprint', projectId, {
      genre: config.genre,
      global_guidance: config.globalGuidance,
      novel_architecture: novelArchitecture,
      chapter_list: chapterList || '（暂无已生成章节）',
      start_chapter: String(startChapter),
      end_chapter: String(endChapter),
    });

    const result = await callLLM([
      { role: 'system', content: systemRole },
      { role: 'user', content },
    ], { maxTokens: 8000, task: 'blueprint' });

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('蓝图生成失败');
    const parsed = JSON.parse(jsonMatch[0]);
    const blueprints = parsed.blueprints || [];

    for (const bp of blueprints) {
      const idx = existingBps.findIndex(e => e.chapterNumber === bp.chapterNumber);
      if (idx >= 0) existingBps[idx] = bp;
      else existingBps.push(bp);
    }
    existingBps.sort((a, b) => a.chapterNumber - b.chapterNumber);

    const { writeJson: wj } = await import('../utils/fs.js');
    await wj(getMetaPath(projectId, 'blueprints'), existingBps);

    // 创建草稿文件
    const draftsDir = getDraftsDir(projectId);
    await ensureDir(draftsDir);
    const existingChapters = await listAllChapters(projectId);
    for (const bp of blueprints) {
      const alreadyExists = existingChapters.some(c => c.chapterNumber === bp.chapterNumber);
      if (!alreadyExists) {
        const num = String(bp.chapterNumber).padStart(3, '0');
        const title = `第${bp.chapterNumber}章 ${bp.title || ''}`.trim();
        const filename = `${num}-${title}.md`;
        await writeText(path.join(draftsDir, filename), `# ${title}\n\n`);
      }
    }

    return { blueprintsCount: blueprints.length };
  }

  async _actionDraft(projectId, params) {
    const chapterNumber = params.chapterNumber;
    const config = await readJson(getMetaPath(projectId, 'config'), {});
    const arch = await readJson(getMetaPath(projectId, 'architecture'), {});
    const blueprints = await readJson(getMetaPath(projectId, 'blueprints'), []);
    const characters = await readJson(getMetaPath(projectId, 'characters'), []);

    const bp = blueprints.find(b => b.chapterNumber === chapterNumber);
    if (!bp) throw new Error(`未找到第${chapterNumber}章蓝图`);

    const isFirst = chapterNumber === 1;
    const architecture = `【故事前提】\n${arch.premise}\n\n【角色图谱】\n${arch.characters}\n\n【世界观】\n${arch.worldBuilding}\n\n【情节大纲】\n${arch.synopsis}`;
    const chapterInfo = JSON.stringify(bp, null, 2);
    const futureBps = blueprints
      .filter(b => b.chapterNumber > chapterNumber && b.chapterNumber <= chapterNumber + 3)
      .map(b => `第${b.chapterNumber}章「${b.title}」: ${b.purpose}`)
      .join('\n') || '（暂无）';

    let templateKey, variables;

    if (isFirst) {
      templateKey = 'first_chapter_draft';
      variables = {
        architecture, chapter_info: chapterInfo, future_blueprints: futureBps,
        global_guidance: config.globalGuidance,
        word_number: String(config.wordsPerChapter),
        writing_style: config.writingStyle || '', user_guidance: '',
      };
    } else {
      const allChapters = await listAllChapters(projectId);
      const previousChapters = allChapters.filter(c => c.chapterNumber < chapterNumber).slice(-3);
      let previousEnding = '', shortSummary = '';
      const summaries = [];
      for (const c of previousChapters) {
        const fullPath = path.join(getProjectDir(projectId), c.relPath);
        const content = await readText(fullPath);
        summaries.push(`第${c.chapterNumber}章 ${c.title}: ${content.slice(0, 200)}...`);
        if (c === previousChapters[previousChapters.length - 1]) {
          previousEnding = content.slice(-800);
        }
      }
      shortSummary = summaries.join('\n');
      const characterStates = characters.map(c =>
        `${c.name}(${c.role}): ${c.currentState?.recentEvents || '无近期事件'}`
      ).join('\n');
      const globalSummary = blueprints
        .filter(b => b.chapterNumber < chapterNumber).slice(-10)
        .map(b => `第${b.chapterNumber}章: ${b.keyEvents?.slice(0, 60)}`).join('\n');

      templateKey = 'next_chapter_draft';
      variables = {
        global_summary: globalSummary || '（首章）',
        character_states: characterStates || '（暂无角色状态）',
        short_summary: shortSummary || '（暂无前文）',
        previous_ending: previousEnding || '（暂无前文）',
        chapter_info: chapterInfo, future_blueprints: futureBps,
        global_guidance: config.globalGuidance,
        word_number: String(config.wordsPerChapter),
        writing_style: config.writingStyle || '', user_guidance: '',
      };
    }

    const { systemRole, content } = await renderProjectPrompt(templateKey, projectId, variables);
    // 非流式调用（pipeline 中不需要流式）
    const draftContent = await callLLM([
      { role: 'system', content: systemRole },
      { role: 'user', content },
    ], { maxTokens: config.wordsPerChapter * 2 || 8000, task: 'draft' });

    // 保存草稿
    const draftsDir = getDraftsDir(projectId);
    await ensureDir(draftsDir);
    const num = String(chapterNumber).padStart(3, '0');
    const title = bp.title || '';
    const fullTitle = title ? `第${chapterNumber}章 ${title}` : `第${chapterNumber}章`;
    const filename = `${num}-${fullTitle}.md`;
    await writeText(path.join(draftsDir, filename), `# ${fullTitle}\n\n${draftContent}`);

    return { chapterNumber, wordCount: draftContent.length, filename };
  }

  async _actionRefine(projectId, params) {
    const chapterNumber = params.chapterNumber;
    const config = await readJson(getMetaPath(projectId, 'config'), {});
    const blueprints = await readJson(getMetaPath(projectId, 'blueprints'), []);

    // 读取当前草稿
    const allChapters = await listAllChapters(projectId);
    const chapter = allChapters.find(c => c.chapterNumber === chapterNumber);
    if (!chapter) throw new Error(`未找到第${chapterNumber}章`);

    const fullPath = path.join(getProjectDir(projectId), chapter.relPath);
    const draftContent = await readText(fullPath);
    if (!draftContent || draftContent.trim().length < 100) {
      throw new Error(`第${chapterNumber}章内容过短，请先生成草稿`);
    }

    const bp = blueprints.find(b => b.chapterNumber === chapterNumber);
    const chapterInfo = bp ? JSON.stringify(bp, null, 2) : '（无蓝图信息）';

    const { systemRole, content } = await renderProjectPrompt('refine_chapter', projectId, {
      chapter_info: chapterInfo, short_summary: '',
      draft_content: draftContent, global_guidance: config.globalGuidance,
      word_number: String(config.wordsPerChapter),
      writing_style: config.writingStyle || '', user_refine_prompt: '',
    });

    const refined = await callLLM([
      { role: 'system', content: systemRole },
      { role: 'user', content },
    ], { maxTokens: config.wordsPerChapter * 2 || 8000, task: 'refine' });

    // 覆盖草稿
    const title = bp?.title || '';
    const fullTitle = title ? `第${chapterNumber}章 ${title}` : `第${chapterNumber}章`;
    await writeText(fullPath, `# ${fullTitle}\n\n${refined}`);

    return { chapterNumber, wordCount: refined.length };
  }

  async _actionReview(projectId, params) {
    const chapterNumber = params.chapterNumber;
    const config = await readJson(getMetaPath(projectId, 'config'), {});
    const arch = await readJson(getMetaPath(projectId, 'architecture'), {});
    const characters = await readJson(getMetaPath(projectId, 'characters'), []);

    const allChapters = await listAllChapters(projectId);
    const chapter = allChapters.find(c => c.chapterNumber === chapterNumber);
    if (!chapter) throw new Error(`未找到第${chapterNumber}章`);

    const fullPath = path.join(getProjectDir(projectId), chapter.relPath);
    const chapterContent = await readText(fullPath);

    const characterStates = characters.map(c =>
      `${c.name}(${c.role}): ${JSON.stringify(c.currentState || {})}`
    ).join('\n');

    const { systemRole, content } = await renderProjectPrompt('consistency_check', projectId, {
      chapter_content: chapterContent,
      character_states: characterStates || '（暂无）',
      global_summary: arch.synopsis?.slice(0, 1000) || '（暂无）',
      world_building: arch.worldBuilding?.slice(0, 1000) || config.worldSetting || '（暂无）',
    });

    const result = await callLLM([
      { role: 'system', content: systemRole },
      { role: 'user', content },
    ], { maxTokens: 4000, task: 'review' });

    let review;
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      review = JSON.parse(jsonMatch[0]);
    } catch {
      review = { raw: result };
    }
    return { chapterNumber, review };
  }

  async _actionFinalize(projectId, params) {
    const chapterNumber = params.chapterNumber;
    const config = await readJson(getMetaPath(projectId, 'config'), {});
    const characters = await readJson(getMetaPath(projectId, 'characters'), []);
    const blueprints = await readJson(getMetaPath(projectId, 'blueprints'), []);

    const allChapters = await listAllChapters(projectId);
    const chapter = allChapters.find(c => c.chapterNumber === chapterNumber);
    if (!chapter) throw new Error(`未找到第${chapterNumber}章`);

    const fullPath = path.join(getProjectDir(projectId), chapter.relPath);
    const chapterContent = await readText(fullPath);
    const chapterTitle = chapter.title || '';
    const bp = blueprints.find(b => b.chapterNumber === chapterNumber);

    // 生成章节要点
    const { systemRole: sr1, content: c1 } = await renderProjectPrompt('generate_chapter_notes', projectId, {
      chapter_number: String(chapterNumber),
      chapter_title: chapterTitle,
      chapter_content: chapterContent,
    });
    const notesResult = await callLLM([
      { role: 'system', content: sr1 },
      { role: 'user', content: c1 },
    ], { maxTokens: 2000, task: 'chapter_notes' });

    const notesDir = getNotesDir(projectId);
    await ensureDir(notesDir);
    await writeText(
      path.join(notesDir, `ch${String(chapterNumber).padStart(3, '0')}-notes.md`),
      notesResult
    );

    // 更新角色卡
    const { systemRole: sr2, content: c2 } = await renderProjectPrompt('update_character_cards', projectId, {
      chapter_number: String(chapterNumber),
      chapter_content: chapterContent,
      existing_cards_json: JSON.stringify(characters.map(c => ({ name: c.name, role: c.role })), null, 2),
    });
    const charResult = await callLLM([
      { role: 'system', content: sr2 },
      { role: 'user', content: c2 },
    ], { maxTokens: 3000, task: 'update_characters' });

    try {
      const jsonMatch = charResult.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.updates) {
          for (const update of parsed.updates) {
            const char = characters.find(c => c.name === update.name);
            if (char) char.currentState = update.currentState;
          }
        }
        if (parsed.newCharacters) {
          for (const nc of parsed.newCharacters) {
            if (!characters.find(c => c.name === nc.name)) characters.push(nc);
          }
        }
        const { writeJson: wj } = await import('../utils/fs.js');
        await wj(getMetaPath(projectId, 'characters'), characters);
      }
    } catch {}

    // 定稿：移动到根目录 .txt
    const num = String(chapterNumber).padStart(3, '0');
    let cleanTitle = chapterTitle.replace(new RegExp(`^第${chapterNumber}章[\\s　]*`), '').trim();
    const fullTitle = cleanTitle ? `第${chapterNumber}章 ${cleanTitle}` : `第${chapterNumber}章`;
    const safeTitle = fullTitle.replace(/[\/\\:*?"<>|]/g, '_');
    const finalFilename = `${num}-${safeTitle}.txt`;

    const { getFinalizedPath } = await import('../utils/paths.js');
    const finalPath = getFinalizedPath(projectId, finalFilename);
    const cleanContent = chapterContent.replace(/^#\s+.*\n+/m, '').trim();
    await writeText(finalPath, cleanContent);

    // 删除草稿
    const draftsDir = getDraftsDir(projectId);
    try {
      const { readdir, unlink } = await import('node:fs/promises');
      const draftFiles = await readdir(draftsDir);
      for (const f of draftFiles) {
        if (f.startsWith(num + '-') && f.endsWith('.md')) {
          await unlink(path.join(draftsDir, f));
        }
      }
    } catch {}

    return { chapterNumber, finalizedFile: finalFilename };
  }

  // ─── 辅助方法 ─────────────────────────────────────────────

  _findStepDef(run, stepId) {
    // 优先从运行时缓存的 pipeline 定义中查找
    if (run._pipelineDef) {
      for (const stage of run._pipelineDef.stages) {
        const step = stage.steps.find(s => s.id === stepId);
        if (step) return step;
      }
    }
    // fallback: 从内置 pipeline 查找
    for (const pipeline of this._builtinPipelines) {
      if (pipeline.name !== run.pipelineName) continue;
      for (const stage of pipeline.stages) {
        const step = stage.steps.find(s => s.id === stepId);
        if (step) return step;
      }
    }
    return null;
  }

  _resolveValue(template, context) {
    if (typeof template === 'number') return template;
    if (typeof template !== 'string') return template;
    // 简单模板解析 {{input.xxx}} {{config.xxx}}
    const match = template.match(/\{\{(.+?)\}\}/);
    if (!match) return parseInt(template) || template;

    const expr = match[1].trim();
    const parts = expr.split('||').map(p => p.trim());

    for (const part of parts) {
      const dotParts = part.split('.');
      let val = context;
      for (const dp of dotParts) {
        val = val?.[dp];
      }
      if (val != null && val !== '') return parseInt(val) || val;
    }
    return parseInt(parts[parts.length - 1]) || 0;
  }

  async _waitIfPaused(controller) {
    while (controller.paused && !controller.cancelled) {
      await this._sleep(500);
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 单例
const executor = new PipelineExecutor();
export default executor;
