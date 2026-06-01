<script setup lang="ts">
/**
 * 提示词套件管理器
 * 嵌入到 PromptsPane 顶部，提供套件切换、新建、删除功能
 * 包含展开式管理列表，标明内置/自定义状态
 */
import { ref, computed, onMounted, watch } from 'vue';
import { promptSetsApi, type PromptSetMeta, type SetPromptItem } from '../api';
import { useWorkspace } from '../stores/workspace';
import BaseDialog from './BaseDialog.vue';

const workspace = useWorkspace();

const sets = ref<PromptSetMeta[]>([]);
const activeSetId = ref('default');
const loading = ref(false);
const showCreate = ref(false);
const showManage = ref(false);
const deleteTarget = ref<PromptSetMeta | null>(null);

// 管理列表中的提示词
const setPrompts = ref<SetPromptItem[]>([]);
const loadingPrompts = ref(false);

const newSet = ref({ id: '', name: '', description: '', cloneFrom: '' });

const emit = defineEmits<{
  (e: 'change', setId: string): void;
}>();

const activeSet = computed(() => sets.value.find(s => s.id === activeSetId.value));

async function loadSets() {
  loading.value = true;
  try {
    const res = await promptSetsApi.list();
    sets.value = res.sets;
    activeSetId.value = res.activeSetId;
  } finally {
    loading.value = false;
  }
}

async function loadSetPrompts() {
  loadingPrompts.value = true;
  try {
    setPrompts.value = await promptSetsApi.listPrompts(activeSetId.value);
  } finally {
    loadingPrompts.value = false;
  }
}

async function switchSet(setId: string) {
  try {
    await promptSetsApi.setActive(setId);
    activeSetId.value = setId;
    emit('change', setId);
    if (showManage.value) await loadSetPrompts();
    workspace.addTaskLog('prompt-sets', 'success', `已切换到提示词套件: ${sets.value.find(s => s.id === setId)?.name || setId}`);
  } catch (e: any) {
    workspace.addTaskLog('prompt-sets', 'error', `切换失败: ${e.message}`);
  }
}

async function createSet() {
  if (!newSet.value.id || !newSet.value.name) return;
  try {
    await promptSetsApi.create({
      id: newSet.value.id,
      name: newSet.value.name,
      description: newSet.value.description,
      cloneFrom: newSet.value.cloneFrom || undefined,
    });
    showCreate.value = false;
    newSet.value = { id: '', name: '', description: '', cloneFrom: '' };
    await loadSets();
    workspace.addTaskLog('prompt-sets', 'success', '新提示词套件已创建');
  } catch (e: any) {
    workspace.addTaskLog('prompt-sets', 'error', `创建失败: ${e.message}`);
  }
}

async function confirmDelete() {
  if (!deleteTarget.value) return;
  try {
    await promptSetsApi.delete(deleteTarget.value.id);
    deleteTarget.value = null;
    await loadSets();
    emit('change', activeSetId.value);
    workspace.addTaskLog('prompt-sets', 'success', '套件已删除');
  } catch (e: any) {
    workspace.addTaskLog('prompt-sets', 'error', `删除失败: ${e.message}`);
  }
}

function toggleManage() {
  showManage.value = !showManage.value;
  if (showManage.value) loadSetPrompts();
}

watch(activeSetId, () => {
  if (showManage.value) loadSetPrompts();
});

onMounted(loadSets);

defineExpose({ loadSets, activeSetId });
</script>

