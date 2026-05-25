import { MediaTrackLifecycle } from './media-track-lifecycle.js';

/** Manages local/remote MediaStreams without UI coupling. */
export class MediaSessionManager {
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private readonly lifecycle = new MediaTrackLifecycle();

  setLocalStream(stream: MediaStream | null): void {
    this.clearLocal();
    this.localStream = stream;
    this.lifecycle.adopt(stream);
  }

  setRemoteStream(stream: MediaStream | null): void {
    this.clearRemote();
    this.remoteStream = stream;
    this.lifecycle.adopt(stream);
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  attachRemoteTrack(event: RTCTrackEvent): MediaStream {
    if (!this.remoteStream) {
      this.remoteStream = new MediaStream();
      this.lifecycle.adopt(this.remoteStream);
    }
    if (event.track) {
      this.remoteStream.addTrack(event.track);
      this.lifecycle.adoptTrack(event.track);
    }
    return this.remoteStream;
  }

  clearLocal(): void {
    if (this.localStream) {
      for (const t of this.localStream.getTracks()) t.stop();
      this.localStream = null;
    }
  }

  clearRemote(): void {
    if (this.remoteStream) {
      for (const t of this.remoteStream.getTracks()) t.stop();
      this.remoteStream = null;
    }
  }

  destroy(): void {
    this.clearLocal();
    this.clearRemote();
    this.lifecycle.stopAll();
  }
}
