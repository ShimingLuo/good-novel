<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useWorkspace } from '../stores/workspace';
import { api, workflowApi } from '../api';

const workspace = useWorkspace();

const form = ref({
  title: '',
  genre: '',
  subGenre: '',
  audience: '',
  structure: 'three_act',
  pov: 'third_limited',
  chapterCount: 100,
  wordsPerChapter: 3000,
  coreOutline: '',
  worldSetting: '',
  goldenFinger: '',
  protagonistProfile: '',
  globalGuidance: '',
  writingStyle: '',
});

const saving = ref(false);
const generating = ref(false);
const userIdea = ref('');

async function loadConfig() {
  if (!workspace.projectDetail) return;
  const c = workspace.projectDetail.config;
  form.value = {
    title: c.title || '',
    genre: c.genre || '',
    subGenre: c.subGenre || '',
    audience: c.audience || '',
    structure: c.structure || 'three_act',
    pov: c.pov || 'third_limited',
    chapterCount: c.chapterCount || 100,
    wordsPerChapter: c.wordsPerChapter || 3000,
    coreOutline: c.coreOutline || '',
    worldSetting: c.worldSetting || '',
    goldenFinger: c.goldenFinger || '',
    protagonistProfile: c.protagonistProfile || '',
    globalGuidance: c.globalGuidance || '',
    writingStyle: c.writingStyle || '',
  };
}

async function saveConfig() {
  if (!workspace.currentProjectId) return;
  saving.value = true;
  try {
    await api.updateConfig(workspace.currentProjectId, form.value);
    await workspace.refreshProject();
    workspace.addTaskLog('config', 'success', '配置已保存');
  } finally {
    saving.value = false;
  }
}

async function generateConfig() {
  if (!workspace.currentProjectId || !userIdea.value.trim()) return;
  generating.value = true;
  workspace.addTaskLog('ai', 'running', '正在 AI 生成全局配置...');
  try {
    const result = await workflowApi.generateConfig(workspace.currentProjectId, userIdea.value);
    if (result.config) {
      await workspace.refreshProject();
      await loadConfig();
      workspace.addTaskLog('ai', 'success', '全局配置生成完成');
    }
  } catch (e: any) {
    workspace.addTaskLog('ai', 'error', `配置生成失败: ${e.message}`);
  } finally {
    generating.value = false;
  }
}

onMounted(loadConfig);
watch(() => workspace.projectDetail, loadConfig);
</script>

