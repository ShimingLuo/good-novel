import fs from 'node:fs/promises';
import path from 'node:path';

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(p, fallback = null) {
  try {
    const txt = await fs.readFile(p, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}

export async function writeJson(p, data) {
  await ensureDir(path.dirname(p));
  await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf8');
}

export async function readText(p, fallback = '') {
  try {
    return await fs.readFile(p, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}

export async function writeText(p, text) {
  await ensureDir(path.dirname(p));
  await fs.writeFile(p, text ?? '', 'utf8');
}

/** 阻止越权访问：确保 target 一定在 root 下 */
export function safeJoin(root, ...parts) {
  const target = path.resolve(root, ...parts);
  const rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    const err = new Error('Path escapes project root');
    err.status = 400;
    throw err;
  }
  return target;
}

export async function listDir(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => !e.name.startsWith('.'))
      .map((e) => ({ name: e.name, isDir: e.isDirectory() }));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}
