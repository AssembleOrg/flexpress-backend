import { Logger } from '@nestjs/common';

/**
 * Validación de entorno al arrancar. Todo salía de `process.env` sin chequear,
 * así que una variable faltante se descubría recién cuando un usuario tocaba la
 * feature (subir un DNI devolvía 400 sin explicación). Preferimos que el proceso
 * no levante antes que quede a medias.
 *
 * Se corre como `validate` de ConfigModule: recibe el env crudo y devuelve el
 * mismo objeto si pasa.
 */

/** Sin esto la app no puede funcionar en ningún entorno. */
const REQUIRED = ['DATABASE_URL', 'JWT_SECRET'] as const;

/**
 * Features que degradan solas. Falta una y esa parte no anda, pero el resto
 * sí: avisamos fuerte en el log en vez de tirar el proceso abajo.
 */
const FEATURE_GROUPS: Record<string, string[]> = {
  'Subida de archivos (DigitalOcean Spaces)': [
    'DO_SPACES_ENDPOINT',
    'DO_SPACES_BUCKET',
    'DO_SPACES_KEY',
    'DO_SPACES_SECRET',
  ],
  'Notificaciones push (VAPID)': [
    'VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY',
  ],
};

export function validateEnv(config: Record<string, unknown>) {
  const logger = new Logger('EnvValidation');
  const isProduction = config.NODE_ENV === 'production';
  const errors: string[] = [];

  const missing = REQUIRED.filter((key) => !config[key]);
  if (missing.length) {
    errors.push(`Faltan variables obligatorias: ${missing.join(', ')}`);
  }

  if (config.JWT_SECRET && String(config.JWT_SECRET).length < 32) {
    errors.push(
      'JWT_SECRET es demasiado corto: usá al menos 32 caracteres aleatorios',
    );
  }

  if (isProduction) {
    // El fallback de Swagger es admin/admin123. En producción eso equivale a
    // publicar la documentación de toda la API sin protección.
    if (!config.SWAGGER_USERNAME || !config.SWAGGER_PASSWORD) {
      errors.push(
        'En producción hay que definir SWAGGER_USERNAME y SWAGGER_PASSWORD (el fallback es admin/admin123)',
      );
    }
    if (!config.CORS_ORIGINS) {
      logger.warn(
        'CORS_ORIGINS no está definida: se usan los orígenes por defecto del código',
      );
    }
  }

  if (errors.length) {
    throw new Error(
      `Configuración inválida:\n  - ${errors.join('\n  - ')}\n` +
        'Revisá el .env contra .env.example.',
    );
  }

  for (const [feature, keys] of Object.entries(FEATURE_GROUPS)) {
    const faltan = keys.filter((key) => !config[key]);
    if (faltan.length) {
      logger.warn(`${feature} deshabilitada, faltan: ${faltan.join(', ')}`);
    }
  }

  return config;
}
