export interface FullscreenTarget {
  requestFullscreen?: () => Promise<void>;
  webkitRequestFullscreen?: () => Promise<void>;
}

/** Fullscreen + PiP helpers with iOS Safari fallback detection. */
export class FullscreenManager {
  private pipVideo: HTMLVideoElement | null = null;

  isSupported(): boolean {
    return typeof document !== 'undefined' && !!document.fullscreenEnabled;
  }

  isIosSafari(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
  }

  async enter(element: HTMLElement): Promise<boolean> {
    const target = element as HTMLElement & FullscreenTarget;
    try {
      if (target.requestFullscreen) {
        await target.requestFullscreen();
        return true;
      }
      if (target.webkitRequestFullscreen) {
        await target.webkitRequestFullscreen();
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  async exit(): Promise<void> {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  }

  async togglePiP(video: HTMLVideoElement): Promise<boolean> {
    if (!document.pictureInPictureEnabled) return false;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        this.pipVideo = null;
        return false;
      }
      await video.requestPictureInPicture();
      this.pipVideo = video;
      return true;
    } catch {
      return false;
    }
  }

  applySafeAreaInsets(container: HTMLElement): void {
    container.style.paddingTop = 'env(safe-area-inset-top)';
    container.style.paddingBottom = 'env(safe-area-inset-bottom)';
    container.style.paddingLeft = 'env(safe-area-inset-left)';
    container.style.paddingRight = 'env(safe-area-inset-right)';
  }

  destroy(): void {
    void this.exit();
    if (this.pipVideo && document.pictureInPictureElement === this.pipVideo) {
      void document.exitPictureInPicture();
    }
    this.pipVideo = null;
  }
}
