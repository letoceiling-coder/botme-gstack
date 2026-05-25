import { Injectable } from '@nestjs/common';
import type { Namespace } from 'socket.io';
import type { RtcDiagnosticsExtendedDto } from '@botme/shared';

@Injectable()
export class AdminSocketBridge {
  private server: Namespace | null = null;

  attach(server: Namespace | import('socket.io').Server): void {
    this.server = server as Namespace;
  }

  emitRtcDiagnostics(workspaceId: string, payload: RtcDiagnosticsExtendedDto): boolean {
    if (!this.server) return false;
    this.server.to(`workspace:${workspaceId}`).emit('admin:rtc-diagnostics', payload);
    return true;
  }

  emitNewMessage(
    workspaceId: string,
    payload: { conversationId: string; message: import('@botme/shared').WidgetMessageDto },
  ): boolean {
    if (!this.server) return false;
    this.server.to(`workspace:${workspaceId}`).emit('admin:new-message', payload);
    return true;
  }

  emitVisitorList(workspaceId: string, payload: { visitors: import('@botme/shared').LiveVisitorDto[] }): boolean {
    if (!this.server) return false;
    this.server.to(`workspace:${workspaceId}`).emit('admin:operator-visitors', payload);
    return true;
  }

  emitPeerReconnected(
    workspaceId: string,
    callSessionId: string,
    payload: { role: 'visitor' | 'operator'; callSessionId: string },
  ): boolean {
    if (!this.server) return false;
    this.server.to(`call:${callSessionId}`).emit('webrtc:peer-reconnected', payload);
    return true;
  }
}
