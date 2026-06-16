import type { LauncherConfig } from './widgets-admin.js';
import { LauncherConfigSchema } from './widgets-admin.js';

/** Normalized widget theme applied at runtime via CSS variables. */
export interface WidgetThemeConfig {
  designPreset: LauncherConfig['designPreset'];
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  launcherPosition: 'bottom-right' | 'bottom-left';
  borderRadius: number;
  avatarUrl: string | null;
  launcherIcon: string;
  launcherIconUrl: string | null;
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
  quickActions: string[];
}

export function normalizeLauncherConfig(raw: unknown): WidgetThemeConfig {
  const parsed = LauncherConfigSchema.parse(raw ?? {});
  const position = parsed.launcherPosition ?? parsed.position ?? 'bottom-right';
  return {
    designPreset: parsed.designPreset,
    primaryColor: parsed.primaryColor,
    secondaryColor: parsed.secondaryColor,
    textColor: parsed.textColor,
    launcherPosition: position,
    borderRadius: parsed.borderRadius,
    avatarUrl: parsed.avatarUrl || null,
    launcherIcon: parsed.launcherIcon,
    launcherIconUrl: parsed.launcherIconUrl || null,
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
    quickActions: parsed.quickActions,
  };
}

export function themeToCssVariables(theme: WidgetThemeConfig): Record<string, string> {
  const isLight = !theme.darkMode;
  const inputText = isLight ? '#1f2937' : theme.textColor;
  const mutedText = isLight ? 'rgba(71, 85, 105, 0.72)' : 'rgba(203, 213, 225, 0.68)';

  return {
    '--botme-primary': theme.primaryColor,
    '--botme-secondary': theme.secondaryColor,
    '--botme-text': theme.textColor,
    '--botme-input-text': inputText,
    '--botme-placeholder': mutedText,
    '--botme-muted-text': mutedText,
    '--botme-radius': `${theme.borderRadius}px`,
    '--botme-typing': theme.typingColor,
    '--botme-bubble-user': theme.bubbleUserColor,
    '--botme-bubble-assistant': theme.bubbleAssistantColor,
    '--botme-user-text': theme.darkMode ? '#ffffff' : '#ffffff',
    '--botme-assistant-text': isLight ? '#334155' : theme.textColor,
    '--botme-bg': theme.darkMode
      ? `radial-gradient(circle at 12% 18%, color-mix(in srgb, ${theme.primaryColor} 24%, transparent), transparent 28%), radial-gradient(circle at 82% 10%, rgba(255,255,255,0.16), transparent 34%), linear-gradient(145deg, ${theme.secondaryColor} 0%, #111827 58%, ${theme.secondaryColor} 100%)`
      : `radial-gradient(circle at 12% 20%, color-mix(in srgb, ${theme.primaryColor} 24%, transparent), transparent 28%), radial-gradient(circle at 88% 12%, rgba(56, 189, 248, 0.24), transparent 35%), linear-gradient(135deg, #f4efe9 0%, #d8dfef 48%, #bfe8ef 100%)`,
  };
}
