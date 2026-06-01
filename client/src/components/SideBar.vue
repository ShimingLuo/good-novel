<script setup lang="ts">
import { ref, computed } from 'vue';
import { useWorkspace } from '../stores/workspace';
import { type ChapterEntry } from '../api';

const workspace = useWorkspace();

const expandedSections = ref<Record<string, boolean>>({
  config: true,
  architecture: true,
  drafts: true,
  finalized: true,
});

function toggleSection(key: string) {
  expandedSections.value[key] = !expandedSections.value[key];
}

function openConfig() {
  workspace.openTab({ id: 'config', label: '小说配置', type: 'config' });
}

function openArchitecture() {
  workspace.openTab({ id: 'architecture', label: '故事架构', type: 'architecture' });
}

function openCharacters() {
  workspace.openTab({ id: 'characters', label: '角色卡', type: 'characters' });
}

function openBlueprints() {
  workspace.openTab({ id: 'blueprints', label: '章节蓝图', type: 'blueprints' });
}

function openAgentPrompts() {
  workspace.openTab({ id: 'agent-prompts', label: 'Agent 命令', type: 'agent-prompts' });
}

function openChapter(ch: ChapterEntry) {
  const label = ch.title ? `第${ch.chapterNumber}章 ${ch.title}` : `第${ch.chapterNumber}章`;
  workspace.openTab({
    id: `chapter-${ch.chapterNumber}`,
    label,
    type: 'editor',
    path: ch.relPath,
  });
}

const allChapters = computed(() => workspace.projectDetail?.chapters || []);
const drafts = computed(() => allChapters.value.filter(c => c.status === 'draft'));
const finalized = computed(() => allChapters.value.filter(c => c.status === 'finalized'));
const characterCount = computed(() => workspace.projectDetail?.characters?.length || 0);
const blueprintCount = computed(() => workspace.projectDetail?.blueprints?.length || 0);

