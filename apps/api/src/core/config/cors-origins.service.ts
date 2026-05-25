import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CorsOriginsService {
  constructor(private readonly config: ConfigService) {}

  get allowedOrigins(): string[] {
    return this.config
      .get<string>('CORS_ORIGINS', 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }

  socketCorsOptions() {
    const origins = this.allowedOrigins;
    return {
      origin: origins,
      credentials: true,
    };
  }
}
