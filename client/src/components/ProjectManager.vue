<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useWorkspace } from '../stores/workspace';
import { api, type ProjectConfig } from '../api';
import BaseDialog from './BaseDialog.vue';

const workspace = useWorkspace();
const searchQuery = ref('');
const showCreate = ref(false);
const renameTarget = ref<ProjectConfig | null>(null);
const duplicateTarget = ref<ProjectConfig | null>(null);
const deleteTarget = ref<ProjectConfig | null>(null);

const newProject = ref({ id: '', title: '' });
const renameForm = ref({ newId: '' });
const duplicateForm = ref({ newId: '', newTitle: '' });

const filteredProjects = computed(() => {
  if (!searchQuery.value.trim()) return workspace.projects;
  const q = searchQuery.value.toLowerCase();
  return workspace.projects.filter(p =>
    p.id?.toLowerCase().includes(q) ||
    p.title?.toLowerCase().includes(q) ||
    p.genre?.toLowerCase().includes(q)
  );
});

async function refresh() {
  await workspace.loadProjects();
}

async function openProject(id: string) {
  await workspace.selectProject(id);
}

async function createProject() {
  if (!newProject.value.id.trim()) return;
  if (!/^[a-zA-Z0-9_-]+$/.test(newProject.value.id)) {
    alert('小说 ID 只能包含字母、数字、下划线、连字符');
    return;
  }
  try {
    await api.createProject({
      id: newProject.value.id.trim(),
      title: newProject.value.title.trim() || newProject.value.id.trim(),
    });
    showCreate.value = false;
    const id = newProject.value.id.trim();
    newProject.value = { id: '', title: '' };
    await refresh();
    await openProject(id);
  } catch (e: any) {
    alert(`创建失败: ${e.message}`);
  }
}

function startRename(p: ProjectConfig) {
  renameTarget.value = p;
  renameForm.value.newId = p.id || '';
}

async function confirmRename() {
  if (!renameTarget.value || !renameForm.value.newId.trim()) return;
  try {
    await api.renameProject(renameTarget.value.id!, renameForm.value.newId.trim());
    renameTarget.value = null;
    await refresh();
  } catch (e: any) {
    alert(`重命名失败: ${e.message}`);
  }
}

function startDuplicate(p: ProjectConfig) {
  duplicateTarget.value = p;
  duplicateForm.value = {
    newId: `${p.id}-copy`,
    newTitle: `${p.title} (副本)`,
  };
}

async function confirmDuplicate() {
  if (!duplicateTarget.value || !duplicateForm.value.newId.trim()) return;
  try {
    await api.duplicateProject(
      duplicateTarget.value.id!,
      duplicateForm.value.newId.trim(),
      duplicateForm.value.newTitle.trim()
    );
    duplicateTarget.value = null;
    await refresh();
  } catch (e: any) {
    alert(`复制失败: ${e.message}`);
  }
}

function startDelete(p: ProjectConfig) {
  deleteTarget.value = p;
}

async function confirmDelete() {
  if (!deleteTarget.value) return;
  try {
    await api.deleteProject(deleteTarget.value.id!);
    if (workspace.currentProjectId === deleteTarget.value.id) {
      workspace.closeProject();
    }
    deleteTarget.value = null;
    await refresh();
  } catch (e: any) {
    alert(`删除失败: ${e.message}`);
  }
}

onMounted(refresh);
</script>

