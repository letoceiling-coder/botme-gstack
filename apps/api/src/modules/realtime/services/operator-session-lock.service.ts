import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';

const LOCK_TTL_MS = 30 * 60_000;

@Injectable()
export class OperatorSessionLockService {
  constructor(private readonly prisma: PrismaService) {}

  async acquire(workspaceId: string, conversationId: string, operatorId: string) {
    await this.releaseExpired();
    const existing = await this.prisma.client.operatorSessionLock.findUnique({
      where: { workspaceId_conversationId: { workspaceId, conversationId } },
    });
    if (existing && existing.expiresAt > new Date() && existing.operatorId !== operatorId) {
      throw new ConflictException('Сессия уже занята другим оператором');
    }
    const expiresAt = new Date(Date.now() + LOCK_TTL_MS);
    return this.prisma.client.operatorSessionLock.upsert({
      where: { workspaceId_conversationId: { workspaceId, conversationId } },
      create: { workspaceId, conversationId, operatorId, expiresAt },
      update: { operatorId, lockedAt: new Date(), expiresAt },
    });
  }

  async release(workspaceId: string, conversationId: string, operatorId: string) {
    await this.prisma.client.operatorSessionLock.deleteMany({
      where: { workspaceId, conversationId, operatorId },
    });
  }

  async releaseExpired(): Promise<number> {
    const result = await this.prisma.client.operatorSessionLock.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }
}
