<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { skillsApi, skillSetsApi, type Skill } from '../api';
import { useWorkspace } from '../stores/workspace';
import SkillSetsManager from './SkillSetsManager.vue';

const workspace = useWorkspace();
const scope = computed({
  get: () => workspace.skillsScope,
  set: (v) => { workspace.skillsScope = v; },
});

const skills = ref<Skill[]>([]);
const showCreate = ref(false);
const editingSkill = ref<Skill | null>(null);
const newSkill = ref({ name: '', displayName: '', description: '', whenToUse: '', content: '' });

const projectId = computed(() => workspace.currentProjectId);
const setsManagerRef = ref<InstanceType<typeof SkillSetsManager> | null>(null);

function onSetChange(_setId: string) {
  loadSkills();
}

async function loadSkills() {
  if (scope.value === 'system') {
    skills.value = await skillsApi.listSystem();
  } else {
    if (!projectId.value) { skills.value = []; return; }
    skills.value = await skillsApi.listProject(projectId.value);
  }
}

async function createSkill() {
  if (!newSkill.value.name || !newSkill.value.content) return;
  try {
    if (scope.value === 'system') {
      await skillsApi.createSystem(newSkill.value);
    } else if (projectId.value) {
      await skillsApi.createProject(projectId.value, newSkill.value);
    }
    newSkill.value = { name: '', displayName: '', description: '', whenToUse: '', content: '' };
    showCreate.value = false;
    await loadSkills();
    workspace.addTaskLog('skills', 'success', '新 Skill 已创建');
  } catch (e: any) {
    workspace.addTaskLog('skills', 'error', `创建失败: ${e.message}`);
  }
}

function startEdit(skill: Skill) {
  editingSkill.value = { ...skill };
}

function cancelEdit() {
  editingSkill.value = null;
}

async function saveEdit() {
  if (!editingSkill.value || !editingSkill.value.content) return;
  try {
    if (scope.value === 'system') {
      await skillsApi.updateSystem(editingSkill.value.name, editingSkill.value);
    } else if (projectId.value) {
      await skillsApi.updateProject(projectId.value, editingSkill.value.name, editingSkill.value);
    }
    editingSkill.value = null;
    await loadSkills();
    workspace.addTaskLog('skills', 'success', 'Skill 已更新');
  } catch (e: any) {
    workspace.addTaskLog('skills', 'error', `更新失败: ${e.message}`);
  }
}

async function deleteSkill(name: string) {
  try {
    if (scope.value === 'system') {
      await skillsApi.deleteSystem(name);
    } else if (projectId.value) {
      await skillsApi.deleteProject(projectId.value, name);
    }
    await loadSkills();
    workspace.addTaskLog('skills', 'success', `Skill "${name}" 已删除`);
  } catch (e: any) {
    workspace.addTaskLog('skills', 'error', `删除失败: ${e.message}`);
  }
}

onMounted(loadSkills);
watch([scope, projectId], () => {
  cancelEdit();
  showCreate.value = false;
  loadSkills();
});
</script>

<template>
  <div class="skills-pane">
    <div class="pane-header">
      <div class="header-left">
        <h2>Skills 管理</h2>
        <p class="desc">
          Agent 的模块化知识包。<b style="color: var(--accent)">系统级</b> 全局可用；
          <b style="color: var(--success)">本书级</b> 仅当前小说使用，可针对本书创建专用技能
        </p>
      </div>
      <div class="actions">
        <button class="btn btn-outline" @click="showCreate = !showCreate">
          {{ showCreate ? '取消' : '＋ 新建 Skill' }}
        </button>
        <button class="btn btn-primary" @click="loadSkills">↻ 刷新</button>
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
    <SkillSetsManager v-if="scope === 'system'" ref="setsManagerRef" @change="onSetChange" />

    <div v-if="scope === 'project' && !projectId" class="empty-tip">
      <p>请先打开一本小说才能管理本书 Skills</p>
    </div>

    <template v-else>
      <!-- 创建表单 -->
      <div v-if="showCreate" class="edit-form">
        <h3>新建 {{ scope === 'system' ? '系统级' : '本书' }} Skill</h3>
        <div class="form-row">
          <div class="field">
            <label>名称 (ID)</label>
            <input v-model="newSkill.name" placeholder="my-skill (英文)" />
          </div>
          <div class="field">
            <label>显示名称</label>
            <input v-model="newSkill.displayName" placeholder="我的技能" />
          </div>
        </div>
        <div class="field">
          <label>功能描述</label>
          <input v-model="newSkill.description" placeholder="这个 Skill 做什么..." />
        </div>
        <div class="field">
          <label>使用场景</label>
          <input v-model="newSkill.whenToUse" placeholder="什么时候 Agent 应该使用" />
        </div>
        <div class="field">
          <label>Skill 内容（Markdown 提示词）</label>
          <textarea v-model="newSkill.content" rows="10" placeholder="# Skill 标题&#10;&#10;详细的提示词内容..."></textarea>
        </div>
        <div class="form-actions">
          <button class="btn btn-accent" @click="createSkill" :disabled="!newSkill.name || !newSkill.content">创建</button>
          <button class="btn btn-outline" @click="showCreate = false">取消</button>
        </div>
      </div>

      <!-- 编辑表单 -->
      <div v-if="editingSkill" class="edit-form editing">
        <h3>编辑：{{ editingSkill.displayName || editingSkill.name }}</h3>
        <div class="form-row">
          <div class="field">
            <label>显示名称</label>
            <input v-model="editingSkill.displayName" />
          </div>
          <div class="field">
            <label>使用场景</label>
            <input v-model="editingSkill.whenToUse" />
          </div>
        </div>
        <div class="field">
          <label>功能描述</label>
          <input v-model="editingSkill.description" />
        </div>
        <div class="field">
          <label>Skill 内容</label>
          <textarea v-model="editingSkill.content" rows="14"></textarea>
        </div>
        <div class="form-actions">
          <button class="btn btn-accent" @click="saveEdit">保存修改</button>
          <button class="btn btn-outline" @click="cancelEdit">取消</button>
        </div>
      </div>

      <!-- 空提示 -->
      <div v-if="!skills.length && !showCreate && !editingSkill" class="empty-tip">
        <p v-if="scope === 'system'">暂无系统级 Skills（内置 Skill 也会出现在这里）</p>
        <p v-else>当前小说还没有专属 Skills。可基于本书特点创建专用技能（如某种笔法、流派惯例）</p>
      </div>

      <!-- 列表 -->
      <div v-show="!editingSkill" class="skills-list">
        <div v-for="skill in skills" :key="skill.name" class="skill-card" @click="startEdit(skill)">
          <div class="skill-header">
            <span class="skill-source" :class="skill.source">
              {{ skill.source === 'builtin' ? '内置' : skill.source === 'custom' ? '已修改' : skill.source === 'project' ? '本书' : '自定义' }}
            </span>
            <span class="skill-name">{{ skill.displayName || skill.name }}</span>
            <button
              v-if="skill.source !== 'builtin'"
              class="delete-btn"
              @click.stop="deleteSkill(skill.name)"
              :title="skill.source === 'custom' ? '重置为内置默认' : '删除'"
            >{{ skill.source === 'custom' ? '↺' : '✕' }}</button>
          </div>
          <p class="skill-desc">{{ skill.description }}</p>
          <p class="skill-when" v-if="skill.whenToUse">
            <span class="when-label">触发：</span>{{ skill.whenToUse }}
          </p>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.skills-pane { padding: 24px 32px; max-width: 860px; margin: 0 auto; overflow-y: auto; height: 100%; }
