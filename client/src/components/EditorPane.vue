<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick, computed } from 'vue';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { useWorkspace } from '../stores/workspace';
import { useSettings } from '../stores/settings';
import { api, workflowApi, type Blueprint } from '../api';
import BaseDialog from './BaseDialog.vue';

const workspace = useWorkspace();
const settings = useSettings();
const editorContainer = ref<HTMLElement | null>(null);
let view: EditorView | null = null;
const content = ref('');
const saving = ref(false);
const aiWorking = ref<string | null>(null);
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// 从文件名提取章节号
const chapterNumber = computed(() => {
  const tab = workspace.activeTab;
  if (!tab?.path) return 0;
  const match = tab.path.match(/(\d+)-/);
  return match ? parseInt(match[1]) : 0;
});

const isChapter = computed(() => workspace.activeTab?.type === 'editor' && chapterNumber.value > 0);

// ─── 弹窗状态 ────────────────────────────────────────────────
const showDraftDialog = ref(false);
const showRefineDialog = ref(false);
const showReviewDialog = ref(false);
const showReviewResult = ref(false);

const draftOptions = ref({
  userGuidance: '',
  temperature: 0.7,
});

const refineOptions = ref({
  userRefinePrompt: '',
  temperature: 0.7,
});

const reviewOptions = ref({
  reviewFocus: '',
});

const reviewResult = ref<any>(null);

// ─── 章节蓝图相关状态 ────────────────────────────────────────
const currentBlueprint = ref<Blueprint | null>(null);
const editingBlueprint = ref<Blueprint | null>(null);
const blueprintLoaded = ref(false);
const savingBlueprint = ref(false);

async function loadBlueprint() {
  if (!workspace.currentProjectId || chapterNumber.value <= 0) {
    currentBlueprint.value = null;
    editingBlueprint.value = null;
    blueprintLoaded.value = true;
    return;
  }
  try {
    const blueprints = await api.getBlueprints(workspace.currentProjectId);
    currentBlueprint.value = blueprints.find(b => b.chapterNumber === chapterNumber.value) || null;
    if (currentBlueprint.value) {
      editingBlueprint.value = JSON.parse(JSON.stringify(currentBlueprint.value));
    } else {
      editingBlueprint.value = null;
    }
  } catch {
    currentBlueprint.value = null;
    editingBlueprint.value = null;
  } finally {
    blueprintLoaded.value = true;
  }
}

async function saveBlueprint() {
  if (!workspace.currentProjectId || !editingBlueprint.value || savingBlueprint.value) return;
  savingBlueprint.value = true;
  try {
    const blueprints = await api.getBlueprints(workspace.currentProjectId);
    const idx = blueprints.findIndex(b => b.chapterNumber === editingBlueprint.value!.chapterNumber);
    if (idx >= 0) {
      blueprints[idx] = { ...editingBlueprint.value };
    } else {
      blueprints.push({ ...editingBlueprint.value });
    }
    await api.updateBlueprints(workspace.currentProjectId, blueprints);
    currentBlueprint.value = { ...editingBlueprint.value };
    workspace.addTaskLog('blueprints', 'success', '蓝图已更新');
  } catch (e: any) {
    workspace.addTaskLog('blueprints', 'error', `蓝图保存失败: ${e.message}`);
  } finally {
    savingBlueprint.value = false;
  }
}

function resetBlueprint() {
  if (currentBlueprint.value) {
    editingBlueprint.value = JSON.parse(JSON.stringify(currentBlueprint.value));
  }
}

function createEmptyBlueprint() {
  editingBlueprint.value = {
    chapterNumber: chapterNumber.value,
    title: `第${chapterNumber.value}章`,
    purpose: '',
    characters: [],
    keyEvents: '',
    suspenseHook: '',
  };
}

// ─── 编辑器 ──────────────────────────────────────────────────
async function loadContent() {
  const tab = workspace.activeTab;
  if (!tab?.path || !workspace.currentProjectId) return;
  try {
    const data = await api.readFile(workspace.currentProjectId, tab.path);
    content.value = data.content ?? '';
  } catch {
    content.value = '';
  }
}

