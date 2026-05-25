/** Tracks and stops MediaStreamTracks with guaranteed cleanup. */
export class MediaTrackLifecycle {
  private readonly tracks = new Set<MediaStreamTrack>();

  adopt(stream: MediaStream | null | undefined): void {
    if (!stream) return;
    for (const track of stream.getTracks()) {
      this.tracks.add(track);
    }
  }

  adoptTrack(track: MediaStreamTrack | null | undefined): void {
    if (track) this.tracks.add(track);
  }

  stopAll(): void {
    for (const track of this.tracks) {
      try {
        track.stop();
      } catch {
        /* ignore */
      }
    }
    this.tracks.clear();
  }

  count(): number {
    return this.tracks.size;
  }
}
