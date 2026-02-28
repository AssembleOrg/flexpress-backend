import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import {
  CreateUserDto,
  UpdateUserDto,
  UserResponseDto,
  VerifyCharterDto,
} from './dto';
import { PaginationQueryDto, PaginatedResponseDto } from '../common/dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Auditory } from '../common/decorators/auditory.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiBody({ 
    type: CreateUserDto,
    examples: {
      user: {
        summary: 'Regular User',
        value: {
          email: 'user@example.com',
          name: 'John Doe',
          password: 'password123',
          role: 'user',
          address: '123 Main St, Buenos Aires, Argentina',
          credits: 100,
          number: 'USER001',
          avatar: 'https://example.com/avatar.jpg'
        }
      },
      charter: {
        summary: 'Charter Service',
        value: {
          email: 'charter@example.com',
          name: 'Premium Charter Service',
          password: 'password123',
          role: 'charter',
          address: '456 Charter Ave, Buenos Aires, Argentina',
          credits: 0,
          number: 'CHARTER001',
          documentationFrontUrl: 'https://example.com/front.jpg',
          documentationBackUrl: 'https://example.com/back.jpg'
        }
      }
    }
  })
  @ApiResponse({
    status: 201,
    description: 'User created successfully',
    type: UserResponseDto,
    examples: {
      success: {
        summary: 'User Created Successfully',
        value: {
          id: 'clx1234567890abcdef',
          email: 'user@example.com',
          name: 'John Doe',
          role: 'user',
          address: '123 Main St, Buenos Aires, Argentina',
          credits: 100,
          number: 'USER001',
          avatar: 'https://example.com/avatar.jpg',
          createdAt: '2024-01-15T10:30:00.000Z',
          updatedAt: '2024-01-15T10:30:00.000Z'
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
  @Auditory('User')
  async create(@Body() createUserDto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all users with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Users retrieved successfully',
    examples: {
      success: {
        summary: 'Paginated Users Response',
        value: {
          data: [
            {
              id: 'clx1234567890abcdef',
              email: 'admin@flexpress.com',
              name: 'System Administrator',
              role: 'admin',
              address: 'Buenos Aires, Argentina',
              credits: 1000,
              number: 'ADMIN001',
              createdAt: '2024-01-15T10:30:00.000Z',
              updatedAt: '2024-01-15T10:30:00.000Z'
            },
            {
              id: 'clx1234567890abcdef2',
              email: 'user@flexpress.com',
              name: 'Sample User',
              role: 'user',
              address: 'Buenos Aires, Argentina',
              credits: 100,
              number: 'USER001',
              createdAt: '2024-01-15T10:30:00.000Z',
              updatedAt: '2024-01-15T10:30:00.000Z'
            }
          ],
          meta: {
            page: 1,
            limit: 10,
            total: 2,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false
          }
        }
      }
    }
  })
  async findAll(
    @Query() paginationQuery: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<UserResponseDto>> {
    return this.usersService.findAll(paginationQuery);
  }

  @Get('all')
  @ApiOperation({ summary: 'Get all users without pagination (admin/subadmin only)' })
  @ApiResponse({
    status: 200,
    description: 'Users retrieved successfully',
    type: [UserResponseDto],
    examples: {
      success: {
        summary: 'All Users Response',
        value: [
          {
            id: 'clx1234567890abcdef',
            email: 'admin@flexpress.com',
            name: 'System Administrator',
            role: 'admin',
            address: 'Buenos Aires, Argentina',
            credits: 1000,
            number: 'ADMIN001',
            createdAt: '2024-01-15T10:30:00.000Z',
            updatedAt: '2024-01-15T10:30:00.000Z'
          },
          {
            id: 'clx1234567890abcdef2',
            email: 'user@flexpress.com',
            name: 'Sample User',
            role: 'user',
            address: 'Buenos Aires, Argentina',
            credits: 100,
            number: 'USER001',
            createdAt: '2024-01-15T10:30:00.000Z',
            updatedAt: '2024-01-15T10:30:00.000Z'
          }
        ]
      }
    }
  })
  @ApiResponse({
    status: 403,
    description: 'User is not authorized to view all users',
  })
  async findAllWithoutPagination(@Request() req): Promise<UserResponseDto[]> {
    const userRole = req.user?.role;
    if (userRole !== 'admin' && userRole !== 'subadmin') {
      throw new ForbiddenException('Solo administradores pueden ver todos los usuarios');
    }
    return this.usersService.findWithoutPagination();
  }

  @Get('charters/pending')
  @ApiOperation({ summary: 'Get all pending charters awaiting verification (admin/subadmin only)' })
  @ApiResponse({
    status: 200,
    description: 'Pending charters retrieved successfully',
    type: [UserResponseDto],
    examples: {
      success: {
        summary: 'Pending Charters Response',
        value: [
          {
            id: 'clx1234567890abcdef',
            email: 'newcharter@example.com',
            name: 'New Charter Service',
            role: 'charter',
            address: 'Buenos Aires, Argentina',
            verificationStatus: 'pending',
            documentationFrontUrl: 'https://example.com/front.jpg',
            documentationBackUrl: 'https://example.com/back.jpg',
            createdAt: '2024-01-15T10:30:00.000Z',
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'User is not authorized to view pending charters',
  })
  async findPendingCharters(@Request() req): Promise<UserResponseDto[]> {
    const userRole = req.user?.role;
    if (userRole !== 'admin' && userRole !== 'subadmin') {
      throw new ForbiddenException('Solo administradores pueden ver charters pendientes');
    }
    return this.usersService.findPendingCharters();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by ID' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'User retrieved successfully',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async findOne(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user' })
  @ApiParam({ name: 'id', description: 'User ID', example: 'clx1234567890abcdef' })
  @ApiBody({ 
    type: UpdateUserDto,
    examples: {
      updateName: {
        summary: 'Update User Name',
        value: {
          name: 'John Smith Updated'
        }
      },
      updateCredits: {
        summary: 'Update User Credits',
        value: {
          credits: 200
        }
      },
      updateAddress: {
        summary: 'Update User Address',
        value: {
          address: '789 New Street, Buenos Aires, Argentina'
        }
      }
    }
  })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully',
    type: UserResponseDto,
    examples: {
      success: {
        summary: 'User Updated Successfully',
        value: {
          id: 'clx1234567890abcdef',
          email: 'user@example.com',
          name: 'John Smith Updated',
          role: 'user',
          address: '789 New Street, Buenos Aires, Argentina',
          credits: 200,
          number: 'USER001',
          createdAt: '2024-01-15T10:30:00.000Z',
          updatedAt: '2024-01-15T11:45:00.000Z'
        }
      }
    }
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
    examples: {
      notFound: {
        summary: 'User Not Found',
        value: {
          message: 'Usuario no encontrado',
          error: 'Not Found',
          statusCode: 404
        }
      }
    }
  })
  @ApiResponse({
    status: 409,
    description: 'Email already in use',
    examples: {
      conflict: {
        summary: 'Email Already In Use',
        value: {
          message: 'El email ya está en uso',
          error: 'Conflict',
          statusCode: 409
        }
      }
    }
  })
  @Auditory('User')
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Request() req,
  ): Promise<UserResponseDto> {
    // Validar ownership: admin/subadmin o el mismo usuario
    const userRole = req.user?.role;
    if (!['admin', 'subadmin'].includes(userRole) && id !== req.user.id) {
      throw new ForbiddenException('No tienes permiso para modificar este usuario');
    }
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a user (admin/subadmin only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'User deleted successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Not authorized to delete users',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @Auditory('User')
  async remove(@Param('id') id: string, @Request() req): Promise<void> {
    // Solo admin/subadmin puede eliminar usuarios
    const userRole = req.user?.role;
    if (!['admin', 'subadmin'].includes(userRole)) {
      throw new ForbiddenException('Solo administradores pueden eliminar usuarios');
    }
    return this.usersService.remove(id);
  }

  @Patch(':id/update-dni-urls')
  @ApiOperation({ summary: 'Update DNI URLs after UploadThing upload' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        documentationFrontUrl: { type: 'string' },
        documentationBackUrl: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'DNI URLs updated successfully',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'User is not authorized to update this user',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @Auditory('User')
  async updateDniUrls(
    @Param('id') id: string,
    @Body() body: { documentationFrontUrl: string; documentationBackUrl: string },
    @Request() req,
  ): Promise<UserResponseDto> {
    // Validar permisos (mismo user o admin)
    if (id !== req.user.id && !['admin', 'subadmin'].includes(req.user.role)) {
      throw new ForbiddenException('Sin permiso');
    }

    // Actualizar URLs
    return this.usersService.update(id, {
      documentationFrontUrl: body.documentationFrontUrl,
      documentationBackUrl: body.documentationBackUrl,
    });
  }

  @Patch(':id/verify')
  @ApiOperation({ summary: 'Verify or reject a charter (admin/subadmin only)' })
  @ApiParam({ name: 'id', description: 'Charter User ID', example: 'clx1234567890abcdef' })
  @ApiBody({
    type: VerifyCharterDto,
    examples: {
      approve: {
        summary: 'Approve Charter',
        value: {
          status: 'verified',
        },
      },
      reject: {
        summary: 'Reject Charter',
        value: {
          status: 'rejected',
          rejectionReason: 'Documentación incompleta o ilegible',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Charter verification status updated successfully',
    type: UserResponseDto,
    examples: {
      verified: {
        summary: 'Charter Verified',
        value: {
          id: 'clx1234567890abcdef',
          email: 'charter@example.com',
          name: 'Charter Service',
          role: 'charter',
          verificationStatus: 'verified',
          verifiedAt: '2024-01-15T11:45:00.000Z',
          verifiedBy: 'admin-user-id',
        },
      },
      rejected: {
        summary: 'Charter Rejected',
        value: {
          id: 'clx1234567890abcdef',
          email: 'charter@example.com',
          name: 'Charter Service',
          role: 'charter',
          verificationStatus: 'rejected',
          rejectionReason: 'Documentación incompleta o ilegible',
          verifiedAt: '2024-01-15T11:45:00.000Z',
          verifiedBy: 'admin-user-id',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request',
    examples: {
      notCharter: {
        summary: 'Not a Charter',
        value: {
          message: 'Este usuario no es un charter',
          error: 'Bad Request',
          statusCode: 400,
        },
      },
      alreadyVerified: {
        summary: 'Already Verified',
        value: {
          message: 'Este charter ya fue verificado',
          error: 'Bad Request',
          statusCode: 400,
        },
      },
      missingReason: {
        summary: 'Missing Rejection Reason',
        value: {
          message: 'Debe proporcionar una razón de rechazo',
          error: 'Bad Request',
          statusCode: 400,
        },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'User is not authorized to verify charters',
  })
  @ApiResponse({
    status: 404,
    description: 'Charter not found',
  })
  @Auditory('User')
  async verifyCharter(
    @Param('id') id: string,
    @Body() verifyCharterDto: VerifyCharterDto,
    @Request() req,
  ): Promise<UserResponseDto> {
    const userRole = req.user?.role;
    if (userRole !== 'admin' && userRole !== 'subadmin') {
      throw new ForbiddenException('Solo administradores pueden verificar charters');
    }
    return this.usersService.verifyCharter(id, verifyCharterDto, req.user.id);
  }
} 