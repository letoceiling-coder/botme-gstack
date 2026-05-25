import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

export interface WidgetPreviewTokenPayload {
  type: 'widget_preview';
  widgetId: string;
  workspaceId: string;
  publicKey: string;
  userId: string;
}

export interface WidgetPreviewSessionDto {
  previewUrl: string;
  previewToken: string;
  expiresAt: string;
  previewOriginTrusted: true;
}

@Injectable()
export class WidgetPreviewTokenService {
  private readonly trustedOrigins: Set<string>;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    const fromEnv = this.config.get<string>('WIDGET_TRUSTED_PREVIEW_ORIGINS', '');
    const defaults = ['agent.neeklo.ru', 'localhost', '127.0.0.1'];
    const hostnames = fromEnv
      ? fromEnv.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)
      : defaults;
    this.trustedOrigins = new Set(hostnames);
  }

  isTrustedPreviewOrigin(origin: string | undefined): boolean {
    if (!origin) return false;
    try {
      const hostname = new URL(origin).hostname.toLowerCase();
      return this.trustedOrigins.has(hostname);
    } catch {
      return false;
    }
  }

  issue(params: {
    widgetId: string;
    workspaceId: string;
    publicKey: string;
    userId: string;
    appOrigin: string;
  }): WidgetPreviewSessionDto {
    const ttlSec = 900;
    const payload: WidgetPreviewTokenPayload = {
      type: 'widget_preview',
      widgetId: params.widgetId,
      workspaceId: params.workspaceId,
      publicKey: params.publicKey,
      userId: params.userId,
    };
    const previewToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: ttlSec,
    });
    const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();
    const base = params.appOrigin.replace(/\/$/, '');
    const previewUrl = `${base}/widget/?widgetKey=${encodeURIComponent(params.publicKey)}&previewToken=${encodeURIComponent(previewToken)}&previewOriginTrusted=1`;
    return { previewUrl, previewToken, expiresAt, previewOriginTrusted: true };
  }

  verify(previewToken: string, publicKey: string, origin: string | undefined): WidgetPreviewTokenPayload {
    if (!this.isTrustedPreviewOrigin(origin)) {
      throw new UnauthorizedException('Preview origin не доверен');
    }
    let payload: WidgetPreviewTokenPayload;
    try {
      payload = this.jwt.verify<WidgetPreviewTokenPayload>(previewToken, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Недействительный preview token');
    }
    if (payload.type !== 'widget_preview' || payload.publicKey !== publicKey.trim()) {
      throw new UnauthorizedException('Preview token не соответствует виджету');
    }
    return payload;
  }
}
