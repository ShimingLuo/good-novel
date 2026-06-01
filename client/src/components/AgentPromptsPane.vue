<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { agentApi, type AgentConfig, type AgentTool, type AgentSkill } from '../api';
import { useWorkspace } from '../stores/workspace';

const workspace = useWorkspace();
const config = ref<AgentConfig | null>(null);
const loading = ref(false);
const activeTab = ref<'tools' | 'skills' | 'system'>('tools');
const filterSource = ref<'all' | 'builtin' | 'custom' | 'project'>('all');

const projectId = computed(() => workspace.currentProjectId);

async function loadConfig() {
  loading.value = true;
  try {
    config.value = await agentApi.getConfig(projectId.value || undefined);
  } catch (e) {
    console.error('Failed to load agent config:', e);
  } finally {
    loading.value = false;
  }
}

const filteredTools = computed(() => {
  if (!config.value) return [];
  return config.value.tools;
});

const filteredSkills = computed(() => {
  if (!config.value) return [];
  if (filterSource.value === 'all') return config.value.skills;
  return config.value.skills.filter(s => s.source === filterSource.value);
});

const systemPromptPreview = computed(() => {
  if (!config.value) return '';
  let prompt = config.value.systemPromptTemplate;

  const toolsDesc = config.value.tools
    .map(t => `- ${t.name}: ${t.description}`)
    .join('\n');
  prompt = prompt.replace('{{tools}}', toolsDesc || '（无可用工具）');

  const skillsDesc = config.value.skills
    .map(s => `- skill__${s.name}: ${s.description}${s.whenToUse ? ` (${s.whenToUse})` : ''}`)
    .join('\n');
  prompt = prompt.replace('{{skills}}', skillsDesc || '（暂无已加载的 Skill）');

  return prompt;
});

function getSkillSourceBadgeClass(source: string) {
  switch (source) {
    case 'builtin': return 'badge-builtin';
    case 'custom': return 'badge-custom';
    case 'project': return 'badge-project';
    default: return 'badge-builtin';
  }
}

function getSkillSourceLabel(source: string) {
  switch (source) {
    case 'builtin': return '内置';
    case 'custom': return '自定义';
    case 'project': return '本书';
    default: return source;
  }
}

onMounted(loadConfig);
watch(projectId, loadConfig);
</script>

<template>
  <div class="agent-prompts-pane">
    <div class="pane-header">
      <div class="header-left">
        <h2>Agent 命令与提示词</h2>
        <p class="desc">
          右侧 Agent 使用的工具命令、Skills 和 System Prompt 配置
        </p>
      </div>
      <div class="actions">
        <button class="btn btn-primary" @click="loadConfig" :disabled="loading">
          {{ loading ? '⏳ 加载中...' : '↻ 刷新' }}
        </button>
      </div>
    </div>

    <!-- Tab 切换 -->
    <div class="tab-bar">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'tools' }"
        @click="activeTab = 'tools'"
      >
        🔧 工具命令
        <span class="tab-count" v-if="config">{{ config.tools.length }}</span>
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'skills' }"
        @click="activeTab = 'skills'"
      >
        📦 Skills
        <span class="tab-count" v-if="config">{{ config.skills.length }}</span>
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'system' }"
        @click="activeTab = 'system'"
      >
        💬 System Prompt
      </button>
    </div>

    <div v-if="loading" class="loading-state">
      <span class="loading-icon">⏳</span>
      <p>加载 Agent 配置中...</p>
    </div>

    <template v-else-if="config">
      <!-- ═══ 工具命令列表 ═══ -->
      <div v-if="activeTab === 'tools'" class="content-section">
        <div class="section-info">
          <p>Agent 可以调用的项目工具命令，共 <strong>{{ config.tools.length }}</strong> 个</p>
        </div>

        <div class="tools-grid">
          <div v-for="tool in filteredTools" :key="tool.name" class="tool-card">
            <div class="tool-header">
              <span class="tool-name">{{ tool.name }}</span>
            </div>
            <p class="tool-desc">{{ tool.description }}</p>
          </div>
        </div>
      </div>

      <!-- ═══ Skills 列表 ═══ -->
      <div v-if="activeTab === 'skills'" class="content-section">
        <div class="section-info">
          <p>Agent 可用的 Skills 知识包，共 <strong>{{ config.skills.length }}</strong> 个</p>
          <div class="filter-row">
            <button
              class="filter-btn"
              :class="{ active: filterSource === 'all' }"
              @click="filterSource = 'all'"
            >全部</button>
            <button
              class="filter-btn"
              :class="{ active: filterSource === 'builtin' }"
              @click="filterSource = 'builtin'"
            >内置</button>
            <button
              class="filter-btn"
              :class="{ active: filterSource === 'custom' }"
              @click="filterSource = 'custom'"
            >自定义</button>
            <button
              class="filter-btn"
              :class="{ active: filterSource === 'project' }"
              @click="filterSource = 'project'"
            >本书</button>
          </div>
        </div>

        <div class="skills-list">
          <div v-for="skill in filteredSkills" :key="skill.name" class="skill-card">
            <div class="skill-header">
              <span class="skill-badge" :class="getSkillSourceBadgeClass(skill.source)">
                {{ getSkillSourceLabel(skill.source) }}
              </span>
              <span class="skill-name">{{ skill.displayName || skill.name }}</span>
              <span class="skill-key">skill__{{ skill.name }}</span>
            </div>
            <p class="skill-desc">{{ skill.description }}</p>
            <p class="skill-when" v-if="skill.whenToUse">
              <span class="when-label">触发：</span>{{ skill.whenToUse }}
            </p>
          </div>
        </div>

        <div v-if="!filteredSkills.length" class="empty-state">
          <p>没有符合条件的 Skills</p>
        </div>
      </div>

      <!-- ═══ System Prompt ═══ -->
      <div v-if="activeTab === 'system'" class="content-section">
        <div class="section-info">
          <p>Agent 的 System Prompt 模板，定义了 Agent 的角色定位和行为规则</p>
        </div>

        <div class="prompt-preview">
          <div class="prompt-header">
            <span class="prompt-label">System Prompt</span>
            <span class="prompt-tip">变量 &#123;&#123;tools&#125;&#125; 和 &#123;&#123;skills&#125;&#125; 会在运行时被替换</span>
          </div>
          <pre class="prompt-content">{{ systemPromptPreview }}</pre>
        </div>

        <div class="stats-row">
          <div class="stat-item">
            <span class="stat-value">{{ config.maxToolRounds }}</span>
            <span class="stat-label">最大工具调用轮次</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{{ config.tools.length }}</span>
            <span class="stat-label">可用工具数</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{{ config.skills.length }}</span>
            <span class="stat-label">可用 Skills 数</span>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="error-state">
      <p>加载失败，请检查网络或刷新重试</p>
    </div>
  </div>
