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
import { CharterPersonnelService } from './charter-personnel.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { CreateDriverDocumentDto } from './dto/create-driver-document.dto';
import { CreateHelperDto } from './dto/create-helper.dto';
import { UpdateHelperDto } from './dto/update-helper.dto';
import { CreateHelperDocumentDto } from './dto/create-helper-document.dto';
import { ReviewEntityDto, ReviewDocumentDto } from './dto/review.dto';

@ApiTags('Charter Personnel')
@Controller('charter-personnel')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CharterPersonnelController {
  constructor(private readonly service: CharterPersonnelService) {}

  // ─── Drivers (charter side) ─────────────────────────────────────────────────

  @Post('drivers')
  @ApiOperation({ summary: 'Crear conductor extra (charter, máx 2)' })
  async createDriver(@Request() req, @Body() dto: CreateDriverDto) {
    this.assertCharter(req);
    return this.service.createDriver(req.user.id, dto);
  }

  @Get('drivers/me')
  @ApiOperation({ summary: 'Listar mis conductores' })
  async getMyDrivers(@Request() req) {
    this.assertCharter(req);
    return this.service.getMyDrivers(req.user.id);
  }

  @Get('drivers/:id')
  @ApiOperation({ summary: 'Detalle de un conductor mío' })
  async getDriver(@Param('id') id: string, @Request() req) {
    this.assertCharter(req);
    return this.service.getDriver(id, req.user.id);
  }

  @Patch('drivers/:id')
  @ApiOperation({ summary: 'Editar conductor (solo si rejected)' })
  async updateDriver(@Param('id') id: string, @Request() req, @Body() dto: UpdateDriverDto) {
    this.assertCharter(req);
    return this.service.updateDriver(id, req.user.id, dto);
  }

  @Patch('drivers/:id/toggle-enabled')
  @ApiOperation({ summary: 'Habilitar/deshabilitar conductor (solo si verified)' })
  async toggleDriverEnabled(@Param('id') id: string, @Request() req) {
    this.assertCharter(req);
    return this.service.toggleDriverEnabled(id, req.user.id);
  }

  @Delete('drivers/:id')
  @ApiOperation({ summary: 'Soft-delete conductor' })
  async deleteDriver(@Param('id') id: string, @Request() req) {
    this.assertCharter(req);
    return this.service.deleteDriver(id, req.user.id);
  }

  @Post('drivers/:id/documents')
  @ApiOperation({ summary: 'Subir documento (DNI front/back o licencia)' })
  async addDriverDocument(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: CreateDriverDocumentDto,
  ) {
    this.assertCharter(req);
    return this.service.addDriverDocument(id, req.user.id, dto);
  }

  // ─── Helpers (charter side) ─────────────────────────────────────────────────

  @Post('helpers')
  @ApiOperation({ summary: 'Crear ayudante (charter, máx 2)' })
  async createHelper(@Request() req, @Body() dto: CreateHelperDto) {
    this.assertCharter(req);
    return this.service.createHelper(req.user.id, dto);
  }

  @Get('helpers/me')
  @ApiOperation({ summary: 'Listar mis ayudantes' })
  async getMyHelpers(@Request() req) {
    this.assertCharter(req);
    return this.service.getMyHelpers(req.user.id);
  }

  @Get('helpers/:id')
  @ApiOperation({ summary: 'Detalle de un ayudante mío' })
  async getHelper(@Param('id') id: string, @Request() req) {
    this.assertCharter(req);
    return this.service.getHelper(id, req.user.id);
  }

  @Patch('helpers/:id')
  @ApiOperation({ summary: 'Editar ayudante (solo si rejected)' })
  async updateHelper(@Param('id') id: string, @Request() req, @Body() dto: UpdateHelperDto) {
    this.assertCharter(req);
    return this.service.updateHelper(id, req.user.id, dto);
  }

  @Patch('helpers/:id/toggle-enabled')
  @ApiOperation({ summary: 'Habilitar/deshabilitar ayudante (solo si verified)' })
  async toggleHelperEnabled(@Param('id') id: string, @Request() req) {
    this.assertCharter(req);
    return this.service.toggleHelperEnabled(id, req.user.id);
  }

  @Delete('helpers/:id')
  @ApiOperation({ summary: 'Soft-delete ayudante' })
  async deleteHelper(@Param('id') id: string, @Request() req) {
    this.assertCharter(req);
    return this.service.deleteHelper(id, req.user.id);
  }

  @Post('helpers/:id/documents')
  @ApiOperation({ summary: 'Subir DNI de ayudante (front/back)' })
  async addHelperDocument(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: CreateHelperDocumentDto,
  ) {
    this.assertCharter(req);
    return this.service.addHelperDocument(id, req.user.id, dto);
  }

  // ─── Admin ──────────────────────────────────────────────────────────────────

  @Get('admin/drivers/pending')
  @ApiOperation({ summary: 'Admin: conductores pendientes' })
  async adminListPendingDrivers(@Request() req) {
    this.assertAdmin(req);
    return this.service.adminListPendingDrivers();
  }

  @Get('admin/helpers/pending')
  @ApiOperation({ summary: 'Admin: ayudantes pendientes' })
  async adminListPendingHelpers(@Request() req) {
    this.assertAdmin(req);
    return this.service.adminListPendingHelpers();
  }

  @Patch('admin/drivers/:id/review')
  @ApiOperation({ summary: 'Admin: aprobar/rechazar conductor' })
  async adminReviewDriver(
    @Param('id') id: string,
    @Body() dto: ReviewEntityDto,
    @Request() req,
  ) {
    this.assertAdmin(req);
    return this.service.adminReviewDriver(id, req.user.id, dto);
  }

  @Patch('admin/helpers/:id/review')
  @ApiOperation({ summary: 'Admin: aprobar/rechazar ayudante' })
  async adminReviewHelper(
    @Param('id') id: string,
    @Body() dto: ReviewEntityDto,
    @Request() req,
  ) {
    this.assertAdmin(req);
    return this.service.adminReviewHelper(id, req.user.id, dto);
  }

  @Patch('admin/drivers/documents/:docId/review')
  @ApiOperation({ summary: 'Admin: aprobar/rechazar documento de conductor' })
  async adminReviewDriverDoc(
    @Param('docId') docId: string,
    @Body() dto: ReviewDocumentDto,
    @Request() req,
  ) {
    this.assertAdmin(req);
    return this.service.adminReviewDriverDocument(docId, req.user.id, dto);
  }

  @Patch('admin/helpers/documents/:docId/review')
  @ApiOperation({ summary: 'Admin: aprobar/rechazar documento de ayudante' })
  async adminReviewHelperDoc(
    @Param('docId') docId: string,
    @Body() dto: ReviewDocumentDto,
    @Request() req,
  ) {
    this.assertAdmin(req);
    return this.service.adminReviewHelperDocument(docId, req.user.id, dto);
  }

  // ─── Guards ─────────────────────────────────────────────────────────────────

  private assertCharter(req: any) {
    if (req.user.role !== 'charter') {
      throw new ForbiddenException('Solo charters pueden gestionar personal');
    }
  }

  private assertAdmin(req: any) {
    if (!['admin', 'subadmin'].includes(req.user.role)) {
      throw new ForbiddenException('Solo administradores');
    }
  }
}
