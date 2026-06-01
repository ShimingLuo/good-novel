<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue';
import { useWorkspace } from '../stores/workspace';
import { api, workflowApi, type Blueprint, type BlueprintSyncItem } from '../api';
import BaseDialog from './BaseDialog.vue';

const workspace = useWorkspace();
const blueprints = ref<Blueprint[]>([]);
const syncItems = ref<BlueprintSyncItem[]>([]);
const generating = ref(false);
const startChapter = ref(1);
const endChapter = ref(10);
const editingIdx = ref<number | null>(null);

// ─── 应用到草稿相关状态 ──────────────────────────────────────
const showApplyConfirm = ref(false);
const applyTarget = ref<{
  chapterNumber: number;
  title: string;
  status: 'draft' | 'finalized';
  wordCount: number;
} | null>(null);
const applying = ref<number | null>(null);

async function loadBlueprints() {
  if (!workspace.currentProjectId) return;
  blueprints.value = await api.getBlueprints(workspace.currentProjectId);
  if (blueprints.value.length > 0) {
    const lastNum = Math.max(...blueprints.value.map(b => b.chapterNumber));
    startChapter.value = lastNum + 1;
    endChapter.value = Math.min(lastNum + 10, workspace.projectDetail?.config.chapterCount || 100);
  }
  await loadSyncStatus();
}

async function loadSyncStatus() {
  if (!workspace.currentProjectId) return;
  try {
    syncItems.value = await api.getBlueprintSync(workspace.currentProjectId);
  } catch {
    syncItems.value = [];
  }
}

function getSyncStatus(chapterNumber: number): BlueprintSyncItem | undefined {
  return syncItems.value.find(s => s.chapterNumber === chapterNumber);
}

function getSyncLabel(chapterNumber: number): string {
  const sync = getSyncStatus(chapterNumber);
  if (!sync) return '';
  switch (sync.draftStatus) {
    case 'finalized': return '已定稿';
    case 'has_content': return '有草稿';
    case 'empty': return '待写作';
    default: return '';
  }
}

function getSyncClass(chapterNumber: number): string {
  const sync = getSyncStatus(chapterNumber);
  if (!sync) return '';
  return `sync-${sync.draftStatus}`;
}

async function applyToDraft(bp: Blueprint) {
  if (!workspace.currentProjectId || applying.value) return;
  applying.value = bp.chapterNumber;

  try {
    const result = await api.applyBlueprintToDraft(workspace.currentProjectId, bp.chapterNumber);

    if (result.needConfirm) {
      // 需要二次确认
      applyTarget.value = {
        chapterNumber: result.chapterNumber,
        title: result.title || bp.title,
        status: result.status as 'draft' | 'finalized',
        wordCount: result.wordCount || 0,
      };
      showApplyConfirm.value = true;
    } else if (result.applied) {
      workspace.addTaskLog('blueprints', 'success', `第${bp.chapterNumber}章草稿已创建`);
      await loadSyncStatus();
      await workspace.refreshProject();
    }
  } catch (e: any) {
    workspace.addTaskLog('blueprints', 'error', `应用失败: ${e.message}`);
  } finally {
    applying.value = null;
  }
}

async function confirmApply() {
  if (!workspace.currentProjectId || !applyTarget.value) return;
  showApplyConfirm.value = false;
  applying.value = applyTarget.value.chapterNumber;

  try {
    const result = await api.applyBlueprintToDraft(
      workspace.currentProjectId,
      applyTarget.value.chapterNumber,
      true // force
    );
    if (result.applied) {
      workspace.addTaskLog('blueprints', 'success',
        `第${applyTarget.value.chapterNumber}章已重置为空草稿（原内容已覆盖）`
      );
      await loadSyncStatus();
      await workspace.refreshProject();
    }
  } catch (e: any) {
    workspace.addTaskLog('blueprints', 'error', `应用失败: ${e.message}`);
  } finally {
    applying.value = null;
    applyTarget.value = null;
  }
}

function cancelApply() {
  showApplyConfirm.value = false;
  applyTarget.value = null;
}

// ─── 一键应用所有蓝图 ────────────────────────────────────────
const applyingAll = ref(false);
const showApplyAllConfirm = ref(false);
const applyAllHasContent = computed(() => {
  return syncItems.value.filter(s => s.draftStatus === 'has_content').length;
});
const applyAllEmpty = computed(() => {
  return syncItems.value.filter(s => s.draftStatus === 'empty').length;
});
const applyAllFinalized = computed(() => {
  return syncItems.value.filter(s => s.draftStatus === 'finalized').length;
});

