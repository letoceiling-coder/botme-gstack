import { useEffect, type RefObject } from 'react';

const MIN_VIEWPORT_HEIGHT = 320;
const KEYBOARD_DELTA_PX = 120;

function readViewport() {
  const visualViewport = window.visualViewport;
  const layoutHeight = window.innerHeight || document.documentElement.clientHeight || MIN_VIEWPORT_HEIGHT;
  const visualHeight = visualViewport?.height ?? layoutHeight;
  const offsetTop = visualViewport?.offsetTop ?? 0;
  const keyboardInset = Math.max(0, layoutHeight - visualHeight - offsetTop);

  return {
    height: Math.max(MIN_VIEWPORT_HEIGHT, Math.round(visualHeight)),
    offsetTop: Math.max(0, Math.round(offsetTop)),
    keyboardOpen: keyboardInset > KEYBOARD_DELTA_PX || visualHeight < layoutHeight * 0.78,
  };
}

export function useWidgetViewport(
  inputRef: RefObject<HTMLTextAreaElement | null>,
  onComposerVisible?: () => void,
): void {
  useEffect(() => {
    let frame = 0;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const applyViewport = () => {
      frame = 0;
      const viewport = readViewport();
      const root = document.documentElement;
      root.style.setProperty('--botme-viewport-height', `${viewport.height}px`);
      root.style.setProperty('--botme-viewport-offset-top', `${viewport.offsetTop}px`);
      root.dataset.botmeKeyboard = viewport.keyboardOpen ? '1' : '0';
    };

    const scheduleApply = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(applyViewport);
    };

    const keepComposerVisible = () => {
      scheduleApply();
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        scheduleApply();
        onComposerVisible?.();
      }, 90);
    };

    const visualViewport = window.visualViewport;
    scheduleApply();

    visualViewport?.addEventListener('resize', keepComposerVisible);
    visualViewport?.addEventListener('scroll', keepComposerVisible);
    window.addEventListener('resize', keepComposerVisible);
    window.addEventListener('orientationchange', keepComposerVisible);

    const input = inputRef.current;
    input?.addEventListener('focus', keepComposerVisible);
    input?.addEventListener('input', keepComposerVisible);
    input?.addEventListener('blur', keepComposerVisible);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (settleTimer) clearTimeout(settleTimer);
      visualViewport?.removeEventListener('resize', keepComposerVisible);
      visualViewport?.removeEventListener('scroll', keepComposerVisible);
      window.removeEventListener('resize', keepComposerVisible);
      window.removeEventListener('orientationchange', keepComposerVisible);
      input?.removeEventListener('focus', keepComposerVisible);
      input?.removeEventListener('input', keepComposerVisible);
      input?.removeEventListener('blur', keepComposerVisible);
    };
  }, [inputRef, onComposerVisible]);
}
