import { ForbiddenException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID } from 'node:crypto';
import type { CallSession } from '@botme/database';
import type { TurnCredentialsDto } from '@botme/shared';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { ActiveCallRegistryService } from './active-call-registry.service';
import { RtcRedisStoreService } from './rtc-redis-store.service';

const MAX_SDP_LENGTH = 64_000;
const ICE_RATE_LIMIT = 120;
const ICE_WINDOW_MS = 10_000;
const TURN_ISSUE_LIMIT = 500;

@Injectable()
export class WebRtcSignalService {
  private readonly logger = new Logger(WebRtcSignalService.name);
  private readonly rtcEnabled: boolean;
  private readonly turnSecret: string;
  private readonly turnHost: string;
  private readonly iceCounts = new Map<string, { count: number; windowStart: number }>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly registry: ActiveCallRegistryService,
    private readonly redisStore: RtcRedisStoreService,
  ) {
    this.rtcEnabled = this.config.get<string>('FEATURE_RTC_CALLS') === 'true';
    this.turnSecret = this.config.get<string>('TURN_AUTH_SECRET', '');
    this.turnHost = this.config.get<string>('TURN_HOST', 'turn.neeklo.ru');
  }

  isEnabled(): boolean {
    return this.rtcEnabled;
  }

  async createCallSession(
    workspaceId: string,
    visitorSessionId: string,
    operatorId?: string,
    type: 'VOICE' | 'VIDEO' = 'VIDEO',
  ): Promise<CallSession> {
    if (!this.rtcEnabled) throw new ForbiddenException('RTC отключён');
    const visitor = await this.prisma.client.visitorSession.findFirst({
      where: { id: visitorSessionId, workspaceId },
    });
    if (!visitor) throw new ForbiddenException('Visitor session недействителен');

    const call = await this.prisma.client.callSession.create({
      data: {
        workspaceId,
        visitorSessionId,
        operatorId,
        status: 'INVITED',
        type,
      },
      include: { visitorSession: true },
    });

    await this.registry.register({
      callSessionId: call.id,
      workspaceId,
      visitorSessionId,
      operatorId,
      visitorSocketId: visitor.socketId,
      status: 'INVITED',
      inviteType: type,
    });

    return call;
  }

  getCallSession(workspaceId: string, callSessionId: string): Promise<(CallSession & { visitorSession: { socketId: string | null } | null }) | null> {
    return this.prisma.client.callSession.findFirst({
      where: { id: callSessionId, workspaceId },
      include: { visitorSession: true },
    });
  }

  async issueTurnCredentials(workspaceId: string): Promise<TurnCredentialsDto | null> {
    if (!this.rtcEnabled || !this.turnSecret) {
      this.logger.warn(
        `issueTurnCredentials: disabled (rtcEnabled=${this.rtcEnabled}, hasSecret=${Boolean(this.turnSecret)})`,
      );
      return null;
    }
    const issued = await this.redisStore.incrementTurnIssued(workspaceId);
    if (issued > TURN_ISSUE_LIMIT) {
      throw new HttpException('TURN credential rate limit', HttpStatus.TOO_MANY_REQUESTS);
    }
    const ttlSec = 86400;
    const username = `${Math.floor(Date.now() / 1000) + ttlSec}`;
    const credential = createHmac('sha1', this.turnSecret).update(username).digest('base64');
    // CRITICAL: STUN and TURN URLs MUST live in SEPARATE RTCIceServer entries.
    // A single entry that mixes a stun: URL with username/credential is invalid
    // per W3C spec and Chrome/Safari silently discard the entire entry.
    const iceServers: TurnCredentialsDto['iceServers'] = [
      { urls: `stun:${this.turnHost}:3478` },
      {
        urls: [
          `turn:${this.turnHost}:3478?transport=udp`,
          `turn:${this.turnHost}:3478?transport=tcp`,
        ],
        username,
        credential,
      },
    ];
    this.logger.debug(
      `TURN_ISSUE ws=${workspaceId} user=${username} ttl=${ttlSec}s host=${this.turnHost}`,
    );
    return { iceServers, username, credential, ttlSec };
  }

  async validateSignal(params: {
    workspaceId: string;
    operatorId?: string;
    callSessionId: string;
    type: string;
    sdp?: string;
    candidate?: unknown;
  }): Promise<void> {
    const session = await this.prisma.client.callSession.findFirst({
      where: { id: params.callSessionId, workspaceId: params.workspaceId },
    });
    if (!session) throw new ForbiddenException('Недопустимая call session');
    if (session.status === 'ENDED') throw new ForbiddenException('Call session завершена');
    if (params.operatorId && session.operatorId && session.operatorId !== params.operatorId) {
      throw new ForbiddenException('Call session принадлежит другому оператору');
    }

    if (params.sdp) this.assertSafeSdp(params.sdp);
    if (params.type === 'ice') this.assertIceRateLimit(params.callSessionId);

    this.logger.debug(`CALL_SIGNAL call=${params.callSessionId} type=${params.type} id=${randomUUID()}`);
  }

  /** @deprecated use RtcSignalRelayService — kept for backwards compat */
  async relaySignal(params: {
    workspaceId: string;
    operatorId: string;
    callSessionId: string;
    type: string;
    sdp?: string;
    candidate?: unknown;
  }) {
    await this.validateSignal(params);
    return { ok: true as const, callSessionId: params.callSessionId, type: params.type };
  }

  private assertSafeSdp(sdp: string): void {
    if (sdp.length > MAX_SDP_LENGTH) {
      throw new ForbiddenException('SDP слишком большой');
    }
    const lowered = sdp.toLowerCase();
    if (lowered.includes('a=candidate:') && lowered.split('a=candidate:').length > 64) {
      throw new ForbiddenException('SDP injection: слишком много candidates');
    }
  }

  private assertIceRateLimit(callSessionId: string): void {
    const now = Date.now();
    const entry = this.iceCounts.get(callSessionId);
    if (!entry || now - entry.windowStart > ICE_WINDOW_MS) {
      this.iceCounts.set(callSessionId, { count: 1, windowStart: now });
      return;
    }
    entry.count += 1;
    if (entry.count > ICE_RATE_LIMIT) {
      throw new HttpException('ICE flood protection', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