function startApplyAll() {
  // 如果有已有草稿内容的章节，弹窗确认是否覆盖
  if (applyAllHasContent.value > 0) {
    showApplyAllConfirm.value = true;
  } else {
    doApplyAll(false);
  }
}

async function doApplyAll(force: boolean) {
  showApplyAllConfirm.value = false;
  if (!workspace.currentProjectId || applyingAll.value) return;
  applyingAll.value = true;

  try {
    const result = await api.applyAllBlueprints(workspace.currentProjectId, force);
    const parts: string[] = [];
    if (result.created.length) parts.push(`新建 ${result.created.length} 章`);
    if (result.overwritten.length) parts.push(`覆盖 ${result.overwritten.length} 章`);
    if (result.skippedFinalized.length) parts.push(`跳过定稿 ${result.skippedFinalized.length} 章`);
    if (result.skippedHasContent.length) parts.push(`跳过有内容 ${result.skippedHasContent.length} 章`);
    workspace.addTaskLog('blueprints', 'success', `一键应用完成：${parts.join('，') || '无变更'}`);
    await loadSyncStatus();
    await workspace.refreshProject();
  } catch (e: any) {
    workspace.addTaskLog('blueprints', 'error', `一键应用失败: ${e.message}`);
  } finally {
    applyingAll.value = false;
  }
}

async function generateBlueprints() {
  if (!workspace.currentProjectId || generating.value) return;
  generating.value = true;
  workspace.addTaskLog('ai', 'running', `正在生成第${startChapter.value}-${endChapter.value}章蓝图...`);
  try {
    const result = await workflowApi.generateBlueprints(
      workspace.currentProjectId,
      startChapter.value,
      endChapter.value
    );
    await loadBlueprints();
    await workspace.refreshProject();
    const msg = result.createdChapters?.length
      ? `蓝图生成完成，共 ${result.total} 章，新建了 ${result.createdChapters.length} 个章节文件`
      : `蓝图生成完成，共 ${result.total} 章`;
    workspace.addTaskLog('ai', 'success', msg);
  } catch (e: any) {
    workspace.addTaskLog('ai', 'error', `蓝图生成失败: ${e.message}`);
  } finally {
    generating.value = false;
  }
}

async function save() {
  if (!workspace.currentProjectId) return;
  await api.updateBlueprints(workspace.currentProjectId, blueprints.value);
  workspace.addTaskLog('blueprints', 'success', '蓝图已保存');
}

function toggleEdit(idx: number) {
  editingIdx.value = editingIdx.value === idx ? null : idx;
}

function deleteBlueprint(idx: number) {
  blueprints.value.splice(idx, 1);
  editingIdx.value = null;
}

onMounted(loadBlueprints);
watch(() => workspace.currentProjectId, loadBlueprints);
</script>

