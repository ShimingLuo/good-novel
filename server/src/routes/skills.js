/**
 * Skills 路由 — 系统级 + 项目级 Skills 管理
 *
 * 系统级：data/skills/{name}.json
 * 项目级：projects/{id}/.good/skills/{name}.json
 *
 * 优先级：项目级 > 系统级（含 user 覆盖） > 内置
 */
import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { writeJson, ensureDir } from '../utils/fs.js';
import {
  loadSystemSkills,
  loadProjectSkills,
  loadAllSkillsForAgent,
  SYSTEM_SKILLS_PATH,
  getProjectSkillsDir,
} from '../services/skills.js';

const router = Router();

// 兼容旧的导出（agent.js 使用）
export async function getSkills(projectId) {
  return await loadAllSkillsForAgent(projectId);
}

// ─── 系统级 Skills ───────────────────────────────────────────
router.get('/system', async (req, res, next) => {
  try {
    const skills = await loadSystemSkills();
    res.json(skills);
  } catch (err) { next(err); }
});

router.post('/system', async (req, res, next) => {
  try {
    const { name, displayName, description, whenToUse, content } = req.body;
    if (!name || !content) return res.status(400).json({ error: 'name and content are required' });

    await ensureDir(SYSTEM_SKILLS_PATH);
    const skill = {
      name,
      displayName: displayName || name,
      description: description || `自定义 Skill: ${name}`,
      whenToUse: whenToUse || '',
      content,
    };
    await writeJson(path.join(SYSTEM_SKILLS_PATH, `${name}.json`), skill);
    res.status(201).json(skill);
  } catch (err) { next(err); }
});

router.put('/system/:name', async (req, res, next) => {
  try {
    const { displayName, description, whenToUse, content } = req.body;
    if (!content) return res.status(400).json({ error: 'content required' });
    await ensureDir(SYSTEM_SKILLS_PATH);
    const skill = {
      name: req.params.name,
      displayName: displayName || req.params.name,
      description: description || '',
      whenToUse: whenToUse || '',
      content,
    };
    await writeJson(path.join(SYSTEM_SKILLS_PATH, `${req.params.name}.json`), skill);
    res.json(skill);
  } catch (err) { next(err); }
});

router.delete('/system/:name', async (req, res, next) => {
  try {
    const filePath = path.join(SYSTEM_SKILLS_PATH, `${req.params.name}.json`);
    try { await fs.unlink(filePath); } catch {}
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── 项目级 Skills ───────────────────────────────────────────
router.get('/project/:projectId', async (req, res, next) => {
  try {
    const skills = await loadProjectSkills(req.params.projectId);
    res.json(skills);
  } catch (err) { next(err); }
});

router.post('/project/:projectId', async (req, res, next) => {
  try {
    const { name, displayName, description, whenToUse, content } = req.body;
    if (!name || !content) return res.status(400).json({ error: 'name and content are required' });

    const dir = getProjectSkillsDir(req.params.projectId);
    await ensureDir(dir);
    const skill = {
      name,
      displayName: displayName || name,
      description: description || `项目 Skill: ${name}`,
      whenToUse: whenToUse || '',
      content,
    };
    await writeJson(path.join(dir, `${name}.json`), skill);
    res.status(201).json(skill);
  } catch (err) { next(err); }
});

router.put('/project/:projectId/:name', async (req, res, next) => {
  try {
    const { displayName, description, whenToUse, content } = req.body;
    if (!content) return res.status(400).json({ error: 'content required' });
    const dir = getProjectSkillsDir(req.params.projectId);
    await ensureDir(dir);
    const skill = {
      name: req.params.name,
      displayName: displayName || req.params.name,
      description: description || '',
      whenToUse: whenToUse || '',
      content,
    };
    await writeJson(path.join(dir, `${req.params.name}.json`), skill);
    res.json(skill);
  } catch (err) { next(err); }
});

router.delete('/project/:projectId/:name', async (req, res, next) => {
  try {
    const filePath = path.join(getProjectSkillsDir(req.params.projectId), `${req.params.name}.json`);
    try { await fs.unlink(filePath); } catch {}
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── 兼容旧接口：列出所有 Skills（默认系统级） ───────────────
router.get('/', async (req, res, next) => {
  try {
    const projectId = req.query.projectId;
    const skills = projectId
      ? await loadAllSkillsForAgent(projectId)
      : await loadSystemSkills();
    res.json(skills);
  } catch (err) { next(err); }
});

export default router;
