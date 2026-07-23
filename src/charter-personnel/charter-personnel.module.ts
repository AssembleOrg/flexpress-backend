import { Module } from '@nestjs/common';
import { CharterPersonnelController } from './charter-personnel.controller';
import { CharterPersonnelService } from './charter-personnel.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [CharterPersonnelController],
  providers: [CharterPersonnelService],
  exports: [CharterPersonnelService],
})
export class CharterPersonnelModule {}