<template>
  <div class="blueprints-pane">
    <div class="pane-header">
      <div class="header-left">
        <h2>章节蓝图</h2>
        <p class="desc">每章的详细执行细纲，点击可编辑，修改后记得保存</p>
      </div>
      <div class="actions">
        <div class="range-inputs">
          <label>第</label>
          <input v-model.number="startChapter" type="number" min="1" class="num-input" />
          <label>到</label>
          <input v-model.number="endChapter" type="number" min="1" class="num-input" />
          <label>章</label>
        </div>
        <button class="btn btn-accent" @click="generateBlueprints" :disabled="generating">
          {{ generating ? '⏳ 生成中...' : '✨ AI 生成蓝图' }}
        </button>
        <button
          class="btn btn-apply-all"
          @click="startApplyAll"
          :disabled="applyingAll || !blueprints.length"
          title="为所有蓝图创建草稿文件（跳过已定稿章节）"
        >
          {{ applyingAll ? '⏳ 应用中...' : '📥 一键应用' }}
        </button>
        <button class="btn btn-primary" @click="save">💾 保存</button>
      </div>
    </div>

    <div v-if="!blueprints.length" class="empty">
      <p>暂无蓝图。请先完成故事架构，然后点击"AI 生成蓝图"。</p>
    </div>

    <div class="blueprint-list">
      <div v-for="(bp, idx) in blueprints" :key="bp.chapterNumber" class="blueprint-card" :class="{ editing: editingIdx === idx }">
        <!-- 查看模式 -->
        <div v-if="editingIdx !== idx" class="bp-view" @dblclick="toggleEdit(idx)">
          <div class="bp-header">
            <span class="bp-num">第{{ bp.chapterNumber }}章</span>
            <span class="bp-title">{{ bp.title }}</span>
            <span class="bp-sync-badge" :class="getSyncClass(bp.chapterNumber)">
              {{ getSyncLabel(bp.chapterNumber) }}
            </span>
            <span class="bp-edit-hint">双击编辑</span>
          </div>
          <div class="bp-body">
            <div class="bp-field">
              <span class="bp-label">目标：</span>
              <span>{{ bp.purpose }}</span>
            </div>
            <div class="bp-field">
              <span class="bp-label">角色：</span>
              <span class="bp-chars">{{ bp.characters?.join('、') }}</span>
            </div>
            <div class="bp-field">
              <span class="bp-label">事件：</span>
              <span>{{ bp.keyEvents }}</span>
            </div>
            <div class="bp-field">
              <span class="bp-label">钩子：</span>
              <span class="bp-hook">{{ bp.suspenseHook }}</span>
            </div>
          </div>
          <div class="bp-actions">
            <button
              class="bp-action-btn"
              :class="{ disabled: applying === bp.chapterNumber }"
              :disabled="applying === bp.chapterNumber"
              @click.stop="applyToDraft(bp)"
              :title="getSyncStatus(bp.chapterNumber)?.draftStatus === 'empty' ? '创建草稿文件' : '重置草稿（会覆盖现有内容）'"
            >
              {{ applying === bp.chapterNumber ? '⏳' : '📥' }}
              {{ getSyncStatus(bp.chapterNumber)?.draftStatus === 'empty' ? '创建草稿' : '应用到草稿' }}
            </button>
          </div>
        </div>

        <!-- 编辑模式 -->
        <div v-else class="bp-edit">
          <div class="bp-edit-header">
            <span class="bp-num">第{{ bp.chapterNumber }}章</span>
            <span class="bp-sync-badge" :class="getSyncClass(bp.chapterNumber)">
              {{ getSyncLabel(bp.chapterNumber) }}
            </span>
            <button class="bp-close-btn" @click="editingIdx = null">✕ 收起</button>
            <button class="bp-delete-btn" @click="deleteBlueprint(idx)">🗑 删除</button>
          </div>
          <div class="bp-edit-grid">
            <div class="bp-edit-field">
              <label>标题</label>
              <input v-model="bp.title" placeholder="章节标题" />
            </div>
            <div class="bp-edit-field">
              <label>本章目标</label>
              <input v-model="bp.purpose" placeholder="主角最想解决的一件事" />
            </div>
            <div class="bp-edit-field">
              <label>出场角色（逗号分隔）</label>
              <input
                :value="bp.characters?.join('、')"
                @input="bp.characters = ($event.target as HTMLInputElement).value.split(/[、,，]/).map(s => s.trim()).filter(Boolean)"
                placeholder="角色A、角色B"
              />
            </div>
            <div class="bp-edit-field full">
              <label>核心事件</label>
              <textarea v-model="bp.keyEvents" rows="3" placeholder="具体发生了什么..."></textarea>
            </div>
            <div class="bp-edit-field full">
              <label>章末钩子</label>
              <input v-model="bp.suspenseHook" placeholder="结尾留的悬念" />
            </div>
          </div>
          <div class="bp-edit-actions">
            <button
              class="bp-action-btn"
              :class="{ disabled: applying === bp.chapterNumber }"
              :disabled="applying === bp.chapterNumber"
              @click="applyToDraft(bp)"
            >
              {{ applying === bp.chapterNumber ? '⏳' : '📥' }}
              {{ getSyncStatus(bp.chapterNumber)?.draftStatus === 'empty' ? '创建草稿' : '应用到草稿' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ 覆盖确认弹窗 ═══ -->
    <BaseDialog :open="showApplyConfirm" title="⚠️ 确认覆盖章节" @close="cancelApply">
      <div class="confirm-content" v-if="applyTarget">
        <div class="confirm-warning">
          <span class="warning-icon">⚠️</span>
          <div class="warning-text">
            <p class="warning-title">
              第{{ applyTarget.chapterNumber }}章已有{{ applyTarget.status === 'finalized' ? '定稿' : '草稿' }}内容
            </p>
            <p class="warning-detail">
              当前标题：{{ applyTarget.title || '（无标题）' }}
            </p>
            <p class="warning-detail">
              现有字数：<strong>{{ applyTarget.wordCount }}</strong> 字
            </p>
          </div>
        </div>
        <div class="confirm-desc">
          <p>应用蓝图将会：</p>
          <ul>
            <li v-if="applyTarget.status === 'finalized'">删除已定稿的 .txt 文件</li>
            <li>清空现有内容，创建新的空白草稿</li>
            <li>使用蓝图标题作为新草稿标题</li>
          </ul>
          <p class="confirm-irreversible">⛔ 此操作不可撤销，原有内容将永久丢失</p>
        </div>
      </div>
      <template #footer>
        <button class="dlg-btn dlg-btn-cancel" @click="cancelApply">取消</button>
        <button class="dlg-btn dlg-btn-danger" @click="confirmApply">
          确认覆盖
        </button>
      </template>
    </BaseDialog>

    <!-- ═══ 一键应用确认弹窗 ═══ -->
    <BaseDialog :open="showApplyAllConfirm" title="📥 一键应用所有蓝图" @close="showApplyAllConfirm = false">
      <div class="confirm-content">
        <div class="apply-all-summary">
          <div class="summary-row">
            <span class="summary-icon">📄</span>
            <span>待创建（空章节）：<strong>{{ applyAllEmpty }}</strong> 章</span>
          </div>
          <div class="summary-row has-content">
            <span class="summary-icon">📝</span>
            <span>已有草稿内容：<strong>{{ applyAllHasContent }}</strong> 章</span>
          </div>
          <div class="summary-row finalized">
            <span class="summary-icon">✅</span>
            <span>已定稿（将跳过）：<strong>{{ applyAllFinalized }}</strong> 章</span>
          </div>
        </div>
        <div class="confirm-desc">
          <p>检测到 <strong>{{ applyAllHasContent }}</strong> 个章节已有草稿内容，请选择处理方式：</p>
        </div>
      </div>
      <template #footer>
        <button class="dlg-btn dlg-btn-cancel" @click="showApplyAllConfirm = false">取消</button>
        <button class="dlg-btn dlg-btn-secondary" @click="doApplyAll(false)">
          仅创建空章节
        </button>
        <button class="dlg-btn dlg-btn-danger" @click="doApplyAll(true)">
          全部覆盖（含已有草稿）
        </button>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.blueprints-pane { padding: 24px 32px; max-width: 900px; margin: 0 auto; overflow-y: auto; height: 100%; }
.pane-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
.header-left { flex: 1; }
.pane-header h2 { font-size: 20px; font-weight: 600; margin-bottom: 4px; }
.desc { color: var(--text-muted); font-size: 13px; }
.actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; flex-shrink: 0; padding-top: 4px; }
.range-inputs { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text-dim); }
.num-input { width: 50px; text-align: center; font-size: 12px; padding: 4px; }
.btn { padding: 6px 16px; border-radius: 6px; font-size: 13px; font-weight: 500; }
.btn-primary { background: var(--accent); color: var(--bg-overlay); }
.btn-accent { background: linear-gradient(135deg, #7c6fe0, #5b8def); color: #fff; }
.btn-accent:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-apply-all { background: var(--bg-overlay); border: 1px solid var(--accent); color: var(--accent); }
.btn-apply-all:hover:not(:disabled) { background: var(--accent-dim); }
.btn-apply-all:disabled { opacity: 0.5; cursor: not-allowed; }

.empty { padding: 40px; text-align: center; color: var(--text-muted); font-size: 13px; }

.blueprint-list { display: flex; flex-direction: column; gap: 10px; }
.blueprint-card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px; transition: border-color 0.15s; }
.blueprint-card:hover { border-color: var(--border-active); }
.blueprint-card.editing { border-color: var(--accent); }

/* 查看模式 */
.bp-view { padding: 14px 16px; cursor: pointer; }
.bp-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.bp-num { font-size: 12px; font-weight: 700; color: var(--accent); background: var(--accent-dim); padding: 2px 8px; border-radius: 4px; flex-shrink: 0; }
.bp-title { font-size: 14px; font-weight: 600; }
.bp-edit-hint { margin-left: auto; font-size: 10px; color: var(--text-muted); opacity: 0; transition: opacity 0.15s; }
.bp-view:hover .bp-edit-hint { opacity: 1; }
.bp-body { display: flex; flex-direction: column; gap: 4px; }
.bp-field { font-size: 12px; line-height: 1.5; display: flex; gap: 4px; }
.bp-label { color: var(--text-dim); font-weight: 500; flex-shrink: 0; }
.bp-chars { color: var(--accent); }
.bp-hook { color: var(--warning); font-style: italic; }

/* 同步状态标签 */
.bp-sync-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 500;
  flex-shrink: 0;
}
.bp-sync-badge.sync-empty {
  background: var(--bg-overlay);
  color: var(--text-muted);
  border: 1px solid var(--border);
}
.bp-sync-badge.sync-has_content {
  background: rgba(78, 154, 241, 0.15);
  color: #4e9af1;
  border: 1px solid rgba(78, 154, 241, 0.3);
}
.bp-sync-badge.sync-finalized {
  background: rgba(80, 200, 120, 0.15);
  color: #50c878;
  border: 1px solid rgba(80, 200, 120, 0.3);
}

