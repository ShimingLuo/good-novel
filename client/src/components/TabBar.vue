<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useWorkspace } from '../stores/workspace';

const workspace = useWorkspace();

const typeIcons: Record<string, string> = {
  config: '⚙️',
  architecture: '📐',
  editor: '📄',
  outline: '📑',
  characters: '👤',
  blueprints: '📑',
  skills: '🧩',
  prompts: '📝',
  settings: '⚙️',
};

const tabbarEl = ref<HTMLElement | null>(null);

// ─── 拖拽（VSCode 风格） ─────────────────────────────────────
// 使用索引而不是 id，且明确区分"插入到目标左侧/右侧"
const draggingIndex = ref<number | null>(null);
const dropIndex = ref<number | null>(null); // 表示要插入的位置（0..tabs.length）

function onDragStart(e: DragEvent, idx: number) {
  draggingIndex.value = idx;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    // Firefox 需要设置 data 才能触发 dragover
    e.dataTransfer.setData('text/plain', String(idx));
  }
}

function onDragOver(e: DragEvent, idx: number) {
  if (draggingIndex.value === null) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

  // 根据鼠标在 tab 内的横向位置决定插入到左侧还是右侧
  const tabEl = e.currentTarget as HTMLElement;
  const rect = tabEl.getBoundingClientRect();
  const isLeftHalf = e.clientX - rect.left < rect.width / 2;
  const targetIdx = isLeftHalf ? idx : idx + 1;

  // 如果就是当前位置或者拖拽自身的相邻位置，不显示指示器
  if (targetIdx === draggingIndex.value || targetIdx === draggingIndex.value + 1) {
    dropIndex.value = null;
  } else {
    dropIndex.value = targetIdx;
  }
}

function onTabbarDragOver(e: DragEvent) {
  if (draggingIndex.value === null) return;
  e.preventDefault();
  // 如果鼠标在 tab 之外的空白区域，附加到末尾
  const target = e.target as HTMLElement;
  if (!target.closest('.tab')) {
    const lastIdx = workspace.tabs.length;
    if (lastIdx !== draggingIndex.value && lastIdx !== draggingIndex.value + 1) {
      dropIndex.value = lastIdx;
    } else {
      dropIndex.value = null;
    }
  }
}

function onDrop(e: DragEvent) {
  e.preventDefault();
  if (draggingIndex.value === null || dropIndex.value === null) {
    resetDrag();
    return;
  }
  workspace.moveTab(draggingIndex.value, dropIndex.value);
  resetDrag();
}

function onDragEnd() {
  resetDrag();
}

function resetDrag() {
  draggingIndex.value = null;
  dropIndex.value = null;
}

// ─── 中键关闭 ────────────────────────────────────────────────
function onMouseDown(e: MouseEvent, tabId: string) {
  if (e.button === 1) {
    e.preventDefault();
    workspace.closeTab(tabId);
  }
}

// ─── 右键菜单 ────────────────────────────────────────────────
const contextMenu = ref<{ tabId: string; x: number; y: number } | null>(null);

function onContextMenu(e: MouseEvent, tabId: string) {
  e.preventDefault();
  contextMenu.value = { tabId, x: e.clientX, y: e.clientY };
  nextTick(() => {
    const menuEl = document.querySelector('.tab-context-menu') as HTMLElement | null;
    if (menuEl && contextMenu.value) {
      const rect = menuEl.getBoundingClientRect();
      const overflowX = rect.right - window.innerWidth;
      const overflowY = rect.bottom - window.innerHeight;
      if (overflowX > 0) contextMenu.value.x -= overflowX + 8;
      if (overflowY > 0) contextMenu.value.y -= overflowY + 8;
    }
  });
}

function closeContextMenu() {
  contextMenu.value = null;
}

const contextActions = computed(() => {
  if (!contextMenu.value) return [];
  const { tabId } = contextMenu.value;
  const idx = workspace.tabs.findIndex(t => t.id === tabId);
  const hasRight = idx >= 0 && idx < workspace.tabs.length - 1;
  const hasOthers = workspace.tabs.length > 1;
  return [
    { key: 'close', label: '关闭', icon: '✕', enabled: true },
    { key: 'closeOthers', label: '关闭其他', icon: '⊟', enabled: hasOthers },
    { key: 'closeRight', label: '关闭右侧标签', icon: '⊟', enabled: hasRight },
    { key: 'closeAll', label: '全部关闭', icon: '✕', enabled: true },
  ];
});

function execAction(key: string) {
  if (!contextMenu.value) return;
  const { tabId } = contextMenu.value;
  switch (key) {
    case 'close': workspace.closeTab(tabId); break;
    case 'closeOthers': workspace.closeOtherTabs(tabId); break;
    case 'closeRight': workspace.closeRightTabs(tabId); break;
    case 'closeAll': workspace.closeAllTabs(); break;
  }
  closeContextMenu();
}

