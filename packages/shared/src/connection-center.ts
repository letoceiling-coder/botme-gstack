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
  websocketUrl: string;
  rtcSignalingPath: string;
  turnHost: string;
  turnUdp: string;
  turnTcp: string;
  permissionsPolicyExample: string;
  nginxSnippet: string;
  cspExample: string;
}

export interface WidgetConnectionHealthDto {
  overall: HealthStatus;
  checks: HealthCheckItemDto[];
  operatorSocketsOnline: number;
  widgetSocketsOnline: number;
}

export interface WidgetConnectionCenterDto {
  access: WorkspaceAccessSummaryDto;
  operatorUrls: OperatorUrlsDto;
  selfHost: SelfHostConfigDto;
  health: WidgetConnectionHealthDto;
  embedCode: string;
  installSteps: string[];
}
