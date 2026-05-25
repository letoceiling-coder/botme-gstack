import { z } from 'zod';

export const LauncherConfigSchema = z.object({
  primaryColor: z.string().max(20).default('#39ff14'),
  secondaryColor: z.string().max(20).default('#1a1a2e'),
  textColor: z.string().max(20).default('#fafafa'),
  launcherPosition: z.enum(['bottom-right', 'bottom-left']).default('bottom-right'),
  /** @deprecated use launcherPosition */
  position: z.enum(['bottom-right', 'bottom-left']).optional(),
  borderRadius: z.number().int().min(0).max(32).default(16),
  avatarUrl: z.string().url().optional().or(z.literal('')),
  launcherIcon: z.string().max(10).default('💬'),
  welcomeMessage: z.string().max(500).optional(),
  widgetTitle: z.string().max(120).optional(),
  typingColor: z.string().max(20).default('#71717a'),
  bubbleUserColor: z.string().max(40).default('rgba(57, 255, 20, 0.15)'),
  bubbleAssistantColor: z.string().max(40).default('rgba(255, 255, 255, 0.06)'),
  fullscreenMobile: z.boolean().default(true),
  darkMode: z.boolean().default(true),
  compactMode: z.boolean().default(false),
  iframeWidth: z.number().int().min(280).max(600).default(380),
  iframeHeight: z.number().int().min(320).max(800).default(520),
  animations: z.boolean().default(true),
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
export type CreateWidgetInput = z.infer<typeof CreateWidgetSchema>;
export type UpdateWidgetInput = z.infer<typeof UpdateWidgetSchema>;

export const DEFAULT_LAUNCHER_CONFIG: LauncherConfig = LauncherConfigSchema.parse({});

export interface WidgetDto {
  id: string;
  name: string;
  publicKey: string;
  assistantId: string;
  assistantName: string;
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
