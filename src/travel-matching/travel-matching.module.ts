import { Module, forwardRef } from '@nestjs/common';
import { TravelMatchingController } from './travel-matching.controller';
import { TravelMatchingService } from './travel-matching.service';
import { TravelMatchingGateway } from './travel-matching.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { ConversationsModule } from 'src/conversations/conversations.module';

@Module({
  imports: [PrismaModule, forwardRef(() => ConversationsModule)],
  controllers: [TravelMatchingController],
  providers: [TravelMatchingService, TravelMatchingGateway],
  exports: [TravelMatchingService, TravelMatchingGateway],
})
export class TravelMatchingModule {}
