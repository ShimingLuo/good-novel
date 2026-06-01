<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useSettings } from '../stores/settings';
import { useWorkspace } from '../stores/workspace';

const settings = useSettings();
const workspace = useWorkspace();

const scope = ref<'system' | 'project'>('system');
const searchQuery = ref('');

const projectId = computed(() => workspace.currentProjectId);

// 当前编辑作用域的设置
const scopeSettings = computed(() => {
  return scope.value === 'system' ? settings.systemSettings : settings.projectSettings;
});

// 检查某个 key 是否在项目级被覆盖
function isOverriddenInProject(key: string): boolean {
  return scope.value === 'system' && key in settings.projectSettings;
}

// 设置项是否在当前作用域被自定义
function isCustomized(key: string): boolean {
  return key in scopeSettings.value;
}

// 获取当前作用域显示的值（如果该作用域没有设置，显示 fallback）
function getDisplayValue(key: string): any {
  if (key in scopeSettings.value) return scopeSettings.value[key];
  if (scope.value === 'project' && key in settings.systemSettings) return settings.systemSettings[key];
  return settings.defaults[key];
}

async function setValue(key: string, value: any) {
  if (scope.value === 'system') {
    await settings.updateSystem({ [key]: value });
  } else if (projectId.value) {
    await settings.updateProject(projectId.value, { [key]: value });
  }
  workspace.addTaskLog('settings', 'success', `已更新 ${key}`);
}

async function clearProjectOverride(key: string) {
  if (scope.value === 'project' && projectId.value) {
    await settings.clearProjectKey(projectId.value, key);
    workspace.addTaskLog('settings', 'success', `已清除本书级覆盖：${key}`);
  }
}

// ─── 设置定义（类似 VSCode 的 settings schema） ─────────────
interface SettingDef {
  key: string;
  label: string;
  description: string;
  category: string;
  type: 'theme' | 'string' | 'number' | 'boolean' | 'select' | 'color-customizations' | 'font-select';
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
}

const SETTINGS_SCHEMA: SettingDef[] = [
  // ─── 主题 ───
  {
    key: 'workbench.theme',
    label: '主题',
    description: '选择应用使用的主题预设',
    category: '工作台 / 主题',
    type: 'theme',
  },
  {
    key: 'workbench.colorCustomizations',
    label: '主题颜色自定义',
    description: '在所选主题基础上覆盖部分颜色变量',
    category: '工作台 / 主题',
    type: 'color-customizations',
  },
  // ─── UI ───
  {
    key: 'ui.fontSize',
    label: '界面字号',
    description: '应用 UI 的全局字号',
    category: '工作台 / 外观',
    type: 'number',
    min: 11,
    max: 18,
    step: 1,
  },
  {
    key: 'ui.density',
    label: '界面密度',
    description: '控件和列表的紧凑程度',
    category: '工作台 / 外观',
    type: 'select',
    options: [
      { value: 'compact', label: '紧凑' },
      { value: 'normal', label: '默认' },
      { value: 'comfortable', label: '舒适' },
    ],
  },
  {
    key: 'ui.showStatusBar',
    label: '显示底部状态栏',
    description: '是否显示窗口底部的状态栏',
    category: '工作台 / 外观',
    type: 'boolean',
  },
  // ─── 编辑器 ───
  {
    key: 'editor.fontSize',
    label: '编辑器字号',
    description: '代码编辑器中的文字大小',
    category: '编辑器',
    type: 'number',
    min: 10,
    max: 24,
    step: 1,
  },
  {
    key: 'editor.fontFamily',
    label: '编辑器字体',
    description: '代码编辑器使用的字体',
    category: '编辑器',
    type: 'font-select',
  },
  {
    key: 'editor.lineHeight',
    label: '行高',
    description: '编辑器中文字的行高（倍数）',
    category: '编辑器',
    type: 'number',
    min: 1.0,
    max: 2.5,
    step: 0.1,
  },
  {
    key: 'editor.tabSize',
    label: 'Tab 大小',
    description: 'Tab 键缩进的空格数',
    category: '编辑器',
    type: 'number',
    min: 1,
    max: 8,
    step: 1,
  },
  {
    key: 'editor.wordWrap',
    label: '自动换行',
    description: '编辑器中长行是否自动换行',
    category: '编辑器',
    type: 'select',
    options: [
      { value: 'on', label: '开启' },
      { value: 'off', label: '关闭' },
    ],
  },
  {
    key: 'editor.lineNumbers',
    label: '显示行号',
    description: '是否在编辑器左侧显示行号',
    category: '编辑器',
    type: 'boolean',
  },
];

