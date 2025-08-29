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
import { SystemConfigService } from './system-config.service';
import {
  CreateSystemConfigDto,
  UpdateSystemConfigDto,
  SystemConfigResponseDto,
} from './dto';
import { PaginationQueryDto, PaginatedResponseDto } from '../common/dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Auditory } from '../common/decorators/auditory.decorator';

@ApiTags('System Configuration')
@Controller('system-config')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SystemConfigController {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new system configuration' })
  @ApiBody({ 
    type: CreateSystemConfigDto,
    examples: {
      creditPrice: {
        summary: 'Credit Price Configuration',
        value: {
          key: 'credit_price',
          value: '1.50',
          description: 'Price per credit in USD'
        }
      },
      contactEmail: {
        summary: 'Contact Email Configuration',
        value: {
          key: 'contact_email',
          value: 'support@flexpress.com',
          description: 'Main contact email address'
        }
      }
    }
  })
  @ApiResponse({
    status: 201,
    description: 'System configuration created successfully',
    type: SystemConfigResponseDto,
    examples: {
      success: {
        summary: 'Configuration Created Successfully',
        value: {
          id: 'clx1234567890abcdef',
          key: 'credit_price',
          value: '1.50',
          description: 'Price per credit in USD',
          createdAt: '2024-01-15T10:30:00.000Z',
          updatedAt: '2024-01-15T10:30:00.000Z'
        }
      }
    }
  })
  @ApiResponse({
    status: 409,
    description: 'Configuration key already exists',
    examples: {
      conflict: {
        summary: 'Key Already Exists',
        value: {
          message: 'La clave de configuración ya existe',
          error: 'Conflict',
          statusCode: 409
        }
      }
    }
  })
  @Auditory('SystemConfig')
  async create(@Body() createSystemConfigDto: CreateSystemConfigDto): Promise<SystemConfigResponseDto> {
    return this.systemConfigService.create(createSystemConfigDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all system configurations with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 }) 
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'System configurations retrieved successfully',
    examples: {
      success: {
        summary: 'Paginated System Configs Response',
        value: {
          data: [
            {
              id: 'clx1234567890abcdef',
              key: 'credit_price',
              value: '1.50',
              description: 'Price per credit in USD',
              createdAt: '2024-01-15T10:30:00.000Z',
              updatedAt: '2024-01-15T10:30:00.000Z'
            },
            {
              id: 'clx1234567890abcdef2',
              key: 'contact_email',
              value: 'support@flexpress.com',
              description: 'Main contact email address',
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
  ): Promise<PaginatedResponseDto<SystemConfigResponseDto>> {
    return this.systemConfigService.findAll(paginationQuery);
  }

  @Get('all')
  @ApiOperation({ summary: 'Get all system configurations without pagination' })
  @ApiResponse({
    status: 200,
    description: 'System configurations retrieved successfully',
    type: [SystemConfigResponseDto],
  })
  async findAllWithoutPagination(): Promise<SystemConfigResponseDto[]> {
    return this.systemConfigService.findWithoutPagination();
  }

  @Get('key/:key')
  @ApiOperation({ summary: 'Get a system configuration by key' })
  @ApiParam({ name: 'key', description: 'Configuration key' })
  @ApiResponse({
    status: 200,
    description: 'System configuration retrieved successfully',
    type: SystemConfigResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'System configuration not found',
  })
  async findByKey(@Param('key') key: string): Promise<SystemConfigResponseDto> {
    return this.systemConfigService.findByKey(key);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a system configuration by ID' })
  @ApiParam({ name: 'id', description: 'Configuration ID' })
  @ApiResponse({
    status: 200,
    description: 'System configuration retrieved successfully',
    type: SystemConfigResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'System configuration not found',
  })
  async findOne(@Param('id') id: string): Promise<SystemConfigResponseDto> {
    return this.systemConfigService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a system configuration' })
  @ApiParam({ name: 'id', description: 'Configuration ID' })
  @ApiBody({ type: UpdateSystemConfigDto })
  @ApiResponse({
    status: 200,
    description: 'System configuration updated successfully',
    type: SystemConfigResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'System configuration not found',
  })
  @Auditory('SystemConfig')
  async update(
    @Param('id') id: string,
    @Body() updateSystemConfigDto: UpdateSystemConfigDto,
  ): Promise<SystemConfigResponseDto> {
    return this.systemConfigService.update(id, updateSystemConfigDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a system configuration' })
  @ApiParam({ name: 'id', description: 'Configuration ID' })
  @ApiResponse({
    status: 200,
    description: 'System configuration deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'System configuration not found',
  })
  @Auditory('SystemConfig')
  async remove(@Param('id') id: string): Promise<void> {
    return this.systemConfigService.remove(id);
  }
} 