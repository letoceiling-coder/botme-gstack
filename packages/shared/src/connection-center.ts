import { z } from 'zod';

export const HealthStatusSchema = z.enum(['online', 'degraded', 'offline']);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export interface HealthCheckItemDto {
  id: string;
  label: string;
  status: HealthStatus;
  detail: string;
  checkedAt: string;
}

export interface OperatorUrlsDto {
  adminOperatorUrl: string;
  operatorPanelUrl: string;
  operatorEmbedPath: string;
  operatorJsUrl: string;
  operatorRuntimeUrl: string;
  standaloneOperatorUrl: string;
  websocketUrl: string;
  widgetJsUrl: string;
}

export interface WorkspaceAccessSummaryDto {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  widgetId: string;
  widgetName: string;
  assistantId: string;
  assistantName: string;
  isActive: boolean;
  rtcEnabled: boolean;
  domains: string[];
}

export interface SelfHostConfigDto {
  widgetJsUrl: string;
  operatorJsUrl: string;
  operatorRuntimePackagePath: string;
  websocketUrl: string;
  rtcSignalingPath: string;
  turnHost: string;
  turnUdp: string;
  turnTcp: string;
  permissionsPolicyExample: string;
  nginxSnippet: string;
  operatorNginxSnippet: string;
  cspExample: string;
}

export interface WidgetConnectionHealthDto {
  overall: HealthStatus;
  checks: HealthCheckItemDto[];
  operatorSocketsOnline: number;
  widgetSocketsOnline: number;
}

export interface OperatorRuntimeTokenDto {
  id: string;
  name: string;
  tokenPrefix: string;
  allowedDomains: string[];
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  /** Returned only once on create */
  plainToken?: string;
}

export interface OperatorEmbedIntegrationDto {
  id: string;
  label: string;
  language: string;
  code: string;
}

export interface OperatorConnectionCenterDto {
  standaloneUrl: string;
  runtimeUrl: string;
  operatorJsUrl: string;
  iframeEmbedCode: string;
  scriptEmbedCode: string;
  integrations: OperatorEmbedIntegrationDto[];
  activeToken: OperatorRuntimeTokenDto | null;
  allowedDomains: string[];
}

export interface WidgetConnectionCenterDto {
  access: WorkspaceAccessSummaryDto;
  operatorUrls: OperatorUrlsDto;
  operatorEmbed: OperatorConnectionCenterDto;
  selfHost: SelfHostConfigDto;
  health: WidgetConnectionHealthDto;
  embedCode: string;
  installSteps: string[];
}

export const CreateOperatorRuntimeTokenSchema = z.object({
  name: z.string().min(1).max(120),
  allowedDomains: z.array(z.string().min(1)).default([]),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

export type CreateOperatorRuntimeTokenInput = z.infer<typeof CreateOperatorRuntimeTokenSchema>;

export const UpdateOperatorRuntimeTokenSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  allowedDomains: z.array(z.string().min(1)).optional(),
});

export type UpdateOperatorRuntimeTokenInput = z.infer<typeof UpdateOperatorRuntimeTokenSchema>;

export const ExchangeOperatorRuntimeSessionSchema = z.object({
  token: z.string().min(10),
  workspaceId: z.string().cuid().optional(),
});

export type ExchangeOperatorRuntimeSessionInput = z.infer<typeof ExchangeOperatorRuntimeSessionSchema>;

export interface OperatorRuntimeSessionDto {
  accessToken: string;
  expiresIn: number;
  user: { id: string; email: string; name: string | null };
  workspace: { id: string; name: string; slug: string; role: 'OPERATOR' };
}
