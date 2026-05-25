import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntegrationCredentialsService } from '../../core/security/integration-credentials.service';
import { ProviderCredentialsResolver } from '../../core/config/provider-credentials.resolver';
import { AuditService } from './application/audit.service';
import { WidgetAuthService } from './application/widget-auth.service';
import { WidgetPreviewTokenService } from './application/widget-preview-token.service';
import { AuditRepository } from './infrastructure/audit.repository';
import { IntegrationRepository } from './infrastructure/integration.repository';
import { WidgetRepository } from './infrastructure/widget.repository';

@Global()
@Module({
  imports: [AuthModule],
  providers: [
    IntegrationCredentialsService,
    ProviderCredentialsResolver,
    AuditRepository,
    AuditService,
    WidgetRepository,
    WidgetPreviewTokenService,
    WidgetAuthService,
    IntegrationRepository,
  ],
  exports: [
    IntegrationCredentialsService,
    ProviderCredentialsResolver,
    AuditService,
    WidgetAuthService,
    WidgetPreviewTokenService,
    IntegrationRepository,
    WidgetRepository,
    AuditRepository,
  ],
})
export class FoundationModule {}
