/** Unlocks autoplay and resumes audio after background/tab sleep (iOS Safari). */
export class AudioResumeManager {
  private unlocked = false;
  private audioContext: AudioContext | null = null;
  private boundResume: (() => void) | null = null;

  unlockFromUserGesture(): void {
    this.unlocked = true;
    if (typeof AudioContext !== 'undefined' && !this.audioContext) {
      this.audioContext = new AudioContext();
    }
    void this.resume();
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  async resume(): Promise<void> {
    if (!this.unlocked || !this.audioContext) return;
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  bindVisibilityResume(): void {
    if (typeof document === 'undefined') return;
    this.boundResume = () => {
      if (document.visibilityState === 'visible') void this.resume();
    };
    document.addEventListener('visibilitychange', this.boundResume);
  }

  resumeMediaElements(elements: HTMLMediaElement[]): void {
    for (const el of elements) {
      if (el.paused) {
        void el.play().catch(() => undefined);
      }
    }
  }

  destroy(): void {
    if (this.boundResume) {
      document.removeEventListener('visibilitychange', this.boundResume);
      this.boundResume = null;
    }
    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }
    this.unlocked = false;
  }
}
