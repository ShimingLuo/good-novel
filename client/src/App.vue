<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useWorkspace } from './stores/workspace';
import { useSettings } from './stores/settings';
import { useResize } from './composables/useResize';
import ActivityBar from './components/ActivityBar.vue';
import SideBar from './components/SideBar.vue';
import TabBar from './components/TabBar.vue';
import EditorPane from './components/EditorPane.vue';
import ConfigPane from './components/ConfigPane.vue';
import ArchitecturePane from './components/ArchitecturePane.vue';
import CharactersPane from './components/CharactersPane.vue';
import BlueprintsPane from './components/BlueprintsPane.vue';
import SkillsPane from './components/SkillsPane.vue';
import PromptsPane from './components/PromptsPane.vue';
import AgentPromptsPane from './components/AgentPromptsPane.vue';
import SettingsPane from './components/SettingsPane.vue';
import PipelinePane from './components/PipelinePane.vue';
import ProjectManager from './components/ProjectManager.vue';
import AgentPanel from './components/AgentPanel.vue';
import TaskPanel from './components/TaskPanel.vue';
import StatusBar from './components/StatusBar.vue';

const workspace = useWorkspace();
const settings = useSettings();

// 可拖拽调整的面板尺寸
const sidebar = useResize({ direction: 'horizontal', initial: 220, min: 100, storageKey: 'good-sidebar-width' });
const agentPanel = useResize({ direction: 'horizontal', initial: 380, min: 200, reverse: true, storageKey: 'good-agent-width' });
const taskPanel = useResize({ direction: 'vertical', initial: 160, min: 60, reverse: true, storageKey: 'good-task-height' });

onMounted(async () => {
  // 优先加载设置（可影响主题）
  await settings.loadAll();
  await workspace.loadProjects();
  // 项目切换时重新加载项目级设置
  if (workspace.currentProjectId) {
    await settings.loadAll(workspace.currentProjectId);
  }
});

// 项目切换时重新加载项目级设置
watch(() => workspace.currentProjectId, async (id) => {
  if (id) await settings.loadAll(id);
});
</script>

<template>
  <div class="app-shell" :class="{ resizing: sidebar.isResizing.value || agentPanel.isResizing.value || taskPanel.isResizing.value }">
    <!-- 顶部主体区域 -->
    <div class="app-body">
      <!-- 最左侧图标栏 -->
      <ActivityBar />

      <!-- ═══ 没有打开项目时：显示项目管理器 ═══ -->
      <main v-if="!workspace.currentProjectId" class="center-area">
        <ProjectManager />
      </main>

      <!-- ═══ 已打开项目时：常规布局 ═══ -->
      <template v-else>
        <!-- 侧边栏 -->
        <SideBar :style="{ width: sidebar.size.value + 'px' }" />

        <!-- 侧边栏拖拽条 -->
        <div
          class="resize-handle resize-handle-h"
          @mousedown="sidebar.onMouseDown"
        ></div>

        <!-- 中央主编辑区 -->
        <main class="center-area">
          <TabBar />
          <div class="editor-content">
            <ConfigPane v-if="workspace.activeTab?.type === 'config'" />
            <ArchitecturePane v-else-if="workspace.activeTab?.type === 'architecture'" />
            <CharactersPane v-else-if="workspace.activeTab?.type === 'characters'" />
            <BlueprintsPane v-else-if="workspace.activeTab?.type === 'blueprints'" />
            <SkillsPane v-else-if="workspace.activeTab?.type === 'skills'" />
            <PromptsPane v-else-if="workspace.activeTab?.type === 'prompts'" />
            <AgentPromptsPane v-else-if="workspace.activeTab?.type === 'agent-prompts'" />
            <SettingsPane v-else-if="workspace.activeTab?.type === 'settings'" />
            <PipelinePane v-else-if="workspace.activeTab?.type === 'pipelines'" />
            <EditorPane v-else-if="workspace.activeTab?.type === 'editor' || workspace.activeTab?.type === 'outline'" />
            <div v-else class="empty-state">
              <div class="empty-inner">
                <span class="empty-icon">📖</span>
                <p>选择左侧文件开始编辑</p>
              </div>
            </div>
          </div>

          <!-- 任务面板拖拽条 -->
          <div
            v-if="workspace.showTaskPanel"
            class="resize-handle resize-handle-v"
            @mousedown="taskPanel.onMouseDown"
          ></div>

          <!-- 底部任务面板 -->
          <TaskPanel v-if="workspace.showTaskPanel" :style="{ height: taskPanel.size.value + 'px' }" />
        </main>

        <!-- Agent 面板拖拽条 -->
        <div
          v-if="workspace.showAgentPanel"
          class="resize-handle resize-handle-h"
          @mousedown="agentPanel.onMouseDown"
        ></div>

        <!-- 右侧 Agent 面板 -->
        <AgentPanel v-if="workspace.showAgentPanel" :style="{ width: agentPanel.size.value + 'px' }" />
      </template>
    </div>

    <!-- 底部状态栏 -->
    <StatusBar />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.app-shell.resizing * {
  pointer-events: none;
}
.app-shell.resizing .resize-handle {
  pointer-events: auto;
}

.app-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.center-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.editor-content {
  flex: 1;
  overflow: auto;
  background: var(--bg-base);
  min-height: 0;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
}

.empty-inner {
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  display: block;
  margin-bottom: 12px;
  opacity: 0.4;
}

.empty-inner p {
  font-size: 14px;
}

/* ─── 拖拽分隔条 ─── */
.resize-handle {
  flex-shrink: 0;
  background: transparent;
  transition: background 0.15s;
  position: relative;
  z-index: 10;
}

.resize-handle:hover,
.resize-handle:active {
  background: var(--accent);
}

.resize-handle-h {
  width: 3px;
  cursor: col-resize;
}

.resize-handle-v {
  height: 3px;
  cursor: row-resize;
}
</style>
