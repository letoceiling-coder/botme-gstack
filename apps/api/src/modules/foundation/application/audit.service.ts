import { Injectable } from '@nestjs/common';
import { AuditRepository, type AuditEntryInput } from '../infrastructure/audit.repository';

@Injectable()
export class AuditService {
  constructor(private readonly repo: AuditRepository) {}

  logIntegrationCreated(
    workspaceId: string,
    userId: string,
    integrationId: string,
    metadata: Record<string, unknown>,
    ip?: string,
  ): Promise<void> {
    return this.write({
      workspaceId,
      userId,
      action: 'integration.created',
      resource: 'AiIntegration',
      resourceId: integrationId,
      metadata,
      ip,
    });
  }

  logIntegrationUpdated(
    workspaceId: string,
    userId: string,
    integrationId: string,
    metadata: Record<string, unknown>,
    ip?: string,
  ): Promise<void> {
    return this.write({
      workspaceId,
      userId,
      action: 'integration.updated',
      resource: 'AiIntegration',
      resourceId: integrationId,
      metadata,
      ip,
    });
  }

  logIntegrationDeleted(
    workspaceId: string,
    userId: string,
    integrationId: string,
    metadata: Record<string, unknown>,
    ip?: string,
  ): Promise<void> {
    return this.write({
      workspaceId,
      userId,
      action: 'integration.deleted',
      resource: 'AiIntegration',
      resourceId: integrationId,
      metadata,
      ip,
    });
  }

  logAgentPromptVersion(
    workspaceId: string,
    userId: string,
    agentId: string,
    version: number,
    ip?: string,
  ): Promise<void> {
    return this.write({
      workspaceId,
      userId,
      action: 'agent.prompt_version.created',
      resource: 'Agent',
      resourceId: agentId,
      metadata: { version },
      ip,
    });
  }

  logAgentPromptActivated(
    workspaceId: string,
    userId: string,
    agentId: string,
    version: number,
    ip?: string,
  ): Promise<void> {
    return this.write({
      workspaceId,
      userId,
      action: 'agent.prompt_version.activated',
      resource: 'Agent',
      resourceId: agentId,
      metadata: { version },
      ip,
    });
  }

  logWidgetDomainChange(
    workspaceId: string,
    userId: string,
    widgetId: string,
    metadata: Record<string, unknown>,
    ip?: string,
  ): Promise<void> {
    return this.write({
      workspaceId,
      userId,
      action: 'widget.domains.updated',
      resource: 'WidgetInstance',
      resourceId: widgetId,
      metadata,
      ip,
    });
  }

  private async write(input: AuditEntryInput): Promise<void> {
    await this.repo.append(input);
  }
}
