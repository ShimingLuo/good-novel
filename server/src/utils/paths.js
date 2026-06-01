/**
 * 项目存储路径工具
 *
 * 数据组织原则：
 * - 项目根目录：仅存放定稿章节（.txt 格式）
 * - .good/ 目录：所有系统相关数据
 *   - .good/project.json    项目配置
 *   - .good/architecture.json  故事架构
 *   - .good/characters.json    角色卡
 *   - .good/blueprints.json    章节蓝图
 *   - .good/outline.md         大纲
 *   - .good/settings.json      项目级设置
 *   - .good/drafts/            草稿章节 (.md)
 *   - .good/notes/             章节要点
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { PROJECTS_ROOT } from '../config.js';
import { safeJoin, ensureDir, exists } from './fs.js';

export function getProjectDir(projectId) {
  return safeJoin(PROJECTS_ROOT, projectId);
}

export function getGoodDir(projectId) {
  return path.join(getProjectDir(projectId), '.good');
}

export function getDraftsDir(projectId) {
  return path.join(getGoodDir(projectId), 'drafts');
}

export function getNotesDir(projectId) {
  return path.join(getGoodDir(projectId), 'notes');
}

/** 元数据文件路径 */
export const META_FILES = {
  config: 'project.json',
  architecture: 'architecture.json',
  characters: 'characters.json',
  blueprints: 'blueprints.json',
  outline: 'outline.md',
  settings: 'settings.json',
};

export function getMetaPath(projectId, key) {
  return path.join(getGoodDir(projectId), META_FILES[key]);
}

/** 已定稿章节的根路径（.txt） */
export function getFinalizedPath(projectId, filename) {
  return path.join(getProjectDir(projectId), filename);
}

/**
 * 旧格式 → 新格式自动迁移
 * 旧格式：
 *   {projectDir}/project.json
 *   {projectDir}/chapters/*.md
 *   {projectDir}/notes/*.md
 *   {projectDir}/.settings.json
 *
 * 新格式：
 *   {projectDir}/.good/{各类元数据}
 *   {projectDir}/.good/drafts/*.md
 *   {projectDir}/.good/notes/*.md
 */
export async function migrateLegacyLayout(projectId) {
  const projDir = getProjectDir(projectId);
  const goodDir = getGoodDir(projectId);

  // 已经是新格式
  if (await exists(goodDir)) return false;

  // 检查是否是旧项目（有任何旧文件）
  const oldConfig = path.join(projDir, 'project.json');
  if (!(await exists(oldConfig))) return false;

  console.log(`[migrate] migrating project ${projectId} to .good/ layout...`);
  await ensureDir(goodDir);

  // 移动元数据文件
  const filesToMove = [
    ['project.json', 'project.json'],
    ['architecture.json', 'architecture.json'],
    ['characters.json', 'characters.json'],
    ['blueprints.json', 'blueprints.json'],
    ['outline.md', 'outline.md'],
    ['.settings.json', 'settings.json'],
  ];

  for (const [oldName, newName] of filesToMove) {
    const oldPath = path.join(projDir, oldName);
    const newPath = path.join(goodDir, newName);
    if (await exists(oldPath)) {
      try { await fs.rename(oldPath, newPath); } catch (e) {
        console.warn(`[migrate] failed to move ${oldName}: ${e.message}`);
      }
    }
  }

  // 移动 chapters → .good/drafts
  const oldChapters = path.join(projDir, 'chapters');
  if (await exists(oldChapters)) {
    try {
      await fs.rename(oldChapters, getDraftsDir(projectId));
    } catch (e) {
      console.warn(`[migrate] failed to move chapters/: ${e.message}`);
    }
  }

  // 移动 notes → .good/notes
  const oldNotes = path.join(projDir, 'notes');
  if (await exists(oldNotes)) {
    try {
      await fs.rename(oldNotes, getNotesDir(projectId));
    } catch (e) {
      console.warn(`[migrate] failed to move notes/: ${e.message}`);
    }
  }

  console.log(`[migrate] project ${projectId} migrated successfully`);
  return true;
}

/**
 * 列出所有章节（合并草稿 + 定稿）
 * 返回 [{ chapterNumber, title, filename, status, path }, ...]
 */
export async function listAllChapters(projectId) {
  const draftsDir = getDraftsDir(projectId);
  const projDir = getProjectDir(projectId);
  const items = new Map(); // chapterNumber -> entry

  // 从文件名解析出的 title 中剥离重复的"第N章"前缀
  // 剥离后如果为空，返回空字符串（前端会显示"第N章"）
  function cleanTitle(rawTitle, chapterNumber) {
    if (!rawTitle) return '';
    const reList = [
      new RegExp(`^第${chapterNumber}章[\\s　]*`),
      /^第[一二三四五六七八九十百千零\d]+章[\s　]*/,
    ];
    let cleaned = rawTitle;
    for (const re of reList) {
      cleaned = cleaned.replace(re, '');
    }
    return cleaned.trim();
  }

  // 草稿
  try {
    const draftFiles = await fs.readdir(draftsDir, { withFileTypes: true });
    for (const f of draftFiles) {
      if (f.isDirectory() || !f.name.endsWith('.md')) continue;
      const m = f.name.match(/^(\d+)-(.+?)\.md$/);
      if (!m) continue;
      const num = parseInt(m[1]);
      items.set(num, {
        chapterNumber: num,
        title: cleanTitle(m[2], num),
        filename: f.name,
        status: 'draft',
        relPath: `.good/drafts/${f.name}`,
      });
    }
  } catch {}

  // 定稿（覆盖同号草稿）
  try {
    const rootFiles = await fs.readdir(projDir, { withFileTypes: true });
    for (const f of rootFiles) {
      if (f.isDirectory() || !f.name.endsWith('.txt')) continue;
      const m = f.name.match(/^(\d+)-(.+?)\.txt$/);
      if (!m) continue;
      const num = parseInt(m[1]);
      items.set(num, {
        chapterNumber: num,
        title: cleanTitle(m[2], num),
        filename: f.name,
        status: 'finalized',
        relPath: f.name,
      });
    }
  } catch {}

  return Array.from(items.values()).sort((a, b) => a.chapterNumber - b.chapterNumber);
}
