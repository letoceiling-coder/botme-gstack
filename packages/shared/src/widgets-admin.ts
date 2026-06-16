import { z } from 'zod';

export const WidgetDesignPresetSchema = z.enum([
  'neeklo',
  'telegram',
  'whatsapp',
  'imessage',
  'messenger',
  'slack',
  'instagram',
  'minimal-light',
  'midnight',
  'glass',
]);

export const LauncherConfigSchema = z.object({
  designPreset: WidgetDesignPresetSchema.default('neeklo'),
  primaryColor: z.string().max(20).default('#39ff14'),
  secondaryColor: z.string().max(20).default('#1a1a2e'),
  textColor: z.string().max(20).default('#fafafa'),
  launcherPosition: z.enum(['bottom-right', 'bottom-left']).default('bottom-right'),
  /** @deprecated use launcherPosition */
  position: z.enum(['bottom-right', 'bottom-left']).optional(),
  borderRadius: z.number().int().min(0).max(32).default(16),
  avatarUrl: z.string().url().optional().or(z.literal('')),
  launcherIcon: z.string().max(10).default('💬'),
  launcherIconUrl: z.string().url().optional().or(z.literal('')),
  welcomeMessage: z.string().max(500).optional(),
  widgetTitle: z.string().max(120).optional(),
  typingColor: z.string().max(20).default('#71717a'),
  bubbleUserColor: z.string().max(40).default('rgba(57, 255, 20, 0.15)'),
  bubbleAssistantColor: z.string().max(40).default('rgba(255, 255, 255, 0.06)'),
  fullscreenMobile: z.boolean().default(true),
  darkMode: z.boolean().default(true),
  compactMode: z.boolean().default(false),
  iframeWidth: z.number().int().min(280).max(900).default(380),
  iframeHeight: z.number().int().min(320).max(900).default(520),
  animations: z.boolean().default(true),
  /** Quick-reply chips on the welcome screen (empty = hidden). */
  quickActions: z.array(z.string().min(1).max(80)).max(8).default([]),
});

export const CreateWidgetSchema = z.object({
  name: z.string().min(1).max(120),
  assistantId: z.string().cuid(),
  domains: z.array(z.string().min(1).max(253)).min(1),
  launcherConfig: LauncherConfigSchema.optional(),
});

export const UpdateWidgetSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  assistantId: z.string().cuid().optional(),
  isActive: z.boolean().optional(),
  launcherConfig: LauncherConfigSchema.optional(),
});

export const UpdateWidgetDomainsSchema = z.object({
  domains: z.array(z.string().min(1).max(253)).min(1),
});

export type LauncherConfig = z.infer<typeof LauncherConfigSchema>;
export type WidgetDesignPreset = z.infer<typeof WidgetDesignPresetSchema>;
export type CreateWidgetInput = z.infer<typeof CreateWidgetSchema>;
export type UpdateWidgetInput = z.infer<typeof UpdateWidgetSchema>;

export const DEFAULT_LAUNCHER_CONFIG: LauncherConfig = LauncherConfigSchema.parse({});

export interface WidgetDesignPresetOption {
  id: WidgetDesignPreset;
  name: string;
  description: string;
  config: LauncherConfig;
}

const preset = (
  id: WidgetDesignPreset,
  name: string,
  description: string,
  config: Partial<LauncherConfig>,
): WidgetDesignPresetOption => ({
  id,
  name,
  description,
  config: LauncherConfigSchema.parse({ ...config, designPreset: id }),
});

