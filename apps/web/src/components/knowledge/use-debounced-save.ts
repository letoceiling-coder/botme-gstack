import { useEffect, useRef } from 'react';

export function useDebouncedSave(
  value: string,
  onSave: (value: string) => void,
  delayMs = 800,
  enabled = true,
) {
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => onSaveRef.current(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs, enabled]);
}
