/**
 * 工作流路由 — AI 小说创作全流程管线
 *
 * 数据存储约定：
 * - 元数据：projects/{id}/.good/*.json
 * - 草稿章节：projects/{id}/.good/drafts/*.md
 * - 定稿章节：projects/{id}/{n}-{title}.txt（根目录）
 */
import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { readJson, writeJson, readText, writeText, listDir, ensureDir } from '../utils/fs.js';
import { callLLM, streamLLM } from '../services/llm.js';
import { renderPrompt, renderProjectPrompt } from '../services/prompts.js';
import {
  getProjectDir,
  getDraftsDir,
  getNotesDir,
  getMetaPath,
  getFinalizedPath,
  listAllChapters,
} from '../utils/paths.js';

const router = Router();

// ─── 一键生成全局配置 ────────────────────────────────────────
router.post('/generate-config', async (req, res, next) => {
  try {
    const { projectId, userIdea, modelId } = req.body;
    const config = await readJson(getMetaPath(projectId, 'config'), {});

    const { systemRole, content } = await renderProjectPrompt('generate_global_config', projectId, {
      user_idea: userIdea,
      number_of_chapters: String(config.chapterCount || 100),
      word_number: String(config.wordsPerChapter || 3000),
    });

    const result = await callLLM([
      { role: 'system', content: systemRole },
      { role: 'user', content },
    ], { maxTokens: 4000, task: 'generate_config', modelId });

    let parsed;
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return res.json({ raw: result, parsed: null });
    }

    const updatedConfig = {
      ...config,
      genre: parsed.genre || config.genre,
      subGenre: parsed.subGenre || config.subGenre,
      audience: parsed.targetAudience || config.audience,
      structure: parsed.plotStructure || config.structure,
      pov: parsed.narrativePOV || config.pov,
      coreOutline: parsed.coreOutline || config.coreOutline,
      worldSetting: parsed.worldSetting || config.worldSetting,
      goldenFinger: parsed.goldenFinger || config.goldenFinger,
      protagonistProfile: parsed.protagonistProfile || config.protagonistProfile,
      globalGuidance: parsed.globalGuidance || config.globalGuidance,
      writingStyle: parsed.writingStyle || config.writingStyle,
    };
    await writeJson(getMetaPath(projectId, 'config'), updatedConfig);

    res.json({ config: updatedConfig, raw: result });
  } catch (err) {
    next(err);
  }
});

// ─── 架构生成（四步流水线） ──────────────────────────────────
router.post('/architecture/:step', async (req, res, next) => {
  try {
    const { projectId, stepGuidance, modelId } = req.body;
    const step = req.params.step;
    const config = await readJson(getMetaPath(projectId, 'config'), {});
    const arch = await readJson(getMetaPath(projectId, 'architecture'), {});

    let templateKey, variables;

    switch (step) {
      case 'premise':
        templateKey = 'premise';
        variables = {
          genre: config.genre,
          sub_genre: config.subGenre,
          topic: config.coreOutline,
          target_audience: config.audience,
          number_of_chapters: String(config.chapterCount),
          word_number: String(config.wordsPerChapter),
          core_setting: config.worldSetting,
          golden_finger: config.goldenFinger,
          protagonist_profile: config.protagonistProfile,
          global_guidance: config.globalGuidance,
          step_guidance: stepGuidance || '',
        };
        break;
      case 'characters':
        templateKey = 'character_dynamics';
        variables = {
          genre: config.genre,
          premise: arch.premise,
          protagonist_profile: config.protagonistProfile,
          golden_finger: config.goldenFinger,
          world_building: config.worldSetting,
          number_of_chapters: String(config.chapterCount),
          global_guidance: config.globalGuidance,
          step_guidance: stepGuidance || '',
        };
        break;
      case 'worldbuilding':
        templateKey = 'world_building';
        variables = {
          genre: config.genre,
          premise: arch.premise,
          core_setting: config.worldSetting,
          golden_finger: config.goldenFinger,
          protagonist_profile: config.protagonistProfile,
          global_guidance: config.globalGuidance,
          step_guidance: stepGuidance || '',
        };
        break;
      case 'synopsis':
        templateKey = 'synopsis';
        variables = {
          genre: config.genre,
          narrative_pov: config.pov,
          premise: arch.premise,
          character_dynamics: arch.characters,
          world_building: arch.worldBuilding,
          global_guidance: config.globalGuidance,
          number_of_chapters: String(config.chapterCount),
          word_number: String(config.wordsPerChapter),
          step_guidance: stepGuidance || '',
        };
        break;
      default:
        return res.status(400).json({ error: `Unknown step: ${step}` });
    }

    const { systemRole, content } = await renderProjectPrompt(templateKey, projectId, variables);
    const result = await callLLM([
      { role: 'system', content: systemRole },
      { role: 'user', content },
    ], { maxTokens: 6000, task: `architecture_${step}`, modelId });

    const fieldMap = {
      premise: 'premise',
      characters: 'characters',
      worldbuilding: 'worldBuilding',
      synopsis: 'synopsis',
    };
    arch[fieldMap[step]] = result;
    await writeJson(getMetaPath(projectId, 'architecture'), arch);

    res.json({ step, content: result });
  } catch (err) {
    next(err);
  }
});

