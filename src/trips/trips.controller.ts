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
  Put,
  Req,
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
import { TripsService } from './trips.service';
import {
  CreateTripDto,
  UpdateTripDto,
  TripResponseDto,
} from './dto';
import { PaginationQueryDto, PaginatedResponseDto } from '../common/dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VerifiedCharterGuard } from '../auth/guards/verified-charter.guard';
import { Auditory } from '../common/decorators/auditory.decorator';

@ApiTags('Trips')
@Controller('trips')
@UseGuards(JwtAuthGuard, VerifiedCharterGuard)
@ApiBearerAuth()
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new trip' })
  @ApiBody({ 
    type: CreateTripDto,
    examples: {
      trip: {
        summary: 'Create Trip',
        value: {
          userId: 'clx1234567890abcdef',
          charterId: 'clx1234567890abcdef2',
          tripTo: 'Miami, Florida',
          latitude: '25.7617',
          longitude: '-80.1918'
        }
      }
    }
  })
  @ApiResponse({
    status: 201,
    description: 'Trip created successfully',
    type: TripResponseDto,
    examples: {
      success: {
        summary: 'Trip Created Successfully',
        value: {
          id: 'clx1234567890abcdef3',
          userId: 'clx1234567890abcdef',
          charterId: 'clx1234567890abcdef2',
          tripTo: 'Miami, Florida',
          latitude: '25.7617',
          longitude: '-80.1918',
          createdAt: '2024-01-15T10:30:00.000Z',
          updatedAt: '2024-01-15T10:30:00.000Z',
          user: {
            id: 'clx1234567890abcdef',
            name: 'John Doe',
            email: 'john@example.com'
          },
          charter: {
            id: 'clx1234567890abcdef2',
            name: 'Premium Charter Service',
            email: 'charter@example.com'
          }
        }
      }
    }
  })
  @Auditory('Trip')
  async create(@Body() createTripDto: CreateTripDto): Promise<TripResponseDto> {
    return this.tripsService.create(createTripDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all trips with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Trips retrieved successfully',
    examples: {
      success: {
        summary: 'Paginated Trips Response',
        value: {
          data: [
            {
              id: 'clx1234567890abcdef',
              userId: 'clx1234567890abcdef2',
              charterId: 'clx1234567890abcdef3',
              tripTo: 'Miami, Florida',
              latitude: '25.7617',
              longitude: '-80.1918',
              createdAt: '2024-01-15T10:30:00.000Z',
              updatedAt: '2024-01-15T10:30:00.000Z',
              user: {
                id: 'clx1234567890abcdef2',
                name: 'John Doe',
                email: 'john@example.com'
              },
              charter: {
                id: 'clx1234567890abcdef3',
                name: 'Premium Charter Service',
                email: 'charter@example.com'
              }
            }
          ],
          meta: {
            page: 1,
            limit: 10,
            total: 1,
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
    @Req() req: any,
  ): Promise<PaginatedResponseDto<TripResponseDto>> {
    return this.tripsService.findAll(paginationQuery, req.user.id, req.user.role);
  }

  @Get('all')
  @ApiOperation({ summary: 'Get all trips without pagination' })
  @ApiResponse({
    status: 200,
    description: 'Trips retrieved successfully',
    type: [TripResponseDto],
  })
  async findAllWithoutPagination(@Req() req: any): Promise<TripResponseDto[]> {
    return this.tripsService.findWithoutPagination(req.user.id, req.user.role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a trip by ID' })
  @ApiParam({ name: 'id', description: 'Trip ID' })
  @ApiResponse({
    status: 200,
    description: 'Trip retrieved successfully',
    type: TripResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Trip not found',
  })
  async findOne(
    @Param('id') id: string,
    @Req() req: any,
  ): Promise<TripResponseDto> {
    return this.tripsService.findOne(id, req.user.id, req.user.role);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a trip' })
  @ApiParam({ name: 'id', description: 'Trip ID' })
  @ApiBody({ type: UpdateTripDto })
  @ApiResponse({
    status: 200,
    description: 'Trip updated successfully',
    type: TripResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Trip not found',
  })
  @Auditory('Trip')
  async update(
    @Param('id') id: string,
    @Body() updateTripDto: UpdateTripDto,
    @Req() req: any,
  ): Promise<TripResponseDto> {
    return this.tripsService.update(id, updateTripDto, req.user.id, req.user.role);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a trip (soft delete)' })
  @ApiParam({ name: 'id', description: 'Trip ID' })
  @ApiResponse({
    status: 200,
    description: 'Trip deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Trip not found',
  })
  @Auditory('Trip')
  async remove(
    @Param('id') id: string,
    @Req() req: any,
  ): Promise<void> {
    return this.tripsService.remove(id, req.user.id, req.user.role);
  }

  @Put(':id/charter-complete')
  @ApiOperation({ summary: 'Charter marks trip as completed' })
  @ApiParam({ name: 'id', description: 'Trip ID' })
  @ApiResponse({
    status: 200,
    description: 'Trip marked as charter_completed',
    type: TripResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Trip not found or not authorized',
  })
  @Auditory('Trip')
  async charterCompleteTrip(
    @Param('id') id: string,
    @Req() req: any,
  ): Promise<TripResponseDto> {
    return this.tripsService.charterCompleteTrip(id, req.user.id);
  }

  @Put(':id/client-confirm')
  @ApiOperation({ summary: 'Client confirms trip completion and triggers credit transfer' })
  @ApiParam({ name: 'id', description: 'Trip ID' })
  @ApiResponse({
    status: 200,
    description: 'Trip completed and credits transferred',
    type: TripResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Trip not found or not authorized',
  })
  @Auditory('Trip')
  async clientConfirmCompletion(
    @Param('id') id: string,
    @Req() req: any,
  ): Promise<TripResponseDto> {
    return this.tripsService.clientConfirmCompletion(id, req.user.id);
  }
} 