import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { UserLoginDto, CreateUserDto } from '../users/dto';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshTokenDto } from './dto/refresh-token.dto';

/** Datos del request que se guardan con la sesión, para poder auditarla. */
const sessionContext = (req: any) => ({
  userAgent: req.headers?.['user-agent'],
  ip:
    req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers?.['x-real-ip'] ||
    req.ip,
});

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Devuelve el usuario del token, ya revalidado contra la base por
   * JwtStrategy: si la cuenta fue dada de baja o bloqueada, este endpoint
   * responde 401/403 aunque el token siga sin expirar. Es lo que le permite al
   * front detectar una sesión revocada al abrir la app, sin esperar a que
   * falle la primera llamada de datos.
   */
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Usuario autenticado actual' })
  @ApiResponse({ status: 200, description: 'Sesión válida' })
  @ApiResponse({ status: 401, description: 'Token inválido, expirado o cuenta dada de baja' })
  @ApiResponse({ status: 403, description: 'Cuenta bloqueada' })
  getProfile(@Request() req: any) {
    return req.user;
  }

  @Public()
  @Post('login')
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User login' })
  @ApiBody({ 
    type: UserLoginDto,
    examples: {
      login: {
        summary: 'User Login',
        value: {
          email: 'user@flexpress.com',
          password: 'password123'
        }
      }
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    examples: {
      success: {
        summary: 'Login Successful',
        value: {
          access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          user: {
            id: 'clx1234567890abcdef',
            email: 'user@flexpress.com',
            name: 'John Doe',
            role: 'user',
            address: 'Buenos Aires, Argentina',
            credits: 100,
            number: 'USER001',
            createdAt: '2024-01-15T10:30:00.000Z',
            updatedAt: '2024-01-15T10:30:00.000Z'
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
    examples: {
      invalidCredentials: {
        summary: 'Invalid Credentials',
        value: {
          message: 'Credenciales inválidas',
          error: 'Unauthorized',
          statusCode: 401
        }
      }
    }
  })
  async login(@Body() userLoginDto: UserLoginDto, @Request() req: any) {
    return this.authService.login(userLoginDto, sessionContext(req));
  }

  /**
   * Canjea el refresh por un access nuevo. El refresh rota: el anterior queda
   * inutilizable, así que si vuelve a aparecer se asume robo y se cortan todas
   * las sesiones del usuario.
   */
  @Public()
  @Post('refresh')
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar el access token' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 200, description: 'Access y refresh nuevos' })
  @ApiResponse({ status: 401, description: 'Refresh inválido, vencido o ya usado' })
  @ApiResponse({ status: 403, description: 'Cuenta bloqueada' })
  async refresh(@Body() dto: RefreshTokenDto, @Request() req: any) {
    return this.authService.refresh(dto.refresh_token, sessionContext(req));
  }

  /**
   * Revoca la sesión de este dispositivo. Es público a propósito: si el access
   * ya venció el usuario igual tiene que poder cerrar sesión.
   */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar sesión en este dispositivo' })
  @ApiBody({ type: RefreshTokenDto, required: false })
  @ApiResponse({ status: 200, description: 'Sesión cerrada' })
  async logout(@Body() dto: Partial<RefreshTokenDto>) {
    return this.authService.logout(dto?.refresh_token);
  }

  @Public()
  @Post('register')
  @Throttle({ short: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user (no admin/subadmin roles allowed)' })
  @ApiBody({ 
    type: CreateUserDto,
    examples: {
      regularUser: {
        summary: 'Regular User Registration',
        value: {
          email: 'newuser@example.com',
          name: 'New User',
          password: 'password123',
          role: 'user',
          address: '123 New Street, Buenos Aires, Argentina',
          credits: 50,
          number: 'NEWUSER001'
        }
      },
      charterUser: {
        summary: 'Charter Service Registration',
        value: {
          email: 'newcharter@example.com',
          name: 'New Charter Service',
          password: 'password123',
          role: 'charter',
          address: '456 Charter Street, Buenos Aires, Argentina',
          credits: 0,
          number: 'NEWCHARTER001',
          documentationFrontUrl: 'https://example.com/front.jpg',
          documentationBackUrl: 'https://example.com/back.jpg'
        }
      }
    }
  })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully',
    examples: {
      success: {
        summary: 'User Registered Successfully',
        value: {
          id: 'clx1234567890abcdef',
          email: 'newuser@example.com',
          name: 'New User',
          role: 'user',
          address: '123 New Street, Buenos Aires, Argentina',
          credits: 50,
          number: 'NEWUSER001',
          createdAt: '2024-01-15T10:30:00.000Z',
          updatedAt: '2024-01-15T10:30:00.000Z'
        }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid role or validation error',
    examples: {
      invalidRole: {
        summary: 'Invalid Role Error',
        value: {
          message: 'No se pueden crear usuarios con roles admin o subadmin',
          error: 'Bad Request',
          statusCode: 400
        }
      },
      validationError: {
        summary: 'Validation Error',
        value: {
          message: ['email must be an email', 'password must not be empty'],
          error: 'Bad Request',
          statusCode: 400
        }
      }
    }
  })
  @ApiResponse({
    status: 409,
    description: 'User already exists',
    examples: {
      conflict: {
        summary: 'Email Already Exists',
        value: {
          message: 'El usuario ya existe con este email',
          error: 'Conflict',
          statusCode: 409
        }
      }
    }
  })
  async register(@Body() createUserDto: CreateUserDto, @Request() req: any) {
    // Validate that admin/subadmin roles are not allowed
    if (createUserDto.role === 'admin' || createUserDto.role === 'subadmin') {
      throw new BadRequestException('No se pueden crear usuarios con roles admin o subadmin');
    }
    
    return this.authService.register(createUserDto, sessionContext(req));
  }
} 