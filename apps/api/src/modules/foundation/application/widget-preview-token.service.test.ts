import { describe, expect, it, vi, beforeEach } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WidgetPreviewTokenService } from './widget-preview-token.service';
import { WidgetAuthService } from './widget-auth.service';
import type { WidgetRepository } from '../infrastructure/widget.repository';

describe('WidgetPreviewTokenService', () => {
  const secret = 'test-secret-key-for-preview-tokens!!';
  let service: WidgetPreviewTokenService;

  beforeEach(() => {
    const jwt = new JwtService({ secret });
    const config = {
      get: (key: string, def?: string) => {
        if (key === 'JWT_ACCESS_SECRET') return secret;
        if (key === 'WIDGET_TRUSTED_PREVIEW_ORIGINS') return 'agent.neeklo.ru,localhost';
        return def;
      },
    } as ConfigService;
    service = new WidgetPreviewTokenService(jwt, config);
  });

  it('issues and verifies preview token for trusted origin', () => {
    const session = service.issue({
      widgetId: 'wid_1',
      workspaceId: 'ws_1',
      publicKey: 'wm_test',
      userId: 'usr_1',
      appOrigin: 'https://agent.neeklo.ru',
    });
    expect(session.previewOriginTrusted).toBe(true);
    expect(session.previewUrl).toContain('previewToken=');
    const payload = service.verify(session.previewToken, 'wm_test', 'https://agent.neeklo.ru');
    expect(payload.widgetId).toBe('wid_1');
  });

  it('rejects untrusted preview origin', () => {
    const session = service.issue({
      widgetId: 'wid_1',
      workspaceId: 'ws_1',
      publicKey: 'wm_test',
      userId: 'usr_1',
      appOrigin: 'https://agent.neeklo.ru',
    });
    expect(() =>
      service.verify(session.previewToken, 'wm_test', 'https://evil.example.com'),
    ).toThrow();
  });
});

describe('WidgetAuthService preview bypass', () => {
  it('skips domain check with valid preview token', async () => {
    const jwt = new JwtService({ secret: 'test-secret-key-for-preview-tokens!!' });
    const config = {
      get: (key: string, def?: string) => {
        if (key === 'JWT_ACCESS_SECRET') return 'test-secret-key-for-preview-tokens!!';
        return def;
      },
    } as ConfigService;
    const previewTokens = new WidgetPreviewTokenService(jwt, config);
    const widgets = {
      findActiveByPublicKey: vi.fn().mockResolvedValue({
        id: 'wid_1',
        workspaceId: 'ws_1',
        assistantId: 'asst_1',
        publicKey: 'wm_test',
        isActive: true,
        domains: [{ domain: 'customer.com' }],
        assistant: { workspaceId: 'ws_1' },
      }),
    } as unknown as WidgetRepository;
    const auth = new WidgetAuthService(widgets, previewTokens);
    const session = previewTokens.issue({
      widgetId: 'wid_1',
      workspaceId: 'ws_1',
      publicKey: 'wm_test',
      userId: 'usr_1',
      appOrigin: 'https://agent.neeklo.ru',
    });
    const ctx = await auth.authenticate('wm_test', 'https://agent.neeklo.ru', {
      previewToken: session.previewToken,
    });
    expect(ctx.previewMode).toBe(true);
  });
});