// ─── 滚轮横向滚动 ────────────────────────────────────────────
function onWheel(e: WheelEvent) {
  if (e.deltaY === 0) return;
  if (tabbarEl.value && tabbarEl.value.scrollWidth > tabbarEl.value.clientWidth) {
    e.preventDefault();
    tabbarEl.value.scrollLeft += e.deltaY;
  }
}

// ─── 全局事件 ────────────────────────────────────────────────
function onGlobalClick(e: MouseEvent) {
  if (contextMenu.value && !(e.target as HTMLElement).closest('.tab-context-menu')) {
    closeContextMenu();
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && contextMenu.value) {
    closeContextMenu();
  }
}

onMounted(() => {
  document.addEventListener('click', onGlobalClick);
  document.addEventListener('keydown', onKeyDown);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onGlobalClick);
  document.removeEventListener('keydown', onKeyDown);
});
</script>

<template>
  <div
    ref="tabbarEl"
    class="tabbar"
    v-if="workspace.tabs.length"
    @wheel="onWheel"
    @dragover="onTabbarDragOver"
    @drop="onDrop"
  >
    <template v-for="(tab, idx) in workspace.tabs" :key="tab.id">
      <!-- 左侧插入指示线 -->
      <div v-if="dropIndex === idx" class="drop-indicator"></div>

      <div
        class="tab"
        :class="{
          active: workspace.activeTabId === tab.id,
          dragging: draggingIndex === idx,
        }"
        draggable="true"
        @click="workspace.activeTabId = tab.id"
        @mousedown="onMouseDown($event, tab.id)"
        @contextmenu="onContextMenu($event, tab.id)"
        @dragstart="onDragStart($event, idx)"
        @dragover="onDragOver($event, idx)"
        @dragend="onDragEnd"
      >
        <span class="tab-icon">{{ typeIcons[tab.type] || '📄' }}</span>
        <span class="tab-label">{{ tab.label }}</span>
        <button class="tab-close" @click.stop="workspace.closeTab(tab.id)" title="关闭 (中键也可)">×</button>
      </div>
    </template>

    <!-- 末尾插入指示线 -->
    <div v-if="dropIndex === workspace.tabs.length" class="drop-indicator"></div>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div
        v-if="contextMenu"
        class="tab-context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      >
        <button
          v-for="act in contextActions"
          :key="act.key"
          class="ctx-item"
          :disabled="!act.enabled"
          @click="execAction(act.key)"
        >
          <span class="ctx-icon">{{ act.icon }}</span>
          <span>{{ act.label }}</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.tabbar {
  display: flex;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  height: var(--panel-header-height);
  overflow-x: auto;
  overflow-y: hidden;
  flex-shrink: 0;
  scrollbar-width: thin;
  position: relative;
}
.tabbar::-webkit-scrollbar { height: 3px; }

.tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 12px;
  height: 100%;
  font-size: 12px;
  cursor: pointer;
  border-right: 1px solid var(--border);
  white-space: nowrap;
  transition: background 0.1s;
  color: var(--text-dim);
  position: relative;
  user-select: none;
  flex-shrink: 0;
}

.tab:hover { background: var(--bg-base); }

.tab.active {
  background: var(--bg-base);
  color: var(--text);
}
.tab.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: var(--accent);
}

.tab.dragging {
  opacity: 0.4;
  background: var(--bg-overlay);
}

/* VSCode 风格的拖拽指示线 */
.drop-indicator {
  width: 2px;
  background: var(--accent);
  flex-shrink: 0;
  align-self: stretch;
  margin: 0;
  box-shadow: 0 0 8px var(--accent);
  pointer-events: none;
}

.tab-icon { font-size: 13px; }

.tab-close {
  margin-left: 6px;
  font-size: 14px;
  opacity: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  color: inherit;
  flex-shrink: 0;
}

.tab:hover .tab-close,
.tab.active .tab-close { opacity: 0.6; }
.tab-close:hover { opacity: 1 !important; background: var(--border); }

/* ─── 右键菜单 ─── */
.tab-context-menu {
  position: fixed;
  z-index: 2000;
  min-width: 160px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  font-size: 12px;
  border-radius: 4px;
  text-align: left;
  color: var(--text);
  background: transparent;
  border: none;
  cursor: pointer;
  width: 100%;
  transition: background 0.1s;
}

.ctx-item:hover:not(:disabled) {
  background: var(--accent-dim);
  color: var(--accent);
}

.ctx-item:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ctx-icon {
  font-size: 11px;
  width: 14px;
  display: inline-flex;
  justify-content: center;
  color: var(--text-muted);
}
</style>
