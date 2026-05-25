/** Buffers ICE candidates until remote description is applied. */
export class IceCandidateQueue {
  private readonly pending: RTCIceCandidateInit[] = [];
  private remoteReady = false;

  markRemoteReady(): void {
    this.remoteReady = true;
  }

  reset(): void {
    this.pending.length = 0;
    this.remoteReady = false;
  }

  enqueue(candidate: RTCIceCandidateInit): void {
    if (!this.remoteReady) {
      this.pending.push(candidate);
      return;
    }
    throw new Error('Remote ready — use flush instead of enqueue');
  }

  pushOrBuffer(candidate: RTCIceCandidateInit): RTCIceCandidateInit[] {
    if (!this.remoteReady) {
      this.pending.push(candidate);
      return [];
    }
    return [candidate];
  }

  flush(): RTCIceCandidateInit[] {
    const batch = [...this.pending];
    this.pending.length = 0;
    return batch;
  }

  size(): number {
    return this.pending.length;
  }
}