export const WIDGET_DESIGN_PRESETS: WidgetDesignPresetOption[] = [
  preset('neeklo', 'Neeklo Neon', 'Фирменный тёмный виджет с неоновым акцентом.', {
    primaryColor: '#22d3ee',
    secondaryColor: '#111827',
    textColor: '#fafafa',
    launcherIcon: 'N',
    bubbleUserColor: 'rgba(34, 211, 238, 0.2)',
    bubbleAssistantColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: 18,
    darkMode: true,
  }),
  preset('telegram', 'Telegram', 'Чистый синий интерфейс в духе Telegram.', {
    primaryColor: '#2aabee',
    secondaryColor: '#17212b',
    textColor: '#f8fafc',
    launcherIcon: '✈',
    bubbleUserColor: '#2b5278',
    bubbleAssistantColor: '#182533',
    borderRadius: 16,
    darkMode: true,
  }),
  preset('whatsapp', 'WhatsApp', 'Зелёные сообщения и мягкие карточки.', {
    primaryColor: '#25d366',
    secondaryColor: '#0b141a',
    textColor: '#f0f2f5',
    launcherIcon: '☎',
    bubbleUserColor: '#005c4b',
    bubbleAssistantColor: '#202c33',
    borderRadius: 18,
    darkMode: true,
  }),
  preset('imessage', 'iMessage', 'Светлый минимализм с синими bubble.', {
    primaryColor: '#0a84ff',
    secondaryColor: '#f5f5f7',
    textColor: '#111827',
    launcherIcon: '💬',
    bubbleUserColor: '#0a84ff',
    bubbleAssistantColor: '#e5e5ea',
    borderRadius: 22,
    darkMode: false,
  }),
  preset('messenger', 'Messenger', 'Градиентный сине-фиолетовый стиль.', {
    primaryColor: '#0084ff',
    secondaryColor: '#101827',
    textColor: '#ffffff',
    launcherIcon: '⚡',
    bubbleUserColor: '#0084ff',
    bubbleAssistantColor: '#262f3f',
    borderRadius: 20,
    darkMode: true,
  }),
  preset('slack', 'Slack', 'Деловой стиль с фиолетовым акцентом.', {
    primaryColor: '#611f69',
    secondaryColor: '#1d1c1d',
    textColor: '#f8fafc',
    launcherIcon: '#',
    bubbleUserColor: '#1264a3',
    bubbleAssistantColor: '#2b2a2b',
    borderRadius: 12,
    darkMode: true,
  }),
  preset('instagram', 'Instagram', 'Яркий social-style градиент.', {
    primaryColor: '#e1306c',
    secondaryColor: '#120816',
    textColor: '#ffffff',
    launcherIcon: '◎',
    bubbleUserColor: '#833ab4',
    bubbleAssistantColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 24,
    darkMode: true,
  }),
  preset('minimal-light', 'Minimal Light', 'Лёгкий светлый дизайн для B2B сайтов.', {
    primaryColor: '#2563eb',
    secondaryColor: '#ffffff',
    textColor: '#111827',
    launcherIcon: '?',
    bubbleUserColor: '#2563eb',
    bubbleAssistantColor: '#f3f4f6',
    borderRadius: 14,
    darkMode: false,
  }),
  preset('midnight', 'Midnight Pro', 'Строгий тёмный виджет с синим акцентом.', {
    primaryColor: '#6366f1',
    secondaryColor: '#050816',
    textColor: '#e5e7eb',
    launcherIcon: 'AI',
    bubbleUserColor: 'rgba(99, 102, 241, 0.28)',
    bubbleAssistantColor: 'rgba(15, 23, 42, 0.9)',
    borderRadius: 16,
    darkMode: true,
  }),
  preset('glass', 'Glassmorphism', 'Полупрозрачные панели с мягким свечением.', {
    primaryColor: '#38bdf8',
    secondaryColor: '#0f172a',
    textColor: '#f8fafc',
    launcherIcon: '✦',
    bubbleUserColor: 'rgba(56, 189, 248, 0.22)',
    bubbleAssistantColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 24,
    darkMode: true,
  }),
];

export interface WidgetDto {
  id: string;
  name: string;
  publicKey: string;
  assistantId: string;
  assistantName: string;
  assistantStatus: string;
  assistantIsActive: boolean;
  isActive: boolean;
  domains: string[];
  launcherConfig: LauncherConfig | null;
  conversationCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WidgetDetailDto extends WidgetDto {
  embedCode: string;
  installGuide: string[];
}

export interface WidgetPreviewSessionDto {
  previewUrl: string;
  previewToken: string;
  expiresAt: string;
  previewOriginTrusted: true;
}
