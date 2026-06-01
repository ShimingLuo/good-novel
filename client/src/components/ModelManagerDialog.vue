<script setup lang="ts">
import { ref, watch } from 'vue';
import { chatApi, TASK_LABELS, type ModelConfig, type ChatSettings } from '../api';
import BaseDialog from './BaseDialog.vue';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const settings = ref<ChatSettings>({
  models: [],
  defaultModelId: '',
  modelByTask: {},
  systemPrompt: '',
});

const view = ref<'list' | 'edit' | 'tasks'>('list');
const editingModel = ref<Partial<ModelConfig> | null>(null);
const testingModelId = ref('');
const testResult = ref<{ ok: boolean; content?: string; error?: string } | null>(null);
const saving = ref(false);
const savedFlash = ref('');

const providerPresets: Record<string, { baseUrl: string; model: string }> = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-5-sonnet-latest' },
  zhipu: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-plus' },
  ollama: { baseUrl: 'http://localhost:11434/v1', model: 'llama3' },
  custom: { baseUrl: '', model: '' },
};

async function loadSettings() {
  settings.value = await chatApi.getSettings();
}

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    loadSettings();
    view.value = 'list';
    editingModel.value = null;
    testResult.value = null;
  }
});

function flash(msg: string) {
  savedFlash.value = msg;
  setTimeout(() => { savedFlash.value = ''; }, 1800);
}

// ─── 模型 CRUD ─────────────────────────────────────────────
function startNew() {
  editingModel.value = {
    name: '',
    provider: 'openai',
    apiKey: '',
    baseUrl: providerPresets.openai.baseUrl,
    model: providerPresets.openai.model,
    temperature: 0.7,
    maxTokens: 4000,
  };
  view.value = 'edit';
}

function startEdit(m: ModelConfig) {
  editingModel.value = { ...m };
  view.value = 'edit';
}

function onProviderChange() {
  if (!editingModel.value) return;
  const preset = providerPresets[editingModel.value.provider || 'openai'];
  if (preset) {
    editingModel.value.baseUrl = preset.baseUrl;
    editingModel.value.model = preset.model;
  }
}

async function saveModel() {
  if (!editingModel.value) return;
  saving.value = true;
  try {
    const saved = await chatApi.upsertModel(editingModel.value);
    await loadSettings();
    // 如果是第一个模型，自动设默认
    if (settings.value.models.length === 1 && !settings.value.defaultModelId) {
      await chatApi.updateSettings({ defaultModelId: saved.id });
      await loadSettings();
    }
    flash('已保存');
    view.value = 'list';
    editingModel.value = null;
    emit('saved');
  } catch (e: any) {
    alert('保存失败: ' + e.message);
  } finally {
    saving.value = false;
  }
}

async function removeModel(id: string) {
  if (!confirm('确定要删除这个模型吗？')) return;
  await chatApi.deleteModel(id);
  await loadSettings();
  emit('saved');
}

async function setDefault(id: string) {
  await chatApi.updateSettings({ defaultModelId: id });
  settings.value.defaultModelId = id;
  flash('已设为默认');
  emit('saved');
}

async function testModel(id: string) {
  testingModelId.value = id;
  testResult.value = null;
  try {
    const result = await chatApi.testModel(id);
    testResult.value = result;
  } catch (e: any) {
    testResult.value = { ok: false, error: e.message };
  } finally {
    testingModelId.value = '';
  }
}

// ─── 任务模型映射 ────────────────────────────────────────
async function setTaskModel(task: string, modelId: string) {
  const next = { ...settings.value.modelByTask };
  if (modelId) next[task] = modelId;
  else delete next[task];
  settings.value.modelByTask = next;
  await chatApi.updateSettings({ modelByTask: next });
  flash('已保存');
}

async function saveSystemPrompt() {
  await chatApi.updateSettings({ systemPrompt: settings.value.systemPrompt });
  flash('已保存');
}

function getModelName(id: string): string {
  return settings.value.models.find(m => m.id === id)?.name || '（默认）';
}
</script>

