<script setup lang="ts">
/**
 * 提示词管理（统一）
 * - 系统级：直接编辑系统提示词（替换 / 重置）
 * - 项目级：可追加（推荐）或覆盖，仅当前项目生效
 */
import { ref, computed, watch, onMounted } from 'vue';
import { promptsApi, type SystemPromptTemplate, type ProjectPromptTemplate } from '../api';
import { useWorkspace } from '../stores/workspace';
import PromptSetsManager from './PromptSetsManager.vue';

const workspace = useWorkspace();
const setsManagerRef = ref<InstanceType<typeof PromptSetsManager> | null>(null);

function onSetChange(_setId: string) {
  loadPrompts();
}
const scope = computed({
  get: () => workspace.promptsScope,
  set: (v) => { workspace.promptsScope = v; },
});

const projectId = computed(() => workspace.currentProjectId);
const filterStage = ref('all');
const loading = ref(false);

// 系统级状态
const sysPrompts = ref<SystemPromptTemplate[]>([]);
const editingSysPrompt = ref<SystemPromptTemplate | null>(null);

// 项目级状态
const projPrompts = ref<ProjectPromptTemplate[]>([]);
const editingProjPrompt = ref<ProjectPromptTemplate | null>(null);
const editMode = ref<'append' | 'override'>('append');
const editAppendContent = ref('');
const editOverrideRole = ref('');
const editOverrideContent = ref('');

const stages = [
  { value: 'all', label: '全部' },
  { value: '配置', label: '📋 配置' },
  { value: '架构', label: '📐 架构' },
  { value: '蓝图', label: '📑 蓝图' },
  { value: '写稿', label: '✍️ 写稿' },
  { value: '修稿', label: '✨ 修稿' },
  { value: '审稿', label: '📝 审稿' },
  { value: '定稿', label: '✅ 定稿' },
  { value: '工具', label: '🔧 工具' },
];

const filteredSysPrompts = computed(() => {
  if (filterStage.value === 'all') return sysPrompts.value;
  return sysPrompts.value.filter(p => p.usage?.stage === filterStage.value);
});

const filteredProjPrompts = computed(() => {
  if (filterStage.value === 'all') return projPrompts.value;
  return projPrompts.value.filter(p => p.usage?.stage === filterStage.value);
});

async function loadPrompts() {
  loading.value = true;
  try {
    if (scope.value === 'system') {
      sysPrompts.value = await promptsApi.listSystem();
    } else if (projectId.value) {
      projPrompts.value = await promptsApi.listProject(projectId.value);
    }
  } finally {
    loading.value = false;
  }
}

// ─── 系统级编辑 ─────────────────────────────────────────────
function startEditSys(p: SystemPromptTemplate) {
  editingSysPrompt.value = { ...p };
}

async function saveEditSys() {
  if (!editingSysPrompt.value) return;
  try {
    await promptsApi.updateSystem(editingSysPrompt.value.key, {
      systemRole: editingSysPrompt.value.systemRole,
      content: editingSysPrompt.value.content,
    });
    editingSysPrompt.value = null;
    await loadPrompts();
    workspace.addTaskLog('prompts', 'success', '提示词已保存');
  } catch (e: any) {
    workspace.addTaskLog('prompts', 'error', `保存失败: ${e.message}`);
  }
}

async function resetSysPrompt(key: string) {
  try {
    await promptsApi.resetSystem(key);
    await loadPrompts();
    workspace.addTaskLog('prompts', 'success', '已重置为内置默认');
  } catch (e: any) {
    workspace.addTaskLog('prompts', 'error', `重置失败: ${e.message}`);
  }
}

// ─── 项目级编辑 ─────────────────────────────────────────────
function startEditProj(p: ProjectPromptTemplate) {
  editingProjPrompt.value = { ...p };
  if (p.project.append) {
    editMode.value = 'append';
    editAppendContent.value = p.project.append.content;
  } else if (p.project.override) {
    editMode.value = 'override';
    editOverrideRole.value = p.project.override.systemRole;
    editOverrideContent.value = p.project.override.content;
  } else {
    editMode.value = 'append';
    editAppendContent.value = '';
    editOverrideRole.value = (p.system?.systemRole || p.builtin.systemRole);
    editOverrideContent.value = (p.system?.content || p.builtin.content);
  }
}