function createEditor() {
  if (!editorContainer.value) return;
  if (view) { view.destroy(); view = null; }

  const fontSize = settings.effective['editor.fontSize'] || 14;
  const fontFamily = settings.effective['editor.fontFamily'] || "'JetBrains Mono', 'Fira Code', monospace";
  const lineHeight = settings.effective['editor.lineHeight'] || 1.6;
  const showLineNumbers = settings.effective['editor.lineNumbers'] !== false;
  const wordWrapEnabled = settings.effective['editor.wordWrap'] !== 'off';

  const extensions: any[] = [
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    markdown(),
    oneDark,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        content.value = update.state.doc.toString();
        debounceSave();
      }
    }),
    EditorView.theme({
      '&': { height: '100%', fontSize: `${fontSize}px` },
      '.cm-scroller': { overflow: 'auto', fontFamily, lineHeight: String(lineHeight) },
      '.cm-content': { padding: '16px 0' },
      '.cm-line': { padding: '0 16px' },
    }),
  ];

  if (showLineNumbers) extensions.unshift(lineNumbers());
  extensions.push(highlightActiveLine());
  if (wordWrapEnabled) extensions.push(EditorView.lineWrapping);

  const state = EditorState.create({
    doc: content.value,
    extensions,
  });

  view = new EditorView({ state, parent: editorContainer.value });
}

function debounceSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveContent, 1000);
}

async function saveContent() {
  const tab = workspace.activeTab;
  if (!tab?.path || !workspace.currentProjectId) return;
  saving.value = true;
  try {
    await api.writeFile(workspace.currentProjectId, tab.path, { content: content.value });
  } finally {
    saving.value = false;
  }
}

function updateEditorContent(text: string) {
  content.value = text;
  if (view) {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  }
}

// ─── AI 工作流 ───────────────────────────────────────────────
function handleOpenDraftDialog() {
  blueprintLoaded.value = false;
  showDraftDialog.value = true;
  loadBlueprint();
}

async function confirmDraft() {
  showDraftDialog.value = false;
  if (!workspace.currentProjectId || !chapterNumber.value) return;
  aiWorking.value = 'draft';
  workspace.addTaskLog('ai', 'running', `正在生成第${chapterNumber.value}章正文...`);

  try {
    const response = await workflowApi.streamDraft(
      workspace.currentProjectId,
      chapterNumber.value,
      draftOptions.value.userGuidance || undefined
    );
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
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
            if (delta) fullText += delta;
          } catch {}
        }
      }
    }

    if (fullText) {
      updateEditorContent(`# 第${chapterNumber.value}章\n\n${fullText}`);
      await saveContent();
      workspace.addTaskLog('ai', 'success', `第${chapterNumber.value}章正文生成完成 (${fullText.length}字)`);
    }
  } catch (e: any) {
    workspace.addTaskLog('ai', 'error', `正文生成失败: ${e.message}`);
  } finally {
    aiWorking.value = null;
  }
}

async function confirmRefine() {
  showRefineDialog.value = false;
  if (!workspace.currentProjectId || !chapterNumber.value || !content.value.trim()) return;
  aiWorking.value = 'refine';
  workspace.addTaskLog('ai', 'running', `正在精修第${chapterNumber.value}章...`);

  try {
    const response = await workflowApi.streamRefine(
      workspace.currentProjectId,
      chapterNumber.value,
      content.value,
      refineOptions.value.userRefinePrompt || undefined
    );
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
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
            if (delta) fullText += delta;
          } catch {}
        }
      }
    }

    if (fullText) {
      updateEditorContent(fullText);
      await saveContent();
      workspace.addTaskLog('ai', 'success', `第${chapterNumber.value}章精修完成`);
    }
  } catch (e: any) {
    workspace.addTaskLog('ai', 'error', `精修失败: ${e.message}`);
  } finally {
    aiWorking.value = null;
  }
}

