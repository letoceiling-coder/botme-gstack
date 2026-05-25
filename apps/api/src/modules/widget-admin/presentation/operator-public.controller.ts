import { Controller, Get, Headers, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../../core/decorators/public.decorator';
import { OperatorPublicService } from '../application/operator-public.service';

@Controller('public/operator')
export class OperatorPublicController {
  constructor(private readonly operatorPublic: OperatorPublicService) {}

  @Public()
  @Get(':publicKey/init')
  async init(
    @Param('publicKey') publicKey: string,
    @Headers('origin') origin: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    return this.operatorPublic.getInit(publicKey, origin);
  }
}
