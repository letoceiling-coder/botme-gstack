import { Injectable } from '@nestjs/common';

interface WidgetStreamEntry {
  controller: AbortController;
  conversationId: string;
  visitorId: string;
  widgetId: string;
  socketId: string;
}

@Injectable()
export class WidgetStreamRegistry {
  private readonly streams = new Map<string, WidgetStreamEntry>();
  private readonly byConversation = new Map<string, string>();

  register(
    streamId: string,
    conversationId: string,
    visitorId: string,
    widgetId: string,
    socketId: string,
  ): AbortController {
    this.cancelByConversation(conversationId);
    const controller = new AbortController();
    this.streams.set(streamId, {
      controller,
      conversationId,
      visitorId,
      widgetId,
      socketId,
    });
    this.byConversation.set(conversationId, streamId);
    return controller;
  }

  hasActive(conversationId: string): boolean {
    return this.byConversation.has(conversationId);
  }

  getActiveStreamId(conversationId: string): string | undefined {
    return this.byConversation.get(conversationId);
  }

  cancel(streamId: string): boolean {
    const entry = this.streams.get(streamId);
    if (!entry) return false;
    entry.controller.abort();
    this.streams.delete(streamId);
    if (this.byConversation.get(entry.conversationId) === streamId) {
      this.byConversation.delete(entry.conversationId);
    }
    return true;
  }

  cancelByConversation(conversationId: string): number {
    const streamId = this.byConversation.get(conversationId);
    if (!streamId) return 0;
    return this.cancel(streamId) ? 1 : 0;
  }

  cancelAllForSocket(socketId: string): number {
    let count = 0;
    for (const [streamId, entry] of this.streams) {
      if (entry.socketId === socketId) {
        if (this.cancel(streamId)) count++;
      }
    }
    return count;
  }

  remove(streamId: string): void {
    const entry = this.streams.get(streamId);
    this.streams.delete(streamId);
    if (entry && this.byConversation.get(entry.conversationId) === streamId) {
      this.byConversation.delete(entry.conversationId);
    }
  }

  count(): number {
    return this.streams.size;
  }
}