<template>
  <div class="project-manager">
    <div class="welcome-header">
      <h1>📖 Good</h1>
      <p class="tagline">AI 小说创作 IDE</p>
    </div>

    <div class="manager-toolbar">
      <input
        v-model="searchQuery"
        class="search-input"
        placeholder="🔍 搜索小说（标题、ID、类型）..."
      />
      <button class="btn btn-accent" @click="showCreate = true">＋ 新建小说</button>
      <button class="btn btn-outline" @click="refresh">↻ 刷新</button>
    </div>

    <div v-if="!filteredProjects.length" class="empty">
      <div class="empty-icon">📂</div>
      <p v-if="!workspace.projects.length">还没有任何小说，点击「＋ 新建小说」开始创作</p>
      <p v-else>没有匹配的小说</p>
    </div>

    <div v-else class="project-grid">
      <div
        v-for="p in filteredProjects"
        :key="p.id"
        class="project-card"
        :class="{ active: workspace.currentProjectId === p.id }"
        @click="openProject(p.id!)"
      >
        <div class="card-header">
          <span class="card-title">{{ p.title || p.id }}</span>
          <div class="card-actions" @click.stop>
            <button class="action-btn" title="重命名 ID" @click="startRename(p)">✎</button>
            <button class="action-btn" title="复制小说" @click="startDuplicate(p)">⎘</button>
            <button class="action-btn delete" title="删除小说" @click="startDelete(p)">🗑</button>
          </div>
        </div>
        <div class="card-id">{{ p.id }}</div>
        <div class="card-meta" v-if="p.genre || p.subGenre">
          <span v-if="p.genre" class="tag">{{ p.genre }}</span>
          <span v-if="p.subGenre" class="tag tag-sub">{{ p.subGenre }}</span>
        </div>
        <div class="card-stats">
          <span>📖 共 {{ p.chapterCount || 100 }} 章</span>
          <span class="sep">·</span>
          <span>{{ p.wordsPerChapter || 3000 }} 字/章</span>
        </div>
        <div v-if="p.coreOutline" class="card-outline">{{ p.coreOutline }}</div>
        <div class="card-footer">
          <span v-if="workspace.currentProjectId === p.id" class="current-tag">✓ 当前打开</span>
          <button v-else class="btn-open">打开 →</button>
        </div>
      </div>
    </div>

    <!-- 新建小说弹窗 -->
    <BaseDialog :open="showCreate" title="✨ 新建小说" @close="showCreate = false">
      <div class="form-stack">
        <div class="field">
          <label>小说 ID（英文，唯一标识）</label>
          <input v-model="newProject.id" placeholder="my-novel" autofocus />
          <span class="field-hint">只能包含字母、数字、下划线、连字符</span>
        </div>
        <div class="field">
          <label>小说名称</label>
          <input v-model="newProject.title" placeholder="我的新小说" />
        </div>
      </div>
      <template #footer>
        <button class="dlg-btn dlg-btn-cancel" @click="showCreate = false">取消</button>
        <button class="dlg-btn dlg-btn-primary" @click="createProject" :disabled="!newProject.id.trim()">
          创建
        </button>
      </template>
    </BaseDialog>

    <!-- 重命名弹窗 -->
    <BaseDialog :open="!!renameTarget" title="✎ 重命名小说 ID" @close="renameTarget = null">
      <div class="form-stack" v-if="renameTarget">
        <div class="field">
          <label>当前 ID</label>
          <input :value="renameTarget.id" disabled />
        </div>
        <div class="field">
          <label>新 ID</label>
          <input v-model="renameForm.newId" autofocus />
          <span class="field-hint">⚠️ 重命名会改变小说目录名，相关引用会自动更新</span>
        </div>
      </div>
      <template #footer>
        <button class="dlg-btn dlg-btn-cancel" @click="renameTarget = null">取消</button>
        <button class="dlg-btn dlg-btn-primary" @click="confirmRename" :disabled="!renameForm.newId.trim()">
          重命名
        </button>
      </template>
    </BaseDialog>

    <!-- 复制弹窗 -->
    <BaseDialog :open="!!duplicateTarget" title="⎘ 复制小说" @close="duplicateTarget = null">
      <div class="form-stack" v-if="duplicateTarget">
        <div class="field">
          <label>源小说</label>
          <input :value="duplicateTarget.title || duplicateTarget.id" disabled />
        </div>
        <div class="field">
          <label>新小说 ID</label>
          <input v-model="duplicateForm.newId" autofocus />
        </div>
        <div class="field">
          <label>新小说名称</label>
          <input v-model="duplicateForm.newTitle" />
        </div>
      </div>
      <template #footer>
        <button class="dlg-btn dlg-btn-cancel" @click="duplicateTarget = null">取消</button>
        <button class="dlg-btn dlg-btn-primary" @click="confirmDuplicate" :disabled="!duplicateForm.newId.trim()">
          复制
        </button>
      </template>
    </BaseDialog>

    <!-- 删除确认弹窗 -->
    <BaseDialog :open="!!deleteTarget" title="🗑 删除小说" @close="deleteTarget = null">
      <div class="delete-warning" v-if="deleteTarget">
        <p>确定要删除小说 <strong>{{ deleteTarget.title || deleteTarget.id }}</strong> 吗？</p>
        <p class="warning-text">⚠️ 此操作会永久删除该小说的所有数据，包括：</p>
        <ul>
          <li>所有定稿章节（.txt）</li>
          <li>所有草稿（.md）</li>
          <li>架构、角色卡、章节蓝图</li>
          <li>本书设置、Skills、自定义提示词</li>
        </ul>
        <p class="warning-text">此操作<strong style="color: var(--danger)">不可撤销</strong>！</p>
      </div>
      <template #footer>
        <button class="dlg-btn dlg-btn-cancel" @click="deleteTarget = null">取消</button>
        <button class="dlg-btn dlg-btn-danger" @click="confirmDelete">确认删除</button>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.project-manager {
  padding: 32px 48px;
  max-width: 1600px;
  margin: 0 auto;
  height: 100%;
  overflow-y: auto;
}

