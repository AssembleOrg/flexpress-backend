export interface DatabaseConfig {
  url: string;
}

export interface JwtConfig {
  secret: string;
  expiresIn: string;
}

export interface SwaggerConfig {
  username: string;
  password: string;
}

export interface MercadoPagoConfig {
  accessToken: string;
  publicKey: string;
}

export interface AppConfig {
  port: number;
  database: DatabaseConfig;
  jwt: JwtConfig;
  swagger: SwaggerConfig;
  mercadopago: MercadoPagoConfig;
  timezone: string;
} 