import { Module, forwardRef } from '@nestjs/common';
import { TripsService } from './trips.service';
import { TripsController } from './trips.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TravelMatchingModule } from '../travel-matching/travel-matching.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => TravelMatchingModule),
  ],
  controllers: [TripsController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {} 