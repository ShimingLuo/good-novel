import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { PROJECTS_ROOT } from '../config.js';
import {
  ensureDir,
  exists,
  readJson,
  writeJson,
  readText,
  writeText,
  safeJoin,
  listDir,
} from '../utils/fs.js';
import {
  getProjectDir,
  getGoodDir,
  getDraftsDir,
  getMetaPath,
  getFinalizedPath,
  migrateLegacyLayout,
  listAllChapters,
} from '../utils/paths.js';

const router = Router();

// ─── 列出所有项目 ───────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    await ensureDir(PROJECTS_ROOT);
    const entries = await listDir(PROJECTS_ROOT);
    const projects = [];
    for (const e of entries) {
      if (!e.isDir) continue;
      // 自动迁移旧格式
      await migrateLegacyLayout(e.name);
      const meta = await readJson(getMetaPath(e.name, 'config'), { title: e.name });
      projects.push({ id: e.name, ...meta });
    }
    res.json(projects);
  } catch (err) {
    next(err);
  }
});

// ─── 获取单个项目详情 ────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const projDir = getProjectDir(req.params.id);
    if (!(await exists(projDir))) {
      return res.status(404).json({ error: 'Project not found' });
    }
    await migrateLegacyLayout(req.params.id);

    const meta = await readJson(getMetaPath(req.params.id, 'config'), {});
    const architecture = await readJson(getMetaPath(req.params.id, 'architecture'), {});
    const outline = await readText(getMetaPath(req.params.id, 'outline'));
    const characters = await readJson(getMetaPath(req.params.id, 'characters'), []);
    const blueprints = await readJson(getMetaPath(req.params.id, 'blueprints'), []);
    const chapters = await listAllChapters(req.params.id);

    res.json({
      id: req.params.id,
      config: meta,
      architecture,
      outline,
      characters,
      blueprints,
      chapters, // 现在是结构化数组（不再是字符串列表）
    });
  } catch (err) {
    next(err);
  }
});

// ─── 重命名项目（修改 ID） ──────────────────────────────────
router.put('/:id/rename', async (req, res, next) => {
  try {
    const { newId } = req.body;
    if (!newId) return res.status(400).json({ error: 'newId is required' });
    if (!/^[a-zA-Z0-9_-]+$/.test(newId)) {
      return res.status(400).json({ error: 'newId 只能包含字母、数字、下划线、连字符' });
    }

    const oldDir = getProjectDir(req.params.id);
    const newDir = getProjectDir(newId);

    if (!(await exists(oldDir))) return res.status(404).json({ error: '项目不存在' });
    if (await exists(newDir)) return res.status(409).json({ error: '新 ID 已存在' });

    await fs.rename(oldDir, newDir);
    res.json({ ok: true, newId });
  } catch (err) {
    next(err);
  }
});

// ─── 删除项目 ────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const projDir = getProjectDir(req.params.id);
    if (!(await exists(projDir))) return res.status(404).json({ error: '项目不存在' });
    await fs.rm(projDir, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── 复制项目 ────────────────────────────────────────────────
router.post('/:id/duplicate', async (req, res, next) => {
  try {
    const { newId, newTitle } = req.body;
    if (!newId) return res.status(400).json({ error: 'newId is required' });
    if (!/^[a-zA-Z0-9_-]+$/.test(newId)) {
      return res.status(400).json({ error: 'newId 只能包含字母、数字、下划线、连字符' });
    }

    const srcDir = getProjectDir(req.params.id);
    const dstDir = getProjectDir(newId);

    if (!(await exists(srcDir))) return res.status(404).json({ error: '源项目不存在' });
    if (await exists(dstDir)) return res.status(409).json({ error: '目标 ID 已存在' });

    await fs.cp(srcDir, dstDir, { recursive: true });

    // 更新新项目的 title
    if (newTitle) {
      const configPath = getMetaPath(newId, 'config');
      const config = await readJson(configPath, {});
      config.title = newTitle;
      await writeJson(configPath, config);
    }

    res.json({ ok: true, newId });
  } catch (err) {
    next(err);
  }
});

// ─── 创建项目 ────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { id, title, genre, subGenre, audience, chapterCount, wordsPerChapter } = req.body;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const projDir = getProjectDir(id);
    const goodDir = getGoodDir(id);
    await ensureDir(projDir);
    await ensureDir(goodDir);
    await ensureDir(getDraftsDir(id));

    const config = {
      title: title || id,
      genre: genre || '',
      subGenre: subGenre || '',
      audience: audience || '',
      chapterCount: chapterCount || 100,
      wordsPerChapter: wordsPerChapter || 3000,
      structure: 'three_act',
      pov: 'third_limited',
      coreOutline: '',
      worldSetting: '',
      goldenFinger: '',
      protagonistProfile: '',
      globalGuidance: '',
      writingStyle: '',
    };
    await writeJson(getMetaPath(id, 'config'), config);
    await writeJson(getMetaPath(id, 'architecture'), {
      premise: '',
      characters: '',
      worldBuilding: '',
      synopsis: '',
    });
    await writeJson(getMetaPath(id, 'characters'), []);
    await writeJson(getMetaPath(id, 'blueprints'), []);
    await writeText(getMetaPath(id, 'outline'), '# 章节蓝图\n\n');
    res.status(201).json({ id, ...config });
  } catch (err) {
    next(err);
  }
});

