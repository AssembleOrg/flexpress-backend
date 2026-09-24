import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { UserLoginDto, CreateUserDto } from '../users/dto';
import { UserRole } from '../common/enums';
import {
  RefreshTokenService,
  RefreshContext,
} from './refresh-token.service';
import * as bcrypt from 'bcryptjs';
import { MailService } from '../mail/mail.service';

/** El link del mail de confirmación vence a las 48 h. */
const EMAIL_VERIFICATION_TTL_MS = 48 * 60 * 60 * 1000;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly mail: MailService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    // findFirst + deletedAt: una cuenta dada de baja no debe poder loguearse.
    // Con findUnique({ email }) el soft delete quedaba sin efecto.
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    if (user && (await bcrypt.compare(password, user.password))) {
      const { password, ...result } = user;
      return result;
    }

    return null;
  }

  async login(userLoginDto: UserLoginDto, ctx: RefreshContext = {}) {
    const user = await this.validateUser(userLoginDto.email, userLoginDto.password);

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (user.accountStatus === 'banned') {
      throw new ForbiddenException(
        user.accountStatusNote
          ? `Tu cuenta está bloqueada: ${user.accountStatusNote}`
          : 'Tu cuenta está bloqueada. Contactá al administrador.',
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload = { email: user.email, sub: user.id, role: user.role };
    const refresh = await this.refreshTokens.issue(user.id, ctx);

    return {
      access_token: this.jwtService.sign(payload),
      refresh_token: refresh.token,
      refresh_expires_at: refresh.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        address: user.address,
        credits: user.credits,
        documentationFrontUrl: user.documentationFrontUrl,
        documentationBackUrl: user.documentationBackUrl,
        number: user.number,
        avatar: user.avatar,
        verificationStatus: user.verificationStatus,
        rejectionReason: user.rejectionReason,
        emailVerifiedAt: user.emailVerifiedAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };
  }

  async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  async register(createUserDto: CreateUserDto, ctx: RefreshContext = {}) {
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('El usuario ya existe con este email');
    }

    // Hash password
    const hashedPassword = await this.hashPassword(createUserDto.password);

    // Create user (role validation is done in controller)
    // New charters start as 'pending', regular users as 'verified'
    const verificationStatus = createUserDto.role === UserRole.CHARTER ? 'pending' : 'verified';

    const user = await this.prisma.user.create({
      data: {
        ...createUserDto,
        password: hashedPassword,
        verificationStatus,
      },
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
        rejectionReason: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // El mail de confirmación sale en segundo plano: si Brevo falla o tarda,
    // la cuenta igual queda creada y el usuario puede pedirlo de nuevo.
    void this.sendEmailVerification(user).catch((err) =>
      this.logger.error(`No se pudo generar la confirmación de email de ${user.id}: ${err.message}`),
    );

    // Generate JWT token igual que login
    const payload = { email: user.email, sub: user.id, role: user.role };
    const refresh = await this.refreshTokens.issue(user.id, ctx);

    return {
      access_token: this.jwtService.sign(payload),
      refresh_token: refresh.token,
      refresh_expires_at: refresh.expiresAt,
      user,
    };
  }

  /**
   * Canjea un refresh token por un access nuevo. Revalida la cuenta contra la
   * base: si fue dada de baja o bloqueada desde que se emitió el refresh, el
   * canje falla y se cortan todas sus sesiones. Es lo que vuelve efectivo el
   * baneo aunque el access token siga sin vencer.
   */
  async refresh(token: string, ctx: RefreshContext = {}) {
    const { userId, refresh } = await this.refreshTokens.rotate(token, ctx);

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
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
        rejectionReason: true,
        accountStatus: true,
        accountStatusNote: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      await this.refreshTokens.revokeAllForUser(userId);
      throw new UnauthorizedException('Sesión inválida');
    }

    if (user.accountStatus === 'banned') {
      await this.refreshTokens.revokeAllForUser(userId);
      throw new ForbiddenException(
        user.accountStatusNote
          ? `Tu cuenta está bloqueada: ${user.accountStatusNote}`
          : 'Tu cuenta está bloqueada. Contactá al administrador.',
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload = { email: user.email, sub: user.id, role: user.role };

    return {
      access_token: this.jwtService.sign(payload),
      refresh_token: refresh.token,
      refresh_expires_at: refresh.expiresAt,
      user,
    };
  }

  /** Cierra la sesión de este dispositivo. El access vigente muere solo al vencer. */
  async logout(token?: string) {
    if (token) {
      await this.refreshTokens.revoke(token);
    }
    return { success: true };
  }

  /**
   * Genera un token nuevo (invalida el anterior) y manda el mail con el link.
   * En la base solo queda el hash: el token en claro viaja únicamente en el mail.
   */
  async sendEmailVerification(user: { id: string; email: string; name: string }) {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationTokenHash: hashToken(token),
        emailVerificationExpiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      },
    });
    const link = `${this.mail.frontendUrl}/verificar-email?token=${encodeURIComponent(token)}`;
    return this.mail.sendEmailVerification({ email: user.email, name: user.name }, link);
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findUnique({
      where: { emailVerificationTokenHash: hashToken(token) },
      select: { id: true, emailVerificationExpiresAt: true, deletedAt: true },
    });

    if (!user || user.deletedAt) {
      throw new BadRequestException('El link no es válido o ya se usó.');
    }
    if (!user.emailVerificationExpiresAt || user.emailVerificationExpiresAt < new Date()) {
      throw new BadRequestException('El link venció. Pedí uno nuevo desde tu cuenta.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
      },
    });
    return { verified: true };
  }

  async resendEmailVerification(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true, name: true, emailVerifiedAt: true },
    });
    if (!user) throw new UnauthorizedException('Usuario no encontrado');
    if (user.emailVerifiedAt) {
      throw new BadRequestException('Tu email ya está confirmado.');
    }

    const sent = await this.sendEmailVerification(user);
    if (!sent) {
      throw new BadRequestException('No pudimos enviar el mail. Probá de nuevo en unos minutos.');
    }
    return { sent: true };
  }
}
