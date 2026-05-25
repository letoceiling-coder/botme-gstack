import { Body, Controller, Headers, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../../core/decorators/public.decorator';
import { ExchangeOperatorRuntimeSessionSchema } from '@botme/shared';
import { OperatorRuntimeTokenService } from '../application/operator-runtime-token.service';

@Controller('public/operator-runtime')
export class OperatorRuntimePublicController {
  constructor(private readonly tokens: OperatorRuntimeTokenService) {}

  @Public()
  @Post('session')
  async session(
    @Body() body: unknown,
    @Headers('origin') origin: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    const input = ExchangeOperatorRuntimeSessionSchema.parse(body);
    return this.tokens.exchangeSession(input.token, origin, input.workspaceId);
  }
}