async function saveEditProj() {
  if (!editingProjPrompt.value || !projectId.value) return;
  try {
    if (editMode.value === 'append') {
      if (!editAppendContent.value.trim()) {
        await promptsApi.clearProject(projectId.value, editingProjPrompt.value.key);
      } else {
        await promptsApi.setProjectAppend(projectId.value, editingProjPrompt.value.key, editAppendContent.value);
      }
    } else {
      await promptsApi.setProjectOverride(projectId.value, editingProjPrompt.value.key, {
        systemRole: editOverrideRole.value,
        content: editOverrideContent.value,
      });
    }
    editingProjPrompt.value = null;
    await loadPrompts();
    workspace.addTaskLog('prompts', 'success', '项目提示词已保存');
  } catch (e: any) {
    workspace.addTaskLog('prompts', 'error', `保存失败: ${e.message}`);
  }
}

async function clearProjPrompt(key: string) {
  if (!projectId.value) return;
  try {
    await promptsApi.clearProject(projectId.value, key);
    editingProjPrompt.value = null;
    await loadPrompts();
    workspace.addTaskLog('prompts', 'success', '已清除项目级覆盖');
  } catch (e: any) {
    workspace.addTaskLog('prompts', 'error', `清除失败: ${e.message}`);
  }
}

function syncFromArchitecture() {
  if (!editingProjPrompt.value || !workspace.projectDetail) return;
  const config = workspace.projectDetail.config;
  const parts: string[] = [];
  if (config.writingStyle) parts.push(`【文风】${config.writingStyle}`);
  if (config.globalGuidance) parts.push(`【全局禁忌】${config.globalGuidance}`);
  if (config.protagonistProfile) parts.push(`【主角人设】${config.protagonistProfile}`);
  if (parts.length) {
    editAppendContent.value = parts.join('\n\n');
    editMode.value = 'append';
  }
}

function getProjStatus(p: ProjectPromptTemplate): { label: string; type: string } | null {
  if (p.project.override) return { label: '已覆盖', type: 'override' };
  if (p.project.append) return { label: '已追加', type: 'append' };
  return null;
}

// 切换 scope 时重置编辑状态
watch([scope, projectId], () => {
  editingSysPrompt.value = null;
  editingProjPrompt.value = null;
  loadPrompts();
});

onMounted(loadPrompts);
</script>