<template>
  <div class="config-pane">
    <div class="pane-header">
      <h2>小说配置</h2>
      <p class="desc">定义你的小说基本信息和写作参数，或使用 AI 一键生成</p>
      <div class="actions">
        <button class="btn btn-primary" @click="saveConfig" :disabled="saving">
          💾 {{ saving ? '保存中...' : '保存' }}
        </button>
      </div>
    </div>

    <!-- AI 一键生成 -->
    <div class="form-section ai-section">
      <h3>✨ AI 一键生成配置</h3>
      <p class="section-desc">输入一句话灵感，AI 将自动生成完整的小说配置</p>
      <div class="ai-input-row">
        <textarea
          v-model="userIdea"
          rows="2"
          placeholder="例如：一个程序员穿越到修仙世界，用编程思维修炼..."
        ></textarea>
        <button class="btn btn-accent" @click="generateConfig" :disabled="generating || !userIdea.trim()">
          {{ generating ? '⏳ 生成中...' : '🚀 一键生成' }}
        </button>
      </div>
    </div>

    <!-- 基本信息 -->
    <div class="form-section">
      <h3>基本信息</h3>
      <div class="form-grid">
        <div class="form-group span-2">
          <label>书名</label>
          <input v-model="form.title" placeholder="小说标题" />
        </div>
        <div class="form-group">
          <label>类型</label>
          <input v-model="form.genre" placeholder="如：玄幻、都市、科幻" />
        </div>
        <div class="form-group">
          <label>细分类型</label>
          <input v-model="form.subGenre" placeholder="如：系统流、末日废土" />
        </div>
        <div class="form-group">
          <label>目标受众</label>
          <select v-model="form.audience">
            <option value="">请选择</option>
            <option value="男频">男频</option>
            <option value="女频">女频</option>
            <option value="通用">通用</option>
          </select>
        </div>
        <div class="form-group">
          <label>故事结构</label>
          <select v-model="form.structure">
            <option value="three_act">三幕结构</option>
            <option value="heros_journey">英雄之旅</option>
            <option value="save_the_cat">节拍表</option>
            <option value="kishotenketsu">起承转合</option>
            <option value="multi_thread">多线叙事</option>
            <option value="freeform">自由结构</option>
          </select>
        </div>
        <div class="form-group">
          <label>叙事视角</label>
          <select v-model="form.pov">
            <option value="third_limited">第三人称有限视角</option>
            <option value="first_person">第一人称</option>
            <option value="third_omniscient">第三人称全知视角</option>
            <option value="multi_pov">多视角轮换</option>
          </select>
        </div>
        <div class="form-group">
          <label>总章数</label>
          <input v-model.number="form.chapterCount" type="number" min="1" />
        </div>
        <div class="form-group">
          <label>每章字数</label>
          <input v-model.number="form.wordsPerChapter" type="number" min="500" step="500" />
        </div>
      </div>
    </div>

    <!-- 核心设定 -->
    <div class="form-section">
      <h3>核心设定</h3>
      <div class="form-stack">
        <div class="form-group">
          <label>核心大纲</label>
          <textarea v-model="form.coreOutline" rows="3" placeholder="一段话概括整个故事的核心冲突和走向..."></textarea>
        </div>
        <div class="form-group">
          <label>世界观设定</label>
          <textarea v-model="form.worldSetting" rows="3" placeholder="故事发生的背景、时代、力量体系..."></textarea>
        </div>
        <div class="form-group">
          <label>金手指 / 核心卖点</label>
          <textarea v-model="form.goldenFinger" rows="3" placeholder="主角的核心能力/系统/外挂..."></textarea>
        </div>
        <div class="form-group">
          <label>主角人设</label>
          <textarea v-model="form.protagonistProfile" rows="3" placeholder="主角的性格、背景、核心驱动力..."></textarea>
        </div>
      </div>
    </div>

    <!-- 写作规范 -->
    <div class="form-section">
      <h3>写作规范</h3>
      <div class="form-stack">
        <div class="form-group">
          <label>全局写作指导与禁忌</label>
          <textarea v-model="form.globalGuidance" rows="3" placeholder="节奏要求、禁止出现的内容、风格底线..."></textarea>
        </div>
        <div class="form-group">
          <label>文风配置</label>
          <textarea v-model="form.writingStyle" rows="3" placeholder="叙述节奏、描写密度、对话风格、用词偏好..."></textarea>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.config-pane {
  padding: 24px 32px;
  max-width: 860px;
  margin: 0 auto;
  overflow-y: auto;
  height: 100%;
}

.pane-header {
  margin-bottom: 24px;
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

.btn-accent {
  background: linear-gradient(135deg, #7c6fe0, #5b8def);
  color: #fff;
  padding: 8px 20px;
  white-space: nowrap;
}
.btn-accent:hover { opacity: 0.9; }
.btn-accent:disabled { opacity: 0.5; cursor: not-allowed; }

.form-section {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}

.form-section h3 {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 8px;
}

.section-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.ai-section {
  border-color: var(--accent);
  border-style: dashed;
}

.ai-input-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.ai-input-row textarea {
  flex: 1;
  resize: vertical;
  min-height: 50px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.form-group.span-2 {
  grid-column: span 2;
}

.form-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-group label {
  font-size: 12px;
  color: var(--text-dim);
  font-weight: 500;
}

.form-group input,
.form-group select {
  height: 32px;
}

textarea {
  width: 100%;
  resize: vertical;
  min-height: 60px;
  padding: 8px 10px;
  font-size: 13px;
  line-height: 1.5;
}
</style>
