import { Controller, Get, Headers, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../../core/decorators/public.decorator';
import { WidgetPublicService } from '../application/widget-public.service';

@Controller('public/widget')
export class WidgetPublicController {
  constructor(private readonly widgetPublic: WidgetPublicService) {}

  @Public()
  @Get(':publicKey/init')
  async init(
    @Param('publicKey') publicKey: string,
    @Headers('origin') origin: string | undefined,
    @Headers('referer') referer: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    return this.widgetPublic.getInit(publicKey, origin, referer);
  }
}
