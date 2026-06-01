/**
 * Prompts 路由 — 提示词模板管理
 *
 * 三级覆盖优先级：项目级覆盖 > 系统级覆盖 > 内置默认
 *
 * 系统级：data/prompts/{key}.json
 * 项目级覆盖：projects/{id}/.good/prompts/{key}.json (mode: 'override' 或缺省)
 * 项目级追加：projects/{id}/.good/prompts/{key}.json (mode: 'append')
 *   追加模式不替换原 prompt，而是在原 prompt 末尾追加项目特定指导
 */
import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { DATA_ROOT, PROJECTS_ROOT } from '../config.js';
import { readJson, writeJson, ensureDir, listDir } from '../utils/fs.js';
import {
  PROMPTS,
  loadSystemPromptOverrides,
  loadProjectPromptOverrides,
} from '../services/prompts.js';

const router = Router();
const SYSTEM_PROMPTS_DIR = path.join(DATA_ROOT, 'prompts');

function getProjectPromptsDir(projectId) {
  return path.join(PROJECTS_ROOT, projectId, '.good', 'prompts');
}

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

const PROMPT_DESCRIPTIONS = {
  generate_global_config: '根据用户一句话灵感，生成完整的小说配置 JSON',
  premise: '故事架构第一步：提炼故事前提',
  character_dynamics: '故事架构第二步：构建核心角色关系网',
  world_building: '故事架构第三步：构建世界观矩阵',
  synopsis: '故事架构第四步：生成情节大纲',
  chapter_blueprint: '基于全书架构生成章节蓝图',
  first_chapter_draft: '生成小说第一章的完整正文',
  next_chapter_draft: '基于上下文生成后续章节',
  refine_chapter: '将草稿提升到大神级质量',
  consistency_check: '检查章节的一致性问题',
  generate_chapter_notes: '定稿后生成结构化章节要点',
  update_character_cards: '定稿后更新角色卡动态状态',
  analyze_writing_style: '从正文样本中提取写作风格特征',
};

const PROMPT_USAGE = {
  generate_global_config: { stage: '配置', trigger: '小说配置 → "🚀 一键生成"按钮', icon: '📋' },
  premise: { stage: '架构', trigger: '故事架构 → 故事前提 "✨ AI 生成"', icon: '🎭' },
  character_dynamics: { stage: '架构', trigger: '故事架构 → 角色图谱 "✨ AI 生成"', icon: '👤' },
  world_building: { stage: '架构', trigger: '故事架构 → 世界观 "✨ AI 生成"', icon: '🌍' },
  synopsis: { stage: '架构', trigger: '故事架构 → 情节大纲 "✨ AI 生成"', icon: '📊' },
  chapter_blueprint: { stage: '蓝图', trigger: '章节蓝图 → "✨ AI 生成蓝图"按钮', icon: '📑' },
  first_chapter_draft: { stage: '写稿', trigger: '编辑器 → 第1章 "✍️ 生成"按钮', icon: '✍️' },
  next_chapter_draft: { stage: '写稿', trigger: '编辑器 → 第2章起 "✍️ 生成"按钮', icon: '✍️' },
  refine_chapter: { stage: '修稿', trigger: '编辑器 → "✨ 精修"按钮', icon: '✨' },
  consistency_check: { stage: '审稿', trigger: '编辑器 → "📝 审阅"按钮', icon: '📝' },
  generate_chapter_notes: { stage: '定稿', trigger: '编辑器 → "✅ 定稿"按钮（自动）', icon: '📌' },
  update_character_cards: { stage: '定稿', trigger: '编辑器 → "✅ 定稿"按钮（自动）', icon: '👤' },
  analyze_writing_style: { stage: '工具', trigger: 'Agent 对话 / 文风分析接口', icon: '🎨' },
};

function getPromptName(key) { return PROMPT_NAMES[key] || key; }
function getPromptDescription(key) { return PROMPT_DESCRIPTIONS[key] || ''; }

// ─── 系统级 Prompt 模板列表 ──────────────────────────────────
router.get('/system', async (req, res, next) => {
  try {
    const sysOverrides = await loadSystemPromptOverrides();
    const templates = Object.entries(PROMPTS).map(([key, tpl]) => {
      const custom = sysOverrides[key];
      return {
        key,
        name: getPromptName(key),
        description: getPromptDescription(key),
        systemRole: custom?.systemRole || tpl.systemRole,
        content: custom?.content || tpl.content,
        builtinSystemRole: tpl.systemRole,
        builtinContent: tpl.content,
        source: custom ? 'custom' : 'builtin',
        usage: PROMPT_USAGE[key] || {},
      };
    });
    res.json(templates);
  } catch (err) { next(err); }
});

