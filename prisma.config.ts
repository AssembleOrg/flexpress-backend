import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Configuración de las herramientas de Prisma (migrate, studio, seed).
 *
 * Desde Prisma 7 la URL ya no puede vivir en schema.prisma. Acá va la que usan
 * los comandos de CLI; la conexión de la aplicación en runtime la arma el
 * driver adapter en src/prisma/prisma.service.ts.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL as string,
  },
});
