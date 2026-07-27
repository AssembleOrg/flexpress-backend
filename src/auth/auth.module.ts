import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    // Sin fallback de secreto a propósito: un default haría que los tokens se
    // firmen con un valor público si falta la variable. validateEnv ya exige
    // JWT_SECRET al arrancar.
    //
    // expiresIn estaba fijo en 24h, así que JWT_EXPIRES_IN (documentada y
    // seteada en 3d) no tenía ningún efecto: los tokens duraban 24h.
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: {
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {} 