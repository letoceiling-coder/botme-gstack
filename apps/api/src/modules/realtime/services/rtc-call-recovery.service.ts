import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { ActiveCallRegistryService } from './active-call-registry.service';
import { WebRtcSignalService } from './webrtc-signal.service';
import { RtcRedisStoreService } from './rtc-redis-store.service';

export type CallRecoveryRole = 'visitor' | 'operator';

export interface CallRecoveryPayload {
  callSessionId: string;
  workspaceId: string;
  role: CallRecoveryRole;
  exp: number;
  tid: string;
}

const TOKEN_TTL_SEC = 3600;
const MAX_RECOVERY_PER_CALL = 20;

@Injectable()
export class RtcCallRecoveryService {
  private readonly logger = new Logger(RtcCallRecoveryService.name);
  private readonly secret: string;

  constructor(
    private readonly config: ConfigService,
    private readonly registry: ActiveCallRegistryService,
    private readonly webrtc: WebRtcSignalService,
    private readonly redisStore: RtcRedisStoreService,
  ) {
    this.secret =
      this.config.get<string>('RTC_RECOVERY_SECRET') ??
      this.config.get<string>('JWT_ACCESS_SECRET', 'rtc-recovery-fallback');
  }

  issueToken(params: {
    callSessionId: string;
    workspaceId: string;
    role: CallRecoveryRole;
  }): string {
    const payload: CallRecoveryPayload = {
      callSessionId: params.callSessionId,
      workspaceId: params.workspaceId,
      role: params.role,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC,
      tid: randomUUID(),
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', this.secret).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  parseToken(
    token: string,
    expectedRole: CallRecoveryRole,
    workspaceId: string,
  ): CallRecoveryPayload {
    const parts = token.split('.');
    if (parts.length !== 2) throw new ForbiddenException('Invalid recovery token');
    const [body, sig] = parts as [string, string];
    const expected = createHmac('sha256', this.secret).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('Invalid recovery token signature');
    }

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as CallRecoveryPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new ForbiddenException('Recovery token expired');
    }
    if (payload.role !== expectedRole || payload.workspaceId !== workspaceId) {
      throw new ForbiddenException('Recovery token role/workspace mismatch');
    }
    return payload;
  }

  async recoverParticipant(params: {
    token: string;
    role: CallRecoveryRole;
    workspaceId: string;
    socketId: string;
    operatorId?: string;
  }): Promise<{ callSessionId: string; inviteType: 'VOICE' | 'VIDEO'; renegotiate: true }> {
    if (!this.webrtc.isEnabled()) throw new ForbiddenException('RTC отключён');

    const payload = this.parseToken(params.token, params.role, params.workspaceId);
    const attempts = await this.redisStore.incrementRecoveryAttempts(payload.callSessionId);
    if (attempts > MAX_RECOVERY_PER_CALL) {
      throw new ForbiddenException('Too many recovery attempts');
    }

    const call = await this.webrtc.getCallSession(params.workspaceId, payload.callSessionId);
    if (!call || call.status === 'ENDED') {
      throw new ForbiddenException('Call session no longer active');
    }

    const entry = await this.registry.get(payload.callSessionId);
    const inviteType = entry?.inviteType ?? (call.type === 'VOICE' ? 'VOICE' : 'VIDEO');

    if (params.role === 'visitor') {
      await this.registry.bindVisitorSocket(payload.callSessionId, params.socketId);
    } else {
      if (!params.operatorId || (entry?.operatorId && entry.operatorId !== params.operatorId)) {
        throw new ForbiddenException('Operator not authorized for this call');
      }
      await this.registry.bindOperatorSocket(payload.callSessionId, params.socketId, params.operatorId);
    }

    await this.registry.incrementReconnect(payload.callSessionId);
    this.logger.log(`Call recovered call=${payload.callSessionId} role=${params.role}`);

    return { callSessionId: payload.callSessionId, inviteType, renegotiate: true };
  }
}
