# ARQUITECTURA DEL BACKEND - FLEXPRESS

## Tabla de Contenidos
1. [Arquitectura General](#1-arquitectura-general)
2. [Estructura de Carpetas](#2-estructura-de-carpetas)
3. [Módulos y Responsabilidades](#3-módulos-y-responsabilidades)
4. [Servicios Detallados](#4-servicios-detallados)
5. [API - Endpoints Completos](#5-api---endpoints-completos)
6. [Modelos de Datos](#6-modelos-de-datos)
7. [Flujos de Datos](#7-flujos-de-datos)
8. [WebSockets](#8-websockets)
9. [Configuración del Sistema](#9-configuración-del-sistema)

---

## 1. ARQUITECTURA GENERAL

### Stack Tecnológico
| Tecnología | Uso |
|------------|-----|
| **NestJS 11** | Framework principal |
| **Prisma 6.15** | ORM para PostgreSQL |
| **PostgreSQL** | Base de datos |
| **Socket.IO** | WebSockets tiempo real |
| **JWT + Passport** | Autenticación |
| **class-validator** | Validación de DTOs |
| **Swagger/OpenAPI** | Documentación API |
| **Helmet** | Seguridad HTTP |
| **bcryptjs** | Hashing de contraseñas |

### Patrón Arquitectónico
**Clean Architecture + Modular Design**

```
┌─────────────────────────────────────────────────┐
│           Controllers (HTTP Layer)              │
│   - Reciben requests HTTP                       │
│   - Validan DTOs                                │
│   - Delegan a servicios                         │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────┐
│        Services (Business Logic Layer)          │
│   - Lógica de negocio                           │
│   - Orquestación de datos                       │
│   - Reglas de validación                        │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────┐
│    Prisma Service (Data Access Layer)           │
│   - Acceso a PostgreSQL                         │
│   - Queries y mutations                         │
└─────────────────────────────────────────────────┘
```

---

## 2. ESTRUCTURA DE CARPETAS

```
flexpress-backend/
├── src/
│   ├── auth/                          # Módulo de autenticación
│   │   ├── guards/                    # JwtAuthGuard, VerifiedCharterGuard
│   │   ├── strategies/                # JWT Strategy (Passport)
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   └── auth.module.ts
│   │
│   ├── users/                         # Módulo de usuarios
│   │   ├── dto/
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   └── users.module.ts
│   │
│   ├── trips/                         # Módulo de viajes
│   │   ├── dto/
│   │   ├── trips.controller.ts
│   │   ├── trips.service.ts
│   │   └── trips.module.ts
│   │
│   ├── travel-matching/               # Módulo de matching
│   │   ├── dto/
│   │   ├── travel-matching.controller.ts
│   │   ├── travel-matching.service.ts
│   │   ├── travel-matching.gateway.ts # WebSocket Gateway
│   │   └── travel-matching.module.ts
│   │
│   ├── payments/                      # Módulo de pagos
│   │   ├── dto/
│   │   ├── payments.controller.ts
│   │   ├── payments.service.ts
│   │   └── payments.module.ts
│   │
│   ├── conversations/                 # Módulo de mensajería
│   │   ├── dto/
│   │   ├── conversations.controller.ts
│   │   ├── conversations.service.ts
│   │   └── conversations.module.ts
│   │
│   ├── feedback/                      # Módulo de reseñas
│   │   ├── dto/
│   │   ├── feedback.controller.ts
│   │   ├── feedback.service.ts
│   │   └── feedback.module.ts
│   │
│   ├── reports/                       # Módulo de reportes
│   │   ├── dto/
│   │   ├── reports.controller.ts
│   │   ├── reports.service.ts
│   │   └── reports.module.ts
│   │
│   ├── system-config/                 # Configuración del sistema
│   │   ├── dto/
│   │   ├── system-config.controller.ts
│   │   ├── system-config.service.ts
│   │   └── system-config.module.ts
│   │
│   ├── common/                        # Componentes compartidos
│   │   ├── adapters/                  # Socket.io adapter
│   │   ├── decorators/                # @Public(), @Auditory()
│   │   ├── dto/                       # PaginationDto
│   │   ├── enums/                     # Roles, Status
│   │   ├── interceptors/              # Response, Logger, Audit
│   │   ├── services/                  # GeolocationService
│   │   └── utils/                     # Date, Distance
│   │
│   ├── prisma/                        # Prisma ORM
│   │   ├── prisma.service.ts
│   │   └── prisma.module.ts
│   │
│   ├── config/                        # Configuración
│   │   └── configuration.ts
│   │
│   ├── app.module.ts                  # Módulo raíz
│   └── main.ts                        # Punto de entrada
│
├── prisma/
│   ├── schema.prisma                  # Esquema de BD
│   ├── seed.ts                        # Datos iniciales
│   └── migrations/                    # Migraciones
│
└── package.json
```

---

## 3. MÓDULOS Y RESPONSABILIDADES

### 3.1 AuthModule
**Responsabilidad:** Autenticación y registro de usuarios

| Componente | Función |
|------------|---------|
| `AuthController` | Endpoints login/register |
| `AuthService` | Validación de credenciales, generación JWT |
| `JwtStrategy` | Estrategia Passport para JWT |
| `JwtAuthGuard` | Protege rutas autenticadas |

### 3.2 UsersModule
**Responsabilidad:** Gestión del ciclo de vida de usuarios

| Componente | Función |
|------------|---------|
| `UsersController` | CRUD de usuarios |
| `UsersService` | Lógica de usuarios, verificación de charters |
| `VerifiedCharterGuard` | Bloquea charters no verificados |

### 3.3 TripsModule
**Responsabilidad:** Gestión de viajes/traslados

| Componente | Función |
|------------|---------|
| `TripsController` | CRUD de viajes |
| `TripsService` | Ciclo de vida: pending → completed |

### 3.4 TravelMatchingModule
**Responsabilidad:** Motor de búsqueda y emparejamiento

| Componente | Función |
|------------|---------|
| `TravelMatchingController` | Endpoints de matching |
| `TravelMatchingService` | Búsqueda de charters, cálculo de tarifas |
| `TravelMatchingGateway` | WebSocket para tiempo real |

### 3.5 ConversationsModule
**Responsabilidad:** Mensajería entre usuario y charter

| Componente | Función |
|------------|---------|
| `ConversationsController` | Endpoints de chat |
| `ConversationsService` | Envío/recepción de mensajes, expiración |

### 3.6 PaymentsModule
**Responsabilidad:** Sistema de créditos y pagos

| Componente | Función |
|------------|---------|
| `PaymentsController` | CRUD de pagos |
| `PaymentsService` | Aprobación, rechazo, acreditación |

### 3.7 FeedbackModule
**Responsabilidad:** Sistema de calificaciones

| Componente | Función |
|------------|---------|
| `FeedbackController` | Endpoints de feedback |
| `FeedbackService` | Crear/consultar calificaciones |

### 3.8 ReportsModule
**Responsabilidad:** Sistema de denuncias

| Componente | Función |
|------------|---------|
| `ReportsController` | Endpoints de reportes |
| `ReportsService` | Crear/resolver reportes |

### 3.9 SystemConfigModule
**Responsabilidad:** Configuración dinámica del sistema

| Componente | Función |
|------------|---------|
| `SystemConfigController` | CRUD de configuraciones |
| `SystemConfigService` | Precios, tarifas, contacto |

### 3.10 PrismaModule
**Responsabilidad:** Acceso a base de datos

| Componente | Función |
|------------|---------|
| `PrismaService` | Conexión singleton a PostgreSQL |

---

## 4. SERVICIOS DETALLADOS

### 4.1 AuthService
**Ubicación:** `src/auth/auth.service.ts`

| Método | Descripción |
|--------|-------------|
| `validateUser(email, password)` | Valida credenciales contra BD |
| `login(user)` | Genera JWT token (24h) |
| `register(createUserDto)` | Crea usuario con password hasheado |
| `hashPassword(password)` | Encripta con bcrypt (10 rounds) |

### 4.2 UsersService
**Ubicación:** `src/users/users.service.ts`

| Método | Descripción |
|--------|-------------|
| `create(dto)` | Crear usuario (valida email único) |
| `findAll(pagination)` | Listar con paginación |
| `findOne(id)` | Obtener por ID |
| `update(id, dto)` | Actualizar usuario |
| `remove(id)` | Soft delete |
| `verifyCharter(id, status)` | Aprobar/rechazar charter |
| `findPendingCharters()` | Listar charters pendientes |

### 4.3 TripsService
**Ubicación:** `src/trips/trips.service.ts`

| Método | Descripción |
|--------|-------------|
| `create(dto)` | Crear viaje desde match |
| `findAll(userId, role)` | Listar viajes del usuario |
| `findOne(id)` | Obtener detalles |
| `update(id, dto)` | Actualizar viaje |
| `remove(id)` | Soft delete |
| `charterCompleteTrip(id)` | Charter marca completado |
| `clientConfirmCompletion(id)` | Cliente confirma + transfiere créditos |

### 4.4 TravelMatchingService
**Ubicación:** `src/travel-matching/travel-matching.service.ts`

| Método | Descripción |
|--------|-------------|
| `createMatch(dto)` | Crear solicitud de búsqueda |
| `findAvailableCharters(location, radius)` | Buscar charters cercanos |
| `calculateCost(distance, workers)` | Calcular tarifa |
| `selectCharter(matchId, charterId)` | Usuario selecciona charter |
| `respondToMatch(matchId, accept)` | Charter acepta/rechaza |
| `createTripFromMatch(matchId)` | Convertir match en viaje |
| `toggleAvailability(charterId)` | Charter activa/desactiva |
| `updateCharterOrigin(charterId, location)` | Actualizar ubicación |

### 4.5 ConversationsService
**Ubicación:** `src/conversations/conversations.service.ts`

| Método | Descripción |
|--------|-------------|
| `createConversation(matchId)` | Crear canal de chat |
| `sendMessage(conversationId, senderId, content)` | Enviar mensaje |
| `getMessages(conversationId)` | Obtener historial |
| `getUserConversations(userId)` | Listar chats activos |
| `closeConversation(id)` | Cerrar manualmente |
| `expireConversation(id)` | Expiración automática (5h) |
| `cleanupExpiredConversations()` | Cron cada hora |

### 4.6 PaymentsService
**Ubicación:** `src/payments/payments.service.ts`

| Método | Descripción |
|--------|-------------|
| `create(dto)` | Registrar pago pendiente |
| `findAll(pagination)` | Listar pagos |
| `findOne(id)` | Obtener detalles |
| `approvePayment(id)` | Aprobar + sumar créditos (transacción) |
| `rejectPayment(id, reason)` | Rechazar con motivo |
| `getPendingCount()` | Contar pendientes |
| `getPaymentsByUserId(userId)` | Historial del usuario |

### 4.7 FeedbackService
**Ubicación:** `src/feedback/feedback.service.ts`

| Método | Descripción |
|--------|-------------|
| `createFeedback(dto)` | Crear calificación |
| `getUserFeedbacks(userId)` | Feedbacks recibidos + promedio |
| `getTripFeedbacks(tripId)` | Feedbacks del viaje |
| `getFeedbacksGiven(userId)` | Feedbacks dados |
| `canGiveFeedback(userId, tripId)` | Verificar elegibilidad |

### 4.8 ReportsService
**Ubicación:** `src/reports/reports.service.ts`

| Método | Descripción |
|--------|-------------|
| `createReport(dto)` | Crear reporte + archivar chat |
| `getAllReports(status)` | Listar (filtrable) |
| `getReportDetails(id)` | Detalles con mensajes |
| `updateReport(id, status, notes)` | Resolver/desestimar |
| `getUserReports(userId)` | Reportes creados |
| `getReportsAgainstUser(userId)` | Reportes recibidos |

### 4.9 SystemConfigService
**Ubicación:** `src/system-config/system-config.service.ts`

| Método | Descripción |
|--------|-------------|
| `findByKey(key)` | Obtener valor por clave |
| `getCreditPrice()` | Precio por crédito |
| `getPublicPricing()` | creditsPerKm, minimumCharge, creditPrice |
| `getContactEmail()` | Email de contacto |
| `getContactPhone()` | Teléfono de contacto |

### 4.10 GeolocationService
**Ubicación:** `src/common/services/geolocation.service.ts`

| Método | Descripción |
|--------|-------------|
| `extractIpAddress(request)` | Extrae IP real (proxy/CF) |
| `getLocationFromIp(ip)` | Lookup geográfico |
| `getLocationFromRequest(request)` | IP + ubicación en un paso |

---

## 5. API - ENDPOINTS COMPLETOS

**Base URL:** `/api/v1`
**Documentación Swagger:** `/api/v1/api-docs`

### 5.1 Autenticación (`/auth`)
| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| `POST` | `/auth/login` | Iniciar sesión | NO |
| `POST` | `/auth/register` | Registrar usuario | NO |

**Login Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Login Response:**
```json
{
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "clx123...",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "user",
      "credits": 100
    }
  },
  "success": true
}
```

### 5.2 Usuarios (`/users`)
| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| `POST` | `/users` | Crear usuario | NO |
| `GET` | `/users` | Listar (paginado) | SI |
| `GET` | `/users/all` | Listar (sin paginar) | SI |
| `GET` | `/users/charters/pending` | Charters pendientes | SI (Admin) |
| `GET` | `/users/:id` | Obtener usuario | SI |
| `PATCH` | `/users/:id` | Actualizar | SI |
| `DELETE` | `/users/:id` | Eliminar (soft) | SI (Admin) |
| `PATCH` | `/users/:id/update-dni-urls` | Actualizar DNI | SI |
| `PATCH` | `/users/:id/verify` | Verificar charter | SI (Admin) |

### 5.3 Viajes (`/trips`)
| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| `POST` | `/trips` | Crear viaje | SI |
| `GET` | `/trips` | Listar (paginado) | SI |
| `GET` | `/trips/all` | Listar (sin paginar) | SI |
| `GET` | `/trips/:id` | Obtener viaje | SI |
| `PATCH` | `/trips/:id` | Actualizar | SI |
| `DELETE` | `/trips/:id` | Eliminar (soft) | SI |
| `PUT` | `/trips/:id/charter-complete` | Charter marca completado | SI |
| `PUT` | `/trips/:id/client-confirm` | Cliente confirma | SI |

### 5.4 Travel Matching (`/travel-matching`)

**Para Usuarios:**
| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| `POST` | `/travel-matching/matches` | Crear búsqueda | SI |
| `GET` | `/travel-matching/matches` | Mis matches | SI |
| `GET` | `/travel-matching/matches/:id` | Detalles match | SI |
| `PUT` | `/travel-matching/matches/:id/select-charter` | Seleccionar charter | SI |
| `PUT` | `/travel-matching/matches/:id/cancel` | Cancelar | SI |
| `POST` | `/travel-matching/matches/:id/create-trip` | Crear viaje | SI |

**Para Charters:**
| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| `GET` | `/travel-matching/charter/matches` | Solicitudes recibidas | SI |
| `PUT` | `/travel-matching/charter/matches/:id/respond` | Aceptar/rechazar | SI |
| `PUT` | `/travel-matching/charter/availability` | Toggle disponibilidad | SI |
| `GET` | `/travel-matching/charter/availability` | Estado actual | SI |
| `PUT` | `/travel-matching/charter/origin` | Actualizar ubicación | SI |

**CreateMatch Request:**
```json
{
  "pickupAddress": "Av. Corrientes 1234, CABA",
  "pickupLatitude": "-34.6037",
  "pickupLongitude": "-58.3816",
  "destinationAddress": "Av. Santa Fe 5678, CABA",
  "destinationLatitude": "-34.5875",
  "destinationLongitude": "-58.4165",
  "maxRadiusKm": 30,
  "workersCount": 2,
  "scheduledDate": "2024-01-20T10:00:00Z"
}
```

### 5.5 Pagos (`/payments`)
| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| `POST` | `/payments` | Crear pago | SI |
| `GET` | `/payments` | Listar (paginado) | SI |
| `GET` | `/payments/all` | Listar (sin paginar) | SI |
| `GET` | `/payments/pending/count` | Contar pendientes | SI |
| `GET` | `/payments/my` | Mis pagos | SI |
| `GET` | `/payments/:id` | Obtener pago | SI |
| `PATCH` | `/payments/:id` | Actualizar | SI |
| `DELETE` | `/payments/:id` | Eliminar (soft) | SI |
| `PATCH` | `/payments/:id/approve` | Aprobar | SI (Admin) |
| `PATCH` | `/payments/:id/reject` | Rechazar | SI (Admin) |

### 5.6 Conversaciones (`/conversations`)
| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| `POST` | `/conversations/match/:matchId` | Crear conversación | SI |
| `GET` | `/conversations/my-conversations` | Mis conversaciones | SI |
| `GET` | `/conversations/:id/messages` | Obtener mensajes | SI |
| `POST` | `/conversations/:id/messages` | Enviar mensaje | SI |
| `PUT` | `/conversations/:id/close` | Cerrar chat | SI |

### 5.7 Feedback (`/feedback`)
| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| `POST` | `/feedback` | Crear feedback | SI |
| `GET` | `/feedback/user/:userId` | Feedbacks de usuario | SI |
| `GET` | `/feedback/trip/:tripId` | Feedbacks de viaje | SI |
| `GET` | `/feedback/my-feedbacks` | Mis feedbacks dados | SI |
| `GET` | `/feedback/can-give/:tripId` | Verificar elegibilidad | SI |

### 5.8 Reportes (`/reports`)
| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| `POST` | `/reports` | Crear reporte | SI |
| `GET` | `/reports` | Todos los reportes | SI (Admin) |
| `GET` | `/reports/my-reports` | Mis reportes | SI |
| `GET` | `/reports/against-me` | Reportes contra mí | SI |
| `GET` | `/reports/:id` | Detalles | SI |
| `PUT` | `/reports/:id` | Actualizar estado | SI (Admin) |

### 5.9 System Config (`/system-config`)
| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| `GET` | `/system-config/public/pricing` | Tarificación pública | NO |
| `POST` | `/system-config` | Crear config | SI (Admin) |
| `GET` | `/system-config` | Listar (paginado) | SI |
| `GET` | `/system-config/all` | Listar (sin paginar) | SI |
| `GET` | `/system-config/key/:key` | Obtener por clave | SI |
| `GET` | `/system-config/:id` | Obtener por ID | SI |
| `PATCH` | `/system-config/:id` | Actualizar | SI (Admin) |
| `DELETE` | `/system-config/:id` | Eliminar | SI (Admin) |

---

## 6. MODELOS DE DATOS

### 6.1 User
```typescript
{
  id: string                    // Prisma CUID
  email: string                 // Único
  password: string              // Hash bcrypt
  name: string
  role: UserRole                // admin | subadmin | user | charter
  address: string
  credits: number               // Default: 0
  number: string                // Identificador
  avatar?: string               // URL
  documentationFrontUrl?: string // DNI frente
  documentationBackUrl?: string  // DNI dorso
  verificationStatus: VerificationStatus // pending | verified | rejected
  rejectionReason?: string
  originAddress?: string        // Solo charter
  originLatitude?: string       // Solo charter
  originLongitude?: string      // Solo charter
  createdAt: DateTime
  updatedAt: DateTime
  deletedAt?: DateTime          // Soft delete
}
```

### 6.2 Trip
```typescript
{
  id: string
  userId: string                // FK → User (cliente)
  charterId: string             // FK → User (charter)
  address: string               // Destino
  latitude: string
  longitude: string
  workersCount?: number         // 0-10
  scheduledDate?: DateTime
  estimatedCredits?: number     // Costo calculado
  status: TripStatus            // pending | charter_completed | completed | cancelled
  travelMatchId?: string        // FK → TravelMatch
  createdAt: DateTime
  updatedAt: DateTime
  deletedAt?: DateTime
}
```

### 6.3 TravelMatch
```typescript
{
  id: string
  userId: string                // FK → User (cliente)
  charterId?: string            // FK → User (charter seleccionado)
  pickupAddress: string
  pickupLatitude: string
  pickupLongitude: string
  destinationAddress: string
  destinationLatitude: string
  destinationLongitude: string
  maxRadiusKm?: number          // Default: 30
  workersCount?: number
  scheduledDate?: DateTime
  estimatedCredits?: number
  status: TravelMatchStatus     // searching | pending | accepted | rejected | completed | cancelled | expired
  createdAt: DateTime
  updatedAt: DateTime
}
```

### 6.4 Conversation
```typescript
{
  id: string
  userId: string                // FK → User (cliente)
  charterId: string             // FK → User (charter)
  travelMatchId: string         // FK → TravelMatch
  status: ConversationStatus    // active | closed | expired
  isArchived: boolean           // Para reportes
  expiresAt: DateTime           // 5 horas después de creación
  createdAt: DateTime
  updatedAt: DateTime
  deletedAt?: DateTime
}
```

### 6.5 Message
```typescript
{
  id: string
  conversationId: string        // FK → Conversation
  senderId: string              // FK → User
  content: string
  isRead: boolean               // Default: false
  createdAt: DateTime
}
```

### 6.6 Payment
```typescript
{
  id: string
  userId: string                // FK → User
  credits: number               // Cantidad de créditos
  amount: number                // Monto en pesos
  status: PaymentStatus         // pending | accepted | rejected
  receiptUrl?: string           // Comprobante
  rejectionReason?: string
  createdAt: DateTime
  updatedAt: DateTime
  deletedAt?: DateTime
}
```

### 6.7 Feedback
```typescript
{
  id: string
  tripId: string                // FK → Trip
  fromUserId: string            // FK → User (quien da)
  toUserId: string              // FK → User (quien recibe)
  rating: number                // 1-5
  comment?: string              // Max 500 chars
  createdAt: DateTime
  updatedAt: DateTime
}
```

### 6.8 Report
```typescript
{
  id: string
  conversationId: string        // FK → Conversation
  reporterId: string            // FK → User (quien reporta)
  reportedId: string            // FK → User (reportado)
  reason: string                // Max 200 chars
  description?: string          // Max 1000 chars
  status: ReportStatus          // pending | investigating | resolved | dismissed
  adminNotes?: string
  resolvedBy?: string           // FK → User (admin)
  resolvedAt?: DateTime
  createdAt: DateTime
  updatedAt: DateTime
}
```

### 6.9 SystemConfig
```typescript
{
  id: string
  key: string                   // Único
  value: string
  description?: string
  createdAt: DateTime
  updatedAt: DateTime
}
```

### 6.10 Enumeraciones

```typescript
enum UserRole {
  ADMIN = 'admin'
  SUBADMIN = 'subadmin'
  USER = 'user'
  CHARTER = 'charter'
}

enum TripStatus {
  PENDING = 'pending'
  CHARTER_COMPLETED = 'charter_completed'
  COMPLETED = 'completed'
  CANCELLED = 'cancelled'
}

enum TravelMatchStatus {
  SEARCHING = 'searching'
  PENDING = 'pending'
  ACCEPTED = 'accepted'
  REJECTED = 'rejected'
  COMPLETED = 'completed'
  CANCELLED = 'cancelled'
  EXPIRED = 'expired'
}

enum ConversationStatus {
  ACTIVE = 'active'
  CLOSED = 'closed'
  EXPIRED = 'expired'
}

enum PaymentStatus {
  PENDING = 'pending'
  ACCEPTED = 'accepted'
  REJECTED = 'rejected'
}

enum VerificationStatus {
  PENDING = 'pending'
  VERIFIED = 'verified'
  REJECTED = 'rejected'
}

enum ReportStatus {
  PENDING = 'pending'
  INVESTIGATING = 'investigating'
  RESOLVED = 'resolved'
  DISMISSED = 'dismissed'
}
```

---

## 7. FLUJOS DE DATOS

### 7.1 Flujo de Autenticación

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Cliente   │────▶│ POST /login │────▶│ AuthService │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                    ┌──────────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │ 1. Buscar usuario     │
        │ 2. Validar password   │
        │ 3. Generar JWT (24h)  │
        └───────────┬───────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │ Response:             │
        │ - access_token        │
        │ - user data           │
        └───────────────────────┘
```

### 7.2 Flujo de Búsqueda y Matching

```
┌─────────────────────────────────────────────────────────────────┐
│ PASO 1: Usuario crea búsqueda                                   │
├─────────────────────────────────────────────────────────────────┤
│ POST /travel-matching/matches                                   │
│                                                                 │
│ - Validar créditos suficientes                                  │
│ - Buscar charters verificados en radio (30km default)           │
│ - Calcular distancia y tarifa para cada charter                 │
│ - Estado: SEARCHING                                             │
│ - Retornar lista ordenada por distancia                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 2: Usuario selecciona charter                              │
├─────────────────────────────────────────────────────────────────┤
│ PUT /travel-matching/matches/:id/select-charter                 │
│                                                                 │
│ - Asignar charterId al match                                    │
│ - Estado: PENDING                                               │
│ - WebSocket: notificar al charter                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 3: Charter responde                                        │
├─────────────────────────────────────────────────────────────────┤
│ PUT /travel-matching/charter/matches/:id/respond                │
│                                                                 │
│ Si ACEPTA:                                                      │
│ - Estado: ACCEPTED                                              │
│ - Crear Conversation (expira en 5h)                             │
│ - WebSocket: notificar al usuario                               │
│                                                                 │
│ Si RECHAZA:                                                     │
│ - Estado: REJECTED                                              │
│ - WebSocket: notificar al usuario                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 4: Crear viaje                                             │
├─────────────────────────────────────────────────────────────────┤
│ POST /travel-matching/matches/:id/create-trip                   │
│                                                                 │
│ Transacción:                                                    │
│ 1. Validar créditos del cliente                                 │
│ 2. DECREMENT créditos del cliente                               │
│ 3. CREATE trip con datos del match                              │
│ 4. UPDATE match → COMPLETED                                     │
│ 5. Retornar trip creado                                         │
└─────────────────────────────────────────────────────────────────┘
```

### 7.3 Flujo de Viaje (Completar)

```
┌─────────────────────────────────────────────────────────────────┐
│ PASO 1: Charter marca completado                                │
├─────────────────────────────────────────────────────────────────┤
│ PUT /trips/:id/charter-complete                                 │
│                                                                 │
│ - Validar que trip esté en PENDING                              │
│ - Estado: CHARTER_COMPLETED                                     │
│ - WebSocket: notificar al cliente                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 2: Cliente confirma                                        │
├─────────────────────────────────────────────────────────────────┤
│ PUT /trips/:id/client-confirm                                   │
│                                                                 │
│ Transacción:                                                    │
│ 1. Validar que trip esté en CHARTER_COMPLETED                   │
│ 2. UPDATE trip → COMPLETED                                      │
│ 3. INCREMENT créditos del charter (estimatedCredits)            │
│ 4. WebSocket: notificar al charter                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 3: Feedback (opcional)                                     │
├─────────────────────────────────────────────────────────────────┤
│ POST /feedback                                                  │
│                                                                 │
│ - Cliente puede calificar al charter                            │
│ - Charter puede calificar al cliente                            │
│ - Una calificación por persona por viaje                        │
└─────────────────────────────────────────────────────────────────┘
```

### 7.4 Flujo de Pagos

```
┌─────────────────────────────────────────────────────────────────┐
│ PASO 1: Usuario solicita compra de créditos                     │
├─────────────────────────────────────────────────────────────────┤
│ POST /payments                                                  │
│                                                                 │
│ - Crear pago con estado PENDING                                 │
│ - Incluir receiptUrl (comprobante)                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 2: Admin revisa                                            │
├─────────────────────────────────────────────────────────────────┤
│ GET /payments (Admin ve lista de pendientes)                    │
│ GET /payments/:id (Detalles con comprobante)                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
┌─────────────────────────┐   ┌─────────────────────────┐
│ APROBAR                 │   │ RECHAZAR                │
├─────────────────────────┤   ├─────────────────────────┤
│ PATCH /:id/approve      │   │ PATCH /:id/reject       │
│                         │   │                         │
│ Transacción:            │   │ - Estado: REJECTED      │
│ 1. Estado: ACCEPTED     │   │ - Guardar motivo        │
│ 2. INCREMENT credits    │   │ - Usuario no recibe     │
│    del usuario          │   │   créditos              │
└─────────────────────────┘   └─────────────────────────┘
```

### 7.5 Flujo de Conversación

```
┌─────────────────────────────────────────────────────────────────┐
│ CREACIÓN (automática al aceptar match)                          │
├─────────────────────────────────────────────────────────────────┤
│ - Se crea cuando charter acepta solicitud                       │
│ - expiresAt = createdAt + 5 horas                               │
│ - Estado: ACTIVE                                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ MENSAJES                                                        │
├─────────────────────────────────────────────────────────────────┤
│ POST /conversations/:id/messages                                │
│                                                                 │
│ - Validar que usuario pertenece a conversación                  │
│ - Crear mensaje                                                 │
│ - WebSocket: emitir 'new-message' a la sala                     │
│                                                                 │
│ GET /conversations/:id/messages                                 │
│ - Marcar mensajes como leídos automáticamente                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
┌─────────────────────────┐   ┌─────────────────────────┐
│ CIERRE MANUAL           │   │ EXPIRACIÓN AUTO         │
├─────────────────────────┤   ├─────────────────────────┤
│ PUT /:id/close          │   │ Cron cada hora          │
│                         │   │                         │
│ - Estado: CLOSED        │   │ - Buscar expiradas      │
│                         │   │ - Estado: EXPIRED       │
│                         │   │ - Si !isArchived →      │
│                         │   │   soft delete           │
└─────────────────────────┘   └─────────────────────────┘
```

### 7.6 Flujo de Reportes

```
┌─────────────────────────────────────────────────────────────────┐
│ PASO 1: Usuario crea reporte                                    │
├─────────────────────────────────────────────────────────────────┤
│ POST /reports                                                   │
│                                                                 │
│ - Validar que es parte de la conversación                       │
│ - ARCHIVAR conversación (isArchived = true)                     │
│ - Estado: PENDING                                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASO 2: Admin revisa                                            │
├─────────────────────────────────────────────────────────────────┤
│ GET /reports (Admin ve lista)                                   │
│ GET /reports/:id (Detalles con historial de mensajes)           │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
┌─────────────────────────┐   ┌─────────────────────────┐
│ RESOLVER                │   │ DESESTIMAR              │
├─────────────────────────┤   ├─────────────────────────┤
│ PUT /reports/:id        │   │ PUT /reports/:id        │
│ status: 'resolved'      │   │ status: 'dismissed'     │
│                         │   │                         │
│ - Agregar adminNotes    │   │ - Agregar adminNotes    │
│ - Tomar acción contra   │   │ - Cerrar sin acción     │
│   usuario reportado     │   │                         │
└─────────────────────────┘   └─────────────────────────┘
```

---

## 8. WEBSOCKETS

### 8.1 Gateway Configuration
**Ubicación:** `src/travel-matching/travel-matching.gateway.ts`

```typescript
@WebSocketGateway({
  namespace: '/conversations',
  cors: { origin: '*', methods: ['GET', 'POST'] }
})
```

### 8.2 Eventos del Cliente → Servidor

| Evento | Payload | Descripción |
|--------|---------|-------------|
| `join-conversation` | `{ conversationId }` | Unirse a sala de chat |
| `leave-conversation` | `{ conversationId }` | Salir de sala |
| `send-message` | `{ conversationId, content }` | Enviar mensaje |
| `typing` | `{ conversationId }` | Indicar que está escribiendo |

### 8.3 Eventos del Servidor → Cliente

| Evento | Payload | Descripción |
|--------|---------|-------------|
| `new-message` | `{ message }` | Nuevo mensaje recibido |
| `user-joined` | `{ userId }` | Usuario entró a conversación |
| `user-left` | `{ userId }` | Usuario salió |
| `user-typing` | `{ userId }` | Usuario está escribiendo |
| `conversation-closed` | `{ conversationId }` | Chat cerrado |
| `conversation-expired` | `{ conversationId }` | Chat expiró (5h) |
| `new-conversation` | `{ conversation }` | Nueva conversación creada |
| `match:updated` | `{ match, status }` | Estado del match cambió |

### 8.4 Estructura de Salas

```
Rooms Map:
  conversationId → {
    charterId: string,
    userId: string,
    socketIds: Set<string>
  }

User Sockets Map:
  odId → Set<socketIds>  // Soporta múltiples conexiones por usuario
```

---

## 9. CONFIGURACIÓN DEL SISTEMA

### 9.1 Variables de Entorno

```env
# Base de datos
DATABASE_URL=postgresql://user:pass@localhost:5432/flexpress_db

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=24h

# Aplicación
NODE_ENV=development|production
PORT=3000
TZ=America/Argentina/Buenos_Aires

# Swagger (producción)
SWAGGER_USERNAME=admin
SWAGGER_PASSWORD=admin123

# MercadoPago
MERCADOPAGO_ACCESS_TOKEN=...
MERCADOPAGO_PUBLIC_KEY=...
```

### 9.2 Middlewares Globales

| Middleware | Función |
|------------|---------|
| **Helmet** | Headers HTTP de seguridad |
| **Morgan** | Logging de requests con IP |
| **CORS** | Permite dominios específicos |
| **ValidationPipe** | Validación global de DTOs |
| **ResponseInterceptor** | Formato estándar de respuestas |
| **RequestLoggerInterceptor** | Logging detallado |

### 9.3 Guards

| Guard | Función |
|-------|---------|
| `JwtAuthGuard` | Valida token JWT |
| `VerifiedCharterGuard` | Bloquea charters no verificados |

### 9.4 Decoradores Custom

| Decorador | Uso |
|-----------|-----|
| `@Public()` | Marca endpoint como público |
| `@Auditory('Entity')` | Registra operación en auditoría |

### 9.5 Configuraciones del Sistema (SystemConfig)

| Key | Descripción | Default |
|-----|-------------|---------|
| `pricing_base_rate_per_km` | Créditos por kilómetro | - |
| `pricing_minimum_charge` | Cargo mínimo en créditos | - |
| `pricing_worker_rate` | Créditos por trabajador | - |
| `credit_price` | Precio en pesos por crédito | - |
| `contact_email` | Email de contacto | - |
| `contact_phone` | Teléfono de contacto | - |

### 9.6 Respuesta Estándar

Todas las respuestas siguen este formato:

```json
{
  "data": { /* resultado */ },
  "message": "Operación exitosa",
  "success": true,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### 9.7 Códigos de Error

| Status | Descripción |
|--------|-------------|
| 200 | OK |
| 201 | Creado |
| 400 | Validación fallida |
| 401 | No autenticado |
| 403 | Sin permisos |
| 404 | No encontrado |
| 409 | Conflicto (duplicado) |
| 500 | Error interno |

---

## Resumen

**FlexPress Backend** es una aplicación NestJS modular que implementa:

- **10 módulos de negocio** independientes
- **11 servicios** con lógica especializada
- **~60 endpoints** RESTful documentados
- **PostgreSQL + Prisma** para persistencia
- **JWT** para autenticación (24h)
- **WebSockets** para tiempo real
- **Soft deletes** para preservación de datos
- **Transacciones atómicas** para operaciones críticas
- **Validación global** de DTOs
- **Swagger** auto-generado
