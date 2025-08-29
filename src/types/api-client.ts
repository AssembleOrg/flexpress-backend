import {
  User,
  CreateUserRequest,
  UpdateUserRequest,
  Trip,
  CreateTripRequest,
  UpdateTripRequest,
  Payment,
  CreatePaymentRequest,
  UpdatePaymentRequest,
  SystemConfig,
  CreateSystemConfigRequest,
  UpdateSystemConfigRequest,
  LoginRequest,
  LoginResponse,
  PaginatedResponse,
  PaginationMeta,
  ApiResponse,
  UserRole,
  PaymentStatus,
} from './api.types';

export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  // Auth methods
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await this.post<LoginResponse>('/auth/login', credentials);
    this.token = response.access_token;
    return response;
  }

  async register(userData: CreateUserRequest): Promise<User> {
    return this.post<User>('/auth/register', userData);
  }

  logout(): void {
    this.token = null;
  }

  setToken(token: string): void {
    this.token = token;
  }

  // User methods
  async createUser(userData: CreateUserRequest): Promise<User> {
    return this.post<User>('/users', userData);
  }

  async getUsers(page: number = 1, limit: number = 10): Promise<PaginatedResponse<User>> {
    return this.get<PaginatedResponse<User>>(`/users?page=${page}&limit=${limit}`);
  }

  async getAllUsers(): Promise<User[]> {
    return this.get<User[]>('/users/all');
  }

  async getUserById(id: string): Promise<User> {
    return this.get<User>(`/users/${id}`);
  }

  async updateUser(id: string, userData: UpdateUserRequest): Promise<User> {
    return this.patch<User>(`/users/${id}`, userData);
  }

  async deleteUser(id: string): Promise<void> {
    return this.delete(`/users/${id}`);
  }

  // Trip methods
  async createTrip(tripData: CreateTripRequest): Promise<Trip> {
    return this.post<Trip>('/trips', tripData);
  }

  async getTrips(page: number = 1, limit: number = 10): Promise<PaginatedResponse<Trip>> {
    return this.get<PaginatedResponse<Trip>>(`/trips?page=${page}&limit=${limit}`);
  }

  async getAllTrips(): Promise<Trip[]> {
    return this.get<Trip[]>('/trips/all');
  }

  async getTripById(id: string): Promise<Trip> {
    return this.get<Trip>(`/trips/${id}`);
  }

  async updateTrip(id: string, tripData: UpdateTripRequest): Promise<Trip> {
    return this.patch<Trip>(`/trips/${id}`, tripData);
  }

  async deleteTrip(id: string): Promise<void> {
    return this.delete(`/trips/${id}`);
  }

  // Payment methods
  async createPayment(paymentData: CreatePaymentRequest): Promise<Payment> {
    return this.post<Payment>('/payments', paymentData);
  }

  async getPayments(page: number = 1, limit: number = 10): Promise<PaginatedResponse<Payment>> {
    return this.get<PaginatedResponse<Payment>>(`/payments?page=${page}&limit=${limit}`);
  }

  async getAllPayments(): Promise<Payment[]> {
    return this.get<Payment[]>('/payments/all');
  }

  async getPaymentById(id: string): Promise<Payment> {
    return this.get<Payment>(`/payments/${id}`);
  }

  async updatePayment(id: string, paymentData: UpdatePaymentRequest): Promise<Payment> {
    return this.patch<Payment>(`/payments/${id}`, paymentData);
  }

  async deletePayment(id: string): Promise<void> {
    return this.delete(`/payments/${id}`);
  }

  // System Config methods
  async createSystemConfig(configData: CreateSystemConfigRequest): Promise<SystemConfig> {
    return this.post<SystemConfig>('/system-config', configData);
  }

  async getSystemConfigs(page: number = 1, limit: number = 10): Promise<PaginatedResponse<SystemConfig>> {
    return this.get<PaginatedResponse<SystemConfig>>(`/system-config?page=${page}&limit=${limit}`);
  }

  async getAllSystemConfigs(): Promise<SystemConfig[]> {
    return this.get<SystemConfig[]>('/system-config/all');
  }

  async getSystemConfigById(id: string): Promise<SystemConfig> {
    return this.get<SystemConfig>(`/system-config/${id}`);
  }

  async getSystemConfigByKey(key: string): Promise<SystemConfig> {
    return this.get<SystemConfig>(`/system-config/key/${key}`);
  }

  async updateSystemConfig(id: string, configData: UpdateSystemConfigRequest): Promise<SystemConfig> {
    return this.patch<SystemConfig>(`/system-config/${id}`, configData);
  }

  async deleteSystemConfig(id: string): Promise<void> {
    return this.delete(`/system-config/${id}`);
  }

  // Utility methods
  async getCreditPrice(): Promise<number> {
    try {
      const config = await this.getSystemConfigByKey('credit_price');
      return parseFloat(config.value);
    } catch {
      return 1.0; // Default price
    }
  }

  async getContactEmail(): Promise<string> {
    try {
      const config = await this.getSystemConfigByKey('contact_email');
      return config.value;
    } catch {
      return 'contact@flexpress.com';
    }
  }

  async getContactPhone(): Promise<string> {
    try {
      const config = await this.getSystemConfigByKey('contact_phone');
      return config.value;
    } catch {
      return '+54 11 1234-5678';
    }
  }

  // Private HTTP methods
  private async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    return this.handleResponse<T>(response);
  }

  private async post<T>(endpoint: string, data: any): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    return this.handleResponse<T>(response);
  }

  private async patch<T>(endpoint: string, data: any): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    return this.handleResponse<T>(response);
  }

  private async delete(endpoint: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Delete operation failed');
    }
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    return headers;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    // Handle the standardized API response format
    if (result.data !== undefined) {
      return result.data;
    }
    
    return result;
  }
}

// Export a default instance
export const apiClient = new ApiClient();

// Export the class for custom instances
export default ApiClient; 