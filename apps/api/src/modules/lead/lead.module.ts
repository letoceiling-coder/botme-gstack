import { Module } from '@nestjs/common';
import { LeadService } from './application/lead.service';
import { LeadRepository } from './infrastructure/lead.repository';
import { LeadController } from './presentation/lead.controller';

@Module({
  controllers: [LeadController],
  providers: [LeadService, LeadRepository],
  exports: [LeadService, LeadRepository],
})
export class LeadModule {}