.pane-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; }
.header-left { flex: 1; }
.pane-header h2 { font-size: 20px; font-weight: 600; margin-bottom: 4px; }
.desc { color: var(--text-muted); font-size: 13px; }
.actions { display: flex; gap: 8px; flex-shrink: 0; padding-top: 4px; }
.btn { padding: 6px 16px; border-radius: 6px; font-size: 13px; font-weight: 500; }
.btn-primary { background: var(--accent); color: var(--bg-overlay); }
.btn-outline { border: 1px solid var(--border); color: var(--text-dim); }
.btn-outline:hover { border-color: var(--accent); color: var(--accent); }
.btn-accent { background: linear-gradient(135deg, #7c6fe0, #5b8def); color: #fff; }
.btn-accent:disabled { opacity: 0.5; }

/* 作用域切换 */
.scope-tabs { display: flex; gap: 2px; background: var(--bg-overlay); padding: 3px; border-radius: 6px; width: fit-content; margin-bottom: 20px; }
.scope-tab { padding: 6px 16px; font-size: 12px; border-radius: 4px; color: var(--text-dim); }
.scope-tab:hover:not(:disabled) { color: var(--text); }
.scope-tab.active { background: var(--accent); color: #fff; font-weight: 500; }
.scope-tab:disabled { opacity: 0.4; cursor: not-allowed; }

.empty-tip { padding: 60px; text-align: center; color: var(--text-muted); font-size: 13px; }

.edit-form { background: var(--bg-surface); border: 1px dashed var(--accent); border-radius: 8px; padding: 16px; margin-bottom: 20px; display: flex; flex-direction: column; gap: 12px; }
.edit-form.editing { border-color: var(--success); }
.edit-form h3 { font-size: 14px; font-weight: 600; }
.form-row { display: flex; gap: 12px; }
.form-row .field { flex: 1; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field label { font-size: 11px; color: var(--text-dim); font-weight: 500; }
.field input, .field textarea { font-size: 12px; padding: 6px 8px; }
.field textarea { resize: vertical; min-height: 160px; line-height: 1.5; font-family: 'JetBrains Mono', 'Fira Code', monospace; }
.form-actions { display: flex; gap: 8px; }

.skills-list { display: flex; flex-direction: column; gap: 10px; }
.skill-card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; cursor: pointer; transition: border-color 0.15s; }
.skill-card:hover { border-color: var(--accent); }
.skill-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.skill-source { font-size: 10px; padding: 2px 8px; border-radius: 10px; font-weight: 500; }
.skill-source.builtin { background: var(--accent-dim); color: var(--accent); }
.skill-source.custom { background: rgba(230, 162, 60, 0.15); color: var(--warning); }
.skill-source.user { background: rgba(230, 162, 60, 0.15); color: var(--warning); }
.skill-source.project { background: var(--success-dim); color: var(--success); }
.skill-name { font-size: 14px; font-weight: 600; }
.delete-btn { margin-left: auto; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; border-radius: 4px; color: var(--danger); font-size: 11px; opacity: 0.5; }
.delete-btn:hover { opacity: 1; background: rgba(224,82,82,0.1); }
.skill-desc { font-size: 12px; color: var(--text-dim); line-height: 1.4; }
.skill-when { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
.when-label { color: var(--warning); font-weight: 500; }
</style>
