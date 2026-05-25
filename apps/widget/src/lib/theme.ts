import type { WidgetThemeConfig } from '@botme/shared';
import { themeToCssVariables } from '@botme/shared';

export function applyWidgetTheme(theme: WidgetThemeConfig): void {
  const root = document.documentElement;
  const vars = themeToCssVariables(theme);
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
  root.dataset.botmeDark = theme.darkMode ? '1' : '0';
  root.dataset.botmeCompact = theme.compactMode ? '1' : '0';
  if (!theme.animations) {
    root.classList.add('botme-no-animations');
  }
}

export interface LauncherInitConfig {
  theme: WidgetThemeConfig;
  widgetOrigin: string;
  embedPath: string;
}

export async function fetchWidgetInit(
  apiOrigin: string,
  publicKey: string,
): Promise<LauncherInitConfig | null> {
  try {
    const res = await fetch(`${apiOrigin}/api/public/widget/${encodeURIComponent(publicKey)}/init`, {
      credentials: 'omit',
    });
    if (!res.ok) return null;
    return (await res.json()) as LauncherInitConfig;
  } catch {
    return null;
  }
}

export function positionStyles(position: 'bottom-right' | 'bottom-left'): {
  launcher: string;
  iframe: string;
} {
  if (position === 'bottom-left') {
    return {
      launcher: 'left:20px;right:auto;',
      iframe: 'left:20px;right:auto;',
    };
  }
  return {
    launcher: 'right:20px;left:auto;',
    iframe: 'right:20px;left:auto;',
  };
}
