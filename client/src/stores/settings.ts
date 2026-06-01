import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { settingsApi, type AppSettings, type ThemePreset } from '../api';

export const useSettings = defineStore('settings', () => {
  // ─── 状态 ────────────────────────────────────────────────
  const themes = ref<ThemePreset[]>([]);
  const systemSettings = ref<AppSettings>({});
  const projectSettings = ref<AppSettings>({});
  const defaults = ref<AppSettings>({});

  // 有效设置：项目级 > 系统级 > 默认
  const effective = computed<AppSettings>(() => ({
    ...defaults.value,
    ...systemSettings.value,
    ...projectSettings.value,
  }));

  // ─── 加载 ────────────────────────────────────────────────
  async function loadThemes() {
    themes.value = await settingsApi.listThemes();
  }

  async function loadAll(projectId?: string) {
    const result = await settingsApi.getEffective(projectId);
    systemSettings.value = result.system;
    projectSettings.value = result.project;
    defaults.value = result.defaults;
    if (!themes.value.length) await loadThemes();
    applyTheme();
  }

  // ─── 更新 ────────────────────────────────────────────────
  async function updateSystem(patch: Partial<AppSettings>) {
    systemSettings.value = await settingsApi.updateSystem(patch);
    applyTheme();
  }

  async function updateProject(projectId: string, patch: Partial<AppSettings>) {
    projectSettings.value = await settingsApi.updateProject(projectId, patch);
    applyTheme();
  }

  async function clearProjectKey(projectId: string, key: string) {
    projectSettings.value = await settingsApi.removeProjectKey(projectId, key);
    applyTheme();
  }

  // ─── 应用主题（注入 CSS 变量） ──────────────────────────
  function applyTheme() {
    const themeId = effective.value['workbench.theme'] || 'dark-default';
    const theme = themes.value.find(t => t.id === themeId);
    if (!theme) return;

    const root = document.documentElement;
    // 先应用主题预设
    for (const [key, value] of Object.entries(theme.colors)) {
      root.style.setProperty(key, value);
    }
    // 再应用自定义覆盖
    const overrides = effective.value['workbench.colorCustomizations'] || {};
    for (const [key, value] of Object.entries(overrides)) {
      root.style.setProperty(key, value);
    }
    // 应用其他 UI 设置
    if (effective.value['ui.fontSize']) {
      root.style.setProperty('--ui-font-size', `${effective.value['ui.fontSize']}px`);
    }
    // 标记主题类型
    root.dataset.themeType = theme.type;
  }

  // 主题颜色变化时自动重新应用
  watch(effective, applyTheme, { deep: true });

  return {
    themes,
    systemSettings,
    projectSettings,
    defaults,
    effective,
    loadThemes,
    loadAll,
    updateSystem,
    updateProject,
    clearProjectKey,
    applyTheme,
  };
});