<template>
  <BaseDialog :open="open" title="🤖 AI 模型管理" width="800px" @close="emit('close')">
    <!-- ═══ 列表视图 ═══ -->
    <div v-if="view === 'list'" class="manager">
      <div class="manager-header">
        <h3>已配置模型 ({{ settings.models.length }})</h3>
        <div class="header-actions">
          <button class="btn btn-outline" @click="view = 'tasks'">⚙️ 任务模型映射</button>
          <button class="btn btn-accent" @click="startNew">＋ 新增模型</button>
        </div>
      </div>

      <div v-if="!settings.models.length" class="empty">
        <p>还没有配置任何模型。点击「＋ 新增模型」开始</p>
      </div>

      <div v-else class="model-list">
        <div
          v-for="m in settings.models"
          :key="m.id"
          class="model-card"
          :class="{ default: settings.defaultModelId === m.id }"
        >
          <div class="model-info" @click="startEdit(m)">
            <div class="model-name-row">
              <span class="model-name">{{ m.name }}</span>
              <span v-if="settings.defaultModelId === m.id" class="default-tag">默认</span>
              <span class="provider-tag">{{ m.provider }}</span>
            </div>
            <div class="model-detail">{{ m.model }} · {{ m.baseUrl }}</div>
            <div class="model-detail dim">temp={{ m.temperature }} · max={{ m.maxTokens }}</div>
          </div>
          <div class="model-actions">
            <button
              v-if="settings.defaultModelId !== m.id"
              class="action-btn"
              title="设为默认"
              @click="setDefault(m.id)"
            >★</button>
            <button
              class="action-btn"
              :class="{ testing: testingModelId === m.id }"
              title="测试连通性"
              @click="testModel(m.id)"
              :disabled="!!testingModelId"
            >{{ testingModelId === m.id ? '⏳' : '🔌' }}</button>
            <button class="action-btn" title="编辑" @click="startEdit(m)">✎</button>
            <button class="action-btn delete" title="删除" @click="removeModel(m.id)">🗑</button>
          </div>
        </div>
      </div>

      <!-- 测试结果 -->
      <div v-if="testResult" class="test-result" :class="{ ok: testResult.ok, fail: !testResult.ok }">
        <span v-if="testResult.ok">✓ 连接成功，模型回应：{{ testResult.content }}</span>
        <span v-else>✗ {{ testResult.error }}</span>
        <button class="dismiss" @click="testResult = null">✕</button>
      </div>

      <!-- 系统提示词 -->
      <div class="system-prompt-section">
        <label>全局 System Prompt（Chat 模式默认使用）</label>
        <textarea v-model="settings.systemPrompt" rows="3" @blur="saveSystemPrompt"></textarea>
      </div>
    </div>

    <!-- ═══ 编辑视图 ═══ -->
    <div v-else-if="view === 'edit' && editingModel" class="editor">
      <div class="manager-header">
        <h3>{{ editingModel.id ? '编辑模型' : '新增模型' }}</h3>
        <button class="btn btn-outline" @click="view = 'list'; editingModel = null">← 返回</button>
      </div>

      <div class="form-grid">
        <div class="field full">
          <label>模型别名（自定义）</label>
          <input v-model="editingModel.name" placeholder="如：DeepSeek 主力 / Claude 精修" autofocus />
        </div>

        <div class="field">
          <label>服务商</label>
          <select v-model="editingModel.provider" @change="onProviderChange">
            <option value="openai">OpenAI</option>
            <option value="deepseek">DeepSeek</option>
            <option value="anthropic">Anthropic Claude</option>
            <option value="zhipu">智谱 GLM</option>
            <option value="ollama">Ollama (本地)</option>
            <option value="custom">自定义</option>
          </select>
        </div>

        <div class="field">
          <label>模型 ID</label>
          <input v-model="editingModel.model" placeholder="gpt-4o / deepseek-chat..." />
        </div>

        <div class="field full">
          <label>Base URL</label>
          <input v-model="editingModel.baseUrl" placeholder="https://..." />
        </div>

        <div class="field full">
          <label>API Key</label>
          <input v-model="editingModel.apiKey" type="password" placeholder="sk-..." autocomplete="off" />
        </div>

        <div class="field">
          <label>Temperature</label>
          <input v-model.number="editingModel.temperature" type="number" min="0" max="2" step="0.1" />
        </div>

        <div class="field">
          <label>Max Tokens</label>
          <input v-model.number="editingModel.maxTokens" type="number" min="100" step="100" />
        </div>
      </div>

      <div class="form-actions">
        <button class="btn btn-accent" @click="saveModel" :disabled="saving">
          {{ saving ? '保存中...' : '💾 保存' }}
        </button>
        <button class="btn btn-outline" @click="view = 'list'; editingModel = null">取消</button>
      </div>
    </div>

    <!-- ═══ 任务映射视图 ═══ -->
    <div v-else-if="view === 'tasks'" class="task-mapping">
      <div class="manager-header">
        <h3>任务模型映射</h3>
        <button class="btn btn-outline" @click="view = 'list'">← 返回</button>
      </div>
      <p class="task-tip">💡 为不同任务指定不同的模型。未指定的任务使用默认模型。例如：用 DeepSeek 写大纲，用 Claude 精修。</p>

      <div v-if="!settings.models.length" class="empty">
        <p>请先添加至少一个模型</p>
      </div>
      <div v-else class="task-list">
        <div v-for="t in TASK_LABELS" :key="t.key" class="task-row">
          <div class="task-info">
            <span class="task-label">{{ t.label }}</span>
            <span class="task-key">{{ t.key }}</span>
            <span v-if="t.desc" class="task-desc">{{ t.desc }}</span>
          </div>
          <select
            :value="settings.modelByTask[t.key] || ''"
            @change="setTaskModel(t.key, ($event.target as HTMLSelectElement).value)"
          >
            <option value="">— 默认（{{ getModelName(settings.defaultModelId) }}）—</option>
            <option v-for="m in settings.models" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
        </div>
      </div>
    </div>

    <template #footer>
      <span v-if="savedFlash" class="flash-msg">{{ savedFlash }}</span>
      <button class="dlg-btn dlg-btn-primary" @click="emit('close')">完成</button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.manager-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.manager-header h3 { font-size: 14px; font-weight: 600; }
