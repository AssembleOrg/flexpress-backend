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
  @ApiOperation({ summary: 'Get all users without pagination' })
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
  async findAllWithoutPagination(): Promise<UserResponseDto[]> {
    return this.usersService.findWithoutPagination();
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
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a user (soft delete)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'User deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @Auditory('User')
  async remove(@Param('id') id: string): Promise<void> {
    return this.usersService.remove(id);
  }
} 