// ─── 章节蓝图生成（同步创建草稿章节文件） ────────────────────
router.post('/blueprints', async (req, res, next) => {
  try {
    const { projectId, startChapter, endChapter, modelId } = req.body;
    const config = await readJson(getMetaPath(projectId, 'config'), {});
    const arch = await readJson(getMetaPath(projectId, 'architecture'), {});
    const existingBps = await readJson(getMetaPath(projectId, 'blueprints'), []);

    const novelArchitecture = `【故事前提】\n${arch.premise}\n\n【角色图谱】\n${arch.characters}\n\n【世界观】\n${arch.worldBuilding}\n\n【情节大纲】\n${arch.synopsis}`;

    const chapterList = existingBps.slice(-20).map(bp =>
      `第${bp.chapterNumber}章「${bp.title}」: ${bp.keyEvents?.slice(0, 50)}...`
    ).join('\n');

    const { systemRole, content } = await renderProjectPrompt('chapter_blueprint', projectId, {
      genre: config.genre,
      global_guidance: config.globalGuidance,
      novel_architecture: novelArchitecture,
      chapter_list: chapterList || '（暂无已生成章节）',
      start_chapter: String(startChapter || 1),
      end_chapter: String(endChapter || Math.min((startChapter || 1) + 9, config.chapterCount)),
    });

    const result = await callLLM([
      { role: 'system', content: systemRole },
      { role: 'user', content },
    ], { maxTokens: 8000, task: 'blueprint', modelId });

    let blueprints = [];
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch[0]);
      blueprints = parsed.blueprints || [];
    } catch {
      return res.json({ raw: result, blueprints: [] });
    }

    for (const bp of blueprints) {
      const idx = existingBps.findIndex(e => e.chapterNumber === bp.chapterNumber);
      if (idx >= 0) existingBps[idx] = bp;
      else existingBps.push(bp);
    }
    existingBps.sort((a, b) => a.chapterNumber - b.chapterNumber);
    await writeJson(getMetaPath(projectId, 'blueprints'), existingBps);

    // 自动为新蓝图创建对应的草稿章节文件
    const draftsDir = getDraftsDir(projectId);
    await ensureDir(draftsDir);
    const existingFiles = await listDir(draftsDir);
    const existingMdFiles = existingFiles.filter(f => f.name.endsWith('.md'));
    const existingChapters = await listAllChapters(projectId);

    const createdChapters = [];
    // 标题去重工具：剥离 title 中已经存在的"第N章"前缀
    const stripChapterPrefix = (raw, num) => {
      if (!raw) return '';
      let s = String(raw).trim();
      s = s.replace(new RegExp(`^第${num}章[\\s　]*`), '');
      s = s.replace(/^第[一二三四五六七八九十百千零\d]+章[\s　]*/, '');
      return s.trim();
    };

    for (const bp of blueprints) {
      const num = String(bp.chapterNumber).padStart(3, '0');
      // 检查是否已经存在同号草稿或定稿
      const alreadyExists = existingChapters.some(c => c.chapterNumber === bp.chapterNumber);
      if (!alreadyExists) {
        const cleanTitle = stripChapterPrefix(bp.title, bp.chapterNumber);
        const fullTitle = cleanTitle ? `第${bp.chapterNumber}章 ${cleanTitle}` : `第${bp.chapterNumber}章`;
        const filename = `${num}-${fullTitle}.md`;
        await writeText(path.join(draftsDir, filename), `# ${fullTitle}\n\n`);
        createdChapters.push(filename);
      }
    }

    res.json({ blueprints, total: existingBps.length, createdChapters });
  } catch (err) {
    next(err);
  }
});

