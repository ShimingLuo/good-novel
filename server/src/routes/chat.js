import { Router } from 'express';
import { getSettings, saveSettings, upsertModel, deleteModel, resolveModel } from '../services/llm.js';

const router = Router();

// ─── 获取设置（apiKey 掩码） ───────────────────────────────
router.get('/settings', async (req, res, next) => {
  try {
    const settings = await getSettings();
    const masked = {
      ...settings,
      models: settings.models.map(m => ({
        ...m,
        apiKey: maskKey(m.apiKey),
      })),
    };
    res.json(masked);
  } catch (err) {
    next(err);
  }
});

// ─── 更新基础设置（systemPrompt / defaultModelId / modelByTask） ─
router.put('/settings', async (req, res, next) => {
  try {
    const updates = {};
    if (req.body.systemPrompt !== undefined) updates.systemPrompt = req.body.systemPrompt;
    if (req.body.defaultModelId !== undefined) updates.defaultModelId = req.body.defaultModelId;
    if (req.body.modelByTask !== undefined) updates.modelByTask = req.body.modelByTask;
    await saveSettings(updates);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── 添加/更新模型 ──────────────────────────────────────────
router.post('/settings/models', async (req, res, next) => {
  try {
    const incoming = { ...req.body };
    // 如果 apiKey 是掩码则不更新（保留旧值）
    if (incoming.id && incoming.apiKey && incoming.apiKey.includes('****')) {
      const settings = await getSettings();
      const existing = settings.models.find(m => m.id === incoming.id);
      if (existing) incoming.apiKey = existing.apiKey;
      else delete incoming.apiKey;
    }
    const saved = await upsertModel(incoming);
    res.json({ ...saved, apiKey: maskKey(saved.apiKey) });
  } catch (err) {
    next(err);
  }
});

router.delete('/settings/models/:id', async (req, res, next) => {
  try {
    await deleteModel(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── 测试模型连通性 ────────────────────────────────────────
router.post('/settings/models/:id/test', async (req, res, next) => {
  try {
    const settings = await getSettings();
    const model = settings.models.find(m => m.id === req.params.id);
    if (!model) return res.status(404).json({ error: '模型不存在' });
    if (!model.apiKey) return res.status(400).json({ error: '请先填写 API Key' });

    const apiUrl = `${model.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${model.apiKey}`,
      },
      body: JSON.stringify({
        model: model.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      let errMsg = `请求失败 (${response.status})`;
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error?.message || errMsg;
      } catch {}
      return res.status(response.status).json({ ok: false, error: errMsg });
    }
    const data = await response.json();
    res.json({ ok: true, content: data.choices?.[0]?.message?.content || '' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── 流式对话 ────────────────────────────────────────────────
router.post('/completions', async (req, res, next) => {
  try {
    const { messages, systemPrompt, modelId } = req.body;
    if (!messages?.length) return res.status(400).json({ error: 'messages 不能为空' });

    const settings = await getSettings();
    const model = await resolveModel({ modelId });

    const fullMessages = [
      { role: 'system', content: systemPrompt || settings.systemPrompt },
      ...messages,
    ];

    const apiUrl = `${model.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${model.apiKey}`,
      },
      body: JSON.stringify({
        model: model.model,
        messages: fullMessages,
        temperature: model.temperature,
        max_tokens: model.maxTokens,
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
      return res.status(response.status).json({ error: errMsg });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
    } catch (e) {
      console.error('[chat] stream error:', e);
    }
    res.end();
  } catch (err) {
    next(err);
  }
});

// ─── 非流式对话 ──────────────────────────────────────────────
router.post('/completions/sync', async (req, res, next) => {
  try {
    const { messages, systemPrompt, modelId } = req.body;
    if (!messages?.length) return res.status(400).json({ error: 'messages 不能为空' });

    const settings = await getSettings();
    const model = await resolveModel({ modelId });
    const fullMessages = [
      { role: 'system', content: systemPrompt || settings.systemPrompt },
      ...messages,
    ];

    const apiUrl = `${model.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${model.apiKey}`,
      },
      body: JSON.stringify({
        model: model.model,
        messages: fullMessages,
        temperature: model.temperature,
        max_tokens: model.maxTokens,
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
      return res.status(response.status).json({ error: errMsg });
    }
    const data = await response.json();
    res.json({ content: data.choices?.[0]?.message?.content || '' });
  } catch (err) {
    next(err);
  }
});

function maskKey(key) {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

export default router;