async function confirmReview() {
  showReviewDialog.value = false;
  if (!workspace.currentProjectId || !content.value.trim()) return;
  aiWorking.value = 'review';
  workspace.addTaskLog('ai', 'running', `正在审阅章节...`);

  try {
    const result = await workflowApi.review(workspace.currentProjectId, content.value);
    reviewResult.value = result;
    showReviewResult.value = true;
    workspace.addTaskLog('ai', 'success', `审阅完成: ${result.summary || '已完成'}`);
  } catch (e: any) {
    workspace.addTaskLog('ai', 'error', `审阅失败: ${e.message}`);
  } finally {
    aiWorking.value = null;
  }
}

async function finalizeChapter() {
  if (!workspace.currentProjectId || !chapterNumber.value || !content.value.trim()) return;
  aiWorking.value = 'finalize';
  workspace.addTaskLog('ai', 'running', `正在定稿第${chapterNumber.value}章（后处理管线）...`);

  try {
    const title = workspace.activeTab?.label || `第${chapterNumber.value}章`;
    const result = await workflowApi.finalize(
      workspace.currentProjectId,
      chapterNumber.value,
      title,
      content.value
    );
    if (result.success) {
      workspace.addTaskLog('ai', 'success', `第${chapterNumber.value}章定稿完成：章节要点已生成，角色卡已更新`);
    } else {
      workspace.addTaskLog('ai', 'warning', `定稿部分完成，有错误: ${(result.errors || []).join('; ')}`);
    }
    await workspace.refreshProject();
    // 定稿后关闭当前草稿 tab，重新打开定稿 tab
    if (result.finalizedFile) {
      const tabId = `chapter-${chapterNumber.value}`;
      workspace.closeTab(tabId);
      workspace.openTab({
        id: tabId,
        label: `第${chapterNumber.value}章 ${title}`,
        type: 'editor',
        path: result.finalizedFile,
      });
    }
  } catch (e: any) {
    workspace.addTaskLog('ai', 'error', `定稿失败: ${e.message}`);
  } finally {
    aiWorking.value = null;
  }
}

watch(
  () => workspace.activeTab?.id,
  async () => {
    await loadContent();
    await nextTick();
    createEditor();
  }
);

// 编辑器相关设置变化时重建编辑器
watch(
  () => [
    settings.effective['editor.fontSize'],
    settings.effective['editor.fontFamily'],
    settings.effective['editor.lineHeight'],
    settings.effective['editor.lineNumbers'],
    settings.effective['editor.wordWrap'],
  ],
  () => {
    if (view) createEditor();
  }
);

onMounted(async () => {
  await loadContent();
  await nextTick();
  createEditor();
});

onBeforeUnmount(() => {
  if (view) view.destroy();
  if (saveTimer) clearTimeout(saveTimer);
});
</script>

