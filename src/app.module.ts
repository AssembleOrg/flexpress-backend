import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TripsModule } from './trips/trips.module';
import { PaymentsModule } from './payments/payments.module';
import { SystemConfigModule } from './system-config/system-config.module';
import { TravelMatchingModule } from './travel-matching/travel-matching.module';
import { FeedbackModule } from './feedback/feedback.module';
import { ConversationsModule } from './conversations/conversations.module';
import { ReportsModule } from './reports/reports.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { RequestLoggerInterceptor } from './common/interceptors/request-logger.interceptor';
import { GeolocationService } from './common/services/geolocation.service';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    TripsModule,
    PaymentsModule,
    SystemConfigModule,
    TravelMatchingModule,
    FeedbackModule,
    ConversationsModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    GeolocationService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggerInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
