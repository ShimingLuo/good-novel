<script setup lang="ts">
import { ref, nextTick, onMounted, computed } from 'vue';
import { chatApi, agentApi, type ChatMessage, type ChatSettings } from '../api';
import { useWorkspace } from '../stores/workspace';
import ModelManagerDialog from './ModelManagerDialog.vue';

const workspace = useWorkspace();

const mode = ref<'chat' | 'agent'>('agent');
const input = ref('');
const messages = ref<ChatMessage[]>([]);
const isLoading = ref(false);
const error = ref('');
const messagesEl = ref<HTMLElement | null>(null);
const toolCallsLog = ref<any[]>([]);

const settings = ref<ChatSettings>({
  models: [],
  defaultModelId: '',
  modelByTask: {},
  systemPrompt: '',
});

const showManagerDialog = ref(false);
// 当前对话使用的模型；空字符串表示使用默认
const currentModelId = ref('');

const currentModel = computed(() => {
  if (currentModelId.value) {
    return settings.value.models.find(m => m.id === currentModelId.value);
  }
  return settings.value.models.find(m => m.id === settings.value.defaultModelId) || settings.value.models[0];
});

const noModel = computed(() => settings.value.models.length === 0);

async function loadSettings() {
  try {
    settings.value = await chatApi.getSettings();
  } catch {}
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesEl.value) {
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
    }
  });
}

async function send() {
  const text = input.value.trim();
  if (!text || isLoading.value) return;
  if (noModel.value) {
    error.value = '请先在「模型管理」中配置至少一个 AI 模型';
    showManagerDialog.value = true;
    return;
  }

  error.value = '';
  messages.value.push({ role: 'user', content: text });
  input.value = '';
  scrollToBottom();
  isLoading.value = true;

  if (mode.value === 'agent') {
    try {
      const result = await agentApi.chat(workspace.currentProjectId, messages.value, currentModelId.value || undefined);
      messages.value.push({ role: 'assistant', content: result.content });
      toolCallsLog.value = result.toolCalls || [];
      if (result.toolCalls?.length) {
        workspace.addTaskLog('agent', 'success', `Agent 调用了 ${result.toolCalls.length} 个工具 (${result.rounds} 轮)`);
      }
    } catch (e: any) {
      error.value = e.message || '请求失败';
    }
  } else {
    messages.value.push({ role: 'assistant', content: '' });
    const aiMsgIdx = messages.value.length - 1;
    scrollToBottom();

    try {
      const response = await chatApi.streamChat(messages.value.slice(0, -1), currentModelId.value || undefined);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                messages.value[aiMsgIdx].content += delta;
                scrollToBottom();
              }
            } catch {}
          }
        }
      }

      if (!messages.value[aiMsgIdx].content) {
        messages.value.splice(aiMsgIdx, 1);
        const result = await chatApi.syncChat(messages.value, currentModelId.value || undefined);
        messages.value.push({ role: 'assistant', content: result.content });
      }
    } catch (e: any) {
      messages.value.splice(aiMsgIdx, 1);
      error.value = e.message || '请求失败';
    }
  }

  isLoading.value = false;
  scrollToBottom();
}

function clearChat() {
  messages.value = [];
  toolCallsLog.value = [];
  error.value = '';
}

async function onSettingsSaved() {
  await loadSettings();
}

agentApi;

onMounted(loadSettings);
</script>