</template>

<style scoped>
.agent-prompts-pane {
  padding: 24px 32px;
  max-width: 960px;
  margin: 0 auto;
  overflow-y: auto;
  height: 100%;
}

.pane-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 16px;
}

.header-left {
  flex: 1;
}

.pane-header h2 {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 4px;
}

.desc {
  color: var(--text-muted);
  font-size: 13px;
}

.actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  padding-top: 4px;
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

.btn-primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Tab 栏 */
.tab-bar {
  display: flex;
  gap: 4px;
  background: var(--bg-overlay);
  padding: 4px;
  border-radius: 8px;
  margin-bottom: 20px;
  width: fit-content;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 13px;
  border-radius: 6px;
  color: var(--text-dim);
  transition: all 0.15s;
}

.tab-btn:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.05);
}

.tab-btn.active {
  background: var(--accent);
  color: #fff;
  font-weight: 500;
}

.tab-count {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.2);
}

.tab-btn:not(.active) .tab-count {
  background: var(--border);
  color: var(--text-dim);
}

/* 内容区域 */
.content-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-info p {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
}

.section-info strong {
  color: var(--accent);
}

/* 筛选按钮 */
.filter-row {
  display: flex;
  gap: 4px;
}

.filter-btn {
  padding: 4px 12px;
  font-size: 11px;
  border-radius: 12px;
  border: 1px solid var(--border);
  color: var(--text-dim);
  background: transparent;
  transition: all 0.15s;
}

.filter-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.filter-btn.active {
  background: var(--accent-dim);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 500;
}

/* 工具卡片网格 */
.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.tool-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
  transition: border-color 0.15s;
}

.tool-card:hover {
  border-color: var(--accent);
}

.tool-header {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
}

.tool-name {
  font-size: 13px;
  font-weight: 600;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  color: var(--accent);
}

.tool-desc {
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.5;
  margin: 0;
}

/* Skills 列表 */
.skills-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.skill-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px 16px;
  transition: border-color 0.15s;
}

.skill-card:hover {
  border-color: var(--accent);
}

.skill-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.skill-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.badge-builtin {
  background: var(--accent-dim);
  color: var(--accent);
}

.badge-custom {
  background: rgba(230, 162, 60, 0.15);
  color: var(--warning);
}

.badge-project {
  background: var(--success-dim);
  color: var(--success);
}

.skill-name {
  font-size: 14px;
  font-weight: 600;
}

.skill-key {
  font-size: 11px;
  color: var(--text-muted);
  font-family: monospace;
  margin-left: auto;
}

.skill-desc {
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.4;
  margin: 0 0 4px 0;
}

.skill-when {
  font-size: 11px;
  color: var(--text-muted);
  margin: 0;
}

.when-label {
  color: var(--warning);
  font-weight: 500;
}

/* System Prompt */
.prompt-preview {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.prompt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-overlay);
  border-bottom: 1px solid var(--border);
}

.prompt-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}

.prompt-tip {
  font-size: 11px;
  color: var(--text-muted);
}

.prompt-content {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.7;
  padding: 16px;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-dim);
  max-height: 400px;
  overflow-y: auto;
}

/* 统计行 */
.stats-row {
  display: flex;
  gap: 16px;
  margin-top: 8px;
}

.stat-item {
  flex: 1;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 24px;
  font-weight: 700;
  color: var(--accent);
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  color: var(--text-muted);
}

/* 加载和空状态 */
.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  color: var(--text-muted);
}

.loading-icon {
  font-size: 32px;
  margin-bottom: 12px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