// ─── 章节正文生成（流式） ────────────────────────────────────
router.post('/draft', async (req, res, next) => {
  try {
    const { projectId, chapterNumber, userGuidance, modelId } = req.body;
    const config = await readJson(getMetaPath(projectId, 'config'), {});
    const arch = await readJson(getMetaPath(projectId, 'architecture'), {});
    const blueprints = await readJson(getMetaPath(projectId, 'blueprints'), []);
    const characters = await readJson(getMetaPath(projectId, 'characters'), []);

    const bp = blueprints.find(b => b.chapterNumber === chapterNumber);
    if (!bp) {
      return res.status(400).json({ error: `未找到第${chapterNumber}章蓝图，请先生成蓝图` });
    }

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
        architecture,
        chapter_info: chapterInfo,
        future_blueprints: futureBps,
        global_guidance: config.globalGuidance,
        word_number: String(config.wordsPerChapter),
        writing_style: config.writingStyle || '',
        user_guidance: userGuidance || '',
      };
    } else {
      // 读取前几章作为上下文（合并草稿+定稿）
      const allChapters = await listAllChapters(projectId);
      const previousChapters = allChapters.filter(c => c.chapterNumber < chapterNumber).slice(-3);

      let previousEnding = '';
      let shortSummary = '';
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
        .filter(b => b.chapterNumber < chapterNumber)
        .slice(-10)
        .map(b => `第${b.chapterNumber}章: ${b.keyEvents?.slice(0, 60)}`)
        .join('\n');

      templateKey = 'next_chapter_draft';
      variables = {
        global_summary: globalSummary || '（首章）',
        character_states: characterStates || '（暂无角色状态）',
        short_summary: shortSummary || '（暂无前文）',
        previous_ending: previousEnding || '（暂无前文）',
        chapter_info: chapterInfo,
        future_blueprints: futureBps,
        global_guidance: config.globalGuidance,
        word_number: String(config.wordsPerChapter),
        writing_style: config.writingStyle || '',
        user_guidance: userGuidance || '',
      };
    }

    const { systemRole, content } = await renderProjectPrompt(templateKey, projectId, variables);

    const response = await streamLLM([
      { role: 'system', content: systemRole },
      { role: 'user', content },
    ], { maxTokens: config.wordsPerChapter * 2 || 8000, task: 'draft', modelId });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
    } catch (streamErr) {
      console.error('[workflow/draft] stream error:', streamErr);
    }
    res.end();
  } catch (err) {
    next(err);
  }
});

