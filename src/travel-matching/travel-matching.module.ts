import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TravelMatchingController } from './travel-matching.controller';
import { TravelMatchingService } from './travel-matching.service';
import { TravelMatchingGateway } from './travel-matching.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { ConversationsModule } from 'src/conversations/conversations.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    forwardRef(() => ConversationsModule),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
    }),
  ],
  controllers: [TravelMatchingController],
  providers: [TravelMatchingService, TravelMatchingGateway],
  exports: [TravelMatchingService, TravelMatchingGateway],
})
export class TravelMatchingModule {}
