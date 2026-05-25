export type WidgetRuntimeState =
  | 'BOOTING'
  | 'CONNECTING'
  | 'ONLINE'
  | 'RECONNECTING'
  | 'STREAMING'
  | 'OPERATOR_CONNECTED'
  | 'CALL_INVITED'
  | 'CALL_ACTIVE'
  | 'OFFLINE'
  | 'DESTROYED';

const TRANSITIONS: Record<WidgetRuntimeState, WidgetRuntimeState[]> = {
  BOOTING: ['CONNECTING', 'OFFLINE', 'DESTROYED'],
  CONNECTING: ['ONLINE', 'OFFLINE', 'RECONNECTING', 'DESTROYED'],
  ONLINE: ['STREAMING', 'RECONNECTING', 'OFFLINE', 'OPERATOR_CONNECTED', 'CALL_INVITED', 'DESTROYED'],
  RECONNECTING: ['ONLINE', 'OFFLINE', 'DESTROYED'],
  STREAMING: ['ONLINE', 'RECONNECTING', 'OFFLINE', 'DESTROYED'],
  OPERATOR_CONNECTED: ['ONLINE', 'STREAMING', 'CALL_INVITED', 'OFFLINE', 'DESTROYED'],
  CALL_INVITED: ['CALL_ACTIVE', 'ONLINE', 'OFFLINE', 'DESTROYED'],
  CALL_ACTIVE: ['ONLINE', 'OPERATOR_CONNECTED', 'OFFLINE', 'DESTROYED'],
  OFFLINE: ['CONNECTING', 'RECONNECTING', 'DESTROYED'],
  DESTROYED: [],
};

export class WidgetStateMachine {
  private state: WidgetRuntimeState = 'BOOTING';

  get current(): WidgetRuntimeState {
    return this.state;
  }

  transition(next: WidgetRuntimeState): boolean {
    const allowed = TRANSITIONS[this.state];
    if (!allowed.includes(next)) return false;
    this.state = next;
    return true;
  }

  force(next: WidgetRuntimeState): void {
    this.state = next;
  }

  isOnline(): boolean {
    return ['ONLINE', 'STREAMING', 'OPERATOR_CONNECTED', 'CALL_INVITED', 'CALL_ACTIVE'].includes(
      this.state,
    );
  }

  canSendMessage(): boolean {
    return this.state === 'ONLINE';
  }
}
