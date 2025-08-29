// Base Types
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

// Pagination Types
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

// Re-export enums from backend
export { UserRole, PaymentStatus } from '../common/enums';

// Re-export DTOs from backend
export type {
  CreateUserDto as CreateUserRequest,
  UpdateUserDto as UpdateUserRequest,
  UserResponseDto as User,
  UserLoginDto as LoginRequest,
} from '../users/dto';
export type {
  CreateTripDto as CreateTripRequest,
  UpdateTripDto as UpdateTripRequest,
  TripResponseDto as Trip,
} from '../trips/dto';
export type {
  CreatePaymentDto as CreatePaymentRequest,
  UpdatePaymentDto as UpdatePaymentRequest,
  PaymentResponseDto as Payment,
} from '../payments/dto';
export type {
  CreateSystemConfigDto as CreateSystemConfigRequest,
  UpdateSystemConfigDto as UpdateSystemConfigRequest,
  SystemConfigResponseDto as SystemConfig,
} from '../system-config/dto';

// Auth Types
export interface LoginResponse {
  access_token: string;
  user: any; // Will be resolved from UserResponseDto
}

// API Response Types
export interface ApiResponse<T> {
  data: T;
  message: string;
  success: boolean;
  timestamp: string;
}

// Error Types
export interface ApiError {
  message: string;
  error: string;
  statusCode: number;
}

// MercadoPago Types
export interface MercadoPagoPaymentRequest {
  userId: string;
  credits: number;
  amount: number;
  description?: string;
}

export interface MercadoPagoPaymentResponse {
  id: string;
  init_point: string;
  sandbox_init_point: string;
  status: string;
}

// WebSocket Types
export interface PaymentStatusUpdate {
  paymentId: string;
  status: any; // Will be resolved from PaymentStatus enum
  message: string;
  timestamp: Date;
}

// Filter and Query Types
export interface UserFilters {
  role?: any; // Will be resolved from UserRole enum
  email?: string;
  name?: string;
}

export interface TripFilters {
  userId?: string;
  charterId?: string;
  tripTo?: string;
}

export interface PaymentFilters {
  userId?: string;
  status?: any; // Will be resolved from PaymentStatus enum
  minAmount?: number;
  maxAmount?: number;
} 