import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Cliente para los scripts de la carpeta prisma (seed, reset-travel).
 *
 * Desde Prisma 7 `new PrismaClient()` sin opciones tira
 * PrismaClientInitializationError: la conexión la tiene que aportar un driver
 * adapter. Se centraliza acá para no repetir el armado en cada script.
 */
export function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
}
