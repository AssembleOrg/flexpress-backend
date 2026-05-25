import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Request,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AvailabilityInquiriesService } from './availability-inquiries.service';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { RespondInquiryDto } from './dto/respond-inquiry.dto';

@ApiTags('Availability Inquiries')
@Controller('availability-inquiries')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AvailabilityInquiriesController {
  constructor(
    private readonly inquiriesService: AvailabilityInquiriesService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Cliente crea consulta de disponibilidad a un charter ocupado' })
  async createInquiry(@Request() req, @Body() dto: CreateInquiryDto) {
    this.assertUser(req);
    return this.inquiriesService.createInquiry(req.user.id, dto.charterId);
  }

  @Get('sent')
  @ApiOperation({ summary: 'Cliente lista sus consultas enviadas' })
  async getSent(@Request() req) {
    this.assertUser(req);
    return this.inquiriesService.getSent(req.user.id);
  }

  @Get('received')
  @ApiOperation({ summary: 'Charter lista las consultas pendientes recibidas' })
  async getReceived(@Request() req) {
    this.assertCharter(req);
    return this.inquiriesService.getReceived(req.user.id);
  }

  @Patch(':id/respond')
  @ApiOperation({ summary: 'Charter responde una consulta con un código predefinido' })
  async respondInquiry(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: RespondInquiryDto,
  ) {
    this.assertCharter(req);
    return this.inquiriesService.respondInquiry(req.user.id, id, dto.responseCode);
  }

  private assertUser(req: any) {
    if (req.user.role !== 'user') {
      throw new ForbiddenException('Solo clientes pueden enviar consultas');
    }
  }

  private assertCharter(req: any) {
    if (req.user.role !== 'charter') {
      throw new ForbiddenException('Solo charters pueden responder consultas');
    }
  }
}
