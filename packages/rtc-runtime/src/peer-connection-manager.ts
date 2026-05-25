import { IceCandidateQueue } from './ice-candidate-queue.js';
import type { PeerConnectionFactory, RtcSignalPayload } from './types.js';
import { defaultPeerConnectionFactory } from './types.js';

export interface PeerConnectionManagerOptions {
  iceServers: RTCIceServer[];
  iceTransportPolicy?: RTCIceTransportPolicy;
  createPeerConnection?: PeerConnectionFactory;
  onSignal: (payload: RtcSignalPayload) => void;
  onTrack?: (event: RTCTrackEvent) => void;
  onIceStateChange?: (state: RTCIceConnectionState) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
}

/** UI-agnostic RTCPeerConnection wrapper with ICE queueing. */
export class PeerConnectionManager {
  private pc: RTCPeerConnection | null = null;
  private readonly iceQueue = new IceCandidateQueue();
  private readonly options: PeerConnectionManagerOptions;
  private readonly createPc: PeerConnectionFactory;

  constructor(options: PeerConnectionManagerOptions) {
    this.options = options;
    this.createPc = options.createPeerConnection ?? defaultPeerConnectionFactory;
  }

  get peerConnection(): RTCPeerConnection | null {
    return this.pc;
  }

  create(): RTCPeerConnection {
    this.destroy();
    const config: RTCConfiguration = { iceServers: this.options.iceServers };
    if (this.options.iceTransportPolicy) {
      config.iceTransportPolicy = this.options.iceTransportPolicy;
    }
    const pc = this.createPc(config);
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.options.onSignal({
          type: 'ice',
          candidate: ev.candidate.toJSON(),
        });
      }
    };
    pc.ontrack = (ev) => this.options.onTrack?.(ev);
    pc.oniceconnectionstatechange = () => {
      this.options.onIceStateChange?.(pc.iceConnectionState);
    };
    pc.onconnectionstatechange = () => {
      this.options.onConnectionStateChange?.(pc.connectionState);
    };
    this.pc = pc;
    return pc;
  }

  async createOffer(): Promise<string> {
    const pc = this.requirePc();
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);
    return offer.sdp ?? '';
  }

  async createAnswer(): Promise<string> {
    const pc = this.requirePc();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return answer.sdp ?? '';
  }

  async applyRemoteOffer(sdp: string): Promise<void> {
    const pc = this.requirePc();
    await pc.setRemoteDescription({ type: 'offer', sdp });
    this.iceQueue.markRemoteReady();
    await this.drainIceQueue();
  }

  async applyRemoteAnswer(sdp: string): Promise<void> {
    const pc = this.requirePc();
    await pc.setRemoteDescription({ type: 'answer', sdp });
    this.iceQueue.markRemoteReady();
    await this.drainIceQueue();
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.requirePc();
    const batch = this.iceQueue.pushOrBuffer(candidate);
    for (const c of batch) {
      await pc.addIceCandidate(c);
    }
  }

  addLocalTrack(track: MediaStreamTrack, stream: MediaStream): RTCRtpSender | null {
    const pc = this.requirePc();
    return pc.addTrack(track, stream);
  }

  async restartIce(): Promise<string> {
    const pc = this.requirePc();
    this.iceQueue.reset();
    const offer = await pc.createOffer({ iceRestart: true });
    await pc.setLocalDescription(offer);
    this.options.onSignal({ type: 'restart', sdp: offer.sdp ?? '' });
    return offer.sdp ?? '';
  }

  getSenders(): RTCRtpSender[] {
    return this.pc?.getSenders() ?? [];
  }

  async replaceVideoTrack(track: MediaStreamTrack): Promise<boolean> {
    const sender = this.getSenders().find((s) => s.track?.kind === 'video');
    if (!sender) return false;
    await sender.replaceTrack(track);
    return true;
  }

  destroy(): void {
    if (!this.pc) return;
    this.pc.onicecandidate = null;
    this.pc.ontrack = null;
    this.pc.oniceconnectionstatechange = null;
    this.pc.onconnectionstatechange = null;
    this.pc.close();
    this.pc = null;
    this.iceQueue.reset();
  }

  private requirePc(): RTCPeerConnection {
    if (!this.pc) throw new Error('PeerConnection not created');
    return this.pc;
  }

  private async drainIceQueue(): Promise<void> {
    const pc = this.requirePc();
    for (const c of this.iceQueue.flush()) {
      await pc.addIceCandidate(c);
    }
  }
}