// 按分类分组
const groupedSettings = computed(() => {
  const filtered = SETTINGS_SCHEMA.filter(s => {
    if (!searchQuery.value) return true;
    const q = searchQuery.value.toLowerCase();
    return s.label.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.key.toLowerCase().includes(q);
  });
  const groups: Record<string, SettingDef[]> = {};
  for (const s of filtered) {
    if (!groups[s.category]) groups[s.category] = [];
    groups[s.category].push(s);
  }
  return groups;
});

// ─── 编辑器字体预设 ────────────────────────────────────────
interface FontPreset {
  label: string;
  value: string;
  type: 'mono' | 'sans' | 'serif';
}

const FONT_PRESETS: FontPreset[] = [
  // 等宽字体（推荐用于代码/Markdown）
  { label: 'JetBrains Mono', value: "'JetBrains Mono', 'Fira Code', monospace", type: 'mono' },
  { label: 'Fira Code', value: "'Fira Code', 'JetBrains Mono', monospace", type: 'mono' },
  { label: 'Cascadia Code', value: "'Cascadia Code', 'Cascadia Mono', monospace", type: 'mono' },
  { label: 'Source Code Pro', value: "'Source Code Pro', monospace", type: 'mono' },
  { label: 'IBM Plex Mono', value: "'IBM Plex Mono', monospace", type: 'mono' },
  { label: 'Menlo', value: "Menlo, Monaco, monospace", type: 'mono' },
  { label: 'Consolas', value: "Consolas, 'Courier New', monospace", type: 'mono' },
  { label: 'SF Mono', value: "'SF Mono', Menlo, monospace", type: 'mono' },
  { label: 'Courier New', value: "'Courier New', Courier, monospace", type: 'mono' },
  // 无衬线字体（适合中文小说写作）
  { label: '系统默认（无衬线）', value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Noto Sans SC', sans-serif", type: 'sans' },
  { label: '苹方 PingFang', value: "'PingFang SC', 'Noto Sans SC', sans-serif", type: 'sans' },
  { label: '微软雅黑', value: "'Microsoft YaHei', 'Noto Sans SC', sans-serif", type: 'sans' },
  { label: 'Inter', value: "'Inter', system-ui, sans-serif", type: 'sans' },
  // 衬线字体（适合阅读体验）
  { label: '宋体', value: "'Songti SC', 'SimSun', serif", type: 'serif' },
  { label: '思源宋体 Source Han Serif', value: "'Source Han Serif SC', 'Noto Serif SC', serif", type: 'serif' },
  { label: 'Georgia', value: "Georgia, 'Times New Roman', serif", type: 'serif' },
];

function getFontTypeBadge(type: string) {
  return type === 'mono' ? 'M' : type === 'serif' ? 'S' : 'A';
}

// ─── 颜色自定义 ────────────────────────────────────────────
const COLOR_CUSTOMIZABLE = [
  { key: '--accent', label: '强调色' },
  { key: '--accent-hover', label: '强调色悬停' },
  { key: '--success', label: '成功色' },
  { key: '--warning', label: '警告色' },
  { key: '--danger', label: '危险色' },
  { key: '--bg-base', label: '基础背景' },
  { key: '--bg-surface', label: '表面背景' },
  { key: '--text', label: '主文本色' },
];

const colorCustomizations = computed<Record<string, string>>({
  get: () => {
    return getDisplayValue('workbench.colorCustomizations') || {};
  },
  set: (v) => {
    setValue('workbench.colorCustomizations', v);
  },
});

function getColorValue(varName: string): string {
  const custom = colorCustomizations.value[varName];
  if (custom) return custom;
  // 从当前主题获取
  const themeId = settings.effective['workbench.theme'] || 'dark-default';
  const theme = settings.themes.find(t => t.id === themeId);
  return theme?.colors[varName] || '#000000';
}

function setColorValue(varName: string, value: string) {
  const next = { ...colorCustomizations.value, [varName]: value };
  setValue('workbench.colorCustomizations', next);
}

function resetColor(varName: string) {
  const next = { ...colorCustomizations.value };
  delete next[varName];
  setValue('workbench.colorCustomizations', next);
}

// ─── 初始化 ────────────────────────────────────────────────
onMounted(async () => {
  await settings.loadAll(projectId.value);
});

watch(projectId, async (id) => {
  if (id) await settings.loadAll(id);
});
</script>

<template>
  <div class="settings-pane">
    <div class="pane-header">
      <div class="header-left">
        <h2>设置</h2>
        <p class="desc">类似 VSCode 的两级配置：本书设置优先于系统设置</p>
      </div>
    </div>

    <!-- 作用域切换 + 搜索 -->
    <div class="toolbar">
      <div class="scope-tabs">
        <button
          class="scope-tab"
          :class="{ active: scope === 'system' }"
          @click="scope = 'system'"
        >
          🌐 系统
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
      <input
        v-model="searchQuery"
        class="search-input"
        placeholder="🔍 搜索设置..."
      />
    </div>

    <!-- 本书作用域提示 -->
    <div v-if="scope === 'project' && !projectId" class="empty-tip">
      <p>请先打开一本小说才能编辑本书级设置</p>
    </div>

    <!-- 设置列表（按分类分组） -->
    <div v-else class="settings-list">
      <div v-for="(group, category) in groupedSettings" :key="category" class="settings-group">
        <h3 class="group-title">{{ category }}</h3>

        <div v-for="def in group" :key="def.key" class="setting-row">
          <div class="setting-meta">
            <div class="setting-header">
              <span class="setting-label">{{ def.label }}</span>
              <span v-if="isCustomized(def.key) && scope === 'system'" class="setting-tag system">已修改</span>
              <span v-if="isCustomized(def.key) && scope === 'project'" class="setting-tag project">本书覆盖</span>
              <span v-if="isOverriddenInProject(def.key)" class="setting-tag overridden">已被本书覆盖</span>
            </div>
            <div class="setting-desc">{{ def.description }}</div>
            <div class="setting-key"><code>{{ def.key }}</code></div>
          </div>

          <div class="setting-control">
            <!-- 主题 -->
            <select
              v-if="def.type === 'theme'"
              :value="getDisplayValue(def.key)"
              @change="setValue(def.key, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="t in settings.themes" :key="t.id" :value="t.id">
                {{ t.label }} ({{ t.type === 'dark' ? '暗' : '亮' }})
              </option>
            </select>

            <!-- 字符串 -->
            <input
              v-else-if="def.type === 'string'"
              type="text"
              :value="getDisplayValue(def.key)"
              @change="setValue(def.key, ($event.target as HTMLInputElement).value)"
            />

            <!-- 数字 -->
            <input
              v-else-if="def.type === 'number'"
              type="number"
              :min="def.min"
              :max="def.max"
              :step="def.step"
              :value="getDisplayValue(def.key)"
              @change="setValue(def.key, Number(($event.target as HTMLInputElement).value))"
            />

            <!-- 布尔 -->
            <label v-else-if="def.type === 'boolean'" class="switch">
              <input
                type="checkbox"
                :checked="getDisplayValue(def.key)"
                @change="setValue(def.key, ($event.target as HTMLInputElement).checked)"
              />
              <span class="slider"></span>
            </label>

            <!-- 选择 -->
            <select
              v-else-if="def.type === 'select'"
              :value="getDisplayValue(def.key)"
              @change="setValue(def.key, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="o in def.options" :key="o.value" :value="o.value">
                {{ o.label }}
              </option>
            </select>

            <!-- 字体选择器（带预览） -->
            <div v-else-if="def.type === 'font-select'" class="font-select-wrapper">
              <div class="font-preview" :style="{ fontFamily: getDisplayValue(def.key) }" :title="getDisplayValue(def.key)">
                The quick brown fox 永和九年 Aa Bb 0123
              </div>
              <select
                class="font-select"
                :value="getDisplayValue(def.key)"
                @change="setValue(def.key, ($event.target as HTMLSelectElement).value)"
              >
                <option
                  v-for="f in FONT_PRESETS"
                  :key="f.value"
                  :value="f.value"
                  :style="{ fontFamily: f.value }"
                >
                  [{{ getFontTypeBadge(f.type) }}] {{ f.label }} — Aa 永
                </option>
              </select>
            </div>

            <!-- 颜色自定义 -->
            <div v-else-if="def.type === 'color-customizations'" class="color-customizations">
              <div v-for="c in COLOR_CUSTOMIZABLE" :key="c.key" class="color-row">
                <span class="color-label">{{ c.label }}</span>
                <input
                  type="color"
                  :value="getColorValue(c.key)"
                  @input="setColorValue(c.key, ($event.target as HTMLInputElement).value)"
                />
                <code class="color-var">{{ c.key }}</code>
                <button
                  v-if="colorCustomizations[c.key]"
                  class="reset-btn"
                  title="重置为主题默认"
                  @click="resetColor(c.key)"
                >↺</button>
              </div>
            </div>

            <!-- 本书级清除按钮 -->
            <button
              v-if="scope === 'project' && isCustomized(def.key) && def.type !== 'color-customizations'"
              class="clear-btn"
              title="移除本书级覆盖（恢复使用系统级）"
              @click="clearProjectOverride(def.key)"
            >↺</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-pane { padding: 24px 32px; max-width: 900px; margin: 0 auto; overflow-y: auto; height: 100%; }

.pane-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; }
.header-left h2 { font-size: 20px; font-weight: 600; margin-bottom: 4px; }
.desc { color: var(--text-muted); font-size: 13px; }

