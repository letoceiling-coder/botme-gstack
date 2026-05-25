import { AudioResumeManager } from './audio-resume-manager.js';
import { DevicePermissionManager } from './device-permission-manager.js';
import { FullscreenManager } from './fullscreen-manager.js';
import { MediaSessionManager } from './media-session-manager.js';
import { RECOVERY_LABELS_RU } from './network-quality.js';
import { PeerConnectionManager } from './peer-connection-manager.js';
import { RTCDiagnosticsCollector } from './rtc-diagnostics-collector.js';
import { RtcMediaWatchdog } from './rtc-media-watchdog.js';
import { RtcRecoveryEngine } from './rtc-recovery-engine.js';
import { RTCReconnectManager } from './rtc-reconnect-manager.js';
import type { RtcConnectionState, RtcRuntimeConfig, RtcSignalPayload } from './types.js';

export interface RtcRuntimeHandle {
  state: RtcConnectionState;
  permissions: DevicePermissionManager;
  media: MediaSessionManager;
  diagnostics: RTCDiagnosticsCollector;
  fullscreen: FullscreenManager;
  audio: AudioResumeManager;
  acceptInvite: (constraints: { audio: boolean; video: boolean }) => Promise<boolean>;
  acceptInviteWithStream: (stream: MediaStream, constraints: { audio: boolean; video: boolean }) => Promise<boolean>;
  prepareForAnswer: (constraints: { audio: boolean; video: boolean }) => Promise<boolean>;
  prepareForAnswerWithStream: (stream: MediaStream) => Promise<boolean>;
  handleRemoteSignal: (payload: RtcSignalPayload) => Promise<void>;
  endCall: () => void;
  reconnectCall: () => Promise<void>;
  replaceVideoTrack: (track: MediaStreamTrack) => Promise<boolean>;
  destroy: () => void;
}

/** Orchestrates RTC subsystems — UI-agnostic, no React. */
export class RtcRuntime {
  readonly permissions = new DevicePermissionManager();
  readonly media = new MediaSessionManager();
  readonly reconnect = new RTCReconnectManager();
  readonly diagnostics = new RTCDiagnosticsCollector();
  readonly fullscreen = new FullscreenManager();
  readonly audio = new AudioResumeManager();

  private pcManager: PeerConnectionManager | null = null;
  private state: RtcConnectionState = 'idle';
  private readonly config: RtcRuntimeConfig;
  private readonly recovery = new RtcRecoveryEngine();
  private readonly mediaWatchdog = new RtcMediaWatchdog();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private mediaVerifyTimer: ReturnType<typeof setTimeout> | null = null;
  private role: 'offerer' | 'answerer' | null = null;

  constructor(config: RtcRuntimeConfig) {
    this.config = config;
    this.audio.bindVisibilityResume();
    this.recovery.setCallbacks({
      onQualityChange: (level, snapshot) => {
        this.config.onQualityChange?.(level, snapshot);
      },
      onRecoveryAction: (action) => {
        if (action === 'audio-only' || action === 'disable-hd' || action === 'lower-resolution') {
          this.setState('degraded');
        }
      },
      onMediaStall: () => {
        this.config.onRecoveryStatus?.(RECOVERY_LABELS_RU.recovering);
      },
      onIceRestart: () => this.performIceRestart(),
    });
  }

  getState(): RtcConnectionState {
    return this.state;
  }

  createHandle(): RtcRuntimeHandle {
    return {
      state: this.state,
      permissions: this.permissions,
      media: this.media,
      diagnostics: this.diagnostics,
      fullscreen: this.fullscreen,
      audio: this.audio,
      acceptInvite: (c) => this.acceptInvite(c),
      acceptInviteWithStream: (s, c) => this.acceptInviteWithStream(s, c),
      prepareForAnswer: (c) => this.prepareForAnswer(c),
      prepareForAnswerWithStream: (s) => this.prepareForAnswerWithStream(s),
      handleRemoteSignal: (p) => this.handleRemoteSignal(p),
      endCall: () => this.endCall(),
      reconnectCall: () => this.reconnectCall(),
      replaceVideoTrack: (track) => this.replaceVideoTrack(track),
      destroy: () => this.destroy(),
    };
  }

  async acceptInvite(constraints: { audio: boolean; video: boolean }): Promise<boolean> {
    this.setState('connecting');
    const perm = await this.permissions.requestMedia(constraints);
    if (!perm.stream) {
      this.setState('failed');
      return false;
    }
    return this.startAsOfferer(perm.stream);
  }

  async acceptInviteWithStream(
    stream: MediaStream,
    _constraints: { audio: boolean; video: boolean },
  ): Promise<boolean> {
    this.setState('connecting');
    return this.startAsOfferer(stream);
  }

  async prepareForAnswer(constraints: { audio: boolean; video: boolean }): Promise<boolean> {
    this.setState('connecting');
    const perm = await this.permissions.requestMedia(constraints);
    if (!perm.stream) {
      this.setState('failed');
      return false;
    }
    return this.startAsAnswerer(perm.stream);
  }