<template>
  <aside class="agent-panel">
    <div class="panel-header">
      <div class="mode-tabs">
        <button class="mode-tab" :class="{ active: mode === 'agent' }" @click="mode = 'agent'">🤖 Agent</button>
        <button class="mode-tab" :class="{ active: mode === 'chat' }" @click="mode = 'chat'">💬 Chat</button>
      </div>
      <div class="header-actions">
        <button class="header-btn" title="清空对话" @click="clearChat">🗑</button>
        <button class="header-btn" title="模型管理" @click="showManagerDialog = true">⚙️</button>
      </div>
    </div>

    <!-- 模型选择栏 -->
    <div class="model-bar" v-if="settings.models.length">
      <span class="model-label">模型：</span>
      <select v-model="currentModelId" class="model-select">
        <option value="">默认（{{ currentModel?.name || '—' }}）</option>
        <option v-for="m in settings.models" :key="m.id" :value="m.id">
          {{ m.name }} · {{ m.model }}
        </option>
      </select>
    </div>

    <div class="panel-body" ref="messagesEl">
      <!-- 未配置模型提示 -->
      <div v-if="noModel" class="empty-state">
        <div class="empty-icon">🤖</div>
        <p class="empty-title">请先配置 AI 模型</p>
        <p class="empty-desc">点击下方按钮添加模型（OpenAI / DeepSeek / Claude / Ollama 等）</p>
        <button class="btn-config" @click="showManagerDialog = true">⚙️ 打开模型管理</button>
      </div>

      <div v-else-if="!messages.length" class="welcome">
        <div class="welcome-icon">{{ mode === 'agent' ? '🤖' : '✨' }}</div>
        <p class="welcome-title">{{ mode === 'agent' ? 'Good Agent' : 'AI 助手' }}</p>
        <p class="welcome-desc" v-if="mode === 'agent'">
          Agent 模式可以自动读取本书数据、调用 Skills 来帮你分析和创作
        </p>
        <p class="welcome-desc" v-else>Chat 模式提供流式对话，适合快速问答和灵感碰撞</p>
        <div class="quick-actions">
          <button class="quick-btn" @click="input = '帮我审阅最新一章'; send()">📝 审阅章节</button>
          <button class="quick-btn" @click="input = '分析一下主角的角色弧'; send()">👤 角色分析</button>
          <button class="quick-btn" @click="input = '帮我想几个剧情反转的创意'; send()">💡 脑暴创意</button>
          <button class="quick-btn" @click="input = '检查一下设定有没有矛盾'; send()">🔍 连续性检查</button>
        </div>
      </div>

      <div v-else class="messages">
        <div v-for="(msg, i) in messages" :key="i" class="message" :class="msg.role">
          <div class="msg-avatar">{{ msg.role === 'user' ? '👤' : '🤖' }}</div>
          <div class="msg-content">
            <pre class="msg-text">{{ msg.content }}<span v-if="isLoading && i === messages.length - 1 && msg.role === 'assistant'" class="cursor">▊</span></pre>
          </div>
        </div>

        <div v-if="toolCallsLog.length" class="tool-calls-log">
          <div class="tool-calls-header">🔧 工具调用记录</div>
          <div v-for="(tc, i) in toolCallsLog" :key="i" class="tool-call-item" :class="tc.status">
            <span class="tc-icon">{{ tc.status === 'completed' ? '✓' : '✗' }}</span>
            <span class="tc-name">{{ tc.name }}</span>
            <span class="tc-status">{{ tc.status }}</span>
          </div>
        </div>
      </div>

      <div v-if="error" class="error-msg">
        <span>⚠️ {{ error }}</span>
        <button @click="error = ''">✕</button>
      </div>
    </div>

    <div class="panel-footer">
      <div class="input-row">
        <textarea
          v-model="input"
          :placeholder="noModel ? '请先配置模型...' : (mode === 'agent' ? 'Agent 模式：可调用工具和 Skills...' : '输入消息...')"
          rows="1"
          @keydown.enter.exact.prevent="send"
          :disabled="isLoading || noModel"
        ></textarea>
        <button class="send-btn" @click="send" :disabled="isLoading || !input.trim() || noModel">
          {{ isLoading ? '⏳' : '→' }}
        </button>
      </div>
      <div class="footer-info">
        <span class="mode-badge">{{ mode === 'agent' ? '🤖 Agent' : '💬 Chat' }}</span>
        <span class="model-label" v-if="currentModel">{{ currentModel.name }}</span>
      </div>
    </div>

    <!-- 模型管理弹窗 -->
    <ModelManagerDialog
      :open="showManagerDialog"
      @close="showManagerDialog = false"
      @saved="onSettingsSaved"
    />
  </aside>
</template>