.welcome-header {
  text-align: center;
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border);
}
.welcome-header h1 { font-size: 32px; font-weight: 700; margin-bottom: 4px; }
.tagline { color: var(--text-muted); font-size: 14px; }

.manager-toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 24px;
  width: 100%;
}
.search-input { flex: 1; font-size: 13px; padding: 8px 12px; height: 36px; min-width: 0; }

.btn { padding: 8px 18px; border-radius: 6px; font-size: 13px; font-weight: 500; height: 36px; transition: all 0.15s; }
.btn-accent { background: linear-gradient(135deg, #7c6fe0, #5b8def); color: #fff; }
.btn-outline { border: 1px solid var(--border); color: var(--text-dim); }
.btn-outline:hover { border-color: var(--accent); color: var(--accent); }

.empty {
  padding: 60px 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}
.empty-icon { font-size: 48px; opacity: 0.4; margin-bottom: 16px; }

/* 项目卡片网格 */
.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
}

.project-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px 18px;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
}
.project-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
}
.project-card.active {
  border-color: var(--accent);
  background: var(--accent-dim);
}

.card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.card-title { font-size: 15px; font-weight: 600; line-height: 1.3; flex: 1; min-width: 0; word-break: break-word; }

.card-actions { display: flex; gap: 2px; opacity: 0; transition: opacity 0.15s; flex-shrink: 0; }
.project-card:hover .card-actions { opacity: 1; }
.action-btn {
  width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 4px; font-size: 12px; color: var(--text-muted);
  background: transparent; border: none;
}
.action-btn:hover { background: var(--border); color: var(--text); }
.action-btn.delete:hover { color: var(--danger); background: rgba(224, 82, 82, 0.1); }

.card-id { font-size: 11px; color: var(--text-muted); font-family: monospace; }

.card-meta { display: flex; gap: 6px; flex-wrap: wrap; }
.tag {
  font-size: 10px; padding: 2px 8px; border-radius: 10px;
  background: var(--accent-dim); color: var(--accent);
}
.tag.tag-sub { background: var(--bg-overlay); color: var(--text-dim); }

.card-stats {
  font-size: 11px;
  color: var(--text-muted);
  display: flex;
  gap: 6px;
  align-items: center;
}
.card-stats .sep { opacity: 0.5; }

.card-outline {
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-footer {
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px dashed var(--border);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  font-size: 11px;
}
.current-tag { color: var(--success); font-weight: 500; }
.btn-open { color: var(--accent); font-size: 11px; padding: 0; background: transparent; border: none; }

/* 弹窗内 */
.form-stack { display: flex; flex-direction: column; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field label { font-size: 12px; font-weight: 500; color: var(--text-dim); }
.field input { font-size: 13px; padding: 8px 12px; height: 36px; }
.field input:disabled { opacity: 0.6; }
.field-hint { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

.delete-warning p { line-height: 1.5; margin-bottom: 10px; font-size: 13px; }
.delete-warning ul { padding-left: 20px; margin-bottom: 10px; }
.delete-warning ul li { font-size: 12px; line-height: 1.8; color: var(--text-dim); }
.warning-text { color: var(--warning); font-size: 12px; }

.dlg-btn { padding: 7px 18px; border-radius: 6px; font-size: 13px; font-weight: 500; transition: all 0.15s; }
.dlg-btn-cancel { border: 1px solid var(--border); color: var(--text-dim); }
.dlg-btn-cancel:hover { border-color: var(--text-muted); }
.dlg-btn-primary { background: var(--accent); color: #fff; }
.dlg-btn-primary:hover { background: var(--accent-hover); }
.dlg-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.dlg-btn-danger { background: var(--danger); color: #fff; }
.dlg-btn-danger:hover { opacity: 0.9; }
</style>