  async prepareForAnswerWithStream(stream: MediaStream): Promise<boolean> {
    this.setState('connecting');
    return this.startAsAnswerer(stream);
  }

  private async startAsOfferer(stream: MediaStream): Promise<boolean> {
    this.role = 'offerer';
    this.media.setLocalStream(stream);
    this.pcManager = this.createPeerManager();
    const pc = this.pcManager.create();
    for (const track of stream.getTracks()) {
      this.pcManager.addLocalTrack(track, stream);
    }
    const sdp = await this.pcManager.createOffer();
    this.config.onSignal?.({ type: 'offer', sdp });
    this.startMonitoring(pc);
    return true;
  }

  private async startAsAnswerer(stream: MediaStream): Promise<boolean> {
    this.role = 'answerer';
    this.media.setLocalStream(stream);
    this.pcManager = this.createPeerManager();
    const pc = this.pcManager.create();
    for (const track of stream.getTracks()) {
      this.pcManager.addLocalTrack(track, stream);
    }
    this.startMonitoring(pc);
    return true;
  }

  private createPeerManager(): PeerConnectionManager {
    // Never force relay-only — ICE must be free to pick host/srflx/relay.
    // Relay-only mode breaks when one side cannot allocate TURN (TLS errors,
    // firewall) leaving zero viable candidate pairs.
    const forceRelay = this.config.forceTurnRelay === true;
    return new PeerConnectionManager({
      iceServers: this.config.iceServers,
      iceTransportPolicy: forceRelay ? 'relay' : undefined,
      onSignal: (p) => this.config.onSignal?.(p),
      onTrack: (ev) => {
        const stream = this.media.attachRemoteTrack(ev);
        this.mediaWatchdog.poke();
        if (ev.track) this.config.onRemoteTrack?.(stream, ev.track);
      },
      onIceStateChange: (ice) => this.onIceState(ice),
      onConnectionStateChange: (cs) => this.onConnectionState(cs),
    });
  }

  private startMonitoring(pc: RTCPeerConnection): void {
    this.diagnostics.setReconnectCount(this.reconnect.reconnectCount);
    this.diagnostics.start(pc, (s) => {
      this.config.onDiagnostics?.(s);
      this.recovery.handleDiagnostics(s);
      this.applyAutoDegrade(s);
      if (s.mediaFrozen) {
        this.recovery.handleMediaStall();
      }
    });
    // Watchdog is intentionally NOT started here: stale checks on a stream
    // that is still negotiating ICE produce false-positive restarts that
    // ruin the very negotiation we are waiting on. The watchdog is armed
    // only once ICE reaches `connected/completed`.
    this.scheduleMediaVerify();
  }

  async handleRemoteSignal(payload: RtcSignalPayload): Promise<void> {
    if (!this.pcManager) return;
    if (payload.type === 'answer' && payload.sdp) {
      await this.pcManager.applyRemoteAnswer(payload.sdp);
      this.cancelMediaVerify();
    } else if (payload.type === 'offer' && payload.sdp) {
      const pc = this.pcManager.peerConnection;
      // Ignore duplicate early offer replays once we already applied one.
      if (pc?.remoteDescription?.type === 'offer' && pc.signalingState === 'stable') {
        return;
      }
      await this.pcManager.applyRemoteOffer(payload.sdp);
      const answer = await this.pcManager.createAnswer();
      this.config.onSignal?.({ type: 'answer', sdp: answer });
      this.cancelMediaVerify();
    } else if (payload.type === 'ice' && payload.candidate) {
      await this.pcManager.addIceCandidate(payload.candidate);
    } else if (payload.type === 'restart' && payload.sdp) {
      await this.recovery.withRenegotiationLock(async () => {
        if (!this.pcManager) return;
        await this.pcManager.applyRemoteOffer(payload.sdp!);
        const answer = await this.pcManager.createAnswer();
        this.config.onSignal?.({ type: 'answer', sdp: answer });
        this.cancelMediaVerify();
      });
    }
  }

  endCall(): void {
    this.setState('closed');
    this.cleanup();
  }

  async reconnectCall(): Promise<void> {
    await this.performIceRestart();
  }

  async replaceVideoTrack(track: MediaStreamTrack): Promise<boolean> {
    if (!this.pcManager) return false;
    const local = this.media.getLocalStream();
    if (local) {
      for (const t of local.getVideoTracks()) {
        if (t.id !== track.id) {
          local.removeTrack(t);
          t.stop();
        }
      }
      if (!local.getVideoTracks().includes(track)) {
        local.addTrack(track);
      }
    }
    return this.pcManager.replaceVideoTrack(track);
  }