/* 操作按钮 */
.bp-actions { margin-top: 8px; display: flex; gap: 6px; }
.bp-edit-actions { margin-top: 12px; display: flex; gap: 6px; }
.bp-action-btn {
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 4px;
  background: var(--bg-overlay);
  border: 1px solid var(--border);
  color: var(--text-dim);
  transition: all 0.15s;
  cursor: pointer;
}
.bp-action-btn:hover:not(.disabled) { border-color: var(--accent); color: var(--accent); }
.bp-action-btn.disabled { opacity: 0.4; cursor: not-allowed; }

/* 编辑模式 */
.bp-edit { padding: 14px 16px; }
.bp-edit-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.bp-close-btn { font-size: 11px; color: var(--text-dim); padding: 3px 8px; border-radius: 4px; border: 1px solid var(--border); margin-left: auto; }
.bp-close-btn:hover { border-color: var(--accent); color: var(--accent); }
.bp-delete-btn { font-size: 11px; color: var(--danger); padding: 3px 8px; border-radius: 4px; border: 1px solid transparent; }
.bp-delete-btn:hover { border-color: var(--danger); background: rgba(224, 82, 82, 0.1); }

.bp-edit-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.bp-edit-field { display: flex; flex-direction: column; gap: 3px; }
.bp-edit-field.full { grid-column: span 2; }
.bp-edit-field label { font-size: 11px; color: var(--text-dim); font-weight: 500; }
.bp-edit-field input, .bp-edit-field textarea { font-size: 12px; padding: 6px 8px; }
.bp-edit-field textarea { resize: vertical; min-height: 60px; line-height: 1.5; }