router.put('/system/:key', async (req, res, next) => {
  try {
    if (!PROMPTS[req.params.key]) return res.status(404).json({ error: 'Unknown prompt' });
    const { systemRole, content } = req.body;
    await ensureDir(SYSTEM_PROMPTS_DIR);
    await writeJson(path.join(SYSTEM_PROMPTS_DIR, `${req.params.key}.json`), { systemRole, content });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/system/:key', async (req, res, next) => {
  try {
    const filePath = path.join(SYSTEM_PROMPTS_DIR, `${req.params.key}.json`);
    try { await fs.unlink(filePath); } catch {}
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── 项目级 Prompt 模板列表 ──────────────────────────────────
// 返回每个 key 的：内置默认 + 系统级覆盖 + 项目级（overide / append）
router.get('/project/:projectId', async (req, res, next) => {
  try {
    const sysOverrides = await loadSystemPromptOverrides();
    const { overrides: projOverrides, appends: projAppends } =
      await loadProjectPromptOverrides(req.params.projectId);

    const templates = Object.entries(PROMPTS).map(([key, tpl]) => {
      const sysOverride = sysOverrides[key];
      const projOverride = projOverrides[key];
      const projAppend = projAppends[key];

      // 当前生效的 systemRole / content
      const effectiveSystemRole =
        projOverride?.systemRole || sysOverride?.systemRole || tpl.systemRole;
      let effectiveContent = projOverride?.content || sysOverride?.content || tpl.content;
      if (projAppend?.content) {
        effectiveContent += `\n\n【★ 本书额外指导】\n${projAppend.content}`;
      }

      return {
        key,
        name: getPromptName(key),
        description: getPromptDescription(key),
        usage: PROMPT_USAGE[key] || {},
        // 各级别的当前值
        builtin: { systemRole: tpl.systemRole, content: tpl.content },
        system: sysOverride ? { systemRole: sysOverride.systemRole, content: sysOverride.content } : null,
        project: {
          override: projOverride
            ? { systemRole: projOverride.systemRole, content: projOverride.content }
            : null,
          append: projAppend ? { content: projAppend.content } : null,
        },
        // 最终生效的内容
        effective: { systemRole: effectiveSystemRole, content: effectiveContent },
      };
    });

    res.json(templates);
  } catch (err) { next(err); }
});

// ─── 项目级覆盖（替换） ──────────────────────────────────────
router.put('/project/:projectId/:key/override', async (req, res, next) => {
  try {
    if (!PROMPTS[req.params.key]) return res.status(404).json({ error: 'Unknown prompt' });
    const { systemRole, content } = req.body;
    const dir = getProjectPromptsDir(req.params.projectId);
    await ensureDir(dir);
    await writeJson(path.join(dir, `${req.params.key}.json`), {
      mode: 'override',
      systemRole,
      content,
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── 项目级追加（保留原 prompt + 追加内容） ──────────────────
router.put('/project/:projectId/:key/append', async (req, res, next) => {
  try {
    if (!PROMPTS[req.params.key]) return res.status(404).json({ error: 'Unknown prompt' });
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'content required' });
    const dir = getProjectPromptsDir(req.params.projectId);
    await ensureDir(dir);
    await writeJson(path.join(dir, `${req.params.key}.json`), {
      mode: 'append',
      content,
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── 删除项目级覆盖（恢复使用系统级） ────────────────────────
router.delete('/project/:projectId/:key', async (req, res, next) => {
  try {
    const dir = getProjectPromptsDir(req.params.projectId);
    const filePath = path.join(dir, `${req.params.key}.json`);
    try { await fs.unlink(filePath); } catch {}
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── 兼容旧接口（默认走系统级） ──────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const sysOverrides = await loadSystemPromptOverrides();
    const templates = Object.entries(PROMPTS).map(([key, tpl]) => {
      const custom = sysOverrides[key];
      return {
        key,
        name: getPromptName(key),
        description: getPromptDescription(key),
        systemRole: custom?.systemRole || tpl.systemRole,
        content: custom?.content || tpl.content,
        source: custom ? 'custom' : 'builtin',
        usage: PROMPT_USAGE[key] || {},
        editable: true,
      };
    });
    res.json(templates);
  } catch (err) { next(err); }
});

export default router;
