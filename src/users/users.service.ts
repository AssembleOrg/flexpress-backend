import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto, UserResponseDto, VerifyCharterDto } from './dto';
import { PaginationQueryDto, PaginatedResponseDto } from '../common/dto';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('El usuario ya existe con este email');
    }

    // Hash password
    const hashedPassword = await this.authService.hashPassword(createUserDto.password);

    const user = await this.prisma.user.create({
      data: {
        ...createUserDto,
        password: hashedPassword,
      },
    });

    const { password, ...userResponse } = user;
    return userResponse as UserResponseDto;
  }

  async findAll(paginationQuery: PaginationQueryDto): Promise<PaginatedResponseDto<UserResponseDto>> {
    const { page = 1, limit = 10 } = paginationQuery;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { deletedAt: null },
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          address: true,
          credits: true,
          documentationFrontUrl: true,
          documentationBackUrl: true,
          number: true,
          avatar: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
      }),
      this.prisma.user.count({
        where: { deletedAt: null },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    return {
      data: users as UserResponseDto[],
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

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        address: true,
        credits: true,
        documentationFrontUrl: true,
        documentationBackUrl: true,
        number: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return user as UserResponseDto;
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // If updating email, check if it's already taken
    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: updateUserDto.email },
      });

      if (existingUser) {
        throw new ConflictException('El email ya está en uso');
      }
    }

    // Hash password if updating
    let hashedPassword = user.password;
    if (updateUserDto.password) {
      hashedPassword = await this.authService.hashPassword(updateUserDto.password);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        ...updateUserDto,
        password: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        address: true,
        credits: true,
        documentationFrontUrl: true,
        documentationBackUrl: true,
        number: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    return updatedUser as UserResponseDto;
  }

  async remove(id: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Soft delete
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async findWithoutPagination(): Promise<UserResponseDto[]> {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        address: true,
        credits: true,
        documentationFrontUrl: true,
        documentationBackUrl: true,
        number: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    return users as UserResponseDto[];
  }

  async verifyCharter(
    charterId: string,
    verifyDto: VerifyCharterDto,
    adminId: string,
  ): Promise<UserResponseDto> {
    const charter = await this.prisma.user.findFirst({
      where: { id: charterId, deletedAt: null },
    });

    if (!charter) {
      throw new NotFoundException('Charter no encontrado');
    }

    if (charter.role !== 'charter') {
      throw new BadRequestException('Este usuario no es un charter');
    }

    if (charter.verificationStatus !== 'pending') {
      throw new BadRequestException(
        `Este charter ya fue ${charter.verificationStatus === 'verified' ? 'verificado' : 'rechazado'}`,
      );
    }

    // Validate rejection reason is provided when rejecting
    if (verifyDto.status === 'rejected' && !verifyDto.rejectionReason) {
      throw new BadRequestException('Debe proporcionar una razón de rechazo');
    }

    const updatedCharter = await this.prisma.user.update({
      where: { id: charterId },
      data: {
        verificationStatus: verifyDto.status,
        rejectionReason: verifyDto.status === 'rejected' ? verifyDto.rejectionReason : null,
        verifiedAt: new Date(),
        verifiedBy: adminId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        address: true,
        credits: true,
        documentationFrontUrl: true,
        documentationBackUrl: true,
        number: true,
        avatar: true,
        verificationStatus: true,
        rejectionReason: true,
        verifiedAt: true,
        verifiedBy: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    return updatedCharter as UserResponseDto;
  }

  async findPendingCharters(): Promise<UserResponseDto[]> {
    const charters = await this.prisma.user.findMany({
      where: {
        role: 'charter',
        verificationStatus: 'pending',
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        address: true,
        credits: true,
        documentationFrontUrl: true,
        documentationBackUrl: true,
        number: true,
        avatar: true,
        verificationStatus: true,
        rejectionReason: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return charters as UserResponseDto[];
  }
} 