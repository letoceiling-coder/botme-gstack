import { Module } from '@nestjs/common';
import { AssistantModule } from '../assistant/assistant.module';
import { FoundationModule } from '../foundation/foundation.module';
import { WidgetAdminService } from './application/widget-admin.service';
import { WidgetPublicService } from './application/widget-public.service';
import { OperatorPublicService } from './application/operator-public.service';
import { WidgetAdminRepository } from './infrastructure/widget-admin.repository';
import { WidgetAdminController } from './presentation/widget-admin.controller';
import { WidgetPublicController } from './presentation/widget-public.controller';
import { OperatorPublicController } from './presentation/operator-public.controller';

@Module({
  imports: [FoundationModule, AssistantModule],
  controllers: [WidgetAdminController, WidgetPublicController, OperatorPublicController],
  providers: [WidgetAdminService, WidgetPublicService, OperatorPublicService, WidgetAdminRepository],
  exports: [WidgetAdminService, WidgetAdminRepository],
})
export class WidgetAdminModule {}
