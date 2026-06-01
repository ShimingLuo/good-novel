/**
 * Skill Sets 服务 — 技能套件管理
 *
 * 概念：一个"套"是一组完整的 Skills 集合，用户可以在不同套之间切换。
 * - 内置套（builtin）：不可删除，代码中硬编码
 * - 自定义套（custom）：用户创建，可编辑、可删除
 *
 * 存储结构：
 *   data/skill-sets/_registry.json   — 套件注册表
 *   data/skill-sets/{setId}/         — 每个自定义套的 skill 文件
 *     {name}.json                    — 单个 skill
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { DATA_ROOT } from '../config.js';
import { readJson, writeJson, ensureDir, listDir } from '../utils/fs.js';
import { BUILTIN_SKILLS } from './skills.js';

const SETS_DIR = path.join(DATA_ROOT, 'skill-sets');
const REGISTRY_FILE = path.join(SETS_DIR, '_registry.json');

// ─── 内置套定义 ──────────────────────────────────────────────
const BUILTIN_SETS = [
  {
    id: 'default',
    name: '默认套件',
    description: '系统内置的标准创作技能包（章节审阅、脑暴创意、角色分析、连续性检查、写作教练）',
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
export async function listSkillSets() {
  const reg = await loadRegistry();
  const allSets = [
    ...BUILTIN_SETS.map(s => ({ ...s, active: reg.activeSetId === s.id })),
    ...reg.sets.map(s => ({ ...s, builtin: false, active: reg.activeSetId === s.id })),
  ];
  return { sets: allSets, activeSetId: reg.activeSetId };
}

/** 获取当前激活的套件 ID */
export async function getActiveSkillSetId() {
  const reg = await loadRegistry();
  return reg.activeSetId || 'default';
}

/** 切换激活套件 */
export async function setActiveSkillSet(setId) {
  const reg = await loadRegistry();
  const isBuiltin = BUILTIN_SETS.some(s => s.id === setId);
  const isCustom = reg.sets.some(s => s.id === setId);
  if (!isBuiltin && !isCustom) {
    throw new Error(`套件 "${setId}" 不存在`);
  }
  reg.activeSetId = setId;
  await saveRegistry(reg);
}

/** 创建新套件 */
export async function createSkillSet({ id, name, description, cloneFrom }) {
  if (!id || !name) throw new Error('id 和 name 必填');
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('id 只能包含字母、数字、下划线、连字符');
  if (BUILTIN_SETS.some(s => s.id === id)) throw new Error('不能使用内置套件 ID');

  const reg = await loadRegistry();
  if (reg.sets.some(s => s.id === id)) throw new Error(`套件 "${id}" 已存在`);

  const setDir = path.join(SETS_DIR, id);
  await ensureDir(setDir);

  // 如果指定了 cloneFrom，复制源套件的 skills
  if (cloneFrom) {
    const sourceSkills = await loadSetSkills(cloneFrom);
    for (const skill of sourceSkills) {
      const { source, ...data } = skill;
      await writeJson(path.join(setDir, `${skill.name}.json`), data);
    }
  }

  const newSet = { id, name, description: description || '', createdAt: new Date().toISOString() };
  reg.sets.push(newSet);
  await saveRegistry(reg);
  return newSet;
}

/** 更新套件元信息 */
export async function updateSkillSet(setId, { name, description }) {
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
export async function deleteSkillSet(setId) {
  if (BUILTIN_SETS.some(s => s.id === setId)) throw new Error('不能删除内置套件');
  const reg = await loadRegistry();
  const idx = reg.sets.findIndex(s => s.id === setId);
  if (idx === -1) throw new Error(`套件 "${setId}" 不存在`);

  reg.sets.splice(idx, 1);
  if (reg.activeSetId === setId) {
    reg.activeSetId = 'default';
  }
  await saveRegistry(reg);

  const setDir = path.join(SETS_DIR, setId);
  try { await fs.rm(setDir, { recursive: true }); } catch {}
  return true;
}

/** 加载指定套件的所有 Skills */
export async function loadSetSkills(setId) {
  if (setId === 'default') {
    return BUILTIN_SKILLS.map(s => ({ ...s }));
  }

  // 自定义套件：从目录加载
  const setDir = path.join(SETS_DIR, setId);
  const skills = [];
  try {
    const entries = await listDir(setDir);
    for (const entry of entries) {
      if (!entry.name.endsWith('.json')) continue;
      const data = await readJson(path.join(setDir, entry.name), null);
      if (data && data.name) {
        skills.push({ ...data, source: 'custom' });
      }
    }
  } catch {}
  return skills;
}

/** 获取套件中单个 Skill */
export async function getSetSkill(setId, skillName) {
  if (setId === 'default') {
    const skill = BUILTIN_SKILLS.find(s => s.name === skillName);
    return skill ? { ...skill } : null;
  }

  const setDir = path.join(SETS_DIR, setId);
  const filePath = path.join(setDir, `${skillName}.json`);
  const data = await readJson(filePath, null);
  return data ? { ...data, source: 'custom' } : null;
}

/** 在套件中创建/更新 Skill */
export async function upsertSetSkill(setId, skill) {
  if (setId === 'default') throw new Error('不能修改内置套件的 Skills，请创建新套件');
  if (!skill.name || !skill.content) throw new Error('name 和 content 必填');

  const setDir = path.join(SETS_DIR, setId);
  await ensureDir(setDir);
  const { source, ...data } = skill;
  await writeJson(path.join(setDir, `${skill.name}.json`), {
    name: data.name,
    displayName: data.displayName || data.name,
    description: data.description || '',
    whenToUse: data.whenToUse || '',
    content: data.content,
  });
}

/** 删除套件中的 Skill */
export async function deleteSetSkill(setId, skillName) {
  if (setId === 'default') throw new Error('不能修改内置套件');
  const setDir = path.join(SETS_DIR, setId);
  const filePath = path.join(setDir, `${skillName}.json`);
  try { await fs.unlink(filePath); } catch {}
}
