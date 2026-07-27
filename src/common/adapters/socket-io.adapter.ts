import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export class SocketIoAdapter extends IoAdapter {
  private readonly origins: string[];

  constructor(private app: INestApplication) {
    super(app);
    // Misma lista que el CORS HTTP (config.corsOrigins). Estaba hardcodeada
    // y le faltaba el dominio de Railway, así que los websockets fallaban en
    // el deploy mientras las llamadas HTTP funcionaban.
    this.origins = app.get(ConfigService).get<string[]>('corsOrigins') ?? [];
  }

  createIOServer(port: number, options?: ServerOptions): any {
    return super.createIOServer(port, {
      ...options,
      cors: {
        origin: this.origins,
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });
  }
}
