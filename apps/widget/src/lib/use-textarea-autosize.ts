import { useCallback, useLayoutEffect } from 'react';

const MIN_HEIGHT = 36;
const MAX_HEIGHT = 120;

/** Stable autosize for widget textarea — no browser resize handle, no inner scroll. */
export function useTextareaAutosize(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
): void {
  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = `${MIN_HEIGHT}px`;
    const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, el.scrollHeight));
    el.style.height = `${next}px`;
    el.style.overflowY = 'hidden';
  }, [ref]);

  useLayoutEffect(() => {
    resize();
  }, [value, resize]);
}