function closeProject() {
  workspace.closeProject();
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <div class="project-info">
        <span class="project-icon">📖</span>
        <div class="project-text">
          <span class="project-title">{{ workspace.currentProject?.title || workspace.currentProjectId }}</span>
          <span class="project-id">{{ workspace.currentProjectId }}</span>
        </div>
      </div>
      <button class="header-btn" title="刷新" @click="workspace.refreshProject()">↻</button>
      <button class="header-btn close-btn" title="关闭小说（返回小说列表）" @click="closeProject">✕</button>
    </div>

    <div class="tree" v-if="workspace.projectDetail">
      <!-- 小说配置 -->
      <div
        class="tree-item"
        :class="{ active: workspace.activeTabId === 'config' }"
        @click="openConfig"
      >
        <span class="tree-icon">📋</span>
        <span class="tree-label">小说配置</span>
      </div>

      <!-- 故事架构 -->
      <div class="tree-section">
        <div class="tree-section-header" @click="toggleSection('architecture')">
          <span class="arrow">{{ expandedSections.architecture ? '▾' : '▸' }}</span>
          <span class="tree-icon">📐</span>
          <span class="tree-label">故事架构</span>
        </div>
        <div v-show="expandedSections.architecture" class="tree-children">
          <div
            class="tree-item indent"
            :class="{ active: workspace.activeTabId === 'architecture' }"
            @click="openArchitecture"
          >
            <span class="tree-icon">🎭</span>
            <span class="tree-label">四步架构</span>
            <span class="badge" v-if="workspace.projectDetail.architecture.premise">✓</span>
          </div>
          <div
            class="tree-item indent"
            :class="{ active: workspace.activeTabId === 'characters' }"
            @click="openCharacters"
          >
            <span class="tree-icon">👤</span>
            <span class="tree-label">角色卡</span>
            <span class="count" v-if="characterCount">{{ characterCount }}</span>
          </div>
          <div
            class="tree-item indent"
            :class="{ active: workspace.activeTabId === 'blueprints' }"
            @click="openBlueprints"
          >
            <span class="tree-icon">📑</span>
            <span class="tree-label">章节蓝图</span>
            <span class="count" v-if="blueprintCount">{{ blueprintCount }}</span>
          </div>
        </div>
      </div>

      <!-- 草稿箱 -->
      <div class="tree-section">
        <div class="tree-section-header" @click="toggleSection('drafts')">
          <span class="arrow">{{ expandedSections.drafts ? '▾' : '▸' }}</span>
          <span class="tree-icon">📝</span>
          <span class="tree-label">草稿箱</span>
          <span class="count">{{ drafts.length }}</span>
        </div>
        <div v-show="expandedSections.drafts" class="tree-children">
          <div
            v-for="ch in drafts"
            :key="ch.chapterNumber"
            class="tree-item indent"
            :class="{ active: workspace.activeTabId === `chapter-${ch.chapterNumber}` }"
            @click="openChapter(ch)"
          >
            <span class="tree-icon">📄</span>
            <span class="tree-label">第{{ ch.chapterNumber }}章<template v-if="ch.title"> {{ ch.title }}</template></span>
          </div>
          <div v-if="!drafts.length" class="tree-item indent empty-hint">
            <span class="hint-text">生成蓝图时自动创建草稿</span>
          </div>
        </div>
      </div>

      <!-- 已定稿 -->
      <div class="tree-section" v-if="finalized.length">
        <div class="tree-section-header" @click="toggleSection('finalized')">
          <span class="arrow">{{ expandedSections.finalized ? '▾' : '▸' }}</span>
          <span class="tree-icon">✅</span>
          <span class="tree-label">已定稿</span>
          <span class="count finalized-count">{{ finalized.length }}</span>
        </div>
        <div v-show="expandedSections.finalized" class="tree-children">
          <div
            v-for="ch in finalized"
            :key="ch.chapterNumber"
            class="tree-item indent"
            :class="{ active: workspace.activeTabId === `chapter-${ch.chapterNumber}` }"
            @click="openChapter(ch)"
          >
            <span class="tree-icon">📜</span>
            <span class="tree-label">第{{ ch.chapterNumber }}章<template v-if="ch.title"> {{ ch.title }}</template></span>
          </div>
        </div>
      </div>

      <!-- AI 工具 -->
      <div class="tree-section">
        <div class="tree-section-header" @click="toggleSection('ai-tools')">
          <span class="arrow">{{ expandedSections['ai-tools'] ? '▾' : '▸' }}</span>
          <span class="tree-icon">🤖</span>
          <span class="tree-label">AI 工具</span>
        </div>
        <div v-show="expandedSections['ai-tools']" class="tree-children">
          <div
            class="tree-item indent"
            :class="{ active: workspace.activeTabId === 'agent-prompts' }"
            @click="openAgentPrompts"
          >
            <span class="tree-icon">💬</span>
            <span class="tree-label">Agent 命令</span>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  background: var(--bg-surface);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  height: var(--panel-header-height);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.project-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0 4px;
}

.project-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.project-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.project-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-id {
  font-size: 10px;
  color: var(--text-muted);
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-btn {
  font-size: 14px;
  opacity: 0.6;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}
.header-btn:hover { opacity: 1; background: var(--border); }
.close-btn:hover { color: var(--danger); background: rgba(224, 82, 82, 0.1); }

.tree {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

.tree-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.1s;
}
.tree-item:hover { background: rgba(255, 255, 255, 0.03); }
.tree-item.active { background: var(--accent-dim); color: var(--accent); }
.tree-item.indent { padding-left: 32px; }

.tree-icon { font-size: 14px; flex-shrink: 0; }
.tree-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.tree-section { margin-top: 2px; }
.tree-section-header { display: flex; align-items: center; gap: 6px; padding: 5px 12px; cursor: pointer; font-size: 13px; font-weight: 500; }
.tree-section-header:hover { background: rgba(255, 255, 255, 0.03); }

.arrow { font-size: 10px; width: 12px; flex-shrink: 0; }

.badge { margin-left: auto; font-size: 10px; color: var(--success); flex-shrink: 0; }
.count { margin-left: auto; font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
.count.finalized-count { color: var(--success); }

.empty-hint { cursor: default; }
.empty-hint:hover { background: transparent; }
.hint-text { font-size: 11px; color: var(--text-muted); font-style: italic; }
</style>
