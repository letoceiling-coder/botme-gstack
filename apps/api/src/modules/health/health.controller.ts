import { Controller, Get } from '@nestjs/common';
import { Public } from '../../core/decorators/public.decorator';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RedisService } from '../../core/redis/redis.service';

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get('health')
  async health() {
    const checks = {
      api: 'ok' as const,
      postgres: 'unknown' as 'ok' | 'error' | 'unknown',
      redis: 'unknown' as 'ok' | 'error' | 'unknown',
    };

    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
      checks.postgres = 'ok';
    } catch {
      checks.postgres = 'error';
    }

    try {
      const pong = await this.redis.client.ping();
      checks.redis = pong === 'PONG' ? 'ok' : 'error';
    } catch {
      checks.redis = 'error';
    }

    const healthy = checks.postgres === 'ok' && checks.redis === 'ok';
    return {
      status: healthy ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}
