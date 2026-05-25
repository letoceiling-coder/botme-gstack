import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplication, INestApplicationContext, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAdapter } from '@socket.io/redis-adapter';
import { ServerOptions } from 'socket.io';
import Redis from 'ioredis';

/** Created in bootstrap — not Nest DI (constructor needs INestApplicationContext). */
export class RealtimeIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RealtimeIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
  private readonly nestApp: INestApplicationContext;

  constructor(app: INestApplicationContext) {
    super(app);
    this.nestApp = app;
  }

  async connectToRedis(): Promise<void> {
    const config = this.nestApp.get(ConfigService);
    const url = config.get<string>('REDIS_URL', 'redis://localhost:6379');
    const pub = new Redis(url, { maxRetriesPerRequest: null });
    const sub = pub.duplicate();
    this.adapterConstructor = createAdapter(pub, sub);
    this.logger.log('Socket.io Redis adapter connected');
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, {
      ...options,
      pingInterval: 25_000,
      pingTimeout: 60_000,
      transports: ['websocket', 'polling'],
    });
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}

export async function setupRealtimeAdapter(app: INestApplication): Promise<void> {
  const adapter = new RealtimeIoAdapter(app);
  await adapter.connectToRedis();
  app.useWebSocketAdapter(adapter);
}
