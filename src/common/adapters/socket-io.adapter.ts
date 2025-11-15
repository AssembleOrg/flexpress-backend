import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { INestApplication } from '@nestjs/common';

export class SocketIoAdapter extends IoAdapter {
  constructor(private app: INestApplication) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: ['http://localhost:3001', 'https://flexpress-front.vercel.app'],
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });
    return server;
  }
}
