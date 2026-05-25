import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FoundationModule } from '../foundation/foundation.module';
import { IntegrationService } from './application/integration.service';
import { ModelSyncService } from './application/model-sync.service';
import { ModelCacheRepository } from './infrastructure/model-cache.repository';
import { IntegrationController } from './presentation/integration.controller';

@Module({
  imports: [AuthModule, FoundationModule],
  controllers: [IntegrationController],
  providers: [IntegrationService, ModelSyncService, ModelCacheRepository],
  exports: [IntegrationService, ModelSyncService, ModelCacheRepository],
})
export class IntegrationModule {}
