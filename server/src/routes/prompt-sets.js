/**
 * Prompt Sets 路由 — 提示词套件管理
 *
 * GET    /prompt-sets              列出所有套件
 * GET    /prompt-sets/active       获取当前激活套件 ID
 * PUT    /prompt-sets/active       切换激活套件
 * POST   /prompt-sets              创建新套件
 * PUT    /prompt-sets/:id          更新套件元信息
 * DELETE /prompt-sets/:id          删除套件
 * GET    /prompt-sets/:id/prompts  列出套件中的提示词
 * GET    /prompt-sets/:id/prompts/:key  获取单个提示词
 * PUT    /prompt-sets/:id/prompts/:key  更新单个提示词
 * DELETE /prompt-sets/:id/prompts/:key  重置单个提示词为默认
 */
import { Router } from 'express';
import {
  listPromptSets,
  getActivePromptSetId,
  setActivePromptSet,
  createPromptSet,
  updatePromptSet,
  deletePromptSet,
  loadSetPrompts,
  getSetPrompt,
  updateSetPrompt,
  resetSetPrompt,
} from '../services/prompt-sets.js';
import { PROMPTS } from '../services/prompts.js';

const router = Router();

const PROMPT_NAMES = {
  generate_global_config: '全文配置生成',
  premise: '故事前提',
  character_dynamics: '角色图谱',
  world_building: '世界观构建',
  synopsis: '情节大纲',
  chapter_blueprint: '章节蓝图生成',
  first_chapter_draft: '第一章草稿',
  next_chapter_draft: '后续章节草稿',
  refine_chapter: '大神级修稿',
  consistency_check: '一致性审稿',
  generate_chapter_notes: '章节要点生成',
  update_character_cards: '角色卡状态更新',
  analyze_writing_style: '文风分析',
};

/** 列出所有套件 */
router.get('/', async (req, res, next) => {
  try {
    const result = await listPromptSets();
    res.json(result);
  } catch (err) { next(err); }
});

/** 获取当前激活套件 */
router.get('/active', async (req, res, next) => {
  try {
    const activeSetId = await getActivePromptSetId();
    res.json({ activeSetId });
  } catch (err) { next(err); }
});

/** 切换激活套件 */
router.put('/active', async (req, res, next) => {
  try {
    const { setId } = req.body;
    if (!setId) return res.status(400).json({ error: 'setId required' });
    await setActivePromptSet(setId);
    res.json({ ok: true, activeSetId: setId });
  } catch (err) { next(err); }
});

/** 创建新套件 */
router.post('/', async (req, res, next) => {
  try {
    const { id, name, description, cloneFrom } = req.body;
    const set = await createPromptSet({ id, name, description, cloneFrom });
    res.status(201).json(set);
  } catch (err) { next(err); }
});

/** 更新套件元信息 */
router.put('/:id', async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const set = await updatePromptSet(req.params.id, { name, description });
    res.json(set);
  } catch (err) { next(err); }
});

/** 删除套件 */
router.delete('/:id', async (req, res, next) => {
  try {
    await deletePromptSet(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/** 列出套件中的提示词（带元信息） */
router.get('/:id/prompts', async (req, res, next) => {
  try {
    const prompts = await loadSetPrompts(req.params.id);
    // 附加名称等元信息
    const result = Object.entries(prompts).map(([key, data]) => ({
      key,
      name: PROMPT_NAMES[key] || key,
      systemRole: data.systemRole,
      content: data.content,
      source: data.source || (PROMPTS[key] && data.systemRole === PROMPTS[key].systemRole && data.content === PROMPTS[key].content ? 'builtin' : 'custom'),
    }));
    res.json(result);
  } catch (err) { next(err); }
});

/** 获取单个提示词 */
router.get('/:id/prompts/:key', async (req, res, next) => {
  try {
    const prompt = await getSetPrompt(req.params.id, req.params.key);
    if (!prompt) return res.status(404).json({ error: '提示词不存在' });
    res.json({ ...prompt, key: req.params.key, name: PROMPT_NAMES[req.params.key] || req.params.key });
  } catch (err) { next(err); }
});

/** 更新单个提示词 */
router.put('/:id/prompts/:key', async (req, res, next) => {
  try {
    const { systemRole, content } = req.body;
    if (!content) return res.status(400).json({ error: 'content required' });
    await updateSetPrompt(req.params.id, req.params.key, { systemRole, content });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/** 重置单个提示词为默认 */
router.delete('/:id/prompts/:key', async (req, res, next) => {
  try {
    await resetSetPrompt(req.params.id, req.params.key);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
