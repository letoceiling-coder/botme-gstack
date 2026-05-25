import { Global, Module } from '@nestjs/common';
import { CorsOriginsService } from './config/cors-origins.service';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';

@Global()
@Module({
  providers: [PrismaService, RedisService, CorsOriginsService],
  exports: [PrismaService, RedisService, CorsOriginsService],
})
export class CoreModule {}
