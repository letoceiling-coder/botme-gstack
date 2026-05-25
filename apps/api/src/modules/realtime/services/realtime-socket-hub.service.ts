import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import { WS_NAMESPACES } from '@botme/shared';

/** Holds root Socket.IO server for cross-namespace RTC relay. */
@Injectable()
export class RealtimeSocketHub {
  private server: Server | null = null;

  attach(server: Server): void {
    this.server = server;
  }

  getServer(): Server | null {
    return this.server;
  }

  widgetNamespace() {
    return this.server?.of(WS_NAMESPACES.widget) ?? null;
  }

  operatorNamespace() {
    return this.server?.of(WS_NAMESPACES.operator) ?? null;
  }
}
