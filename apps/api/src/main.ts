import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { setupRealtimeAdapter } from './modules/realtime/realtime.adapter';

loadEnv({ path: resolve(__dirname, '../../../.env'), override: true });

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  await setupRealtimeAdapter(app);
  const config = app.get(ConfigService);

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const corsOrigins = config.get<string>('CORS_ORIGINS', 'http://localhost:5173');
  app.enableCors({
    origin: corsOrigins.split(',').map((o) => o.trim()),
    credentials: true,
  });

  const port = Number(config.get('API_PORT') ?? 3010) || 3010;
  await app.listen(port);
}

void bootstrap();
