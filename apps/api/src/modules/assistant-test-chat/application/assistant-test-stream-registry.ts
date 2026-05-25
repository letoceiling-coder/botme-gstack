import { Injectable } from '@nestjs/common';

interface StreamEntry {
  controller: AbortController;
  conversationId: string;
  userId: string;
  socketId: string;
}

@Injectable()
export class AssistantTestStreamRegistry {
  private readonly streams = new Map<string, StreamEntry>();
  private readonly byConversation = new Map<string, string>();

  register(
    streamId: string,
    conversationId: string,
    userId: string,
    socketId: string,
  ): AbortController {
    this.cancelByConversation(conversationId);
    const controller = new AbortController();
    this.streams.set(streamId, { controller, conversationId, userId, socketId });
    this.byConversation.set(conversationId, streamId);
    return controller;
  }

  hasActive(conversationId: string): boolean {
    return this.byConversation.has(conversationId);
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

  cancelAllForUser(userId: string): number {
    let count = 0;
    for (const [streamId, entry] of this.streams) {
      if (entry.userId === userId && this.cancel(streamId)) count++;
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
}
