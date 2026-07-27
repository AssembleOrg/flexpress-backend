// Orígenes permitidos por CORS. Una sola lista para HTTP y para Socket.IO:
// estaban duplicadas a mano y la de sockets se quedó sin el dominio de
// Railway, así que el realtime fallaba solo en el deploy.
const parseOrigins = (raw?: string): string[] =>
  (raw ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

const DEFAULT_ORIGINS = [
  'https://flexpress-front.vercel.app',
  'https://flexpress-front-production-2f47.up.railway.app',
  'http://localhost:3000',
  'http://localhost:3001',
];

export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS).length
    ? parseOrigins(process.env.CORS_ORIGINS)
    : DEFAULT_ORIGINS,
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  swagger: {
    username: process.env.SWAGGER_USERNAME || 'admin',
    password: process.env.SWAGGER_PASSWORD || 'admin123',
  },
  mercadopago: {
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
    publicKey: process.env.MERCADOPAGO_PUBLIC_KEY,
  },
  timezone: process.env.TZ || 'America/Argentina/Buenos_Aires',
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@flexpress.com',
  },
  spaces: {
    endpoint: process.env.DO_SPACES_ENDPOINT, // https://nyc3.digitaloceanspaces.com
    region: process.env.DO_SPACES_REGION || 'nyc3',
    bucket: process.env.DO_SPACES_BUCKET,
    accessKey: process.env.DO_SPACES_KEY,
    secretKey: process.env.DO_SPACES_SECRET,
    cdnBase: process.env.DO_SPACES_CDN_BASE, // https://<bucket>.<region>.cdn.digitaloceanspaces.com
    env: process.env.SPACES_ENV || 'dev', // prefijo de entorno en el bucket
    readTtl: parseInt(process.env.DO_SPACES_URL_TTL || '3600', 10), // lectura admin (1h)
    uploadTtl: parseInt(process.env.DO_SPACES_UPLOAD_TTL || '300', 10), // PUT presign (5min)
  },
}); 