/* 工具栏 */
.toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }

.scope-tabs { display: flex; gap: 2px; background: var(--bg-overlay); padding: 3px; border-radius: 6px; }
.scope-tab { padding: 5px 12px; font-size: 12px; border-radius: 4px; color: var(--text-dim); }
.scope-tab:hover:not(:disabled) { color: var(--text); }
.scope-tab.active { background: var(--accent); color: #fff; font-weight: 500; }
.scope-tab:disabled { opacity: 0.4; cursor: not-allowed; }

.search-input { flex: 1; max-width: 320px; font-size: 12px; padding: 6px 10px; }

.empty-tip { padding: 60px; text-align: center; color: var(--text-muted); font-size: 13px; }

/* 设置组 */
.settings-list { display: flex; flex-direction: column; gap: 28px; }
.settings-group { display: flex; flex-direction: column; gap: 4px; }
.group-title { font-size: 13px; font-weight: 600; color: var(--accent); margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }

/* 单个设置 */
.setting-row { display: grid; grid-template-columns: 1fr 320px; gap: 20px; padding: 14px 0; border-bottom: 1px dashed var(--border); }
.setting-row:last-child { border-bottom: none; }

.setting-meta { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.setting-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.setting-label { font-size: 13px; font-weight: 600; }
.setting-tag { font-size: 10px; padding: 2px 7px; border-radius: 10px; font-weight: 500; }
.setting-tag.system { background: var(--accent-dim); color: var(--accent); }
.setting-tag.project { background: var(--success-dim); color: var(--success); }
.setting-tag.overridden { background: rgba(230, 162, 60, 0.15); color: var(--warning); }
.setting-desc { font-size: 12px; color: var(--text-dim); line-height: 1.4; }
.setting-key code { font-size: 10px; color: var(--text-muted); font-family: monospace; }

.setting-control { display: flex; align-items: flex-start; gap: 8px; }
.setting-control > select,
.setting-control > input[type="text"],
.setting-control > input[type="number"] {
  flex: 1;
  font-size: 12px;
  padding: 6px 10px;
  height: 32px;
}

/* Switch 开关 */
.switch { position: relative; display: inline-block; width: 36px; height: 20px; flex-shrink: 0; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider {
  position: absolute; cursor: pointer; inset: 0;
  background: var(--border); border-radius: 20px; transition: 0.2s;
}
.slider::before {
  content: ''; position: absolute; left: 2px; top: 2px;
  width: 16px; height: 16px; background: var(--text-dim);
  border-radius: 50%; transition: 0.2s;
}
.switch input:checked + .slider { background: var(--accent); }
.switch input:checked + .slider::before { transform: translateX(16px); background: #fff; }

/* 字体选择 */
.font-select-wrapper { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; }
.font-select { width: 100%; font-size: 12px; padding: 6px 10px; height: 32px; }
.font-select option { padding: 6px 4px; font-size: 13px; background: var(--bg-elevated); }
.font-preview {
  padding: 8px 10px;
  background: var(--bg-overlay);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 14px;
  color: var(--text);
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 颜色自定义 */
.color-customizations { display: flex; flex-direction: column; gap: 6px; flex: 1; }
.color-row { display: flex; align-items: center; gap: 8px; }
.color-label { font-size: 11px; color: var(--text-dim); width: 80px; flex-shrink: 0; }
.color-row input[type="color"] {
  width: 32px; height: 24px; border: 1px solid var(--border); border-radius: 4px;
  padding: 0; cursor: pointer; background: transparent;
}
.color-var { font-size: 10px; color: var(--text-muted); flex: 1; font-family: monospace; }
.reset-btn,
.clear-btn {
  width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;
  border-radius: 4px; font-size: 12px; color: var(--warning);
}
.reset-btn:hover,
.clear-btn:hover { background: rgba(230, 162, 60, 0.1); }
</style>