<template>
  <div class="prompts-pane">
    <div class="pane-header">
      <div class="header-left">
        <h2>提示词管理</h2>
        <p class="desc">
          AI 创作管线使用的 Prompt 模板。<b style="color: var(--accent)">系统级</b> 全局生效；
          <b style="color: var(--success)">本书级</b> 可追加本小说特定指导（如笔法、风格）
        </p>
      </div>
      <div class="actions">
        <button class="btn btn-primary" @click="loadPrompts" :disabled="loading">↻ 刷新</button>
      </div>
    </div>

    <!-- 作用域切换 -->
    <div class="scope-tabs">
      <button class="scope-tab" :class="{ active: scope === 'system' }" @click="scope = 'system'">
        🌐 系统级
      </button>
      <button
        class="scope-tab"
        :class="{ active: scope === 'project' }"
        :disabled="!projectId"
        @click="scope = 'project'"
      >
        📁 本书 {{ projectId ? `(${projectId})` : '' }}
      </button>
    </div>

    <!-- 套件管理器（仅系统级显示） -->
    <PromptSetsManager v-if="scope === 'system'" ref="setsManagerRef" @change="onSetChange" />

    <div v-if="scope === 'project' && !projectId" class="empty-tip">
      <p>请先打开一本小说才能管理本书提示词</p>
    </div>

    <template v-else>
      <!-- 阶段筛选 -->
      <div v-show="!editingSysPrompt && !editingProjPrompt" class="stage-filter">
        <button v-for="s in stages" :key="s.value" class="filter-btn"
          :class="{ active: filterStage === s.value }" @click="filterStage = s.value">{{ s.label }}</button>
      </div>

      <!-- ═══ 系统级编辑面板 ═══ -->
      <div v-if="scope === 'system' && editingSysPrompt" class="edit-panel">
        <div class="edit-header">
          <h3>{{ editingSysPrompt.name }}</h3>
          <span class="edit-key">{{ editingSysPrompt.key }}</span>
          <span class="edit-source" :class="editingSysPrompt.source">
            {{ editingSysPrompt.source === 'custom' ? '已自定义' : '内置默认' }}
          </span>
        </div>
        <p class="edit-desc">{{ editingSysPrompt.description }}</p>

        <div v-if="editingSysPrompt.usage" class="usage-badge-large">
          <span class="usage-icon">{{ editingSysPrompt.usage.icon }}</span>
          <div class="usage-info">
            <span class="usage-stage">阶段：{{ editingSysPrompt.usage.stage }}</span>
            <span class="usage-trigger">触发位置：{{ editingSysPrompt.usage.trigger }}</span>
          </div>
        </div>

        <div class="field">
          <label>System Role（角色定位）</label>
          <textarea v-model="editingSysPrompt.systemRole" rows="3"></textarea>
        </div>

        <div class="field">
          <label>
            Prompt 内容
            <span class="var-hint">支持 &#123;&#123;变量&#125;&#125; 插值</span>
          </label>
          <textarea v-model="editingSysPrompt.content" rows="20" class="prompt-editor"></textarea>
        </div>

        <div class="form-actions">
          <button class="btn btn-accent" @click="saveEditSys">💾 保存修改</button>
          <button v-if="editingSysPrompt.source === 'custom'"
            class="btn btn-warning" @click="resetSysPrompt(editingSysPrompt.key); editingSysPrompt = null">↺ 重置为默认</button>
          <button class="btn btn-outline" @click="editingSysPrompt = null">取消</button>
        </div>
      </div>

      <!-- ═══ 系统级列表 ═══ -->
      <div v-show="scope === 'system' && !editingSysPrompt" class="prompts-list">
        <div v-for="p in filteredSysPrompts" :key="p.key" class="prompt-card" @click="startEditSys(p)">
          <div class="prompt-header">
            <span class="prompt-source" :class="p.source">
              {{ p.source === 'custom' ? '已修改' : '内置' }}
            </span>
            <span class="prompt-name">{{ p.name }}</span>
            <span class="prompt-key">{{ p.key }}</span>
          </div>
          <p class="prompt-desc">{{ p.description }}</p>
          <div v-if="p.usage" class="usage-badge">
            <span class="usage-icon">{{ p.usage.icon }}</span>
            <span class="usage-stage">{{ p.usage.stage }}</span>
            <span class="usage-sep">→</span>
            <span class="usage-trigger">{{ p.usage.trigger }}</span>
          </div>
        </div>
      </div>

      <!-- ═══ 项目级编辑面板 ═══ -->
      <div v-if="scope === 'project' && editingProjPrompt" class="edit-panel">
        <div class="edit-header">
          <h3>{{ editingProjPrompt.name }}</h3>
          <span class="edit-key">{{ editingProjPrompt.key }}</span>
        </div>
        <p class="edit-desc">{{ editingProjPrompt.description }}</p>

        <div class="mode-tabs">
          <button class="mode-tab" :class="{ active: editMode === 'append' }" @click="editMode = 'append'">
            ➕ 追加（推荐）
          </button>
          <button class="mode-tab" :class="{ active: editMode === 'override' }" @click="editMode = 'override'">
            ✏️ 完全覆盖
          </button>
        </div>

        <div v-if="editMode === 'append'" class="mode-tip">
          💡 「追加」会保留原 prompt，仅在末尾添加本书特定指导。适合补充本小说的笔法、风格、禁忌等。
        </div>
        <div v-else class="mode-tip warn">
          ⚠️ 「覆盖」会完全替换原 prompt。仅在你确实需要重写整个 prompt 时使用。
        </div>

        <!-- 追加模式 -->
        <div v-if="editMode === 'append'" class="form-section">
          <div class="field">
            <div class="field-row-label">
              <label>追加内容（本书特定指导）</label>
              <button class="sync-btn" @click="syncFromArchitecture" title="从小说配置同步文风/禁忌/主角人设">
                🔄 从架构同步
              </button>
            </div>
            <textarea
              v-model="editAppendContent"
              rows="12"
              class="prompt-editor"
              placeholder="例如：&#10;- 本小说要使用 noir 风格，多用阴影、雨夜、霓虹意象&#10;- 主角是程序员，对话中可以适度使用技术黑话&#10;- 节奏偏慢热，重视心理刻画"
            ></textarea>
          </div>
          <div class="preview-section">
            <details>
              <summary>📄 查看生效后的完整 prompt</summary>
              <pre class="effective-preview">{{ editingProjPrompt.effective.content + (editAppendContent ? '\n\n【★ 本书额外指导】\n' + editAppendContent : '') }}</pre>
            </details>
          </div>
        </div>

        <!-- 覆盖模式 -->
        <div v-else class="form-section">
          <div class="field">
            <label>System Role</label>
            <textarea v-model="editOverrideRole" rows="3"></textarea>
          </div>
          <div class="field">
            <label>Prompt 内容（完全覆盖）</label>
            <textarea v-model="editOverrideContent" rows="14" class="prompt-editor"></textarea>
          </div>
        </div>

        <div class="form-actions">
          <button class="btn btn-accent" @click="saveEditProj">💾 保存</button>
          <button v-if="editingProjPrompt.project.append || editingProjPrompt.project.override"
            class="btn btn-warning" @click="clearProjPrompt(editingProjPrompt.key)">↺ 清除本书级</button>
          <button class="btn btn-outline" @click="editingProjPrompt = null">取消</button>
        </div>
      </div>

      <!-- ═══ 项目级列表 ═══ -->
      <div v-show="scope === 'project' && !editingProjPrompt" class="prompts-list">
        <div v-for="p in filteredProjPrompts" :key="p.key" class="prompt-card" @click="startEditProj(p)">
          <div class="prompt-header">
            <span v-if="getProjStatus(p)" class="prompt-status" :class="getProjStatus(p)!.type">
              {{ getProjStatus(p)!.label }}
            </span>
            <span v-else class="prompt-status default">未配置</span>
            <span class="prompt-name">{{ p.name }}</span>
            <span class="prompt-key">{{ p.key }}</span>
          </div>
          <p class="prompt-desc">{{ p.description }}</p>
          <div v-if="p.usage" class="usage-badge">
            <span class="usage-icon">{{ p.usage.icon }}</span>
            <span class="usage-stage">{{ p.usage.stage }}</span>
            <span class="usage-sep">→</span>
            <span class="usage-trigger">{{ p.usage.trigger }}</span>
          </div>
          <p v-if="p.project.append" class="append-preview">
            <span class="ap-label">追加：</span>{{ p.project.append.content.slice(0, 100) }}{{ p.project.append.content.length > 100 ? '...' : '' }}
          </p>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.prompts-pane { padding: 24px 32px; max-width: 900px; margin: 0 auto; overflow-y: auto; height: 100%; }
