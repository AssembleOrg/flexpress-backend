import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Request,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DocumentsService } from './documents.service';
import { CreateUserDocumentDto } from './dto/create-user-document.dto';
import { ReviewDocumentDto } from './dto/review-document.dto';

@ApiTags('Documents')
@Controller()
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  // ─── User Documents ──────────────────────────────────────────────────────────

  @Post('users/me/documents')
  @ApiOperation({ summary: 'Upload a document for the authenticated user' })
  async createUserDocument(
    @Request() req,
    @Body() dto: CreateUserDocumentDto,
  ) {
    return this.documentsService.createUserDocument(req.user.id, dto);
  }

  @Get('users/me/documents')
  @ApiOperation({ summary: 'Get documents of the authenticated user' })
  async getUserDocuments(@Request() req) {
    return this.documentsService.getUserDocuments(req.user.id);
  }

  @Delete('users/me/documents/:id')
  @ApiOperation({ summary: 'Soft-delete a user document' })
  async deleteUserDocument(@Param('id') id: string, @Request() req) {
    const isAdmin = ['admin', 'subadmin'].includes(req.user.role);
    return this.documentsService.deleteUserDocument(id, req.user.id, isAdmin);
  }

  // ─── Admin: review documents ─────────────────────────────────────────────────

  @Patch('admin/documents/user/:id/review')
  @ApiOperation({ summary: 'Admin: approve or reject a user document' })
  async reviewUserDocument(
    @Param('id') id: string,
    @Body() dto: ReviewDocumentDto,
    @Request() req,
  ) {
    if (!['admin', 'subadmin'].includes(req.user.role)) {
      throw new ForbiddenException('Solo administradores');
    }
    return this.documentsService.reviewUserDocument(id, dto, req.user.id);
  }

  @Patch('admin/documents/vehicle/:id/review')
  @ApiOperation({ summary: 'Admin: approve or reject a vehicle document' })
  async reviewVehicleDocument(
    @Param('id') id: string,
    @Body() dto: ReviewDocumentDto,
    @Request() req,
  ) {
    if (!['admin', 'subadmin'].includes(req.user.role)) {
      throw new ForbiddenException('Solo administradores');
    }
    return this.documentsService.reviewVehicleDocument(id, dto, req.user.id);
  }
}
