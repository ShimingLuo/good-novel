<script setup lang="ts">
import { computed } from 'vue';
import { useWorkspace } from '../stores/workspace';

const workspace = useWorkspace();

// 没打开项目时禁用所有功能按钮
const disabled = computed(() => !workspace.currentProjectId);

function openSkills() {
  if (disabled.value) return;
  workspace.skillsScope = 'system';
  workspace.openTab({ id: 'skills', label: 'Skills 管理', type: 'skills' });
}

function openPrompts() {
  if (disabled.value) return;
  workspace.promptsScope = 'system';
  workspace.openTab({ id: 'prompts', label: '提示词管理', type: 'prompts' });
}

function openPipelines() {
  if (disabled.value) return;
  workspace.openTab({ id: 'pipelines', label: '工作流管线', type: 'pipelines' });
}

function openSettings() {
  if (disabled.value) return;
  workspace.openTab({ id: 'settings', label: '设置', type: 'settings' });
}

function toggleAgent() {
  if (disabled.value) return;
  workspace.showAgentPanel = !workspace.showAgentPanel;
}
</script>

<template>
  <aside class="activity-bar">
    <div class="top-icons">
      <button
        class="icon-btn"
        :class="{ active: !disabled, disabled }"
        :title="disabled ? '请先打开一本小说' : '小说结构'"
      >📁</button>
      <button
        class="icon-btn"
        :class="{ active: workspace.activeTabId === 'skills', disabled }"
        :disabled="disabled"
        :title="disabled ? '请先打开一本小说' : 'Skills 管理'"
        @click="openSkills"
      >🧩</button>
      <button
        class="icon-btn"
        :class="{ active: workspace.activeTabId === 'prompts', disabled }"
        :disabled="disabled"
        :title="disabled ? '请先打开一本小说' : '提示词管理'"
        @click="openPrompts"
      >📝</button>
      <button
        class="icon-btn"
        :class="{ active: workspace.activeTabId === 'pipelines', disabled }"
        :disabled="disabled"
        :title="disabled ? '请先打开一本小说' : '工作流管线'"
        @click="openPipelines"
      >🔗</button>
    </div>
    <div class="bottom-icons">
      <button
        class="icon-btn"
        :class="{ active: workspace.activeTabId === 'settings', disabled }"
        :disabled="disabled"
        :title="disabled ? '请先打开一本小说' : '设置'"
        @click="openSettings"
      >⚙️</button>
      <button
        class="icon-btn"
        :class="{ active: workspace.showAgentPanel && !disabled, disabled }"
        :disabled="disabled"
        :title="disabled ? '请先打开一本小说' : 'AI 助手'"
        @click="toggleAgent"
      >🤖</button>
    </div>
  </aside>
</template>

<style scoped>
.activity-bar {
  width: var(--activitybar-width);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-overlay);
  border-right: 1px solid var(--border);
  padding: 8px 0;
  flex-shrink: 0;
}

.top-icons, .bottom-icons {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.icon-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-size: 18px;
  opacity: 0.6;
  transition: all 0.15s;
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
}

.icon-btn:hover:not(.disabled) {
  opacity: 1;
  background: var(--border);
}

.icon-btn.active:not(.disabled) {
  opacity: 1;
  border-left: 2px solid var(--accent);
}

.icon-btn.disabled {
  opacity: 0.25;
  cursor: not-allowed;
  filter: grayscale(0.6);
}
</style>