<template>
  <div class="sets-manager">
    <div class="sets-header">
      <span class="sets-label">📦 提示词套件</span>
      <div class="sets-actions">
        <button class="btn-sm btn-manage" :class="{ active: showManage }" @click="toggleManage">
          {{ showManage ? '收起' : '📋 管理' }}
        </button>
        <button class="btn-sm btn-create" @click="showCreate = true">＋ 新建套件</button>
      </div>
    </div>

    <div class="sets-list">
      <div
        v-for="s in sets"
        :key="s.id"
        class="set-chip"
        :class="{ active: s.id === activeSetId, builtin: s.builtin }"
        @click="switchSet(s.id)"
      >
        <span class="set-icon">{{ s.builtin ? '🔒' : '📝' }}</span>
        <span class="set-name">{{ s.name }}</span>
        <span v-if="s.builtin" class="set-badge builtin">内置</span>
        <button
          v-if="!s.builtin"
          class="set-delete"
          @click.stop="deleteTarget = s"
          title="删除套件"
        >✕</button>
      </div>
    </div>

    <p v-if="activeSet" class="sets-desc">
      <span class="active-indicator">✓ 当前使用：</span>{{ activeSet.description || activeSet.name }}
    </p>

    <!-- 展开式管理列表 -->
    <Transition name="slide">
      <div v-if="showManage" class="manage-panel">
        <div class="manage-header">
          <h4>「{{ activeSet?.name }}」包含的提示词</h4>
          <span class="manage-count">共 {{ setPrompts.length }} 项</span>
        </div>
        <div v-if="loadingPrompts" class="manage-loading">加载中...</div>
        <div v-else class="manage-list">
          <div v-for="p in setPrompts" :key="p.key" class="manage-item">
            <div class="item-left">
              <span class="item-source" :class="p.source">
                {{ p.source === 'builtin' ? '内置' : '自定义' }}
              </span>
              <span class="item-name">{{ p.name }}</span>
            </div>
            <span class="item-key">{{ p.key }}</span>
          </div>
        </div>
        <div v-if="activeSet?.builtin" class="manage-tip">
          💡 内置套件不可修改。如需自定义，请点击「＋ 新建套件」并从此套件克隆。
        </div>
        <div v-else class="manage-tip">
          ✏️ 自定义套件：可在上方提示词列表中直接编辑各项内容。
        </div>
      </div>
    </Transition>

    <!-- 新建套件弹窗 -->
    <BaseDialog :open="showCreate" title="📦 新建提示词套件" @close="showCreate = false">
      <div class="form-stack">
        <div class="field">
          <label>套件 ID（英文标识）</label>
          <input v-model="newSet.id" placeholder="my-prompts" />
          <span class="field-hint">只能包含字母、数字、下划线、连字符</span>
        </div>
        <div class="field">
          <label>套件名称</label>
          <input v-model="newSet.name" placeholder="我的提示词套件" />
        </div>
        <div class="field">
          <label>描述（可选）</label>
          <input v-model="newSet.description" placeholder="适用于什么场景..." />
        </div>
        <div class="field">
          <label>从已有套件克隆（可选）</label>
          <select v-model="newSet.cloneFrom">
            <option value="">不克隆，从空白开始</option>
            <option v-for="s in sets" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <span class="field-hint">克隆会复制源套件的所有提示词作为起点，方便在此基础上修改</span>
        </div>
      </div>
      <template #footer>
        <button class="dlg-btn dlg-btn-cancel" @click="showCreate = false">取消</button>
        <button class="dlg-btn dlg-btn-primary" @click="createSet" :disabled="!newSet.id || !newSet.name">创建</button>
      </template>
    </BaseDialog>

    <!-- 删除确认弹窗 -->
    <BaseDialog :open="!!deleteTarget" title="🗑 删除提示词套件" @close="deleteTarget = null">
      <div v-if="deleteTarget" class="delete-warning">
        <p>确定要删除套件 <strong>{{ deleteTarget.name }}</strong> 吗？</p>
        <p class="warning-text">⚠️ 此操作会永久删除该套件中的所有自定义提示词，不可撤销。</p>
        <p v-if="deleteTarget.active" class="warning-text">当前套件正在使用中，删除后将自动切回默认套件。</p>
      </div>
      <template #footer>
        <button class="dlg-btn dlg-btn-cancel" @click="deleteTarget = null">取消</button>
        <button class="dlg-btn dlg-btn-danger" @click="confirmDelete">确认删除</button>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.sets-manager {
  margin-bottom: 16px;
  padding-bottom: 14px;
  border-bottom: 1px dashed var(--border);
}

.sets-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.sets-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
}

.sets-actions {
  display: flex;
  gap: 6px;
}

