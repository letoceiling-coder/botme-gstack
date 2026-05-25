import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { WidgetRepository } from '../../foundation/infrastructure/widget.repository';

@Injectable()
export class OperatorPublicService {
  constructor(
    private readonly widgets: WidgetRepository,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getInit(publicKey: string, origin?: string) {
    const widget = await this.widgets.findActiveByPublicKey(publicKey);
    if (!widget) {
      throw new NotFoundException('Operator key не найден');
    }

    const workspace = await this.prisma.client.workspace.findUnique({
      where: { id: widget.workspaceId },
      select: { name: true, slug: true },
    });

    const agentOrigin = this.config.get<string>('WEB_URL', 'https://agent.neeklo.ru').replace(/\/$/, '');
    const demoOrigin = this.config.get<string>('DEMO_URL', 'https://demo.neeklo.ru').replace(/\/$/, '');
    const panelOrigin =
      origin?.includes('demo.neeklo.ru') || origin?.includes('localhost:5180') ? demoOrigin : agentOrigin;

    return {
      operatorKey: widget.publicKey,
      workspaceId: widget.workspaceId,
      workspaceSlug: workspace?.slug ?? '',
      workspaceName: workspace?.name ?? 'Workspace',
      panelOrigin,
      embedPath: '/operator-panel/',
    };
  }
}
