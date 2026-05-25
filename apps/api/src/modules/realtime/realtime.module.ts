import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FoundationModule } from '../foundation/foundation.module';
import { PlaygroundModule } from '../playground/playground.module';
import { AssistantTestChatModule } from '../assistant-test-chat/assistant-test-chat.module';
import { WidgetChatModule } from '../widget-chat/widget-chat.module';
import { AdminGateway } from './admin.gateway';
import { WidgetGateway } from './widget.gateway';
import { OperatorGateway } from './operator.gateway';
import { RealtimeRuntimeService } from './services/realtime-runtime.service';
import { LiveVisitorTrackerService } from './services/live-visitor-tracker.service';
import { OperatorSessionLockService } from './services/operator-session-lock.service';
import { WebRtcSignalService } from './services/webrtc-signal.service';
import { RealtimeDiagnosticsService } from './services/realtime-diagnostics.service';
import { RealtimeDiagnosticsController } from './presentation/realtime-diagnostics.controller';
import { WidgetSocketBridge } from './services/widget-socket-bridge.service';
import { OperatorSocketBridge } from './services/operator-socket-bridge.service';
import { AdminSocketBridge } from './services/admin-socket-bridge.service';
import { ActiveCallRegistryService } from './services/active-call-registry.service';
import { RtcSignalRelayService } from './services/rtc-signal-relay.service';
import { RtcRedisStoreService } from './services/rtc-redis-store.service';
import { RtcCallRecoveryService } from './services/rtc-call-recovery.service';
import { RtcDiagnosticsBroadcastService } from './services/rtc-diagnostics-broadcast.service';
import { ChatRealtimeBroadcastService } from './services/chat-realtime-broadcast.service';
import { OperatorChatService } from './services/operator-chat.service';

@Module({
  imports: [AuthModule, FoundationModule, PlaygroundModule, AssistantTestChatModule, WidgetChatModule],
  controllers: [RealtimeDiagnosticsController],
  providers: [
    AdminGateway,
    WidgetGateway,
    OperatorGateway,
    RealtimeRuntimeService,
    LiveVisitorTrackerService,
    OperatorSessionLockService,
    WebRtcSignalService,
    RealtimeDiagnosticsService,
    WidgetSocketBridge,
    OperatorSocketBridge,
    AdminSocketBridge,
    ActiveCallRegistryService,
    RtcSignalRelayService,
    RtcRedisStoreService,
    RtcCallRecoveryService,
    RtcDiagnosticsBroadcastService,
    ChatRealtimeBroadcastService,
    OperatorChatService,
  ],
  exports: [
    RealtimeRuntimeService,
    LiveVisitorTrackerService,
    WebRtcSignalService,
    ActiveCallRegistryService,
    OperatorSocketBridge,
  ],
})
export class RealtimeModule {}