.btn-sm {
  padding: 3px 10px;
  font-size: 11px;
  border-radius: 4px;
}

.btn-create {
  border: 1px solid var(--accent);
  color: var(--accent);
  background: transparent;
}
.btn-create:hover {
  background: var(--accent-dim);
}

.btn-manage {
  border: 1px solid var(--border);
  color: var(--text-dim);
  background: transparent;
}
.btn-manage:hover {
  border-color: var(--text-muted);
  color: var(--text);
}
.btn-manage.active {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-dim);
}

.sets-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.set-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: 16px;
  font-size: 12px;
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all 0.15s;
  color: var(--text-dim);
}
.set-chip:hover {
  border-color: var(--accent);
  color: var(--text);
}
.set-chip.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  font-weight: 500;
}
.set-chip.active .set-delete {
  color: rgba(255, 255, 255, 0.7);
}
.set-chip.active .set-delete:hover {
  color: #fff;
}
.set-chip.active .set-badge {
  background: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.9);
}

.set-icon {
  font-size: 11px;
}

.set-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.set-badge {
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 6px;
  font-weight: 500;
}
.set-badge.builtin {
  background: var(--accent-dim);
  color: var(--accent);
}

.set-delete {
  margin-left: 2px;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 9px;
  color: var(--text-muted);
  opacity: 0;
  transition: opacity 0.15s;
}
.set-chip:hover .set-delete {
  opacity: 1;
}
.set-delete:hover {
  background: rgba(224, 82, 82, 0.2);
  color: var(--danger);
}

.sets-desc {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}
.active-indicator {
  color: var(--success);
  font-weight: 500;
}

/* 管理面板 */
.manage-panel {
  margin-top: 12px;
  background: var(--bg-overlay);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
}

.manage-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.manage-header h4 {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}
.manage-count {
  font-size: 11px;
  color: var(--text-muted);
}

.manage-loading {
  text-align: center;
  padding: 16px;
  font-size: 12px;
  color: var(--text-muted);
}

.manage-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 240px;
  overflow-y: auto;
}

.manage-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-radius: 5px;
  background: var(--bg-surface);
  border: 1px solid transparent;
  transition: border-color 0.1s;
}
.manage-item:hover {
  border-color: var(--border);
}

.item-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.item-source {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 6px;
  font-weight: 600;
  min-width: 36px;
  text-align: center;
}
.item-source.builtin {
  background: var(--accent-dim);
  color: var(--accent);
}
.item-source.custom {
  background: rgba(230, 162, 60, 0.15);
  color: var(--warning);
}

.item-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
}

.item-key {
  font-size: 10px;
  color: var(--text-muted);
  font-family: monospace;
}

.manage-tip {
  margin-top: 10px;
  padding: 8px 10px;
  font-size: 11px;
  color: var(--text-dim);
  background: var(--bg-surface);
  border-radius: 4px;
  line-height: 1.5;
}

/* 动画 */
.slide-enter-active, .slide-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}
.slide-enter-from, .slide-leave-to {
  opacity: 0;
  max-height: 0;
  margin-top: 0;
  padding: 0 12px;
}
.slide-enter-to, .slide-leave-from {
  opacity: 1;
  max-height: 400px;
}

/* 弹窗内 */
.form-stack { display: flex; flex-direction: column; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field label { font-size: 12px; font-weight: 500; color: var(--text-dim); }
.field input, .field select { font-size: 13px; padding: 8px 12px; height: 36px; }
.field-hint { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

.delete-warning p { line-height: 1.5; margin-bottom: 10px; font-size: 13px; }
.warning-text { color: var(--warning); font-size: 12px; }

.dlg-btn { padding: 7px 18px; border-radius: 6px; font-size: 13px; font-weight: 500; transition: all 0.15s; }
.dlg-btn-cancel { border: 1px solid var(--border); color: var(--text-dim); }
.dlg-btn-cancel:hover { border-color: var(--text-muted); }
.dlg-btn-primary { background: var(--accent); color: #fff; }
.dlg-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.dlg-btn-danger { background: var(--danger); color: #fff; }
.dlg-btn-danger:hover { opacity: 0.9; }
</style>
