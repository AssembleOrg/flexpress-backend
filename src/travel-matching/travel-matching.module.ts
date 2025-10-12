import { Module } from '@nestjs/common';
import { TravelMatchingController } from './travel-matching.controller';
import { TravelMatchingService } from './travel-matching.service';
import { TravelMatchingGateway } from './travel-matching.gateway';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TravelMatchingController],
  providers: [TravelMatchingService, TravelMatchingGateway],
  exports: [TravelMatchingService],
})
export class TravelMatchingModule {}

