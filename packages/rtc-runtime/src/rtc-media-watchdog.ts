export interface MediaWatchdogConfig {
  /** No inbound frames/audio for this long → frozen */
  stallMs?: number;
  checkIntervalMs?: number;
}

// 25s is a deliberately conservative window: TURN-relay handshake over a
// cellular CGNAT routinely takes 5-15s, and browser sets `track.muted=true`
// for ~1-2s right after `getUserMedia` before the source produces frames.
// Anything tighter than 25s causes false-positive restarts that destroy
// an in-progress ICE negotiation.
const DEFAULTS: Required<MediaWatchdogConfig> = {
  stallMs: 25000,
  checkIntervalMs: 4000,
};

/** Detects stalled remote/local media tracks during active calls. */
export class RtcMediaWatchdog {
  private interval: ReturnType<typeof setInterval> | null = null;
  private lastActivityAt = Date.now();
  private readonly cfg: Required<MediaWatchdogConfig>;
  private onStall: (() => void) | null = null;

  constructor(config: MediaWatchdogConfig = {}) {
    this.cfg = { ...DEFAULTS, ...config };
  }

  start(getStreams: () => { local: MediaStream | null; remote: MediaStream | null }, onStall: () => void): void {
    this.stop();
    this.onStall = onStall;
    this.lastActivityAt = Date.now();
    this.interval = setInterval(() => {
      const { local, remote } = getStreams();
      const active = [local, remote].filter(Boolean) as MediaStream[];
      if (active.length === 0) return;

      // `track.muted` flips to true for ~1-2s after getUserMedia and can
      // briefly toggle during normal ICE renegotiation. Watchdog should only
      // care whether the underlying source is still alive (readyState/enabled).
      let live = false;
      for (const stream of active) {
        for (const track of stream.getTracks()) {
          if (track.readyState === 'live' && track.enabled) {
            live = true;
            break;
          }
        }
      }

      if (live) {
        this.lastActivityAt = Date.now();
        return;
      }

      if (Date.now() - this.lastActivityAt > this.cfg.stallMs) {
        this.onStall?.();
        this.lastActivityAt = Date.now();
      }
    }, this.cfg.checkIntervalMs);
  }

  poke(): void {
    this.lastActivityAt = Date.now();
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.onStall = null;
  }
}
