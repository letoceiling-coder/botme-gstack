import { Injectable } from '@nestjs/common';

interface ActiveStream {
  controller: AbortController;
  sessionId: string;
  userId: string;
  workspaceId: string;
}

@Injectable()
export class StreamRegistry {
  private readonly streams = new Map<string, ActiveStream>();

  register(
    streamId: string,
    sessionId: string,
    userId: string,
    workspaceId: string,
  ): AbortController {
    this.cancel(streamId);
    const controller = new AbortController();
    this.streams.set(streamId, { controller, sessionId, userId, workspaceId });
    return controller;
  }

  cancel(streamId: string): boolean {
    const entry = this.streams.get(streamId);
    if (!entry) return false;
    entry.controller.abort();
    this.streams.delete(streamId);
    return true;
  }

  cancelBySession(sessionId: string): number {
    let count = 0;
    for (const [id, entry] of this.streams) {
      if (entry.sessionId === sessionId) {
        entry.controller.abort();
        this.streams.delete(id);
        count++;
      }
    }
    return count;
  }

  cancelAllForSocket(userId: string, workspaceId: string): number {
    let count = 0;
    for (const [id, entry] of this.streams) {
      if (entry.userId === userId && entry.workspaceId === workspaceId) {
        entry.controller.abort();
        this.streams.delete(id);
        count++;
      }
    }
    return count;
  }

  get(streamId: string): ActiveStream | undefined {
    return this.streams.get(streamId);
  }

  remove(streamId: string): void {
    this.streams.delete(streamId);
  }

  count(): number {
    return this.streams.size;
  }
}
