<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useWorkspace } from '../stores/workspace';
import { api, workflowApi } from '../api';

const workspace = useWorkspace();

const form = ref({
  premise: '',
  characters: '',
  worldBuilding: '',
  synopsis: '',
});

const saving = ref(false);
const generating = ref<string | null>(null);
const stepGuidance = ref('');

const steps = [
  { key: 'premise', label: '故事前提', icon: '🎭', desc: '提炼核心冲突与金手指定位', promptKey: 'premise' },
  { key: 'characters', label: '角色图谱', icon: '👤', desc: '构建角色关系网与角色弧光', promptKey: 'character_dynamics' },
  { key: 'worldbuilding', label: '世界观', icon: '🌍', desc: '构建自带冲突引擎的世界观', promptKey: 'world_building' },
  { key: 'synopsis', label: '情节大纲', icon: '📊', desc: '整合所有碎片生成情节大纲', promptKey: 'synopsis' },
];

async function loadArchitecture() {
  if (!workspace.projectDetail) return;
  const a = workspace.projectDetail.architecture;
  form.value = {
    premise: a.premise || '',
    characters: a.characters || '',
    worldBuilding: a.worldBuilding || '',
    synopsis: a.synopsis || '',
  };
}

async function save() {
  if (!workspace.currentProjectId) return;
  saving.value = true;
  try {
    await api.updateArchitecture(workspace.currentProjectId, form.value);
    await workspace.refreshProject();
    workspace.addTaskLog('architecture', 'success', '架构已保存');
  } finally {
    saving.value = false;
  }
}

async function generateStep(step: string) {
  if (!workspace.currentProjectId || generating.value) return;
  generating.value = step;
  workspace.addTaskLog('ai', 'running', `正在生成：${steps.find(s => s.key === step)?.label}...`);
  try {
    const result = await workflowApi.generateArchitecture(
      workspace.currentProjectId,
      step,
      stepGuidance.value || undefined
    );
    // 更新本地表单
    const fieldMap: Record<string, keyof typeof form.value> = {
      premise: 'premise',
      characters: 'characters',
      worldbuilding: 'worldBuilding',
      synopsis: 'synopsis',
    };
    form.value[fieldMap[step]] = result.content;
    await workspace.refreshProject();
    workspace.addTaskLog('ai', 'success', `${steps.find(s => s.key === step)?.label} 生成完成`);
  } catch (e: any) {
    workspace.addTaskLog('ai', 'error', `生成失败: ${e.message}`);
  } finally {
    generating.value = null;
  }
}

async function generateAll() {
  for (const step of steps) {
    await generateStep(step.key);
    if (generating.value === null) break; // 如果被中断
  }
}

onMounted(loadArchitecture);
watch(() => workspace.projectDetail, loadArchitecture);
</script>

<template>
  <div class="arch-pane">
    <div class="pane-header">
      <h2>故事架构</h2>
      <p class="desc">四步流水线：故事前提 → 角色图谱 → 世界观 → 情节大纲</p>
      <div class="actions">
        <button class="btn btn-outline" @click="generateAll" :disabled="!!generating">
          🚀 一键全部生成
        </button>
        <button class="btn btn-primary" @click="save" :disabled="saving">
          💾 {{ saving ? '保存中...' : '保存' }}
        </button>
      </div>
    </div>

    <!-- 步骤指导（可选） -->
    <div class="guidance-section">
      <label>作者补充指导（可选，对下一步生成生效）</label>
      <textarea v-model="stepGuidance" rows="2" placeholder="对 AI 生成的额外要求或方向指引..."></textarea>
    </div>

    <!-- 四步架构 -->
    <div v-for="step in steps" :key="step.key" class="form-section">
      <div class="section-header">
        <div class="section-title">
          <span class="step-icon">{{ step.icon }}</span>
          <h3>{{ step.label }}</h3>
          <span class="step-desc">{{ step.desc }}</span>
        </div>
        <div class="section-actions">
          <span class="prompt-hint" :title="'使用提示词: ' + step.promptKey">📝 {{ step.promptKey }}</span>
          <button
            class="btn btn-sm"
            @click="generateStep(step.key)"
            :disabled="!!generating"
          >
            {{ generating === step.key ? '⏳ 生成中...' : '✨ AI 生成' }}
          </button>
        </div>
      </div>
      <textarea
        v-model="form[step.key === 'worldbuilding' ? 'worldBuilding' : step.key as keyof typeof form]"
        rows="8"
        :placeholder="`${step.label}内容...`"
      ></textarea>
      <div v-if="form[step.key === 'worldbuilding' ? 'worldBuilding' : step.key as keyof typeof form]" class="char-count">
        {{ (form[step.key === 'worldbuilding' ? 'worldBuilding' : step.key as keyof typeof form] as string).length }} 字
      </div>
    </div>
  </div>
</template>

<style scoped>
.arch-pane {
  padding: 24px 32px;
  max-width: 860px;
  margin: 0 auto;
  overflow-y: auto;
  height: 100%;
}

.pane-header {
  margin-bottom: 20px;
}

.pane-header h2 {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 4px;
}

.desc {
  color: var(--text-muted);
  font-size: 13px;
  margin-bottom: 12px;
}

.actions {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s;
}

.btn-primary {
  background: var(--accent);
  color: var(--bg-overlay);
}
.btn-primary:hover { background: var(--accent-hover); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-outline {
  border: 1px solid var(--accent);
  color: var(--accent);
}
.btn-outline:hover { background: var(--accent-dim); }
.btn-outline:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-sm {
  padding: 4px 12px;
  font-size: 12px;
  background: var(--accent-dim);
  color: var(--accent);
  border-radius: 4px;
}
.btn-sm:hover { background: var(--accent); color: #fff; }
.btn-sm:disabled { opacity: 0.5; cursor: not-allowed; }

.guidance-section {
  margin-bottom: 16px;
  padding: 12px;
  background: var(--bg-surface);
  border: 1px dashed var(--border);
  border-radius: 6px;
}

.guidance-section label {
  font-size: 12px;
  color: var(--text-dim);
  display: block;
  margin-bottom: 6px;
}

.guidance-section textarea {
  width: 100%;
  font-size: 12px;
}

.form-section {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px 20px;
  margin-bottom: 16px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.prompt-hint {
  font-size: 10px;
  color: var(--text-muted);
  padding: 2px 6px;
  background: var(--bg-overlay);
  border-radius: 3px;
  font-family: monospace;
  cursor: help;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.step-icon { font-size: 18px; }

.section-title h3 {
  font-size: 15px;
  font-weight: 600;
}

.step-desc {
  font-size: 12px;
  color: var(--text-muted);
}

textarea {
  width: 100%;
  resize: vertical;
  min-height: 120px;
  padding: 10px;
  font-size: 13px;
  line-height: 1.6;
}

.char-count {
  text-align: right;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}
</style>
