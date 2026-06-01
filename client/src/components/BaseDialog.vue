<script setup lang="ts">
import { watch, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps<{
  open: boolean;
  title?: string;
  width?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

function onOverlayClick(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains('dialog-overlay')) {
    emit('close');
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="open" class="dialog-overlay" @mousedown="onOverlayClick">
        <div class="dialog-content" :style="{ maxWidth: width || '520px' }">
          <div class="dialog-header" v-if="title">
            <h3>{{ title }}</h3>
            <button class="dialog-close" @click="emit('close')">✕</button>
          </div>
          <div class="dialog-body">
            <slot />
          </div>
          <div class="dialog-footer" v-if="$slots.footer">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(2px);
}

.dialog-content {
  width: 90%;
  max-height: 85vh;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.dialog-header h3 {
  font-size: 15px;
  font-weight: 600;
}

.dialog-close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-size: 14px;
  color: var(--text-muted);
  transition: all 0.15s;
}
.dialog-close:hover {
  background: var(--border);
  color: var(--text);
}

.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

/* 动画 */
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.15s ease;
}
.dialog-enter-active .dialog-content,
.dialog-leave-active .dialog-content {
  transition: transform 0.15s ease;
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
.dialog-enter-from .dialog-content {
  transform: scale(0.96) translateY(8px);
}
.dialog-leave-to .dialog-content {
  transform: scale(0.96) translateY(8px);
}
</style>
