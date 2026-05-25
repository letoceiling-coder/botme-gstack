/** Audio output selection via setSinkId + device hot-plug recovery. */
export class DeviceOutputManager {
  private sinkId: string | null = null;

  async listOutputs(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'audiooutput');
  }

  async setOutputDevice(element: HTMLMediaElement, deviceId: string): Promise<boolean> {
    const el = element as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };
    if (typeof el.setSinkId !== 'function') return false;
    try {
      await el.setSinkId(deviceId);
      this.sinkId = deviceId;
      return true;
    } catch {
      return false;
    }
  }

  getSelectedSinkId(): string | null {
    return this.sinkId;
  }

  bindDeviceChange(onChange: () => void): () => void {
    if (!navigator.mediaDevices) return () => undefined;
    navigator.mediaDevices.addEventListener('devicechange', onChange);
    return () => navigator.mediaDevices.removeEventListener('devicechange', onChange);
  }
}
