/** Recovers from microphone/camera unplug via devicechange. */
export class DeviceInputManager {
  private unbind: (() => void) | null = null;

  bind(
    getConstraints: () => { audio: boolean; video: boolean },
    onDeviceLost: (kind: 'audio' | 'video') => void,
    onReacquire: (stream: MediaStream) => void,
  ): void {
    this.unbind?.();
    if (!navigator.mediaDevices) return;

    const handler = async () => {
      const constraints = getConstraints();
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasAudio = devices.some((d) => d.kind === 'audioinput');
      const hasVideo = devices.some((d) => d.kind === 'videoinput');

      if (constraints.audio && !hasAudio) onDeviceLost('audio');
      if (constraints.video && !hasVideo) onDeviceLost('video');

      if ((constraints.audio && hasAudio) || (constraints.video && hasVideo)) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: constraints.audio && hasAudio,
            video: constraints.video && hasVideo,
          });
          onReacquire(stream);
        } catch {
          /* permission or hardware unavailable */
        }
      }
    };

    navigator.mediaDevices.addEventListener('devicechange', handler);
    this.unbind = () => navigator.mediaDevices.removeEventListener('devicechange', handler);
  }

  destroy(): void {
    this.unbind?.();
    this.unbind = null;
  }
}
