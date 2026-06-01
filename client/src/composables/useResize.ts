import { ref, watch, onUnmounted } from 'vue';

export interface ResizeOptions {
  direction: 'horizontal' | 'vertical';
  /** 初始尺寸 px */
  initial: number;
  /** 最小尺寸 px */
  min?: number;
  /** 是否反向（从右/从下拖拽） */
  reverse?: boolean;
  /** localStorage 持久化 key，传入后自动保存/恢复 */
  storageKey?: string;
}

export function useResize(options: ResizeOptions) {
  // 从 localStorage 恢复，否则用初始值
  let initialSize = options.initial;
  if (options.storageKey) {
    const saved = localStorage.getItem(options.storageKey);
    if (saved) {
      const parsed = Number(saved);
      if (!isNaN(parsed) && parsed > 0) {
        initialSize = parsed;
      }
    }
  }

  const size = ref(initialSize);
  const isResizing = ref(false);
  const min = options.min ?? 50;

  let startPos = 0;
  let startSize = 0;

  // 持久化到 localStorage
  if (options.storageKey) {
    watch(size, (val) => {
      localStorage.setItem(options.storageKey!, String(Math.round(val)));
    });
  }

  function onMouseDown(e: MouseEvent) {
    e.preventDefault();
    isResizing.value = true;
    startPos = options.direction === 'horizontal' ? e.clientX : e.clientY;
    startSize = size.value;

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = options.direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }

  function onMouseMove(e: MouseEvent) {
    const currentPos = options.direction === 'horizontal' ? e.clientX : e.clientY;
    let delta = currentPos - startPos;
    if (options.reverse) delta = -delta;

    let newSize = startSize + delta;
    newSize = Math.max(min, newSize);
    size.value = newSize;
  }

  function onMouseUp() {
    isResizing.value = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  onUnmounted(() => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  });

  return { size, isResizing, onMouseDown };
}