/* ─── 确认弹窗内部样式 ─── */
.confirm-content { display: flex; flex-direction: column; gap: 16px; }
.confirm-warning {
  display: flex;
  gap: 12px;
  padding: 12px 14px;
  background: rgba(224, 160, 50, 0.1);
  border: 1px solid rgba(224, 160, 50, 0.3);
  border-radius: 8px;
}
.warning-icon { font-size: 20px; flex-shrink: 0; }
.warning-text { display: flex; flex-direction: column; gap: 4px; }
.warning-title { font-size: 14px; font-weight: 600; color: var(--text); }
.warning-detail { font-size: 12px; color: var(--text-dim); }
.confirm-desc { font-size: 13px; color: var(--text-dim); line-height: 1.6; }
.confirm-desc ul { margin: 6px 0; padding-left: 20px; }
.confirm-desc li { margin-bottom: 4px; }
.confirm-irreversible { margin-top: 8px; color: var(--danger); font-weight: 500; font-size: 12px; }

.dlg-btn { padding: 7px 18px; border-radius: 6px; font-size: 13px; font-weight: 500; transition: all 0.15s; }
.dlg-btn-cancel { border: 1px solid var(--border); color: var(--text-dim); }
.dlg-btn-cancel:hover { border-color: var(--text-muted); }
.dlg-btn-secondary { background: var(--accent); color: #fff; }
.dlg-btn-secondary:hover { opacity: 0.9; }
.dlg-btn-danger { background: var(--danger); color: #fff; }
.dlg-btn-danger:hover { opacity: 0.9; }

/* ─── 一键应用摘要 ─── */
.apply-all-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  background: var(--bg-overlay);
  border-radius: 8px;
  margin-bottom: 4px;
}
.summary-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-dim);
}
.summary-row.has-content { color: #e0a032; }
.summary-row.finalized { color: #50c878; }
.summary-icon { font-size: 14px; flex-shrink: 0; }
</style>
