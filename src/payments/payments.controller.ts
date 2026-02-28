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
  Request,
  ForbiddenException,
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
import { PaymentsService } from './payments.service';
import {
  CreatePaymentDto,
  UpdatePaymentDto,
  PaymentResponseDto,
  RejectPaymentDto,
} from './dto';
import { PaginationQueryDto, PaginatedResponseDto } from '../common/dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Auditory } from '../common/decorators/auditory.decorator';

@ApiTags('Payments')
@Controller('payments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new payment' })
  @ApiBody({ 
    type: CreatePaymentDto,
    examples: {
      payment: {
        summary: 'Create Payment',
        value: {
          userId: 'clx1234567890abcdef',
          credits: 100,
          amount: 100.00
        }
      }
    }
  })
  @ApiResponse({
    status: 201,
    description: 'Payment created successfully',
    type: PaymentResponseDto,
    examples: {
      success: {
        summary: 'Payment Created Successfully',
        value: {
          id: 'clx1234567890abcdef3',
          userId: 'clx1234567890abcdef',
          credits: 100,
          amount: 100.00,
          status: 'pending',
          createdAt: '2024-01-15T10:30:00.000Z',
          updatedAt: '2024-01-15T10:30:00.000Z',
          user: {
            id: 'clx1234567890abcdef',
            name: 'John Doe',
            email: 'john@example.com'
          }
        }
      }
    }
  })
  @Auditory('Payment')
  async create(@Body() createPaymentDto: CreatePaymentDto): Promise<PaymentResponseDto> {
    return this.paymentsService.create(createPaymentDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all payments with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Payments retrieved successfully',
    examples: {
      success: {
        summary: 'Paginated Payments Response',
        value: {
          data: [
            {
              id: 'clx1234567890abcdef',
              userId: 'clx1234567890abcdef2',
              credits: 100,
              amount: 100.00,
              status: 'pending',
              createdAt: '2024-01-15T10:30:00.000Z',
              updatedAt: '2024-01-15T10:30:00.000Z',
              user: {
                id: 'clx1234567890abcdef2',
                name: 'John Doe',
                email: 'john@example.com'
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
  ): Promise<PaginatedResponseDto<PaymentResponseDto>> {
    return this.paymentsService.findAll(paginationQuery);
  }

  @Get('all')
  @ApiOperation({ summary: 'Get all payments without pagination' })
  @ApiResponse({
    status: 200,
    description: 'Payments retrieved successfully',
    type: [PaymentResponseDto],
  })
  async findAllWithoutPagination(): Promise<PaymentResponseDto[]> {
    return this.paymentsService.findWithoutPagination();
  }

  @Get('pending/count')
  @ApiOperation({ summary: 'Get count of pending payments (Admin)' })
  @ApiResponse({
    status: 200,
    description: 'Pending payments count',
    schema: {
      type: 'object',
      properties: {
        count: { type: 'number', example: 3 }
      }
    }
  })
  async getPendingCount(): Promise<{ count: number }> {
    return this.paymentsService.getPendingCount();
  }

  @Get('my')
  @ApiOperation({ summary: 'Get my payments (Client)' })
  @ApiResponse({
    status: 200,
    description: 'Payments retrieved successfully',
    type: [PaymentResponseDto],
  })
  async getMyPayments(@Request() req: any): Promise<PaymentResponseDto[]> {
    return this.paymentsService.getPaymentsByUserId(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a payment by ID' })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiResponse({
    status: 200,
    description: 'Payment retrieved successfully',
    type: PaymentResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Payment not found',
  })
  async findOne(@Param('id') id: string): Promise<PaymentResponseDto> {
    return this.paymentsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a payment (admin/subadmin or owner only)' })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiBody({ type: UpdatePaymentDto })
  @ApiResponse({
    status: 200,
    description: 'Payment updated successfully',
    type: PaymentResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Not authorized to update this payment',
  })
  @ApiResponse({
    status: 404,
    description: 'Payment not found',
  })
  @Auditory('Payment')
  async update(
    @Param('id') id: string,
    @Body() updatePaymentDto: UpdatePaymentDto,
    @Request() req: any,
  ): Promise<PaymentResponseDto> {
    // Validar ownership: admin/subadmin o dueño del pago
    const userRole = req.user?.role;
    if (!['admin', 'subadmin'].includes(userRole)) {
      const payment = await this.paymentsService.findOne(id);
      if (payment.userId !== req.user.id) {
        throw new ForbiddenException('No tienes permiso para modificar este pago');
      }
    }
    return this.paymentsService.update(id, updatePaymentDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a payment (admin/subadmin or owner only)' })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiResponse({
    status: 200,
    description: 'Payment deleted successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Not authorized to delete this payment',
  })
  @ApiResponse({
    status: 404,
    description: 'Payment not found',
  })
  @Auditory('Payment')
  async remove(@Param('id') id: string, @Request() req: any): Promise<void> {
    // Validar ownership: admin/subadmin o dueño del pago
    const userRole = req.user?.role;
    if (!['admin', 'subadmin'].includes(userRole)) {
      const payment = await this.paymentsService.findOne(id);
      if (payment.userId !== req.user.id) {
        throw new ForbiddenException('No tienes permiso para eliminar este pago');
      }
    }
    return this.paymentsService.remove(id);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve a payment request (Admin/Subadmin only)' })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiResponse({
    status: 200,
    description: 'Payment approved and credits added to user',
    type: PaymentResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Only admins can approve payments',
  })
  @ApiResponse({
    status: 404,
    description: 'Payment not found',
  })
  @ApiResponse({
    status: 400,
    description: 'Payment already processed',
  })
  @Auditory('Payment')
  async approvePayment(@Param('id') id: string, @Request() req: any): Promise<PaymentResponseDto> {
    const userRole = req.user?.role;
    if (!['admin', 'subadmin'].includes(userRole)) {
      throw new ForbiddenException('Solo administradores pueden aprobar pagos');
    }
    return this.paymentsService.approvePayment(id);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject a payment request (Admin/Subadmin only)' })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiBody({ type: RejectPaymentDto })
  @ApiResponse({
    status: 200,
    description: 'Payment rejected',
    type: PaymentResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Only admins can reject payments',
  })
  @ApiResponse({
    status: 404,
    description: 'Payment not found',
  })
  @ApiResponse({
    status: 400,
    description: 'Payment already processed',
  })
  @Auditory('Payment')
  async rejectPayment(
    @Param('id') id: string,
    @Body() rejectDto: RejectPaymentDto,
    @Request() req: any,
  ): Promise<PaymentResponseDto> {
    const userRole = req.user?.role;
    if (!['admin', 'subadmin'].includes(userRole)) {
      throw new ForbiddenException('Solo administradores pueden rechazar pagos');
    }
    return this.paymentsService.rejectPayment(id, rejectDto.reason);
  }
} 