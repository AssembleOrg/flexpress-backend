import { Module } from '@nestjs/common';
import { CharterPersonnelController } from './charter-personnel.controller';
import { CharterPersonnelService } from './charter-personnel.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CharterPersonnelController],
  providers: [CharterPersonnelService],
  exports: [CharterPersonnelService],
})
export class CharterPersonnelModule {}
