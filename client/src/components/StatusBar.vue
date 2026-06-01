<script setup lang="ts">
import { useWorkspace } from '../stores/workspace';

const workspace = useWorkspace();
</script>

<template>
  <footer class="status-bar">
    <div class="left">
      <span class="status-item">📖 Good v0.2.0</span>
      <span class="status-item" v-if="workspace.currentProject">
        📂 {{ workspace.currentProject.title }}
      </span>
    </div>
    <div class="right">
      <span class="status-item">Markdown</span>
      <span class="status-item">UTF-8</span>
    </div>
  </footer>
</template>

<style scoped>
.status-bar {
  height: var(--statusbar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: var(--bg-overlay);
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.left, .right {
  display: flex;
  gap: 12px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
