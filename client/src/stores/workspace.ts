import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, type ProjectConfig, type ProjectDetail } from '../api';

export interface TabItem {
  id: string;
  label: string;
  type: 'config' | 'architecture' | 'editor' | 'outline' | 'characters' | 'blueprints' | 'skills' | 'prompts' | 'agent-prompts' | 'settings' | 'pipelines';
  path?: string;
}

export const useWorkspace = defineStore('workspace', () => {
  // ─── 项目列表 ─────────────────────────────────────────────
  const projects = ref<ProjectConfig[]>([]);
  const currentProjectId = ref<string>('');
  const projectDetail = ref<ProjectDetail | null>(null);

  const currentProject = computed(() =>
    projects.value.find((p) => p.id === currentProjectId.value)
  );

  async function loadProjects() {
    projects.value = await api.listProjects();
  }

  async function selectProject(id: string) {
    currentProjectId.value = id;
    projectDetail.value = await api.getProject(id);
    tabs.value = [{ id: 'config', label: '小说配置', type: 'config' }];
    activeTabId.value = 'config';
  }

  async function refreshProject() {
    if (currentProjectId.value) {
      projectDetail.value = await api.getProject(currentProjectId.value);
    }
  }

  function closeProject() {
    currentProjectId.value = '';
    projectDetail.value = null;
    tabs.value = [];
    activeTabId.value = '';
  }

  // ─── 标签页 ───────────────────────────────────────────────
  const tabs = ref<TabItem[]>([]);
  const activeTabId = ref<string>('');

  function openTab(tab: TabItem) {
    const existing = tabs.value.find((t) => t.id === tab.id);
    if (!existing) {
      tabs.value.push(tab);
    }
    activeTabId.value = tab.id;
  }

  function closeTab(tabId: string) {
    const idx = tabs.value.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    tabs.value.splice(idx, 1);
    if (activeTabId.value === tabId) {
      activeTabId.value = tabs.value[Math.min(idx, tabs.value.length - 1)]?.id || '';
    }
  }

  function closeOtherTabs(tabId: string) {
    tabs.value = tabs.value.filter((t) => t.id === tabId);
    activeTabId.value = tabId;
  }

  function closeRightTabs(tabId: string) {
    const idx = tabs.value.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    tabs.value = tabs.value.slice(0, idx + 1);
    if (!tabs.value.find((t) => t.id === activeTabId.value)) {
      activeTabId.value = tabId;
    }
  }

  function closeAllTabs() {
    tabs.value = [];
    activeTabId.value = '';
  }

  function moveTab(fromIndex: number, toIndex: number) {
    if (fromIndex < 0 || fromIndex >= tabs.value.length) return;
    if (toIndex < 0 || toIndex > tabs.value.length) return;
    if (fromIndex === toIndex) return;
    const [moved] = tabs.value.splice(fromIndex, 1);
    // 移除后，目标索引可能需要调整
    const adjustedTo = toIndex > fromIndex ? toIndex - 1 : toIndex;
    tabs.value.splice(adjustedTo, 0, moved);
  }

  const activeTab = computed(() => tabs.value.find((t) => t.id === activeTabId.value));

  // ─── 面板控制 ──────────────────────────────────────────────
  const showAgentPanel = ref(true);
  const showTaskPanel = ref(true);

  // ─── Skills/Prompts 当前作用域（系统/项目） ────────────────
  const skillsScope = ref<'system' | 'project'>('system');
  const promptsScope = ref<'system' | 'project'>('system');

  // ─── 任务面板状态 ──────────────────────────────────────────
  const taskLogs = ref<{ id: string; type: string; status: string; message: string; time: string }[]>([]);

  function addTaskLog(type: string, status: string, message: string) {
    taskLogs.value.push({
      id: Date.now().toString(),
      type,
      status,
      message,
      time: new Date().toLocaleTimeString(),
    });
    // 保留最近 50 条
    if (taskLogs.value.length > 50) {
      taskLogs.value = taskLogs.value.slice(-50);
    }
  }

  function clearTaskLogs() {
    taskLogs.value = [];
  }

  return {
    projects,
    currentProjectId,
    currentProject,
    projectDetail,
    loadProjects,
    selectProject,
    refreshProject,
    closeProject,
    tabs,
    activeTabId,
    activeTab,
    openTab,
    closeTab,
    closeOtherTabs,
    closeRightTabs,
    closeAllTabs,
    moveTab,
    showAgentPanel,
    showTaskPanel,
    skillsScope,
    promptsScope,
    taskLogs,
    addTaskLog,
    clearTaskLogs,
  };
});
