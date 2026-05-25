import { useEffect, useState } from 'react';
import type { HealthCheckItemDto, HealthStatus } from '@botme/shared';
import { Card } from '@botme/ui';
import { HealthStatusChip } from './health-status-chip';

interface BrowserDiagnostic {
  id: string;
  label: string;
  status: HealthStatus;
  detail: string;
}

export function BrowserDiagnosticsPanel() {
  const [checks, setChecks] = useState<BrowserDiagnostic[]>([]);

  useEffect(() => {
    void runBrowserDiagnostics().then(setChecks);
  }, []);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Проверки выполняются локально в вашем браузере — без mock-данных.
      </p>
      {checks.map((c) => (
        <Card key={c.id} className="flex items-start justify-between gap-3 p-3">
          <div>
            <p className="text-sm font-medium">{c.label}</p>
            <p className="text-xs text-muted-foreground">{c.detail}</p>
          </div>
          <HealthStatusChip status={c.status} pulse={false} />
        </Card>
      ))}
    </div>
  );
}

async function runBrowserDiagnostics(): Promise<BrowserDiagnostic[]> {
  const results: BrowserDiagnostic[] = [];

  results.push({
    id: 'https',
    label: 'HTTPS',
    status: typeof window !== 'undefined' && window.isSecureContext ? 'online' : 'offline',
    detail:
      typeof window !== 'undefined' && window.isSecureContext
        ? 'Secure context — камера/микрофон доступны'
        : 'Требуется HTTPS для WebRTC',
  });

  const rtcOk = typeof RTCPeerConnection !== 'undefined';
  results.push({
    id: 'webrtc',
    label: 'WebRTC support',
    status: rtcOk ? 'online' : 'offline',
    detail: rtcOk ? 'RTCPeerConnection доступен' : 'WebRTC не поддерживается',
  });

  if (navigator.mediaDevices?.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stream.getTracks().forEach((t) => t.stop());
      results.push({
        id: 'media',
        label: 'Камера / микрофон',
        status: 'online',
        detail: 'Разрешения получены',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'denied';
      results.push({
        id: 'media',
        label: 'Камера / микрофон',
        status: msg.includes('NotFound') ? 'degraded' : 'offline',
        detail: msg,
      });
    }
  }

  if (navigator.permissions?.query) {
    try {
      const cam = await navigator.permissions.query({ name: 'camera' as PermissionName });
      const mic = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      const ok = cam.state === 'granted' && mic.state === 'granted';
      results.push({
        id: 'permissions',
        label: 'Permissions API',
        status: ok ? 'online' : cam.state === 'prompt' || mic.state === 'prompt' ? 'degraded' : 'offline',
        detail: `camera=${cam.state}, microphone=${mic.state}`,
      });
    } catch {
      results.push({
        id: 'permissions',
        label: 'Permissions API',
        status: 'degraded',
        detail: 'Браузер не раскрывает статус разрешений',
      });
    }
  }

  return results;
}

export function ServerHealthList({ checks }: { checks: HealthCheckItemDto[] }) {
  return (
    <div className="space-y-2">
      {checks.map((c) => (
        <Card key={c.id} className="flex items-start justify-between gap-3 p-3">
          <div>
            <p className="text-sm font-medium">{c.label}</p>
            <p className="text-xs text-muted-foreground">{c.detail}</p>
          </div>
          <HealthStatusChip status={c.status} />
        </Card>
      ))}
    </div>
  );
}
