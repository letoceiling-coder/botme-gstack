import { useEffect, useState } from 'react';
import type { RtcDiagnosticsExtendedDto } from '@botme/shared';
import { Card } from '@botme/ui';
import { getAdminSocket } from '@/lib/socket';

async function fetchRtcDiagnostics(): Promise<RtcDiagnosticsExtendedDto> {
  const res = await fetch('/api/realtime/diagnostics/rtc', { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<RtcDiagnosticsExtendedDto>;
}

export function RtcDiagnosticsPage() {
  const [diag, setDiag] = useState<RtcDiagnosticsExtendedDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchRtcDiagnostics()
      .then(setDiag)
      .catch((e: Error) => setError(e.message));

    const socket = getAdminSocket();
    if (!socket) return;

    socket.emit('admin:rtc-subscribe', {});
    const onRtc = (payload: RtcDiagnosticsExtendedDto) => setDiag(payload);
    socket.on('admin:rtc-diagnostics', onRtc);
    return () => {
      socket.off('admin:rtc-diagnostics', onRtc);
    };
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">RTC Diagnostics</h1>
        <p className="mt-1 text-sm text-muted-foreground">Live WebRTC sessions — realtime push, no polling.</p>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {diag && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Active calls</p>
              <p className="text-2xl font-semibold">{diag.activeCallCount}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">TURN</p>
              <p className="text-2xl font-semibold">{diag.turnFeatureEnabled ? 'ON' : 'OFF'}</p>
              <p className="text-xs text-muted-foreground">{diag.turnHost ?? '—'}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Widget sockets</p>
              <p className="text-2xl font-semibold">{diag.widgetSockets}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Operator sockets</p>
              <p className="text-2xl font-semibold">{diag.operatorSockets}</p>
            </Card>
          </div>
          <Card className="overflow-x-auto p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-muted-foreground">
                  <th className="pb-2 pr-4">Call</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">ICE</th>
                  <th className="pb-2 pr-4">TURN</th>
                  <th className="pb-2 pr-4">Reconnects</th>
                  <th className="pb-2 pr-4">Duration</th>
                </tr>
              </thead>
              <tbody>
                {diag.activeCalls.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-muted-foreground">
                      No active calls
                    </td>
                  </tr>
                )}
                {diag.activeCalls.map((c) => (
                  <tr key={c.callSessionId} className="border-b border-white/5">
                    <td className="py-2 pr-4 font-mono text-xs">{c.callSessionId.slice(0, 10)}…</td>
                    <td className="py-2 pr-4">{c.status}</td>
                    <td className="py-2 pr-4">{c.iceState ?? '—'}</td>
                    <td className="py-2 pr-4">{c.usingTurn ? 'yes' : 'no'}</td>
                    <td className="py-2 pr-4">{c.reconnectCount}</td>
                    <td className="py-2 pr-4">{c.durationSec}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
