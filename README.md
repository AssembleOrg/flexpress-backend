# FlexPress Backend - Relocation Application

A comprehensive backend API for the FlexPress relocation application built with NestJS, PostgreSQL, and Prisma.

## 🚀 Features

- **Authentication & Authorization**: JWT-based authentication with role-based access control
- **User Management**: Complete CRUD operations for users with different roles (admin, subadmin, user, charter)
- **Trip Management**: Track and manage relocation trips
- **Payment System**: Integrated with MercadoPago for credit purchases
- **Audit Logging**: Comprehensive audit trail for all CRUD operations
- **Swagger Documentation**: Auto-generated API documentation
- **Soft Deletes**: Data preservation with soft delete functionality
- **Pagination**: Consistent pagination across all endpoints
- **Timezone Support**: GMT-3 (Buenos Aires) timezone handling with Luxon
- **CORS Enabled**: Cross-origin resource sharing support

## 🏗️ Architecture

The application follows Clean Architecture principles with:

- **Controllers**: Handle HTTP requests and responses
- **Services**: Business logic implementation
- **DTOs**: Data transfer objects with validation
- **Interceptors**: Cross-cutting concerns (audit, response formatting)
- **Guards**: Authentication and authorization
- **Decorators**: Custom metadata for audit and public routes

## 🛠️ Tech Stack

- **Framework**: NestJS 11
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT with Passport
- **Validation**: class-validator and class-transformer
- **Documentation**: Swagger/OpenAPI
- **Time Handling**: Luxon
- **Password Hashing**: bcryptjs
- **Language**: TypeScript

## 📋 Prerequisites

- Node.js 18+ 
- PostgreSQL 12+
- pnpm (recommended) or npm

## 🚀 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd flexpress-backend
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Environment Configuration**
   ```bash
   cp .env.example .env
   ```
   
   Update the `.env` file with your configuration:
   ```env
   # Database
   DATABASE_URL="postgresql://username:password@localhost:5432/flexpress_db?schema=public"
   
   # JWT
   JWT_SECRET="your-super-secret-jwt-key-change-in-production"
   JWT_EXPIRES_IN="24h"
   
   # App
   NODE_ENV="development"
   PORT=3000
   
   # Swagger
   SWAGGER_USERNAME="admin"
   SWAGGER_PASSWORD="admin123"
   
   # MercadoPago
   MERCADOPAGO_ACCESS_TOKEN="your-mercadopago-access-token"
   MERCADOPAGO_PUBLIC_KEY="your-mercadopago-public-key"
   
   # Timezone
   TZ="America/Argentina/Buenos_Aires"
   ```

4. **Database Setup**
   ```bash
   # Generate Prisma client
   npx prisma generate
   
   # Run database migrations
   npx prisma migrate dev
   
   # (Optional) Seed the database
   npx prisma db seed
   ```

5. **Start the application**
   ```bash
   # Development mode
   pnpm run start:dev
   
   # Production mode
   pnpm run start:prod
   ```

## 📚 API Documentation

Once the application is running, you can access the Swagger documentation at:

- **Development**: `http://localhost:3000/api-docs`
- **Production**: `http://localhost:3000/api-docs` (requires authentication)

## 🔐 Authentication

The API uses JWT tokens for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### User Roles

- **admin**: Full system access
- **subadmin**: Administrative access (limited)
- **user**: Regular user access
- **charter**: Charter service provider access

## 📊 Database Schema

### Core Entities

- **User**: User accounts with role-based permissions
- **Trip**: Relocation trips with user and charter relationships
- **Payment**: Credit purchase transactions
- **SystemConfig**: System configuration values
- **AuditLog**: Comprehensive audit trail

### Key Features

- Soft deletes with `deletedAt` timestamps
- Automatic `createdAt` and `updatedAt` timestamps
- Foreign key relationships with proper constraints
- Enum types for roles and payment statuses

## 🔍 API Endpoints

### Authentication
- `POST /auth/login` - User login

### Users
- `POST /users` - Create user
- `GET /users` - Get users (paginated)
- `GET /users/all` - Get all users
- `GET /users/:id` - Get user by ID
- `PATCH /users/:id` - Update user
- `DELETE /users/:id` - Delete user (soft delete)

### Trips
- `POST /trips` - Create trip
- `GET /trips` - Get trips (paginated)
- `GET /trips/all` - Get all trips
- `GET /trips/:id` - Get trip by ID
- `PATCH /trips/:id` - Update trip
- `DELETE /trips/:id` - Delete trip (soft delete)

### Payments
- `POST /payments` - Create payment
- `GET /payments` - Get payments (paginated)
- `GET /payments/all` - Get all payments
- `GET /payments/:id` - Get payment by ID
- `PATCH /payments/:id` - Update payment
- `DELETE /payments/:id` - Delete payment (soft delete)

### System Configuration
- `POST /system-config` - Create system config
- `GET /system-config` - Get configs (paginated)
- `GET /system-config/all` - Get all configs
- `GET /system-config/:id` - Get config by ID
- `GET /system-config/key/:key` - Get config by key
- `PATCH /system-config/:id` - Update config
- `DELETE /system-config/:id` - Delete config

## 📱 Frontend Integration

The project includes a comprehensive frontend context API with:

- **TypeScript Types**: Complete type definitions for all entities
- **API Client**: HTTP client with authentication and error handling
- **React Context**: State management for authentication and user data
- **Custom Hooks**: Easy access to common functionality

See `src/types/README.md` and `src/types/context-api.md` for detailed frontend usage instructions.

## 🔒 Security Features

- JWT token authentication
- Role-based access control
- Password hashing with bcrypt
- CORS configuration
- Input validation and sanitization
- Audit logging for all operations

## 📝 Audit System

All CRUD operations are automatically logged with:

- Entity type and ID
- Action performed
- Old and new values
- IP address and location
- User ID (if authenticated)
- Timestamp

Use the `@Auditory('EntityName')` decorator to enable audit logging on specific endpoints.

## 🌍 Internationalization

- Error messages in Spanish
- GMT-3 timezone support (Buenos Aires)
- Luxon library for time operations

## 🧪 Testing

```bash
# Unit tests
pnpm run test

# E2E tests
pnpm run test:e2e

# Test coverage
pnpm run test:cov
```

## 📦 Available Scripts

- `pnpm run build` - Build the application
- `pnpm run start` - Start the application
- `pnpm run start:dev` - Start in development mode with hot reload
- `pnpm run start:debug` - Start in debug mode
- `pnpm run start:prod` - Start in production mode
- `pnpm run lint` - Run ESLint
- `pnpm run format` - Format code with Prettier

## 🚀 Deployment

1. **Build the application**
   ```bash
   pnpm run build
   ```

2. **Set production environment variables**
   ```bash
   NODE_ENV=production
   DATABASE_URL="your-production-database-url"
   JWT_SECRET="your-production-jwt-secret"
   ```

3. **Start the application**
   ```bash
   pnpm run start:prod
   ```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is proprietary software. All rights reserved.

## 🆘 Support

For support and questions, please contact the development team or create an issue in the repository.

## 🔄 Changelog

### v1.0.0
- Initial release
- Complete CRUD operations for all entities
- JWT authentication system
- Audit logging
- Swagger documentation
- Frontend context API
