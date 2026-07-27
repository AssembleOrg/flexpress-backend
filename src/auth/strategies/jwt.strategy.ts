import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const secret = configService.get<string>('jwt.secret');
    if (!secret) {
      throw new Error('JWT_SECRET is not defined');
    }
    
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        address: true,
        credits: true,
        documentationFrontUrl: true,
        documentationBackUrl: true,
        number: true,
        avatar: true,
        verificationStatus: true,
        accountStatus: true,
        accountStatusNote: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    // El token vive 3 días: sin revalidar baja y baneo en cada request, un
    // usuario dado de baja o bloqueado seguía operando hasta que expirara.
    if (user.deletedAt) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    if (user.accountStatus === 'banned') {
      throw new ForbiddenException(
        user.accountStatusNote
          ? `Tu cuenta está bloqueada: ${user.accountStatusNote}`
          : 'Tu cuenta está bloqueada. Contactá al administrador.',
      );
    }

    const { deletedAt, ...authUser } = user;
    return authUser;
  }
} 