import type { LauncherConfig } from './widgets-admin.js';
import { LauncherConfigSchema } from './widgets-admin.js';

/** Normalized widget theme applied at runtime via CSS variables. */
export interface WidgetThemeConfig {
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  launcherPosition: 'bottom-right' | 'bottom-left';
  borderRadius: number;
  avatarUrl: string | null;
  launcherIcon: string;
  welcomeMessage: string | null;
  widgetTitle: string | null;
  typingColor: string;
  bubbleUserColor: string;
  bubbleAssistantColor: string;
  fullscreenMobile: boolean;
  darkMode: boolean;
  compactMode: boolean;
  iframeWidth: number;
  iframeHeight: number;
  animations: boolean;
}

export function normalizeLauncherConfig(raw: unknown): WidgetThemeConfig {
  const parsed = LauncherConfigSchema.parse(raw ?? {});
  const position = parsed.launcherPosition ?? parsed.position ?? 'bottom-right';
  return {
    primaryColor: parsed.primaryColor,
    secondaryColor: parsed.secondaryColor,
    textColor: parsed.textColor,
    launcherPosition: position,
    borderRadius: parsed.borderRadius,
    avatarUrl: parsed.avatarUrl || null,
    launcherIcon: parsed.launcherIcon,
    welcomeMessage: parsed.welcomeMessage ?? null,
    widgetTitle: parsed.widgetTitle ?? null,
    typingColor: parsed.typingColor,
    bubbleUserColor: parsed.bubbleUserColor,
    bubbleAssistantColor: parsed.bubbleAssistantColor,
    fullscreenMobile: parsed.fullscreenMobile,
    darkMode: parsed.darkMode,
    compactMode: parsed.compactMode,
    iframeWidth: parsed.compactMode ? Math.min(parsed.iframeWidth, 340) : parsed.iframeWidth,
    iframeHeight: parsed.compactMode ? Math.min(parsed.iframeHeight, 480) : parsed.iframeHeight,
    animations: parsed.animations,
  };
}

export function themeToCssVariables(theme: WidgetThemeConfig): Record<string, string> {
  return {
    '--botme-primary': theme.primaryColor,
    '--botme-secondary': theme.secondaryColor,
    '--botme-text': theme.textColor,
    '--botme-radius': `${theme.borderRadius}px`,
    '--botme-typing': theme.typingColor,
    '--botme-bubble-user': theme.bubbleUserColor,
    '--botme-bubble-assistant': theme.bubbleAssistantColor,
    '--botme-bg': theme.darkMode
      ? `linear-gradient(145deg, ${theme.secondaryColor} 0%, #0f0f12 50%, ${theme.secondaryColor} 100%)`
      : `linear-gradient(145deg, #f8fafc 0%, #e2e8f0 100%)`,
  };
}
