export interface CallControlsState {
  voiceEnabled: boolean;
  videoEnabled: boolean;
  callSessionId?: string;
}

export function getCallControlsFromEvent(payload: {
  voiceEnabled: boolean;
  videoEnabled: boolean;
  callSessionId?: string;
}): CallControlsState {
  return {
    voiceEnabled: payload.voiceEnabled,
    videoEnabled: payload.videoEnabled,
    callSessionId: payload.callSessionId,
  };
}
