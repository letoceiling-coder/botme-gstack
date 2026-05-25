import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AssistantModule } from '../assistant/assistant.module';
import { FoundationModule } from '../foundation/foundation.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { WidgetAdminService } from './application/widget-admin.service';
import { WidgetPublicService } from './application/widget-public.service';
import { OperatorPublicService } from './application/operator-public.service';
import { OperatorRuntimeTokenService } from './application/operator-runtime-token.service';
import { OperatorEmbedValidationService } from './application/operator-embed-validation.service';
import { OperatorSelfHostPackService } from './application/operator-self-host-pack.service';
import { WidgetConnectionHealthService } from './application/widget-connection-health.service';
import { WidgetConnectionCenterService } from './application/widget-connection-center.service';
import { WidgetAdminRepository } from './infrastructure/widget-admin.repository';
import { WidgetAdminController } from './presentation/widget-admin.controller';
import { WidgetPublicController } from './presentation/widget-public.controller';
import { OperatorPublicController } from './presentation/operator-public.controller';
import {
  OperatorRuntimeTokenController,
  OperatorSelfHostController,
} from './presentation/operator-runtime-token.controller';
import { OperatorRuntimePublicController } from './presentation/operator-runtime-public.controller';

@Module({
  imports: [FoundationModule, AssistantModule, RealtimeModule, JwtModule.register({})],
  controllers: [
    WidgetAdminController,
    WidgetPublicController,
    OperatorPublicController,
    OperatorRuntimeTokenController,
    OperatorSelfHostController,
    OperatorRuntimePublicController,
  ],
  providers: [
    WidgetAdminService,
    WidgetPublicService,
    OperatorPublicService,
    OperatorRuntimeTokenService,
    OperatorEmbedValidationService,
    OperatorSelfHostPackService,
    WidgetConnectionHealthService,
    WidgetConnectionCenterService,
    WidgetAdminRepository,
  ],
  exports: [WidgetAdminService, WidgetAdminRepository, OperatorRuntimeTokenService],
})
export class WidgetAdminModule {}
