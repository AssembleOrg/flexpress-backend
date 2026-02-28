import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { CreateVehicleDocumentDto } from './dto/create-vehicle-document.dto';

@ApiTags('Vehicles')
@Controller('vehicles')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  // ─── Charter: own vehicles ───────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Create a vehicle (charter only, max 2)' })
  async createVehicle(@Request() req, @Body() dto: CreateVehicleDto) {
    this.assertCharter(req);
    return this.vehiclesService.createVehicle(req.user.id, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get my vehicles with documents' })
  async getMyVehicles(@Request() req) {
    this.assertCharter(req);
    return this.vehiclesService.getMyVehicles(req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a vehicle' })
  async updateVehicle(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: UpdateVehicleDto,
  ) {
    this.assertCharter(req);
    return this.vehiclesService.updateVehicle(id, req.user.id, dto);
  }

  @Patch(':id/toggle-enabled')
  @ApiOperation({ summary: 'Toggle vehicle isEnabled (only if verified)' })
  async toggleEnabled(@Param('id') id: string, @Request() req) {
    this.assertCharter(req);
    return this.vehiclesService.toggleEnabled(id, req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a vehicle' })
  async deleteVehicle(@Param('id') id: string, @Request() req) {
    this.assertCharter(req);
    return this.vehiclesService.deleteVehicle(id, req.user.id);
  }

  // ─── Vehicle documents ───────────────────────────────────────────────────────

  @Post(':id/documents')
  @ApiOperation({ summary: 'Add a document to a vehicle' })
  async createVehicleDocument(
    @Param('id') vehicleId: string,
    @Request() req,
    @Body() dto: CreateVehicleDocumentDto,
  ) {
    this.assertCharter(req);
    return this.vehiclesService.createVehicleDocument(vehicleId, req.user.id, dto);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'Get documents of a vehicle' })
  async getVehicleDocuments(@Param('id') vehicleId: string, @Request() req) {
    this.assertCharter(req);
    return this.vehiclesService.getVehicleDocuments(vehicleId, req.user.id);
  }

  // ─── Admin ───────────────────────────────────────────────────────────────────

  @Get('admin/pending')
  @ApiOperation({ summary: 'Admin: get all pending vehicles' })
  async getAllPendingVehicles(@Request() req) {
    this.assertAdmin(req);
    return this.vehiclesService.getAllPendingVehicles();
  }

  @Patch('admin/:id/review')
  @ApiOperation({ summary: 'Admin: verify or reject a vehicle' })
  async reviewVehicle(
    @Param('id') id: string,
    @Body() body: { status: 'verified' | 'rejected'; rejectionReason?: string },
    @Request() req,
  ) {
    this.assertAdmin(req);
    return this.vehiclesService.reviewVehicle(id, body.status, req.user.id, body.rejectionReason);
  }

  // ─── Guards ──────────────────────────────────────────────────────────────────

  private assertCharter(req: any) {
    if (req.user.role !== 'charter') {
      throw new ForbiddenException('Solo charters pueden gestionar vehículos');
    }
  }

  private assertAdmin(req: any) {
    if (!['admin', 'subadmin'].includes(req.user.role)) {
      throw new ForbiddenException('Solo administradores');
    }
  }
}
