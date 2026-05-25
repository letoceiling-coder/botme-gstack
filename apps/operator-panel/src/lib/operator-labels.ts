import { controlModeLabel } from '../i18n/ru';

export { controlModeLabel };

export function formatDuration(sec: number): string {
  if (sec < 60) return `${sec} сек`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m} мин ${s} сек` : `${m} мин`;
}
