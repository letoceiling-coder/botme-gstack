import { Injectable } from '@nestjs/common';
import { RealtimeRuntime, type CreateEnvelopeInput, type RealtimeEventEnvelope } from '@botme/realtime-runtime';

@Injectable()
export class RealtimeRuntimeService {
  private readonly runtime = new RealtimeRuntime();

  emit<T>(input: CreateEnvelopeInput<T>): RealtimeEventEnvelope<T> | null {
    return this.runtime.emit(input);
  }

  registerSocket(entry: Parameters<RealtimeRuntime['registerSocket']>[0]): void {
    this.runtime.registerSocket(entry);
  }

  unregisterSocket(socketId: string): void {
    this.runtime.unregisterSocket(socketId);
  }

  touchHeartbeat(socketId: string): void {
    this.runtime.touchHeartbeat(socketId);
  }

  getRuntime(): RealtimeRuntime {
    return this.runtime;
  }
}