<template>
  <div class="editor-pane">
    <div class="editor-toolbar">
      <span class="file-path">{{ workspace.activeTab?.path }}</span>
      <div class="toolbar-actions" v-if="isChapter">
        <button
          class="toolbar-btn"
          @click="handleOpenDraftDialog"
          :disabled="!!aiWorking"
        >
          {{ aiWorking === 'draft' ? '⏳' : '✍️' }} 生成
        </button>
        <button
          class="toolbar-btn"
          @click="showRefineDialog = true"
          :disabled="!!aiWorking || !content.trim()"
        >
          {{ aiWorking === 'refine' ? '⏳' : '✨' }} 精修
        </button>
        <button
          class="toolbar-btn"
          @click="showReviewDialog = true"
          :disabled="!!aiWorking || !content.trim()"
        >
          {{ aiWorking === 'review' ? '⏳' : '📝' }} 审阅
        </button>
        <button
          class="toolbar-btn finalize-btn"
          @click="finalizeChapter"
          :disabled="!!aiWorking || !content.trim()"
          title="定稿（生成要点+更新角色卡）"
        >
          {{ aiWorking === 'finalize' ? '⏳' : '✅' }} 定稿
        </button>
      </div>
      <span v-if="saving" class="save-indicator">保存中...</span>
      <span v-if="aiWorking" class="ai-indicator">AI 工作中...</span>
    </div>
    <div ref="editorContainer" class="editor-container"></div>

    <!-- ═══ 生成弹窗 ═══ -->
    <BaseDialog :open="showDraftDialog" title="✍️ 生成章节正文" width="700px" @close="showDraftDialog = false">
      <div class="dialog-form">
        <div class="dialog-info">
          <span class="info-label">章节：</span>第 {{ chapterNumber }} 章
          <span class="info-sep">|</span>
          <span class="info-label">提示词：</span>
          <code>{{ chapterNumber === 1 ? 'first_chapter_draft' : 'next_chapter_draft' }}</code>
        </div>

        <!-- 章节蓝图展示与编辑 -->
        <div v-if="blueprintLoaded" class="blueprint-section">
          <div class="section-header">
            <h3>📋 章节蓝图</h3>
            <div class="blueprint-actions" v-if="editingBlueprint">
              <button class="bp-action-btn" @click="resetBlueprint" :disabled="savingBlueprint">
                ↩️ 重置
              </button>
              <button class="bp-action-btn" @click="saveBlueprint" :disabled="savingBlueprint">
                {{ savingBlueprint ? '⏳' : '💾' }} 保存蓝图
              </button>
            </div>
          </div>
          
          <div v-if="editingBlueprint" class="blueprint-form">
            <div class="blueprint-row">
              <div class="blueprint-field">
                <label>标题</label>
                <input v-model="editingBlueprint.title" placeholder="章节标题" />
              </div>
              <div class="blueprint-field">
                <label>本章目标</label>
                <input v-model="editingBlueprint.purpose" placeholder="主角最想解决的一件事" />
              </div>
            </div>
            <div class="blueprint-row">
              <div class="blueprint-field">
                <label>出场角色（逗号分隔）</label>
                <input
                  :value="editingBlueprint.characters?.join('、')"
                  @input="editingBlueprint.characters = ($event.target as HTMLInputElement).value.split(/[、,，]/).map(s => s.trim()).filter(Boolean)"
                  placeholder="角色A、角色B"
                />
              </div>
            </div>
            <div class="blueprint-row">
              <div class="blueprint-field full">
                <label>核心事件</label>
                <textarea v-model="editingBlueprint.keyEvents" rows="3" placeholder="具体发生了什么..."></textarea>
              </div>
            </div>
            <div class="blueprint-row">
              <div class="blueprint-field full">
                <label>章末钩子</label>
                <input v-model="editingBlueprint.suspenseHook" placeholder="结尾留的悬念" />
              </div>
            </div>
          </div>
          
          <div v-else class="blueprint-empty">
            <p>⚠️ 该章节暂无蓝图，将根据故事架构直接生成</p>
            <button class="create-blueprint-btn" @click="createEmptyBlueprint">
              📝 创建空蓝图
            </button>
          </div>
        </div>

        <div v-else class="loading-blueprint">
          <span class="loading-spinner">⏳</span> 加载蓝图中...
        </div>

        <div class="dialog-field">
          <label>作者微操指导（可选）</label>
          <textarea
            v-model="draftOptions.userGuidance"
            rows="4"
            placeholder="对本章生成的额外要求，例如：&#10;- 本章重点描写打斗场面&#10;- 加入一段回忆杀&#10;- 节奏放慢，多一些心理描写"
          ></textarea>
        </div>
        <p class="dialog-tip">💡 留空则完全按照蓝图和架构生成</p>
      </div>
      <template #footer>
        <button class="dlg-btn dlg-btn-cancel" @click="showDraftDialog = false">取消</button>
        <button class="dlg-btn dlg-btn-primary" @click="confirmDraft" :disabled="!!aiWorking">
          🚀 开始生成
        </button>
      </template>
    </BaseDialog>

    <!-- ═══ 精修弹窗 ═══ -->
    <BaseDialog :open="showRefineDialog" title="✨ 精修章节" @close="showRefineDialog = false">
      <div class="dialog-form">
        <div class="dialog-info">
          <span class="info-label">章节：</span>第 {{ chapterNumber }} 章
          <span class="info-sep">|</span>
          <span class="info-label">当前字数：</span>{{ content.length }}
          <span class="info-sep">|</span>
          <span class="info-label">提示词：</span>
          <code>refine_chapter</code>
        </div>
        <div class="dialog-field">
          <label>精修指导（可选）</label>
          <textarea
            v-model="refineOptions.userRefinePrompt"
            rows="4"
            placeholder="对精修的额外要求，例如：&#10;- 加强环境描写&#10;- 对话更口语化&#10;- 减少心理独白&#10;- 结尾钩子再强一些"
          ></textarea>
        </div>
        <p class="dialog-tip">⚠️ 精修会替换当前正文，建议先确认内容无误</p>
      </div>
      <template #footer>
        <button class="dlg-btn dlg-btn-cancel" @click="showRefineDialog = false">取消</button>
        <button class="dlg-btn dlg-btn-primary" @click="confirmRefine" :disabled="!!aiWorking">
          ✨ 开始精修
        </button>
      </template>
    </BaseDialog>

    <!-- ═══ 审阅弹窗 ═══ -->
    <BaseDialog :open="showReviewDialog" title="📝 审阅章节" @close="showReviewDialog = false">
      <div class="dialog-form">
        <div class="dialog-info">
          <span class="info-label">章节：</span>第 {{ chapterNumber }} 章
          <span class="info-sep">|</span>
          <span class="info-label">当前字数：</span>{{ content.length }}
          <span class="info-sep">|</span>
          <span class="info-label">提示词：</span>
          <code>consistency_check</code>
        </div>
        <div class="dialog-field">
          <label>审阅重点（可选）</label>
          <textarea
            v-model="reviewOptions.reviewFocus"
            rows="3"
            placeholder="希望重点检查的维度，例如：&#10;- 重点检查角色状态是否一致&#10;- 关注伏笔是否有遗漏&#10;- 检查时间线是否合理"
          ></textarea>
        </div>
        <p class="dialog-tip">📋 审阅不会修改正文，只生成审阅报告</p>
      </div>
      <template #footer>
        <button class="dlg-btn dlg-btn-cancel" @click="showReviewDialog = false">取消</button>
        <button class="dlg-btn dlg-btn-primary" @click="confirmReview" :disabled="!!aiWorking">
          📝 开始审阅
        </button>
      </template>
    </BaseDialog>

    <!-- ═══ 审阅结果弹窗 ═══ -->
    <BaseDialog :open="showReviewResult" title="📋 审阅报告" width="640px" @close="showReviewResult = false">
      <div class="review-result" v-if="reviewResult">
        <div v-if="reviewResult.items" class="review-items">
          <div v-for="(item, i) in reviewResult.items" :key="i" class="review-item" :class="item.severity">
            <span class="review-icon">
              {{ item.severity === 'error' ? '🔴' : item.severity === 'warning' ? '🟡' : '🟢' }}
            </span>
            <div class="review-content">
              <span class="review-category">{{ item.category }}</span>
              <span class="review-desc">{{ item.description }}</span>
              <span v-if="item.quote" class="review-quote">"{{ item.quote }}"</span>
            </div>
          </div>
        </div>
        <div v-if="reviewResult.summary" class="review-summary">
          <strong>总评：</strong>{{ reviewResult.summary }}
        </div>
        <div v-if="reviewResult.raw" class="review-raw">
          <pre>{{ reviewResult.raw }}</pre>
        </div>
      </div>
      <template #footer>
        <button class="dlg-btn dlg-btn-primary" @click="showReviewResult = false">关闭</button>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.editor-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 16px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.file-path { flex: 1; }
