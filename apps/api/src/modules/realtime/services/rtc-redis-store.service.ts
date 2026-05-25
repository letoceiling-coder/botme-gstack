import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../core/redis/redis.service';

const CALL_TTL_SEC = 7200;

export interface RedisCallEntry {
  callSessionId: string;
  workspaceId: string;
  visitorSessionId: string;
  operatorId: string | null;
  visitorSocketId: string | null;
  operatorSocketId: string | null;
  status: string;
  iceState: string | null;
  reconnectCount: number;
  usingTurn: boolean;
  startedAt: number | null;
  lastSignalAt: number;
  inviteType?: 'VOICE' | 'VIDEO';
}

/** Redis-backed RTC state — shared across PM2 instances. */
@Injectable()
export class RtcRedisStoreService {
  constructor(private readonly redis: RedisService) {}

  private callKey(id: string): string {
    return `rtc:call:${id}`;
  }

  private wsCallsKey(workspaceId: string): string {
    return `rtc:ws:${workspaceId}:calls`;
  }

  private seqKey(callSessionId: string): string {
    return `rtc:seq:${callSessionId}`;
  }

  async saveCall(entry: RedisCallEntry): Promise<void> {
    await this.redis.client.setex(this.callKey(entry.callSessionId), CALL_TTL_SEC, JSON.stringify(entry));
    await this.redis.client.sadd(this.wsCallsKey(entry.workspaceId), entry.callSessionId);
    await this.redis.client.expire(this.wsCallsKey(entry.workspaceId), CALL_TTL_SEC);
  }

  async getCall(callSessionId: string): Promise<RedisCallEntry | null> {
    const raw = await this.redis.client.get(this.callKey(callSessionId));
    if (!raw) return null;
    return JSON.parse(raw) as RedisCallEntry;
  }

  async patchCall(callSessionId: string, patch: Partial<RedisCallEntry>): Promise<RedisCallEntry | null> {
    const entry = await this.getCall(callSessionId);
    if (!entry) return null;
    const next = { ...entry, ...patch, callSessionId };
    await this.saveCall(next);
    return next;
  }

  async deleteCall(callSessionId: string, workspaceId: string): Promise<void> {
    await this.redis.client.del(this.callKey(callSessionId));
    await this.redis.client.srem(this.wsCallsKey(workspaceId), callSessionId);
    await this.redis.client.del(this.seqKey(callSessionId));
  }

  async nextSignalSequence(callSessionId: string): Promise<number> {
    const n = await this.redis.client.incr(this.seqKey(callSessionId));
    await this.redis.client.expire(this.seqKey(callSessionId), CALL_TTL_SEC);
    return n;
  }

  async listWorkspaceCallIds(workspaceId: string): Promise<string[]> {
    return this.redis.client.smembers(this.wsCallsKey(workspaceId));
  }

  async markSignalSeen(callSessionId: string, signalId: string, ttlSec = 60): Promise<boolean> {
    const key = `rtc:seen:${callSessionId}:${signalId}`;
    const result = await this.redis.client.set(key, '1', 'EX', ttlSec, 'NX');
    return result === 'OK';
  }

  async incrementTurnIssued(workspaceId: string, windowSec = 3600): Promise<number> {
    const key = `rtc:turn:${workspaceId}:${Math.floor(Date.now() / (windowSec * 1000))}`;
    const n = await this.redis.client.incr(key);
    await this.redis.client.expire(key, windowSec);
    return n;
  }

  async incrementRecoveryAttempts(callSessionId: string, windowSec = 300): Promise<number> {
    const key = `rtc:recover:${callSessionId}`;
    const n = await this.redis.client.incr(key);
    if (n === 1) await this.redis.client.expire(key, windowSec);
    return n;
  }

  private lastOfferKey(callSessionId: string): string {
    return `rtc:last-offer:${callSessionId}`;
  }

  async saveLastOffer(callSessionId: string, sdp: string): Promise<void> {
    await this.redis.client.setex(this.lastOfferKey(callSessionId), CALL_TTL_SEC, sdp);
  }

  async getLastOffer(callSessionId: string): Promise<string | null> {
    return this.redis.client.get(this.lastOfferKey(callSessionId));
  }

  async clearLastOffer(callSessionId: string): Promise<void> {
    await this.redis.client.del(this.lastOfferKey(callSessionId));
  }

  private lastAnswerKey(callSessionId: string): string {
    return `rtc:last-answer:${callSessionId}`;
  }

  async saveLastAnswer(callSessionId: string, sdp: string): Promise<void> {
    await this.redis.client.setex(this.lastAnswerKey(callSessionId), CALL_TTL_SEC, sdp);
  }

  async getLastAnswer(callSessionId: string): Promise<string | null> {
    return this.redis.client.get(this.lastAnswerKey(callSessionId));
  }

  async clearLastAnswer(callSessionId: string): Promise<void> {
    await this.redis.client.del(this.lastAnswerKey(callSessionId));
  }
}
