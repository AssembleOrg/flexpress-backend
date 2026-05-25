import { Module } from '@nestjs/common';
import { AvailabilityInquiriesController } from './availability-inquiries.controller';
import { AvailabilityInquiriesService } from './availability-inquiries.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [AvailabilityInquiriesController],
  providers: [AvailabilityInquiriesService],
  exports: [AvailabilityInquiriesService],
})
export class AvailabilityInquiriesModule {}