.pane-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; }
.header-left { flex: 1; }
.pane-header h2 { font-size: 20px; font-weight: 600; margin-bottom: 4px; }
.desc { color: var(--text-muted); font-size: 13px; }
.actions { display: flex; gap: 8px; flex-shrink: 0; padding-top: 4px; }
.btn { padding: 6px 16px; border-radius: 6px; font-size: 13px; font-weight: 500; transition: all 0.15s; }
.btn-primary { background: var(--accent); color: var(--bg-overlay); }
.btn-outline { border: 1px solid var(--border); color: var(--text-dim); }
.btn-outline:hover { border-color: var(--accent); color: var(--accent); }
.btn-accent { background: linear-gradient(135deg, #7c6fe0, #5b8def); color: #fff; }
.btn-warning { border: 1px solid var(--warning); color: var(--warning); }
.btn-warning:hover { background: rgba(230, 162, 60, 0.1); }

/* 作用域切换 */
.scope-tabs { display: flex; gap: 2px; background: var(--bg-overlay); padding: 3px; border-radius: 6px; width: fit-content; margin-bottom: 16px; }
.scope-tab { padding: 6px 16px; font-size: 12px; border-radius: 4px; color: var(--text-dim); }
.scope-tab:hover:not(:disabled) { color: var(--text); }
.scope-tab.active { background: var(--accent); color: #fff; font-weight: 500; }
.scope-tab:disabled { opacity: 0.4; cursor: not-allowed; }

.empty-tip { padding: 60px; text-align: center; color: var(--text-muted); font-size: 13px; }

.stage-filter { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 16px; }
.filter-btn { padding: 4px 10px; font-size: 11px; border-radius: 12px; border: 1px solid var(--border); color: var(--text-dim); }
.filter-btn:hover { border-color: var(--accent); color: var(--accent); }
.filter-btn.active { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); font-weight: 500; }

/* 编辑面板 */
.edit-panel { background: var(--bg-surface); border: 1px solid var(--accent); border-radius: 8px; padding: 20px; }
.edit-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.edit-header h3 { font-size: 16px; font-weight: 600; }
.edit-key { font-size: 11px; color: var(--text-muted); font-family: monospace; background: var(--bg-overlay); padding: 2px 6px; border-radius: 3px; }
.edit-source { font-size: 10px; padding: 2px 8px; border-radius: 10px; font-weight: 500; }
.edit-source.builtin { background: var(--accent-dim); color: var(--accent); }
.edit-source.custom { background: rgba(230, 162, 60, 0.15); color: var(--warning); }
.edit-desc { font-size: 12px; color: var(--text-muted); margin-bottom: 12px; }

.usage-badge-large { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--bg-overlay); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 16px; }
.usage-icon { font-size: 20px; }
.usage-info { display: flex; flex-direction: column; gap: 2px; }
.usage-stage { font-size: 12px; font-weight: 600; color: var(--accent); }
.usage-trigger { font-size: 11px; color: var(--text-dim); }

.mode-tabs { display: flex; gap: 2px; margin-bottom: 12px; background: var(--bg-overlay); padding: 3px; border-radius: 6px; width: fit-content; }
.mode-tab { padding: 6px 16px; font-size: 12px; border-radius: 4px; color: var(--text-dim); }
.mode-tab:hover { color: var(--text); }
.mode-tab.active { background: var(--accent); color: #fff; font-weight: 500; }

.mode-tip { padding: 8px 12px; background: var(--bg-overlay); border-left: 3px solid var(--success); font-size: 12px; color: var(--text-dim); margin-bottom: 14px; line-height: 1.5; border-radius: 0 4px 4px 0; }
.mode-tip.warn { border-color: var(--warning); }

.form-section { display: flex; flex-direction: column; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; }
.field-row-label { display: flex; align-items: center; justify-content: space-between; }
.field label { font-size: 11px; color: var(--text-dim); font-weight: 500; display: flex; align-items: center; gap: 8px; }
.var-hint { font-size: 10px; color: var(--accent); font-weight: 400; }
.sync-btn { font-size: 11px; padding: 3px 10px; border-radius: 4px; border: 1px solid var(--accent); color: var(--accent); background: transparent; }
.sync-btn:hover { background: var(--accent-dim); }

.field textarea { font-size: 12px; padding: 10px 12px; resize: vertical; line-height: 1.5; border-radius: 4px; }
.prompt-editor { min-height: 280px; font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 11px; line-height: 1.6; }

.preview-section { font-size: 12px; }
.preview-section summary { cursor: pointer; color: var(--text-dim); padding: 4px 0; }
.preview-section summary:hover { color: var(--accent); }
.effective-preview { margin-top: 8px; padding: 12px; background: var(--bg-base); border: 1px solid var(--border); border-radius: 4px; font-size: 11px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; max-height: 400px; overflow-y: auto; font-family: 'JetBrains Mono', monospace; }

.form-actions { display: flex; gap: 8px; margin-top: 4px; }

/* 列表 */
.prompts-list { display: flex; flex-direction: column; gap: 8px; }
.prompt-card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; cursor: pointer; transition: border-color 0.15s; }
.prompt-card:hover { border-color: var(--accent); }
.prompt-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.prompt-source, .prompt-status { font-size: 10px; padding: 2px 8px; border-radius: 10px; font-weight: 500; }
.prompt-source.builtin { background: var(--accent-dim); color: var(--accent); }
.prompt-source.custom, .prompt-status.override { background: rgba(230, 162, 60, 0.15); color: var(--warning); }
.prompt-status.default { background: var(--bg-overlay); color: var(--text-muted); }
.prompt-status.append { background: var(--success-dim); color: var(--success); }
.prompt-name { font-size: 13px; font-weight: 600; }
.prompt-key { font-size: 10px; color: var(--text-muted); font-family: monospace; margin-left: auto; }
.prompt-desc { font-size: 12px; color: var(--text-dim); margin-bottom: 6px; }

.usage-badge { display: flex; align-items: center; gap: 5px; font-size: 11px; padding: 4px 8px; background: var(--bg-overlay); border-radius: 4px; margin-top: 4px; }
.usage-stage { color: var(--accent); font-weight: 600; }
.usage-sep { color: var(--text-muted); }
.usage-trigger { color: var(--text-dim); }

.append-preview { font-size: 11px; color: var(--success); margin-top: 6px; padding: 4px 8px; background: var(--success-dim); border-radius: 4px; line-height: 1.4; }
.ap-label { font-weight: 600; }
</style>
