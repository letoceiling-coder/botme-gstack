import type { MediaConstraintsRequest } from './types.js';

export type PermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported';

export interface DevicePermissionResult {
  stream: MediaStream | null;
  audio: PermissionState;
  video: PermissionState;
  error?: string;
}

/** Requests mic/camera only after explicit user gesture — never auto-enables. */
export class DevicePermissionManager {
  private gestureUnlocked = false;

  /** Must be called from a user gesture handler before requestMedia. */
  unlockFromUserGesture(): void {
    this.gestureUnlocked = true;
  }

  isUnlocked(): boolean {
    return this.gestureUnlocked;
  }

  async requestMedia(constraints: MediaConstraintsRequest): Promise<DevicePermissionResult> {
    if (!this.gestureUnlocked) {
      return {
        stream: null,
        audio: 'denied',
        video: 'denied',
        error: 'Требуется явное действие пользователя',
      };
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return { stream: null, audio: 'unsupported', video: 'unsupported', error: 'getUserMedia недоступен' };
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: constraints.audio,
        video: constraints.video,
      });
      const audio = stream.getAudioTracks().length > 0 ? 'granted' : constraints.audio ? 'denied' : 'prompt';
      const video = stream.getVideoTracks().length > 0 ? 'granted' : constraints.video ? 'denied' : 'prompt';
      return { stream, audio, video };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Permission denied';
      return {
        stream: null,
        audio: constraints.audio ? 'denied' : 'prompt',
        video: constraints.video ? 'denied' : 'prompt',
        error: message,
      };
    }
  }

  async enumerateDevices(): Promise<MediaDeviceInfo[]> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return [];
    return navigator.mediaDevices.enumerateDevices();
  }
}