<style scoped>
.agent-panel {
  background: var(--bg-surface);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  height: var(--panel-header-height);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.mode-tabs { display: flex; gap: 2px; }
.mode-tab { padding: 4px 10px; font-size: 12px; border-radius: 4px; opacity: 0.6; }
.mode-tab:hover { opacity: 1; }
.mode-tab.active { opacity: 1; background: var(--accent-dim); color: var(--accent); }

.header-actions { display: flex; gap: 4px; }
.header-btn {
  width: 26px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 4px; font-size: 13px; opacity: 0.6;
}
.header-btn:hover { opacity: 1; background: var(--border); }

/* 模型选择栏 */
.model-bar {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-overlay);
  flex-shrink: 0;
}
.model-bar .model-label { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
.model-select { flex: 1; font-size: 11px; padding: 3px 6px; height: 26px; min-width: 0; }

.panel-body { flex: 1; overflow-y: auto; padding: 12px; min-height: 0; }

/* 空状态 */
.empty-state { display: flex; flex-direction: column; align-items: center; padding-top: 60px; text-align: center; gap: 8px; }
.empty-icon { font-size: 48px; opacity: 0.6; }
.empty-title { font-size: 14px; font-weight: 600; color: var(--text); }
.empty-desc { font-size: 12px; color: var(--text-muted); max-width: 240px; line-height: 1.5; margin-bottom: 12px; }
.btn-config { padding: 8px 16px; background: var(--accent); color: #fff; border-radius: 6px; font-size: 12px; font-weight: 500; }
.btn-config:hover { background: var(--accent-hover); }

.welcome { display: flex; flex-direction: column; align-items: center; padding-top: 30px; text-align: center; }
.welcome-icon { font-size: 32px; margin-bottom: 12px; }
.welcome-title { font-size: 15px; font-weight: 600; margin-bottom: 6px; }
.welcome-desc { font-size: 12px; color: var(--text-muted); margin-bottom: 20px; line-height: 1.5; max-width: 260px; }

.quick-actions { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.quick-btn { padding: 8px 12px; background: var(--bg-overlay); border: 1px solid var(--border); border-radius: 6px; font-size: 12px; text-align: left; }
.quick-btn:hover { border-color: var(--accent); background: var(--accent-dim); }

.messages { display: flex; flex-direction: column; gap: 14px; }
.message { display: flex; gap: 8px; align-items: flex-start; }
.msg-avatar { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 13px; flex-shrink: 0; border-radius: 50%; background: var(--bg-overlay); }
.msg-content { flex: 1; min-width: 0; }
.msg-text { font-family: inherit; font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; margin: 0; padding: 8px 10px; border-radius: 8px; }
.message.user .msg-text { background: var(--accent-dim); border-top-left-radius: 2px; }
.message.assistant .msg-text { background: var(--bg-overlay); border-top-left-radius: 2px; }
.cursor { animation: blink 0.8s infinite; color: var(--accent); }
@keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }

.tool-calls-log { margin-top: 12px; padding: 8px; background: var(--bg-overlay); border-radius: 6px; border: 1px solid var(--border); }
.tool-calls-header { font-size: 11px; color: var(--text-dim); margin-bottom: 6px; font-weight: 500; }
.tool-call-item { display: flex; align-items: center; gap: 6px; font-size: 11px; padding: 3px 0; }
.tool-call-item.completed .tc-icon { color: var(--success); }
.tool-call-item.failed .tc-icon { color: var(--danger); }
.tc-name { color: var(--accent); }
.tc-status { color: var(--text-muted); margin-left: auto; }

.error-msg { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; padding: 8px 10px; background: rgba(224, 82, 82, 0.1); border: 1px solid rgba(224, 82, 82, 0.3); border-radius: 6px; font-size: 12px; color: var(--danger); }
.error-msg button { font-size: 12px; opacity: 0.6; }
.error-msg button:hover { opacity: 1; }

.panel-footer { padding: 10px 12px; border-top: 1px solid var(--border); flex-shrink: 0; }
.input-row { display: flex; gap: 6px; align-items: flex-end; }
.input-row textarea { flex: 1; min-height: 32px; max-height: 120px; resize: none; font-size: 12px; padding: 7px 10px; line-height: 1.4; border-radius: 6px; background: var(--bg-overlay); border: 1px solid var(--border); color: var(--text); outline: none; }
.input-row textarea:focus { border-color: var(--accent); }
.input-row textarea:disabled { opacity: 0.5; }
.send-btn { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: var(--accent); color: var(--bg-overlay); border-radius: 6px; font-size: 14px; flex-shrink: 0; }
.send-btn:hover { background: var(--accent-hover); }
.send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.footer-info { display: flex; align-items: center; justify-content: space-between; margin-top: 6px; font-size: 11px; color: var(--text-muted); }
.mode-badge { padding: 1px 6px; border: 1px solid var(--accent); border-radius: 3px; color: var(--accent); }
.footer-info .model-label { padding: 1px 6px; border: 1px solid var(--border); border-radius: 3px; }
</style>
