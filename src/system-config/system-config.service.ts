import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSystemConfigDto, UpdateSystemConfigDto, SystemConfigResponseDto } from './dto';
import { PaginationQueryDto, PaginatedResponseDto } from '../common/dto';

@Injectable()
export class SystemConfigService {
  constructor(private prisma: PrismaService) {}

  async create(createSystemConfigDto: CreateSystemConfigDto): Promise<SystemConfigResponseDto> {
    // Check if config key already exists
    const existingConfig = await this.prisma.systemConfig.findUnique({
      where: { key: createSystemConfigDto.key },
    });

    if (existingConfig) {
      throw new ConflictException('La clave de configuración ya existe');
    }

    const config = await this.prisma.systemConfig.create({
      data: createSystemConfigDto,
    });

    return config as SystemConfigResponseDto;
  }

  async findAll(paginationQuery: PaginationQueryDto): Promise<PaginatedResponseDto<SystemConfigResponseDto>> {
    const { page = 1, limit = 10 } = paginationQuery;
    const skip = (page - 1) * limit;

    const [configs, total] = await Promise.all([
      this.prisma.systemConfig.findMany({
        skip,
        take: limit,
      }),
      this.prisma.systemConfig.count(),
    ]);

    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    return {
      data: configs as SystemConfigResponseDto[],
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
    };
  }

  async findOne(id: string): Promise<SystemConfigResponseDto> {
    const config = await this.prisma.systemConfig.findUnique({
      where: { id },
    });

    if (!config) {
      throw new NotFoundException('Configuración no encontrada');
    }

    return config as SystemConfigResponseDto;
  }

  async findByKey(key: string): Promise<SystemConfigResponseDto> {
    const config = await this.prisma.systemConfig.findUnique({
      where: { key },
    });

    if (!config) {
      throw new NotFoundException('Configuración no encontrada');
    }

    return config as SystemConfigResponseDto;
  }

  async update(id: string, updateSystemConfigDto: UpdateSystemConfigDto): Promise<SystemConfigResponseDto> {
    const config = await this.prisma.systemConfig.findUnique({
      where: { id },
    });

    if (!config) {
      throw new NotFoundException('Configuración no encontrada');
    }

    const updatedConfig = await this.prisma.systemConfig.update({
      where: { id },
      data: updateSystemConfigDto,
    });

    return updatedConfig as SystemConfigResponseDto;
  }

  async remove(id: string): Promise<void> {
    const config = await this.prisma.systemConfig.findUnique({
      where: { id },
    });

    if (!config) {
      throw new NotFoundException('Configuración no encontrada');
    }

    await this.prisma.systemConfig.delete({
      where: { id },
    });
  }

  async findWithoutPagination(): Promise<SystemConfigResponseDto[]> {
    const configs = await this.prisma.systemConfig.findMany();
    return configs as SystemConfigResponseDto[];
  }

  async getCreditPrice(): Promise<number> {
    try {
      const config = await this.findByKey('credit_price');
      return parseFloat(config.value);
    } catch (error) {
      // Default credit price if not configured
      return 1.0;
    }
  }

  async getContactEmail(): Promise<string> {
    try {
      const config = await this.findByKey('contact_email');
      return config.value;
    } catch (error) {
      return 'contact@flexpress.com';
    }
  }

  async getContactPhone(): Promise<string> {
    try {
      const config = await this.findByKey('contact_phone');
      return config.value;
    } catch (error) {
      return '+54 11 1234-5678';
    }
  }
} 