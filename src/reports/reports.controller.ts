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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReportsService } from './reports.service';
import { CreateReportDto, UpdateReportDto } from './dto';
import { Auditory } from '../common/decorators/auditory.decorator';

@ApiTags('Reportes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @Auditory('Report')
  @ApiOperation({ summary: 'Crear un reporte contra un usuario o chófer' })
  @ApiResponse({ status: 201, description: 'Reporte creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Solicitud inválida' })
  async createReport(@Request() req: any, @Body() dto: CreateReportDto) {
    return this.reportsService.createReport(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todos los reportes (Admin)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiResponse({ status: 200, description: 'Reportes obtenidos exitosamente' })
  async getAllReports(@Query('status') status?: string) {
    return this.reportsService.getAllReports(status);
  }

  @Get('my-reports')
  @ApiOperation({ summary: 'Obtener reportes que he hecho' })
  @ApiResponse({ status: 200, description: 'Reportes obtenidos exitosamente' })
  async getMyReports(@Request() req: any) {
    return this.reportsService.getUserReports(req.user.id);
  }

  @Get('against-me')
  @ApiOperation({ summary: 'Obtener reportes en mi contra' })
  @ApiResponse({ status: 200, description: 'Reportes obtenidos exitosamente' })
  async getReportsAgainstMe(@Request() req: any) {
    return this.reportsService.getReportsAgainstUser(req.user.id);
  }

  @Get(':reportId')
  @ApiOperation({ summary: 'Obtener detalles de un reporte con historial de conversación' })
  @ApiResponse({ status: 200, description: 'Reporte obtenido exitosamente' })
  @ApiResponse({ status: 404, description: 'Reporte no encontrado' })
  async getReportDetails(@Param('reportId') reportId: string) {
    return this.reportsService.getReportDetails(reportId);
  }

  @Put(':reportId')
  @Auditory('Report')
  @ApiOperation({ summary: 'Actualizar estado de reporte (Admin)' })
  @ApiResponse({ status: 200, description: 'Reporte actualizado exitosamente' })
  @ApiResponse({ status: 404, description: 'Reporte no encontrado' })
  async updateReport(
    @Param('reportId') reportId: string,
    @Request() req: any,
    @Body() dto: UpdateReportDto
  ) {
    return this.reportsService.updateReport(reportId, req.user.id, dto);
  }
}

