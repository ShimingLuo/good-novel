/**
 * 设置路由 — 系统设置 + 项目设置（两级覆盖）
 * 
 * 优先级：项目设置 > 系统设置 > 默认值
 * 
 * 系统设置存储在 data/settings.json 的 ui/theme/editor 字段
 * 项目设置存储在 projects/{id}/.settings.json
 */
import { Router } from 'express';
import path from 'node:path';
import { DATA_ROOT, PROJECTS_ROOT } from '../config.js';
import { readJson, writeJson, ensureDir, safeJoin } from '../utils/fs.js';

const router = Router();
const SETTINGS_PATH = path.join(DATA_ROOT, 'settings.json');

// ─── 默认值 ──────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  // 主题
  'workbench.theme': 'dark-default',
  'workbench.colorCustomizations': {},

  // 编辑器
  'editor.fontSize': 14,
  'editor.fontFamily': "'JetBrains Mono', 'Fira Code', monospace",
  'editor.lineHeight': 1.6,
  'editor.tabSize': 2,
  'editor.wordWrap': 'on',
  'editor.lineNumbers': true,

  // UI
  'ui.fontSize': 13,
  'ui.density': 'normal',
  'ui.showStatusBar': true,
};

// ─── 内置主题预设 ────────────────────────────────────────────
const BUILTIN_THEMES = {
  'dark-default': {
    label: '深色默认',
    type: 'dark',
    colors: {
      '--bg-base': '#1a1b1e',
      '--bg-surface': '#202124',
      '--bg-overlay': '#161719',
      '--bg-elevated': '#2a2b2f',
      '--border': '#2e2f33',
      '--border-active': '#3d3e42',
      '--text': '#e0e0e0',
      '--text-dim': '#a8a8a8',
      '--text-muted': '#6b6b6b',
      '--accent': '#7c6fe0',
      '--accent-hover': '#9488f0',
      '--accent-dim': 'rgba(124, 111, 224, 0.15)',
      '--success': '#5cb85c',
      '--success-dim': 'rgba(92, 184, 92, 0.15)',
      '--warning': '#e6a23c',
      '--danger': '#e05252',
    },
  },
  'dark-blue': {
    label: '深色蓝调',
    type: 'dark',
    colors: {
      '--bg-base': '#0d1117',
      '--bg-surface': '#161b22',
      '--bg-overlay': '#0a0d12',
      '--bg-elevated': '#21262d',
      '--border': '#30363d',
      '--border-active': '#484f58',
      '--text': '#c9d1d9',
      '--text-dim': '#8b949e',
      '--text-muted': '#6e7681',
      '--accent': '#58a6ff',
      '--accent-hover': '#79b8ff',
      '--accent-dim': 'rgba(88, 166, 255, 0.15)',
      '--success': '#3fb950',
      '--success-dim': 'rgba(63, 185, 80, 0.15)',
      '--warning': '#d29922',
      '--danger': '#f85149',
    },
  },
  'dark-green': {
    label: '深色翠绿',
    type: 'dark',
    colors: {
      '--bg-base': '#1a1f1c',
      '--bg-surface': '#1f2622',
      '--bg-overlay': '#161a17',
      '--bg-elevated': '#2a322d',
      '--border': '#2e3631',
      '--border-active': '#3d4842',
      '--text': '#e0e6e2',
      '--text-dim': '#a0a8a3',
      '--text-muted': '#6b7370',
      '--accent': '#10b981',
      '--accent-hover': '#34d399',
      '--accent-dim': 'rgba(16, 185, 129, 0.15)',
      '--success': '#10b981',
      '--success-dim': 'rgba(16, 185, 129, 0.15)',
      '--warning': '#f59e0b',
      '--danger': '#ef4444',
    },
  },
  'light-default': {
    label: '浅色默认',
    type: 'light',
    colors: {
      '--bg-base': '#ffffff',
      '--bg-surface': '#f5f5f5',
      '--bg-overlay': '#fafafa',
      '--bg-elevated': '#ebebeb',
      '--border': '#e0e0e0',
      '--border-active': '#c0c0c0',
      '--text': '#1f1f1f',
      '--text-dim': '#5f5f5f',
      '--text-muted': '#9e9e9e',
      '--accent': '#7c6fe0',
      '--accent-hover': '#5b4fcf',
      '--accent-dim': 'rgba(124, 111, 224, 0.12)',
      '--success': '#16a34a',
      '--success-dim': 'rgba(22, 163, 74, 0.12)',
      '--warning': '#ea580c',
      '--danger': '#dc2626',
    },
  },
};

// ─── 系统设置 ────────────────────────────────────────────────
async function loadSystemSettings() {
  const stored = await readJson(SETTINGS_PATH, {});
  // 把已有的 chat 字段保留，但合并 ui/theme/editor 的默认值
  return { ...DEFAULT_SETTINGS, ...stored };
}

async function saveSystemSettings(settings) {
  await ensureDir(DATA_ROOT);
  await writeJson(SETTINGS_PATH, settings);
}

// ─── 项目设置 ────────────────────────────────────────────────
async function loadProjectSettings(projectId) {
  if (!projectId) return {};
  const settingsPath = path.join(PROJECTS_ROOT, projectId, '.good', 'settings.json');
  return await readJson(settingsPath, {});
}

async function saveProjectSettings(projectId, settings) {
  const goodDir = path.join(PROJECTS_ROOT, projectId, '.good');
  await ensureDir(goodDir);
  await writeJson(path.join(goodDir, 'settings.json'), settings);
}

// ─── 路由：列出主题 ──────────────────────────────────────────
router.get('/themes', (req, res) => {
  const themes = Object.entries(BUILTIN_THEMES).map(([id, t]) => ({
    id,
    label: t.label,
    type: t.type,
    colors: t.colors,
  }));
  res.json(themes);
});

// ─── 路由：获取系统设置 ──────────────────────────────────────
router.get('/system', async (req, res, next) => {
  try {
    const settings = await loadSystemSettings();
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

// ─── 路由：更新系统设置 ──────────────────────────────────────
router.put('/system', async (req, res, next) => {
  try {
    const current = await loadSystemSettings();
    const updated = { ...current, ...req.body };
    await saveSystemSettings(updated);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── 路由：获取项目设置 ──────────────────────────────────────
router.get('/project/:id', async (req, res, next) => {
  try {
    const settings = await loadProjectSettings(req.params.id);
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

// ─── 路由：更新项目设置 ──────────────────────────────────────
router.put('/project/:id', async (req, res, next) => {
  try {
    const current = await loadProjectSettings(req.params.id);
    const updated = { ...current, ...req.body };
    await saveProjectSettings(req.params.id, updated);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── 路由：删除项目级单个设置（恢复使用系统级） ──────────────
router.delete('/project/:id/:key', async (req, res, next) => {
  try {
    const current = await loadProjectSettings(req.params.id);
    delete current[req.params.key];
    await saveProjectSettings(req.params.id, current);
    res.json(current);
  } catch (err) {
    next(err);
  }
});

// ─── 路由：获取合并后的有效设置（系统 + 项目） ───────────────
router.get('/effective/:projectId?', async (req, res, next) => {
  try {
    const sys = await loadSystemSettings();
    const proj = req.params.projectId ? await loadProjectSettings(req.params.projectId) : {};
    const effective = { ...DEFAULT_SETTINGS, ...sys, ...proj };
    res.json({
      effective,
      system: sys,
      project: proj,
      defaults: DEFAULT_SETTINGS,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
