export interface ReconnectPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_POLICY: ReconnectPolicy = {
  maxAttempts: 8,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
};

/** Schedules ICE restart / reconnect with exponential backoff. */
export class RTCReconnectManager {
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly policy: ReconnectPolicy;

  constructor(policy: Partial<ReconnectPolicy> = {}) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
  }

  get reconnectCount(): number {
    return this.attempts;
  }

  reset(): void {
    this.attempts = 0;
    this.clearTimer();
  }

  scheduleRestart(onRestart: () => void | Promise<void>): boolean {
    if (this.attempts >= this.policy.maxAttempts) return false;
    this.clearTimer();
    const delay = Math.min(
      this.policy.baseDelayMs * 2 ** this.attempts,
      this.policy.maxDelayMs,
    );
    this.attempts += 1;
    this.timer = setTimeout(() => {
      void onRestart();
    }, delay);
    return true;
  }

  destroy(): void {
    this.clearTimer();
    this.attempts = 0;
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
