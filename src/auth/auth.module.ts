import { Module } from '@nestjs/common';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
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
      // El cast es necesario porque `expiresIn` está tipado con el template
      // literal `StringValue` de ms ('3d', '24h', ...) y lo que sale de
      // process.env es string a secas. El formato se valida al firmar el
      // primer token.
      signOptions: {
        expiresIn: (process.env.JWT_EXPIRES_IN ||
          '24h') as JwtSignOptions['expiresIn'],
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {} 