.toolbar-actions { display: flex; gap: 4px; }

.toolbar-btn {
  padding: 3px 10px;
  font-size: 11px;
  border-radius: 4px;
  background: var(--bg-overlay);
  border: 1px solid var(--border);
  color: var(--text-dim);
  transition: all 0.15s;
}
.toolbar-btn:hover { border-color: var(--accent); color: var(--accent); }
.toolbar-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.toolbar-btn.finalize-btn { border-color: var(--success); color: var(--success); }
.toolbar-btn.finalize-btn:hover { background: var(--success-dim); }

.save-indicator { color: var(--accent); }
.ai-indicator { color: var(--warning); animation: pulse 1.5s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

.editor-container { flex: 1; overflow: hidden; }
.editor-container :deep(.cm-editor) { height: 100%; }

/* ─── Dialog 内部样式 ─── */
.dialog-form { display: flex; flex-direction: column; gap: 14px; max-height: 60vh; overflow-y: auto; }
.dialog-info { font-size: 12px; color: var(--text-dim); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 8px 12px; background: var(--bg-overlay); border-radius: 6px; }
.info-label { font-weight: 500; color: var(--text-muted); }
.info-sep { color: var(--border); }
.dialog-info code { font-size: 11px; padding: 1px 5px; background: var(--accent-dim); color: var(--accent); border-radius: 3px; }

.dialog-field { display: flex; flex-direction: column; gap: 5px; }
.dialog-field label { font-size: 12px; font-weight: 500; color: var(--text-dim); }
.dialog-field textarea { font-size: 13px; padding: 10px 12px; resize: vertical; min-height: 80px; line-height: 1.5; border-radius: 6px; }

.dialog-tip { font-size: 11px; color: var(--text-muted); padding: 6px 0 0; }

/* ─── 蓝图编辑区域样式 ─── */
.blueprint-section {
  background: var(--bg-overlay);
  border-radius: 8px;
  padding: 14px;
  border: 1px solid var(--border);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-header h3 {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
}

.blueprint-actions {
  display: flex;
  gap: 6px;
}

.bp-action-btn {
  padding: 4px 10px;
  font-size: 11px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--bg-base);
  color: var(--text-dim);
  cursor: pointer;
  transition: all 0.15s;
}

.bp-action-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.bp-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.blueprint-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.blueprint-row {
  display: flex;
  gap: 12px;
}

.blueprint-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.blueprint-field.full {
  flex: 1;
  min-width: 100%;
}

.blueprint-field label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
}