  destroy(): void {
    this.endCall();
    this.reconnect.destroy();
    this.fullscreen.destroy();
    this.audio.destroy();
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  private cleanup(): void {
    this.cancelMediaVerify();
    this.mediaWatchdog.stop();
    this.diagnostics.stop();
    this.pcManager?.destroy();
    this.pcManager = null;
    this.media.destroy();
    this.reconnect.reset();
    this.recovery.reset();
    this.role = null;
  }

  private setState(next: RtcConnectionState): void {
    this.state = next;
    this.config.onStateChange?.(next);
    if (next === 'connected') {
      this.config.onRecoveryStatus?.(RECOVERY_LABELS_RU.recovered);
      this.timers.push(
        setTimeout(() => this.config.onRecoveryStatus?.(null), 3000),
      );
    }
    if (next === 'reconnecting') {
      this.config.onRecoveryStatus?.(RECOVERY_LABELS_RU.reconnecting);
    }
  }

  private onIceState(ice: RTCIceConnectionState): void {
    if (ice === 'connected' || ice === 'completed') {
      this.setState('connected');
      this.reconnect.reset();
      this.cancelMediaVerify();
      this.mediaWatchdog.poke();
      // Arm watchdog only after a successful ICE connection. Before that,
      // any `muted` track is a normal `getUserMedia` race condition.
      this.mediaWatchdog.start(
        () => ({ local: this.media.getLocalStream(), remote: this.media.getRemoteStream() }),
        () => this.recovery.handleMediaStall(),
      );
    } else if (ice === 'disconnected') {
      // `disconnected` is often transient — Chrome reports it for ~3-5s
      // during normal candidate re-pair. Wait it out before forcing a restart.
      this.setState('reconnecting');
      const verifyTimer = setTimeout(() => {
        if (this.state === 'reconnecting') this.scheduleIceRestart();
      }, 6000);
      this.timers.push(verifyTimer);
    } else if (ice === 'failed') {
      this.setState('failed');
      this.scheduleIceRestart();
    }
  }

  private onConnectionState(cs: RTCPeerConnectionState): void {
    if (cs === 'connected') this.setState('connected');
    if (cs === 'failed') this.setState('failed');
    if (cs === 'closed') this.setState('closed');
  }

  private scheduleIceRestart(): void {
    this.diagnostics.setReconnectCount(this.reconnect.reconnectCount);
    const scheduled = this.reconnect.scheduleRestart(() => this.performIceRestart());
    if (!scheduled) this.setState('failed');
  }

  private async performIceRestart(): Promise<void> {
    if (!this.pcManager) return;
    this.setState('reconnecting');
    this.config.onRecoveryStatus?.(RECOVERY_LABELS_RU.iceRestart);
    await this.recovery.withRenegotiationLock(async () => {
      if (!this.pcManager) return;
      this.diagnostics.setReconnectCount(this.reconnect.reconnectCount);
      await this.pcManager.restartIce();
    });
  }

  private scheduleMediaVerify(): void {
    if (this.mediaVerifyTimer) clearTimeout(this.mediaVerifyTimer);
    // Do NOT restart while ICE is actively checking — TURN cross-network
    // negotiation routinely takes 20-45s. Only force restart after a full
    // 60s budget AND only if ICE is failed/disconnected (not still checking).
    this.mediaVerifyTimer = setTimeout(() => {
      const remote = this.media.getRemoteStream();
      const hasLiveRemote = remote?.getTracks().some((t) => t.readyState === 'live');
      if (hasLiveRemote) return;
      const ice = this.pcManager?.peerConnection?.iceConnectionState;
      if (ice === 'connected' || ice === 'completed') return;
      if (ice === 'checking' || ice === 'new') return;
      if (this.state === 'connecting' || this.state === 'reconnecting') {
        void this.performIceRestart();
      }
    }, 60000);
  }

  private cancelMediaVerify(): void {
    if (this.mediaVerifyTimer) {
      clearTimeout(this.mediaVerifyTimer);
      this.mediaVerifyTimer = null;
    }
  }

  private applyAutoDegrade(snapshot: import('./types.js').RtcDiagnosticsSnapshot): void {
    const action = this.diagnostics.shouldDegrade(snapshot);
    if (action === 'none') return;
    if (action === 'reduce-video' || action === 'audio-only') {
      this.setState('degraded');
      const local = this.media.getLocalStream();
      if (local) {
        for (const track of local.getVideoTracks()) {
          track.enabled = action !== 'audio-only';
        }
      }
    }
    if (action === 'ice-restart') {
      void this.performIceRestart();
    }
  }
}

export * from './types.js';
export * from './peer-connection-manager.js';
export * from './media-session-manager.js';
export * from './device-permission-manager.js';
export * from './ice-candidate-queue.js';
export * from './rtc-reconnect-manager.js';
export * from './rtc-diagnostics-collector.js';
export * from './media-track-lifecycle.js';
export * from './fullscreen-manager.js';
export * from './audio-resume-manager.js';
export * from './call-state-machine.js';
export * from './media-quality-engine.js';
export * from './network-quality.js';
export * from './rtc-recovery-engine.js';
export * from './rtc-media-watchdog.js';
export * from './device-output-manager.js';
export * from './device-input-manager.js';
