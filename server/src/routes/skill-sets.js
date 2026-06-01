/**
 * Skill Sets 路由 — 技能套件管理
 *
 * GET    /skill-sets              列出所有套件
 * GET    /skill-sets/active       获取当前激活套件 ID
 * PUT    /skill-sets/active       切换激活套件
 * POST   /skill-sets              创建新套件
 * PUT    /skill-sets/:id          更新套件元信息
 * DELETE /skill-sets/:id          删除套件
 * GET    /skill-sets/:id/skills   列出套件中的 Skills
 * POST   /skill-sets/:id/skills   创建/更新套件中的 Skill
 * DELETE /skill-sets/:id/skills/:name  删除套件中的 Skill
 */
import { Router } from 'express';
import {
  listSkillSets,
  getActiveSkillSetId,
  setActiveSkillSet,
  createSkillSet,
  updateSkillSet,
  deleteSkillSet,
  loadSetSkills,
  upsertSetSkill,
  deleteSetSkill,
} from '../services/skill-sets.js';

const router = Router();

/** 列出所有套件 */
router.get('/', async (req, res, next) => {
  try {
    const result = await listSkillSets();
    res.json(result);
  } catch (err) { next(err); }
});

/** 获取当前激活套件 */
router.get('/active', async (req, res, next) => {
  try {
    const activeSetId = await getActiveSkillSetId();
    res.json({ activeSetId });
  } catch (err) { next(err); }
});

/** 切换激活套件 */
router.put('/active', async (req, res, next) => {
  try {
    const { setId } = req.body;
    if (!setId) return res.status(400).json({ error: 'setId required' });
    await setActiveSkillSet(setId);
    res.json({ ok: true, activeSetId: setId });
  } catch (err) { next(err); }
});

/** 创建新套件 */
router.post('/', async (req, res, next) => {
  try {
    const { id, name, description, cloneFrom } = req.body;
    const set = await createSkillSet({ id, name, description, cloneFrom });
    res.status(201).json(set);
  } catch (err) { next(err); }
});

/** 更新套件元信息 */
router.put('/:id', async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const set = await updateSkillSet(req.params.id, { name, description });
    res.json(set);
  } catch (err) { next(err); }
});

/** 删除套件 */
router.delete('/:id', async (req, res, next) => {
  try {
    await deleteSkillSet(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/** 列出套件中的 Skills */
router.get('/:id/skills', async (req, res, next) => {
  try {
    const skills = await loadSetSkills(req.params.id);
    res.json(skills);
  } catch (err) { next(err); }
});

/** 创建/更新套件中的 Skill */
router.post('/:id/skills', async (req, res, next) => {
  try {
    const skill = req.body;
    await upsertSetSkill(req.params.id, skill);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/** 删除套件中的 Skill */
router.delete('/:id/skills/:name', async (req, res, next) => {
  try {
    await deleteSetSkill(req.params.id, req.params.name);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
