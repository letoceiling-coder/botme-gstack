export interface StreamMetrics {
  streamId: string;
  startedAt: number;
  endedAt: number | null;
  chunkCount: number;
  byteCount: number;
  resetCount: number;
  failoverCount: number;
  provider: string | null;
  modelId: string | null;
  aborted: boolean;
}

export interface StreamRuntimeCallbacks {
  onChunk?: (delta: string) => void;
  onReset?: () => void;
  onFailover?: (fromModel: string, toModel: string) => void;
  onDone?: (content: string) => void;
  onError?: (err: unknown) => void;
}

export interface StreamRuntimeOptions {
  streamId: string;
  signal?: AbortSignal;
  callbacks?: StreamRuntimeCallbacks;
}

/**
 * Unified stream consumer — abort-safe, reset on failover, metrics tracking.
 * Ensures old stream terminates fully before new chunks emit after reset.
 */
export class StreamRuntime {
  readonly streamId: string;
  readonly metrics: StreamMetrics;
  private content = '';
  private active = true;
  private readonly callbacks: StreamRuntimeCallbacks;
  private readonly signal?: AbortSignal;

  constructor(options: StreamRuntimeOptions) {
    this.streamId = options.streamId;
    this.signal = options.signal;
    this.callbacks = options.callbacks ?? {};
    this.metrics = {
      streamId: options.streamId,
      startedAt: Date.now(),
      endedAt: null,
      chunkCount: 0,
      byteCount: 0,
      resetCount: 0,
      failoverCount: 0,
      provider: null,
      modelId: null,
      aborted: false,
    };
  }

  get contentSnapshot(): string {
    return this.content;
  }

  isActive(): boolean {
    return this.active;
  }

  /** Full reset — clears buffer, notifies client. Called on model failover mid-stream. */
  reset(): void {
    if (!this.active) return;
    this.content = '';
    this.metrics.resetCount++;
    this.callbacks.onReset?.();
  }

  recordFailover(fromModel: string, toModel: string): void {
    this.metrics.failoverCount++;
    this.callbacks.onFailover?.(fromModel, toModel);
    this.reset();
  }

  pushChunk(delta: string): void {
    if (!this.active || !delta) return;
    if (this.signal?.aborted) {
      this.abort();
      return;
    }
    this.content += delta;
    this.metrics.chunkCount++;
    this.metrics.byteCount += delta.length;
    this.callbacks.onChunk?.(delta);
  }

  complete(content: string, meta?: { provider?: string; modelId?: string }): string {
    if (!this.active) return this.content;
    this.active = false;
    this.metrics.endedAt = Date.now();
    if (meta?.provider) this.metrics.provider = meta.provider;
    if (meta?.modelId) this.metrics.modelId = meta.modelId;
    this.content = content;
    this.callbacks.onDone?.(content);
    return this.content;
  }

  abort(): void {
    if (!this.active) return;
    this.active = false;
    this.metrics.aborted = true;
    this.metrics.endedAt = Date.now();
  }

  fail(err: unknown): void {
    this.abort();
    this.callbacks.onError?.(err);
  }
}

export * from './stream-consumer.js';