// ─── 更新项目配置 ────────────────────────────────────────────
router.put('/:id/config', async (req, res, next) => {
  try {
    const configPath = getMetaPath(req.params.id, 'config');
    const current = await readJson(configPath, {});
    const updated = { ...current, ...req.body };
    await writeJson(configPath, updated);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── 更新故事架构 ────────────────────────────────────────────
router.put('/:id/architecture', async (req, res, next) => {
  try {
    const archPath = getMetaPath(req.params.id, 'architecture');
    const current = await readJson(archPath, {});
    const updated = { ...current, ...req.body };
    await writeJson(archPath, updated);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── 角色卡 CRUD ─────────────────────────────────────────────
router.get('/:id/characters', async (req, res, next) => {
  try {
    const chars = await readJson(getMetaPath(req.params.id, 'characters'), []);
    res.json(chars);
  } catch (err) {
    next(err);
  }
});

router.put('/:id/characters', async (req, res, next) => {
  try {
    await writeJson(getMetaPath(req.params.id, 'characters'), req.body);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── 章节蓝图 ────────────────────────────────────────────────
router.get('/:id/blueprints', async (req, res, next) => {
  try {
    const bps = await readJson(getMetaPath(req.params.id, 'blueprints'), []);
    res.json(bps);
  } catch (err) {
    next(err);
  }
});

router.put('/:id/blueprints', async (req, res, next) => {
  try {
    await writeJson(getMetaPath(req.params.id, 'blueprints'), req.body);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── 蓝图与草稿同步状态 ──────────────────────────────────────
router.get('/:id/blueprints/sync', async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const blueprints = await readJson(getMetaPath(projectId, 'blueprints'), []);
    const chapters = await listAllChapters(projectId);

    const syncItems = blueprints.map(bp => {
      const chapter = chapters.find(c => c.chapterNumber === bp.chapterNumber);
      let draftStatus = 'empty'; // empty | has_content | finalized
      let wordCount = 0;

      if (chapter) {
        draftStatus = chapter.status === 'finalized' ? 'finalized' : 'has_content';
      }

      return {
        chapterNumber: bp.chapterNumber,
        blueprintTitle: bp.title,
        draftStatus,
        draftTitle: chapter?.title || null,
        draftFilename: chapter?.filename || null,
        relPath: chapter?.relPath || null,
      };
    });

    res.json(syncItems);
  } catch (err) {
    next(err);
  }
});

// ─── 蓝图应用到草稿（创建或覆盖） ──────────────────────────
router.post('/:id/blueprints/apply', async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const { chapterNumber, force } = req.body;
    if (!chapterNumber) return res.status(400).json({ error: 'chapterNumber is required' });

    const blueprints = await readJson(getMetaPath(projectId, 'blueprints'), []);
    const bp = blueprints.find(b => b.chapterNumber === chapterNumber);
    if (!bp) return res.status(404).json({ error: `未找到第${chapterNumber}章蓝图` });

    const chapters = await listAllChapters(projectId);
    const existing = chapters.find(c => c.chapterNumber === chapterNumber);

    // 如果已有内容且未强制覆盖，返回需要确认
    if (existing && !force) {
      // 读取现有内容字数
      const fullPath = safeJoin(getProjectDir(projectId), existing.relPath);
      const content = await readText(fullPath);
      const wordCount = content.replace(/\s/g, '').length;
      return res.json({
        needConfirm: true,
        chapterNumber,
        status: existing.status,
        wordCount,
        title: existing.title,
      });
    }

    // 执行应用：创建/覆盖草稿文件
    const draftsDir = getDraftsDir(projectId);
    await ensureDir(draftsDir);
    const num = String(chapterNumber).padStart(3, '0');

    // 如果是定稿，需要删除定稿文件
    if (existing && existing.status === 'finalized') {
      const finalPath = safeJoin(getProjectDir(projectId), existing.relPath);
      try { await fs.unlink(finalPath); } catch {}
    }

    // 删除旧草稿（如果存在）
    if (existing && existing.status === 'draft') {
      const draftPath = safeJoin(getProjectDir(projectId), existing.relPath);
      try { await fs.unlink(draftPath); } catch {}
    }

    // 创建新的空草稿文件（标题来自蓝图）
    let cleanTitle = (bp.title || '').trim();
    cleanTitle = cleanTitle.replace(new RegExp(`^第${chapterNumber}章[\\s　]*`), '');
    cleanTitle = cleanTitle.replace(/^第[一二三四五六七八九十百千零\d]+章[\s　]*/, '').trim();
    const fullTitle = cleanTitle ? `第${chapterNumber}章 ${cleanTitle}` : `第${chapterNumber}章`;
    const filename = `${num}-${fullTitle}.md`;
    await writeText(path.join(draftsDir, filename), `# ${fullTitle}\n\n`);

    res.json({
      needConfirm: false,
      applied: true,
      chapterNumber,
      filename,
      relPath: `.good/drafts/${filename}`,
    });
  } catch (err) {
    next(err);
  }
});

// ─── 一键应用所有蓝图到草稿（跳过已定稿） ──────────────────
router.post('/:id/blueprints/apply-all', async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const { force } = req.body; // force: 是否覆盖已有草稿内容
    const blueprints = await readJson(getMetaPath(projectId, 'blueprints'), []);
    const chapters = await listAllChapters(projectId);
    const draftsDir = getDraftsDir(projectId);
    await ensureDir(draftsDir);

    const results = { created: [], skippedFinalized: [], skippedHasContent: [], overwritten: [] };

    for (const bp of blueprints) {
      const existing = chapters.find(c => c.chapterNumber === bp.chapterNumber);

      // 跳过已定稿
      if (existing && existing.status === 'finalized') {
        results.skippedFinalized.push(bp.chapterNumber);
        continue;
      }

      // 已有草稿内容且未强制覆盖 → 跳过
      if (existing && existing.status === 'draft' && !force) {
        results.skippedHasContent.push(bp.chapterNumber);
        continue;
      }

      const num = String(bp.chapterNumber).padStart(3, '0');

      // 删除旧草稿（如果存在）
      if (existing && existing.status === 'draft') {
        const draftPath = safeJoin(getProjectDir(projectId), existing.relPath);
        try { await fs.unlink(draftPath); } catch {}
        results.overwritten.push(bp.chapterNumber);
      } else {
        results.created.push(bp.chapterNumber);
      }

      // 创建新草稿
      let cleanTitle = (bp.title || '').trim();
      cleanTitle = cleanTitle.replace(new RegExp(`^第${bp.chapterNumber}章[\\s　]*`), '');
      cleanTitle = cleanTitle.replace(/^第[一二三四五六七八九十百千零\d]+章[\s　]*/, '').trim();
      const fullTitle = cleanTitle ? `第${bp.chapterNumber}章 ${cleanTitle}` : `第${bp.chapterNumber}章`;
      const filename = `${num}-${fullTitle}.md`;
      await writeText(path.join(draftsDir, filename), `# ${fullTitle}\n\n`);
    }

    res.json(results);
  } catch (err) {
    next(err);
  }
});

// ─── 读取文件内容（支持新旧路径） ───────────────────────────
router.get('/:id/file', async (req, res, next) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'path query required' });
    const fullPath = safeJoin(getProjectDir(req.params.id), filePath);
    if (fullPath.endsWith('.json')) {
      const data = await readJson(fullPath);
      res.json(data);
    } else {
      const text = await readText(fullPath);
      res.json({ content: text });
    }
  } catch (err) {
    next(err);
  }
});

// ─── 写入文件内容 ────────────────────────────────────────────
router.put('/:id/file', async (req, res, next) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'path query required' });
    const fullPath = safeJoin(getProjectDir(req.params.id), filePath);
    if (fullPath.endsWith('.json')) {
      await writeJson(fullPath, req.body);
    } else {
      await writeText(fullPath, req.body.content ?? '');
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── 创建草稿章节 ────────────────────────────────────────────
router.post('/:id/chapters', async (req, res, next) => {
  try {
    const draftsDir = getDraftsDir(req.params.id);
    await ensureDir(draftsDir);
    const existing = await listDir(draftsDir);
    const mdFiles = existing.filter((e) => e.name.endsWith('.md'));
    const chapterNumber = mdFiles.length + 1;
    const num = String(chapterNumber).padStart(3, '0');
    // 标准化：剥离已有"第N章"前缀，统一加上"第N章 "
    let rawTitle = (req.body.title || '').trim();
    rawTitle = rawTitle.replace(new RegExp(`^第${chapterNumber}章[\\s　]*`), '');
    rawTitle = rawTitle.replace(/^第[一二三四五六七八九十百千零\d]+章[\s　]*/, '').trim();
    const fullTitle = rawTitle ? `第${chapterNumber}章 ${rawTitle}` : `第${chapterNumber}章`;
    const filename = `${num}-${fullTitle}.md`;
    await writeText(path.join(draftsDir, filename), `# ${fullTitle}\n\n`);
    res.status(201).json({ filename, relPath: `.good/drafts/${filename}` });
  } catch (err) {
    next(err);
  }
});

// ─── 删除章节文件（草稿或定稿） ─────────────────────────────
router.delete('/:id/file', async (req, res, next) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'path query required' });
    const fullPath = safeJoin(getProjectDir(req.params.id), filePath);
    await fs.unlink(fullPath);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