.header-actions { display: flex; gap: 8px; }

.btn { padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 500; transition: all 0.15s; }
.btn-accent { background: var(--accent); color: #fff; }
.btn-accent:hover { background: var(--accent-hover); }
.btn-accent:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-outline { border: 1px solid var(--border); color: var(--text-dim); }
.btn-outline:hover { border-color: var(--accent); color: var(--accent); }

.empty { padding: 40px; text-align: center; color: var(--text-muted); font-size: 13px; }

/* 模型列表 */
.model-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.model-card {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 14px;
  background: var(--bg-overlay);
  border: 1px solid var(--border);
  border-radius: 6px;
  transition: border-color 0.15s;
}
.model-card:hover { border-color: var(--accent); }
.model-card.default { border-color: var(--accent); background: var(--accent-dim); }

.model-info { flex: 1; cursor: pointer; min-width: 0; }
.model-name-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap; }
.model-name { font-size: 13px; font-weight: 600; color: var(--text); }
.default-tag { font-size: 10px; padding: 1px 6px; border-radius: 8px; background: var(--accent); color: #fff; }
.provider-tag { font-size: 10px; padding: 1px 6px; border-radius: 8px; background: var(--bg-base); color: var(--text-muted); font-family: monospace; }
.model-detail { font-size: 11px; color: var(--text-dim); font-family: monospace; word-break: break-all; }
.model-detail.dim { color: var(--text-muted); margin-top: 2px; }

.model-actions { display: flex; gap: 2px; flex-shrink: 0; }
.action-btn {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 4px; font-size: 12px;
  background: transparent; border: none;
  color: var(--text-muted);
}
.action-btn:hover:not(:disabled) { background: var(--border); color: var(--text); }
.action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.action-btn.delete:hover { color: var(--danger); background: rgba(224, 82, 82, 0.1); }
.action-btn.testing { color: var(--warning); }

.test-result {
  margin-bottom: 14px; padding: 10px 12px; border-radius: 6px;
  font-size: 12px; display: flex; align-items: center; justify-content: space-between;
}
.test-result.ok { background: var(--success-dim); color: var(--success); }
.test-result.fail { background: rgba(224, 82, 82, 0.1); color: var(--danger); }
.dismiss { font-size: 11px; opacity: 0.6; padding: 0 4px; }
.dismiss:hover { opacity: 1; }

.system-prompt-section { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }
.system-prompt-section label { font-size: 12px; color: var(--text-dim); display: block; margin-bottom: 6px; }
.system-prompt-section textarea { width: 100%; font-size: 12px; padding: 8px 10px; resize: vertical; line-height: 1.5; min-height: 60px; }

/* 编辑视图 */
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field.full { grid-column: span 2; }
.field label { font-size: 11px; color: var(--text-dim); font-weight: 500; }
.field input, .field select { font-size: 12px; padding: 7px 10px; height: 32px; }

.form-actions { display: flex; gap: 8px; padding-top: 12px; border-top: 1px solid var(--border); }

/* 任务映射视图 */
.task-tip { font-size: 12px; color: var(--text-dim); margin-bottom: 14px; padding: 8px 12px; background: var(--bg-overlay); border-left: 3px solid var(--accent); border-radius: 0 4px 4px 0; line-height: 1.5; }
.task-list { display: flex; flex-direction: column; gap: 6px; }
.task-row {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 12px;
  background: var(--bg-overlay);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.task-info { flex: 1; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.task-label { font-size: 13px; font-weight: 500; }
.task-key { font-size: 10px; color: var(--text-muted); font-family: monospace; }
.task-desc { font-size: 11px; color: var(--text-dim); }
.task-row select { width: 220px; font-size: 12px; padding: 5px 8px; height: 30px; flex-shrink: 0; }

.flash-msg { color: var(--success); font-size: 12px; margin-right: auto; }
.dlg-btn { padding: 7px 18px; border-radius: 6px; font-size: 13px; font-weight: 500; }
.dlg-btn-primary { background: var(--accent); color: #fff; }
.dlg-btn-primary:hover { background: var(--accent-hover); }
</style>
