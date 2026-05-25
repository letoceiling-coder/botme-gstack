import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CoreModule } from './core/core.module';
import { JwtAuthGuard } from './core/guards/jwt-auth.guard';
import { RolesGuard } from './core/guards/roles.guard';
import { WorkspaceGuard } from './core/guards/workspace.guard';
import { AuthModule } from './modules/auth/auth.module';
import { FoundationModule } from './modules/foundation/foundation.module';
import { HealthModule } from './modules/health/health.module';
import { IntegrationModule } from './modules/integration/integration.module';
import { AgentModule } from './modules/agent/agent.module';
import { PlaygroundModule } from './modules/playground/playground.module';
import { AssistantModule } from './modules/assistant/assistant.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { AssistantTestChatModule } from './modules/assistant-test-chat/assistant-test-chat.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { ToolModule } from './modules/tool/tool.module';
import { WidgetAdminModule } from './modules/widget-admin/widget-admin.module';
import { LeadModule } from './modules/lead/lead.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    CoreModule,
    FoundationModule,
    HealthModule,
    AuthModule,
    WorkspaceModule,
    IntegrationModule,
    AgentModule,
    PlaygroundModule,
    AssistantModule,
    KnowledgeModule,
    AssistantTestChatModule,
    RealtimeModule,
    ToolModule,
    WidgetAdminModule,
    LeadModule,
  ],
  providers: [
    JwtAuthGuard,
    WorkspaceGuard,
    RolesGuard,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useExisting: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useExisting: WorkspaceGuard,
    },
    {
      provide: APP_GUARD,
      useExisting: RolesGuard,
    },
  ],
})
export class AppModule {}
