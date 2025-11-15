import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TravelMatchingService } from './travel-matching.service';
import {
  CreateMatchDto,
  SelectCharterDto,
  ToggleAvailabilityDto,
  UpdateCharterOriginDto,
  RespondToMatchDto,
} from './dto';
// import { Auditory } from '../common/decorators/auditory.decorator';

@ApiTags('Travel Matching')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('travel-matching')
export class TravelMatchingController {
  constructor(private readonly matchingService: TravelMatchingService) {}

  @Post('matches')
  // @Auditory('TravelMatch')
  @ApiOperation({ summary: 'Create a new travel match request' })
  @ApiResponse({ status: 201, description: 'Match created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async createMatch(@Request() req: any, @Body() dto: CreateMatchDto) {
    return this.matchingService.createMatch(req.user.id, dto);
  }

  @Get('matches')
  @ApiOperation({ summary: 'Get user matches' })
  @ApiQuery({ name: 'status', required: false })
  @ApiResponse({ status: 200, description: 'Matches retrieved successfully' })
  async getUserMatches(@Request() req: any, @Query('status') status?: string) {
    return this.matchingService.getUserMatches(req.user.id, status);
  }

  @Get('matches/:id')
  @ApiOperation({ summary: 'Get match details' })
  @ApiResponse({ status: 200, description: 'Match details retrieved' })
  @ApiResponse({ status: 404, description: 'Match not found' })
  async getMatch(@Param('id') id: string) {
    return this.matchingService.getMatch(id);
  }

  @Put('matches/:id/select-charter')
  // @Auditory('TravelMatch')
  @ApiOperation({ summary: 'Select a charter for the match' })
  @ApiResponse({ status: 200, description: 'Charter selected successfully' })
  @ApiResponse({ status: 404, description: 'Match not found' })
  async selectCharter(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: SelectCharterDto,
  ) {
    return this.matchingService.selectCharter(req.user.id, id, dto);
  }

  @Put('matches/:id/cancel')
  // @Auditory('TravelMatch')
  @ApiOperation({ summary: 'Cancel a match' })
  @ApiResponse({ status: 200, description: 'Match cancelled successfully' })
  @ApiResponse({ status: 404, description: 'Match not found' })
  async cancelMatch(@Request() req: any, @Param('id') id: string) {
    return this.matchingService.cancelMatch(req.user.id, id);
  }

  @Post('matches/:id/create-trip')
  // @Auditory('Trip')
  @ApiOperation({ summary: 'Create trip from accepted match' })
  @ApiResponse({ status: 201, description: 'Trip created successfully' })
  @ApiResponse({ status: 400, description: 'Cannot create trip' })
  async createTripFromMatch(@Request() req: any, @Param('id') id: string) {
    return this.matchingService.createTripFromMatch(req.user.id, id);
  }

  @Get('charter/matches')
  @ApiOperation({ summary: 'Get charter match requests' })
  @ApiQuery({ name: 'status', required: false })
  @ApiResponse({ status: 200, description: 'Match requests retrieved' })
  async getCharterMatches(
    @Request() req: any,
    @Query('status') status?: string,
  ) {
    return this.matchingService.getCharterMatches(req.user.id, status);
  }

  @Put('charter/matches/:id/respond')
  // @Auditory('TravelMatch')
  @ApiOperation({ summary: 'Charter responds to match request' })
  @ApiResponse({ status: 200, description: 'Response recorded successfully' })
  async respondToMatch(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: RespondToMatchDto,
  ) {
    return this.matchingService.respondToMatch(req.user.id, id, dto.accept);
  }

  @Put('charter/availability')
  // @Auditory('CharterAvailability')
  @ApiOperation({ summary: 'Toggle charter availability' })
  @ApiResponse({ status: 200, description: 'Availability updated' })
  async toggleAvailability(
    @Request() req: any,
    @Body() dto: ToggleAvailabilityDto,
  ) {
    return this.matchingService.toggleAvailability(req.user.id, dto);
  }

  @Get('charter/availability')
  @ApiOperation({ summary: 'Get charter availability' })
  @ApiResponse({ status: 200, description: 'Availability retrieved' })
  async getAvailability(@Request() req: any) {
    return this.matchingService.getAvailability(req.user.id);
  }

  @Put('charter/origin')
  // @Auditory('User')
  @ApiOperation({ summary: 'Update charter origin location' })
  @ApiResponse({ status: 200, description: 'Origin location updated' })
  async updateCharterOrigin(
    @Request() req: any,
    @Body() dto: UpdateCharterOriginDto,
  ) {
    return this.matchingService.updateCharterOrigin(req.user.id, dto);
  }
}
