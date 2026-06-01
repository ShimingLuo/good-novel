<script setup lang="ts">
import { useWorkspace } from '../stores/workspace';

const workspace = useWorkspace();

const statusIcons: Record<string, string> = {
  running: '⏳',
  success: '✓',
  error: '✗',
};

const statusColors: Record<string, string> = {
  running: 'var(--warning)',
  success: 'var(--success)',
  error: 'var(--danger)',
};
</script>

<template>
  <div class="task-panel">
    <div class="panel-tabs">
      <span class="panel-tab active">任务日志</span>
      <span class="spacer"></span>
      <button class="action-btn" title="清空" @click="workspace.clearTaskLogs()">🗑</button>
      <button class="collapse-btn" title="收起" @click="workspace.showTaskPanel = false">─</button>
    </div>
    <div class="panel-body">
      <div v-if="!workspace.taskLogs.length" class="empty-tasks">
        <span class="task-icon">⚡</span>
        <p>暂无任务日志</p>
      </div>
      <div v-else class="task-list">
        <div v-for="log in workspace.taskLogs" :key="log.id" class="task-item">
          <span class="task-status" :style="{ color: statusColors[log.status] }">
            {{ statusIcons[log.status] || '•' }}
          </span>
          <span class="task-time">{{ log.time }}</span>
          <span class="task-type">[{{ log.type }}]</span>
          <span class="task-msg">{{ log.message }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.task-panel {
  border-top: 1px solid var(--border);
  background: var(--bg-surface);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
}

.panel-tabs {
  display: flex;
  align-items: center;
  padding: 0 12px;
  height: 28px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  flex-shrink: 0;
}

.panel-tab { color: var(--text-dim); padding: 4px 8px; }
.panel-tab.active { color: var(--text); }
.spacer { flex: 1; }
.action-btn, .collapse-btn { font-size: 12px; opacity: 0.5; margin-left: 4px; }
.action-btn:hover, .collapse-btn:hover { opacity: 1; }

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 12px;
}

.empty-tasks {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
}

.task-icon { font-size: 18px; margin-right: 8px; opacity: 0.5; }

.task-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  padding: 2px 0;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

.task-status { font-weight: 700; width: 12px; }
.task-time { color: var(--text-muted); }
.task-type { color: var(--accent); }
.task-msg { color: var(--text-dim); }
</style>