// ─── 精修 ────────────────────────────────────────────────────
router.post('/refine', async (req, res, next) => {
  try {
    const { projectId, chapterNumber, draftContent, userRefinePrompt, modelId } = req.body;
    const config = await readJson(getMetaPath(projectId, 'config'), {});
    const blueprints = await readJson(getMetaPath(projectId, 'blueprints'), []);

    const bp = blueprints.find(b => b.chapterNumber === chapterNumber);
    const chapterInfo = bp ? JSON.stringify(bp, null, 2) : '（无蓝图信息）';

    const { systemRole, content } = await renderProjectPrompt('refine_chapter', projectId, {
      chapter_info: chapterInfo,
      short_summary: '',
      draft_content: draftContent,
      global_guidance: config.globalGuidance,
      word_number: String(config.wordsPerChapter),
      writing_style: config.writingStyle || '',
      user_refine_prompt: userRefinePrompt || '',
    });

    const response = await streamLLM([
      { role: 'system', content: systemRole },
      { role: 'user', content },
    ], { maxTokens: config.wordsPerChapter * 2 || 8000, task: 'refine', modelId });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
    } catch (streamErr) {
      console.error('[workflow/refine] stream error:', streamErr);
    }
    res.end();
  } catch (err) {
    next(err);
  }
});

// ─── 审稿 ────────────────────────────────────────────────────
router.post('/review', async (req, res, next) => {
  try {
    const { projectId, chapterContent, modelId } = req.body;
    const config = await readJson(getMetaPath(projectId, 'config'), {});
    const arch = await readJson(getMetaPath(projectId, 'architecture'), {});
    const characters = await readJson(getMetaPath(projectId, 'characters'), []);

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
    ], { maxTokens: 4000, task: 'review', modelId });

    let review;
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      review = JSON.parse(jsonMatch[0]);
    } catch {
      review = { raw: result };
    }

    res.json(review);
  } catch (err) {
    next(err);
  }
});

// ─── 章节要点生成 ────────────────────────────────────────────
router.post('/chapter-notes', async (req, res, next) => {
  try {
    const { projectId, chapterNumber, chapterTitle, chapterContent, modelId } = req.body;

    const { systemRole, content } = await renderProjectPrompt('generate_chapter_notes', projectId, {
      chapter_number: String(chapterNumber),
      chapter_title: chapterTitle || '',
      chapter_content: chapterContent,
    });

    const result = await callLLM([
      { role: 'system', content: systemRole },
      { role: 'user', content },
    ], { maxTokens: 2000, task: 'chapter_notes', modelId });

    res.json({ notes: result });
  } catch (err) {
    next(err);
  }
});

// ─── 角色卡状态更新 ──────────────────────────────────────────
router.post('/update-characters', async (req, res, next) => {
  try {
    const { projectId, chapterNumber, chapterContent, modelId } = req.body;
    const characters = await readJson(getMetaPath(projectId, 'characters'), []);

    const { systemRole, content } = await renderProjectPrompt('update_character_cards', projectId, {
      chapter_number: String(chapterNumber),
      chapter_content: chapterContent,
      existing_cards_json: JSON.stringify(characters.map(c => ({ name: c.name, role: c.role })), null, 2),
    });

    const result = await callLLM([
      { role: 'system', content: systemRole },
      { role: 'user', content },
    ], { maxTokens: 3000, task: 'update_characters', modelId });

    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch[0]);

      if (parsed.updates) {
        for (const update of parsed.updates) {
          const char = characters.find(c => c.name === update.name);
          if (char) char.currentState = update.currentState;
        }
      }
      if (parsed.newCharacters) {
        for (const newChar of parsed.newCharacters) {
          if (!characters.find(c => c.name === newChar.name)) {
            characters.push(newChar);
          }
        }
      }

      await writeJson(getMetaPath(projectId, 'characters'), characters);
      res.json({ characters, updates: parsed });
    } catch {
      res.json({ raw: result, characters });
    }
  } catch (err) {
    next(err);
  }
});

// ─── 文风分析 ────────────────────────────────────────────────
router.post('/analyze-style', async (req, res, next) => {
  try {
    const { projectId, sampleText, modelId } = req.body;
    const { systemRole, content } = await renderProjectPrompt('analyze_writing_style', projectId, {
      sample_text: sampleText,
    });
    const result = await callLLM([
      { role: 'system', content: systemRole },
      { role: 'user', content },
    ], { maxTokens: 2000, task: 'analyze_style', modelId });
    res.json({ analysis: result });
  } catch (err) {
    next(err);
  }
});

