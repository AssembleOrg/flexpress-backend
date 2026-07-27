import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TravelMatchingController } from './travel-matching.controller';
import { TravelMatchingService } from './travel-matching.service';
import { TravelPricingService } from './travel-pricing.service';
import { CharterAvailabilityService } from './charter-availability.service';
import { TravelMatchingGateway } from './travel-matching.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => NotificationsModule),
    forwardRef(() => ConversationsModule),
    // Sin fallback a propósito: un secreto por defecto haría que los tokens se
    // firmen con un valor público si falta la variable. validateEnv ya exige
    // JWT_SECRET al arrancar, así que acá no puede estar vacío.
    JwtModule.register({
      secret: process.env.JWT_SECRET,
    }),
  ],
  controllers: [TravelMatchingController],
  providers: [
    TravelMatchingService,
    TravelPricingService,
    CharterAvailabilityService,
    TravelMatchingGateway,
  ],
  exports: [TravelMatchingService, TravelMatchingGateway],
})
export class TravelMatchingModule {}