.blueprint-field input,
.blueprint-field textarea {
  font-size: 12px;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-base);
  color: var(--text-primary);
}

.blueprint-field textarea {
  resize: vertical;
  min-height: 60px;
  line-height: 1.4;
}

.blueprint-empty {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  background: var(--bg-base);
  border-radius: 6px;
  text-align: center;
}

.blueprint-empty p {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}

.create-blueprint-btn {
  align-self: center;
  padding: 6px 14px;
  font-size: 12px;
  border-radius: 4px;
  border: 1px solid var(--accent);
  background: var(--accent-dim);
  color: var(--accent);
  cursor: pointer;
  transition: all 0.15s;
}

.create-blueprint-btn:hover {
  background: var(--accent);
  color: #fff;
}

.loading-blueprint {
  text-align: center;
  padding: 20px;
  font-size: 12px;
  color: var(--text-muted);
}

.loading-spinner {
  margin-right: 6px;
}

.dlg-btn { padding: 7px 18px; border-radius: 6px; font-size: 13px; font-weight: 500; transition: all 0.15s; }
.dlg-btn-cancel { border: 1px solid var(--border); color: var(--text-dim); }
.dlg-btn-cancel:hover { border-color: var(--text-muted); }
.dlg-btn-primary { background: var(--accent); color: #fff; }
.dlg-btn-primary:hover { background: var(--accent-hover); }
.dlg-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

/* ─── 审阅结果 ─── */
.review-result { display: flex; flex-direction: column; gap: 12px; }
.review-items { display: flex; flex-direction: column; gap: 8px; }
.review-item { display: flex; gap: 10px; padding: 10px 12px; border-radius: 6px; background: var(--bg-overlay); }
.review-item.error { border-left: 3px solid var(--danger); }
.review-item.warning { border-left: 3px solid var(--warning); }
.review-item.pass { border-left: 3px solid var(--success); }
.review-icon { font-size: 14px; flex-shrink: 0; padding-top: 1px; }
.review-content { display: flex; flex-direction: column; gap: 3px; }
.review-category { font-size: 12px; font-weight: 600; }
.review-desc { font-size: 12px; color: var(--text-dim); line-height: 1.4; }
.review-quote { font-size: 11px; color: var(--text-muted); font-style: italic; padding: 4px 8px; background: var(--bg-base); border-radius: 4px; margin-top: 2px; }
.review-summary { font-size: 13px; padding: 10px 12px; background: var(--bg-overlay); border-radius: 6px; line-height: 1.5; }
.review-raw { font-size: 12px; }
.review-raw pre { white-space: pre-wrap; word-break: break-word; line-height: 1.5; }
</style>