// ─── 定稿（章节要点 + 角色卡更新 + 移动到根目录 .txt） ───────
router.post('/finalize', async (req, res, next) => {
  try {
    const { projectId, chapterNumber, chapterTitle, chapterContent, modelId } = req.body;
    const characters = await readJson(getMetaPath(projectId, 'characters'), []);
    const results = { notes: null, characterUpdates: null, finalizedFile: null, errors: [] };

    // 步骤 1：生成章节要点
    try {
      const { systemRole: sr1, content: c1 } = await renderProjectPrompt('generate_chapter_notes', projectId, {
        chapter_number: String(chapterNumber),
        chapter_title: chapterTitle || '',
        chapter_content: chapterContent,
      });
      const notesResult = await callLLM([
        { role: 'system', content: sr1 },
        { role: 'user', content: c1 },
      ], { maxTokens: 2000, task: 'chapter_notes', modelId });
      results.notes = notesResult;

      const notesDir = getNotesDir(projectId);
      await ensureDir(notesDir);
      await writeText(
        path.join(notesDir, `ch${String(chapterNumber).padStart(3, '0')}-notes.md`),
        notesResult
      );
    } catch (e) {
      results.errors.push(`章节要点生成失败: ${e.message}`);
    }

    // 步骤 2：更新角色卡状态
    try {
      const { systemRole: sr2, content: c2 } = await renderProjectPrompt('update_character_cards', projectId, {
        chapter_number: String(chapterNumber),
        chapter_content: chapterContent,
        existing_cards_json: JSON.stringify(characters.map(c => ({ name: c.name, role: c.role })), null, 2),
      });
      const charResult = await callLLM([
        { role: 'system', content: sr2 },
        { role: 'user', content: c2 },
      ], { maxTokens: 3000, task: 'update_characters', modelId });

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
          for (const newChar of parsed.newCharacters) {
            if (!characters.find(c => c.name === newChar.name)) {
              characters.push(newChar);
            }
          }
        }
        await writeJson(getMetaPath(projectId, 'characters'), characters);
        results.characterUpdates = parsed;
      }
    } catch (e) {
      results.errors.push(`角色卡更新失败: ${e.message}`);
    }

    // 步骤 3：将定稿移动到根目录 .txt
    try {
      const num = String(chapterNumber).padStart(3, '0');
      // 标准化：剥离已有"第N章"前缀，统一加上"第N章 "
      let cleanTitle = (chapterTitle || '').trim();
      cleanTitle = cleanTitle.replace(new RegExp(`^第${chapterNumber}章[\\s　]*`), '');
      cleanTitle = cleanTitle.replace(/^第[一二三四五六七八九十百千零\d]+章[\s　]*/, '').trim();
      const fullTitle = cleanTitle ? `第${chapterNumber}章 ${cleanTitle}` : `第${chapterNumber}章`;
      const safeTitle = fullTitle.replace(/[\/\\:*?"<>|]/g, '_');
      const finalFilename = `${num}-${safeTitle}.txt`;
      const finalPath = getFinalizedPath(projectId, finalFilename);

      // 写入定稿正文（去除 Markdown 标题，纯文本）
      const cleanContent = chapterContent.replace(/^#\s+.*\n+/m, '').trim();
      await writeText(finalPath, cleanContent);

      // 删除草稿文件（如果存在）
      const draftsDir = getDraftsDir(projectId);
      try {
        const draftFiles = await fs.readdir(draftsDir);
        for (const f of draftFiles) {
          if (f.startsWith(num + '-') && f.endsWith('.md')) {
            await fs.unlink(path.join(draftsDir, f));
          }
        }
      } catch {}

      results.finalizedFile = finalFilename;
    } catch (e) {
      results.errors.push(`定稿文件保存失败: ${e.message}`);
    }

    res.json({
      success: results.errors.length === 0,
      ...results,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
