/**
 * LLM 服务 — 多模型管理 + 统一调用层
 *
 * 数据结构：
 *   {
 *     models: [{ id, name, provider, apiKey, baseUrl, model, temperature, maxTokens }, ...],
 *     defaultModelId: "uuid",
 *     modelByTask: { draft: "uuid", refine: "uuid", ... },
 *     systemPrompt: "..."
 *   }
 *
 * 调用时优先级：
 *   options.modelId > options.task → modelByTask[task] > defaultModelId > 第一个 model
 */
import path from 'node:path';
import { readJson, writeJson, ensureDir } from '../utils/fs.js';
import { DATA_ROOT } from '../config.js';
import { randomUUID } from 'node:crypto';

const SETTINGS_PATH = path.join(DATA_ROOT, 'settings.json');

const DEFAULT_SETTINGS = {
  models: [],
  defaultModelId: '',
  modelByTask: {},
  systemPrompt: '你是一个专业的小说创作助手，帮助用户进行小说写作、情节构思、角色设计、文笔润色等工作。请用中文回复。',
};

/** 旧格式兼容：把单模型字段升级为新的 models 数组 */
function migrateLegacy(settings) {
  if (Array.isArray(settings.models)) return settings;

  const upgraded = {
    models: [],
    defaultModelId: '',
    modelByTask: {},
    systemPrompt: settings.systemPrompt || DEFAULT_SETTINGS.systemPrompt,
  };

  if (settings.apiKey || settings.baseUrl || settings.model) {
    const id = randomUUID();
    upgraded.models.push({
      id,
      name: '默认模型',
      provider: settings.provider || 'openai',
      apiKey: settings.apiKey || '',
      baseUrl: settings.baseUrl || 'https://api.openai.com/v1',
      model: settings.model || 'gpt-3.5-turbo',
      temperature: settings.temperature ?? 0.7,
      maxTokens: settings.maxTokens ?? 4000,
    });
    upgraded.defaultModelId = id;
  }

  // 保留其他无关字段
  return { ...settings, ...upgraded };
}

export async function getSettings() {
  let settings = await readJson(SETTINGS_PATH, DEFAULT_SETTINGS);
  settings = migrateLegacy(settings);
  // 补全缺失字段
  if (!Array.isArray(settings.models)) settings.models = [];
  if (!settings.modelByTask) settings.modelByTask = {};
  if (!settings.systemPrompt) settings.systemPrompt = DEFAULT_SETTINGS.systemPrompt;
  return settings;
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const updated = { ...current, ...patch };
  await ensureDir(DATA_ROOT);
  await writeJson(SETTINGS_PATH, updated);
  return updated;
}

/** 添加 / 更新一个模型 */
export async function upsertModel(model) {
  const settings = await getSettings();
  const id = model.id || randomUUID();
  const idx = settings.models.findIndex(m => m.id === id);
  const entry = {
    id,
    name: model.name || '未命名模型',
    provider: model.provider || 'openai',
    apiKey: model.apiKey || '',
    baseUrl: model.baseUrl || '',
    model: model.model || '',
    temperature: model.temperature ?? 0.7,
    maxTokens: model.maxTokens ?? 4000,
  };
  if (idx >= 0) {
    settings.models[idx] = entry;
  } else {
    settings.models.push(entry);
  }
  // 如果是第一个模型，自动设为默认
  if (!settings.defaultModelId && settings.models.length === 1) {
    settings.defaultModelId = id;
  }
  await saveSettings(settings);
  return entry;
}

export async function deleteModel(id) {
  const settings = await getSettings();
  settings.models = settings.models.filter(m => m.id !== id);
  if (settings.defaultModelId === id) {
    settings.defaultModelId = settings.models[0]?.id || '';
  }
  // 清掉 task → 该模型的引用
  for (const task of Object.keys(settings.modelByTask)) {
    if (settings.modelByTask[task] === id) {
      delete settings.modelByTask[task];
    }
  }
  await saveSettings(settings);
}

/** 解析最终使用的模型 */
export async function resolveModel(options = {}) {
  const settings = await getSettings();
  if (!settings.models.length) {
    throw new Error('请先在设置中配置至少一个 AI 模型');
  }

  // 按优先级查找
  let model = null;
  if (options.modelId) {
    model = settings.models.find(m => m.id === options.modelId);
  }
  if (!model && options.task && settings.modelByTask[options.task]) {
    model = settings.models.find(m => m.id === settings.modelByTask[options.task]);
  }
  if (!model && settings.defaultModelId) {
    model = settings.models.find(m => m.id === settings.defaultModelId);
  }
  if (!model) {
    model = settings.models[0];
  }
  if (!model.apiKey) {
    throw new Error(`模型 "${model.name}" 缺少 API Key`);
  }
  return model;
}

/**
 * 非流式调用 LLM
 * options: { modelId?, task?, temperature?, maxTokens?, model? }
 */
export async function callLLM(messages, options = {}) {
  const m = await resolveModel(options);

  const apiUrl = `${m.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${m.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model || m.model,
      messages,
      temperature: options.temperature ?? m.temperature,
      max_tokens: options.maxTokens ?? m.maxTokens,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    let errMsg = `API 请求失败 (${response.status})`;
    try {
      const errJson = JSON.parse(errText);
      errMsg = errJson.error?.message || errMsg;
    } catch {}
    throw new Error(errMsg);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * 流式调用 LLM
 */
export async function streamLLM(messages, options = {}) {
  const m = await resolveModel(options);

  const apiUrl = `${m.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${m.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model || m.model,
      messages,
      temperature: options.temperature ?? m.temperature,
      max_tokens: options.maxTokens ?? m.maxTokens,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    let errMsg = `API 请求失败 (${response.status})`;
    try {
      const errJson = JSON.parse(errText);
      errMsg = errJson.error?.message || errMsg;
    } catch {}
    throw new Error(errMsg);
  }

  return response;
}
