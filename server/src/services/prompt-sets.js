/**
 * Prompt Sets 服务 — 提示词套件管理
 *
 * 概念：一个"套"是一组完整的提示词模板集合，用户可以在不同套之间切换。
 * - 内置套（builtin）：不可删除，代码中硬编码
 * - 自定义套（custom）：用户创建，可编辑、可删除
 *
 * 存储结构：
 *   data/prompt-sets/_registry.json  — 套件注册表（列表 + 当前激活）
 *   data/prompt-sets/{setId}/        — 每个自定义套的提示词文件
 *     {key}.json                     — 单个提示词模板
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { DATA_ROOT } from '../config.js';
import { readJson, writeJson, ensureDir, listDir, exists } from '../utils/fs.js';
import { PROMPTS } from './prompts.js';

const SETS_DIR = path.join(DATA_ROOT, 'prompt-sets');
const REGISTRY_FILE = path.join(SETS_DIR, '_registry.json');

// ─── 内置套定义 ──────────────────────────────────────────────
const BUILTIN_SETS = [
  {
    id: 'default',
    name: '默认套件',
    description: '系统内置的标准网文创作提示词，适用于大多数网文类型',
    builtin: true,
  },
];

// ─── 注册表管理 ──────────────────────────────────────────────
async function loadRegistry() {
  await ensureDir(SETS_DIR);
  const reg = await readJson(REGISTRY_FILE, null);
  if (!reg) {
    const defaultReg = {
      activeSetId: 'default',
      sets: [],
    };
    await writeJson(REGISTRY_FILE, defaultReg);
    return defaultReg;
  }
  return reg;
}

async function saveRegistry(reg) {
  await ensureDir(SETS_DIR);
  await writeJson(REGISTRY_FILE, reg);
}

// ─── 公开 API ────────────────────────────────────────────────

/** 列出所有套件（内置 + 自定义） */
export async function listPromptSets() {
  const reg = await loadRegistry();
  const allSets = [
    ...BUILTIN_SETS.map(s => ({ ...s, active: reg.activeSetId === s.id })),
    ...reg.sets.map(s => ({ ...s, builtin: false, active: reg.activeSetId === s.id })),
  ];
  return { sets: allSets, activeSetId: reg.activeSetId };
}

/** 获取当前激活的套件 ID */
export async function getActivePromptSetId() {
  const reg = await loadRegistry();
  return reg.activeSetId || 'default';
}

/** 切换激活套件 */
export async function setActivePromptSet(setId) {
  const reg = await loadRegistry();
  // 验证 setId 存在
  const isBuiltin = BUILTIN_SETS.some(s => s.id === setId);
  const isCustom = reg.sets.some(s => s.id === setId);
  if (!isBuiltin && !isCustom) {
    throw new Error(`套件 "${setId}" 不存在`);
  }
  reg.activeSetId = setId;
  await saveRegistry(reg);
}

/** 创建新套件 */
export async function createPromptSet({ id, name, description, cloneFrom }) {
  if (!id || !name) throw new Error('id 和 name 必填');
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('id 只能包含字母、数字、下划线、连字符');
  if (BUILTIN_SETS.some(s => s.id === id)) throw new Error('不能使用内置套件 ID');

  const reg = await loadRegistry();
  if (reg.sets.some(s => s.id === id)) throw new Error(`套件 "${id}" 已存在`);

  // 创建目录
  const setDir = path.join(SETS_DIR, id);
  await ensureDir(setDir);

  // 如果指定了 cloneFrom，复制源套件的提示词
  if (cloneFrom) {
    const sourcePrompts = await loadSetPrompts(cloneFrom);
    for (const [key, data] of Object.entries(sourcePrompts)) {
      await writeJson(path.join(setDir, `${key}.json`), data);
    }
  }

  const newSet = { id, name, description: description || '', createdAt: new Date().toISOString() };
  reg.sets.push(newSet);
  await saveRegistry(reg);
  return newSet;
}

/** 更新套件元信息 */
export async function updatePromptSet(setId, { name, description }) {
  if (BUILTIN_SETS.some(s => s.id === setId)) throw new Error('不能修改内置套件');
  const reg = await loadRegistry();
  const set = reg.sets.find(s => s.id === setId);
  if (!set) throw new Error(`套件 "${setId}" 不存在`);
  if (name) set.name = name;
  if (description !== undefined) set.description = description;
  await saveRegistry(reg);
  return set;
}

/** 删除套件（内置不可删） */
export async function deletePromptSet(setId) {
  if (BUILTIN_SETS.some(s => s.id === setId)) throw new Error('不能删除内置套件');
  const reg = await loadRegistry();
  const idx = reg.sets.findIndex(s => s.id === setId);
  if (idx === -1) throw new Error(`套件 "${setId}" 不存在`);

  reg.sets.splice(idx, 1);
  // 如果删除的是当前激活的，切回 default
  if (reg.activeSetId === setId) {
    reg.activeSetId = 'default';
  }
  await saveRegistry(reg);

  // 删除目录
  const setDir = path.join(SETS_DIR, setId);
  try { await fs.rm(setDir, { recursive: true }); } catch {}
  return true;
}

/** 加载指定套件的所有提示词 */
export async function loadSetPrompts(setId) {
  // 内置套件直接返回 PROMPTS
  if (setId === 'default') {
    const result = {};
    for (const [key, tpl] of Object.entries(PROMPTS)) {
      result[key] = { systemRole: tpl.systemRole, content: tpl.content };
    }
    return result;
  }

  // 自定义套件：从目录加载
  const setDir = path.join(SETS_DIR, setId);
  const prompts = {};
  try {
    const entries = await listDir(setDir);
    for (const entry of entries) {
      if (!entry.name.endsWith('.json')) continue;
      const key = entry.name.replace('.json', '');
      const data = await readJson(path.join(setDir, entry.name), null);
      if (data) prompts[key] = data;
    }
  } catch {}

  // 对于自定义套件中缺失的 key，回退到内置默认
  for (const [key, tpl] of Object.entries(PROMPTS)) {
    if (!prompts[key]) {
      prompts[key] = { systemRole: tpl.systemRole, content: tpl.content };
    }
  }
  return prompts;
}

/** 获取套件中单个提示词 */
export async function getSetPrompt(setId, key) {
  if (setId === 'default') {
    const tpl = PROMPTS[key];
    if (!tpl) return null;
    return { systemRole: tpl.systemRole, content: tpl.content, source: 'builtin' };
  }

  const setDir = path.join(SETS_DIR, setId);
  const filePath = path.join(setDir, `${key}.json`);
  const data = await readJson(filePath, null);
  if (data) return { ...data, source: 'custom' };

  // 回退到内置
  const tpl = PROMPTS[key];
  if (!tpl) return null;
  return { systemRole: tpl.systemRole, content: tpl.content, source: 'builtin' };
}

/** 更新套件中的单个提示词 */
export async function updateSetPrompt(setId, key, { systemRole, content }) {
  if (setId === 'default') throw new Error('不能修改内置套件的提示词，请创建新套件');
  if (!PROMPTS[key]) throw new Error(`未知的提示词 key: ${key}`);

  const setDir = path.join(SETS_DIR, setId);
  await ensureDir(setDir);
  await writeJson(path.join(setDir, `${key}.json`), { systemRole, content });
}

/** 重置套件中的单个提示词为内置默认 */
export async function resetSetPrompt(setId, key) {
  if (setId === 'default') return; // 内置套件无需重置
  const setDir = path.join(SETS_DIR, setId);
  const filePath = path.join(setDir, `${key}.json`);
  try { await fs.unlink(filePath); } catch {}
}
