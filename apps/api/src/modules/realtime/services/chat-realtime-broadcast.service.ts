import { Injectable } from '@nestjs/common';
import type { WidgetMessageDto } from '@botme/shared';
import { OperatorSocketBridge } from './operator-socket-bridge.service';
import { AdminSocketBridge } from './admin-socket-bridge.service';
import { LiveVisitorTrackerService } from './live-visitor-tracker.service';

/** Fan-out chat events to operator + admin namespaces with dedupe-friendly dual emit. */
@Injectable()
export class ChatRealtimeBroadcastService {
  constructor(
    private readonly operatorBridge: OperatorSocketBridge,
    private readonly adminBridge: AdminSocketBridge,
    private readonly visitors: LiveVisitorTrackerService,
  ) {}

  broadcastMessage(workspaceId: string, conversationId: string, message: WidgetMessageDto): void {
    const payload = { conversationId, message };
    this.operatorBridge.emitToWorkspace(workspaceId, 'operator:new-message', payload);
    this.adminBridge.emitNewMessage(workspaceId, payload);
  }

  async refreshVisitorList(workspaceId: string): Promise<void> {
    const live = await this.visitors.listLive(workspaceId);
    this.operatorBridge.emitToWorkspace(workspaceId, 'operator:visitors', { visitors: live });
    this.adminBridge.emitVisitorList(workspaceId, { visitors: live });
  }
}
