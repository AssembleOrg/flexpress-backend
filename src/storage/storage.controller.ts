import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StorageService } from './storage.service';
import { PresignUploadDto } from './dto/presign-upload.dto';

@ApiTags('Storage')
@Controller('storage')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('presign-upload')
  @ApiOperation({ summary: 'Genera una URL firmada para subir un archivo a Spaces' })
  async presignUpload(@Request() req, @Body() dto: PresignUploadDto) {
    return this.storageService.presignUpload(req.user, dto);
  }

  @Get('presign-read')
  @ApiOperation({ summary: 'Genera una URL firmada de lectura para un objeto privado' })
  async presignRead(@Request() req, @Query('key') key: string) {
    return this.storageService.presignRead(req.user, key);
  }
}
