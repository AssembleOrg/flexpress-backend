import { Module, forwardRef } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TravelMatchingModule } from '../travel-matching/travel-matching.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [PrismaModule, forwardRef(() => TravelMatchingModule), PushModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
