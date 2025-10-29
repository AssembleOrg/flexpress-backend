import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as morgan from 'morgan';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  

  app.setGlobalPrefix('api/v1');

  // Security middleware - Helmet adds various HTTP headers for security
  app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for Swagger UI
    crossOriginEmbedderPolicy: false,
  }));

  // Trust proxy - needed to get real IP behind reverse proxy/load balancer
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  // HTTP request logger with detailed information
  // Custom Morgan token to extract real IP
  morgan.token('real-ip', (req: any) => {
    return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
           req.headers['x-real-ip'] ||
           req.headers['cf-connecting-ip'] ||
           req.connection?.remoteAddress ||
           req.ip ||
           'unknown';
  });

  // Morgan logging format with IP and detailed info
  const morganFormat = configService.get<string>('NODE_ENV') === 'production'
    ? ':real-ip - :method :url :status :res[content-length] - :response-time ms'
    : ':real-ip - :method :url :status :res[content-length] - :response-time ms - :user-agent';

  app.use(morgan(morganFormat, {
    stream: {
      write: (message: string) => {
        logger.log(message.trim());
      },
    },
  }));

  app.enableCors({
    origin: [
      'https://flexpress-front.vercel.app', 
      'http://localhost:3000', // Backend port
      'http://localhost:3001', // Alternative backend port
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // Swagger configuration
  // const isDevelopment = configService.get<string>('NODE_ENV') === 'development';
  
    const config = new DocumentBuilder()
      .setTitle('FlexPress API')
      .setDescription('API para la aplicación de reubicación FlexPress')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    
          // Basic auth for Swagger in production
      if (configService.get<string>('NODE_ENV') === 'production') {
        const swaggerUsername = configService.get<string>('swagger.username') || 'admin';
        const swaggerPassword = configService.get<string>('swagger.password') || 'admin123';
        
        app.use('/api/v1/api-docs', (req, res, next) => {
          const auth = req.headers.authorization;
          if (!auth || !isValidBasicAuth(auth, swaggerUsername, swaggerPassword)) {
            res.setHeader('WWW-Authenticate', 'Basic realm="Swagger API Documentation"');
            res.status(401).send('Authentication required');
            return;
          }
          next();
        });
      }
    
    SwaggerModule.setup('api/v1/api-docs', app, document);

  const port = configService.get<number>('port') || 3000;
  await app.listen(port);
  
  logger.log(`🚀 Application is running on: http://localhost:${port}/api/v1`);
  logger.log(`📚 Swagger documentation available at: http://localhost:${port}/api/v1/api-docs`);
  logger.log(`🔒 Security features enabled: Helmet, IP tracking, Geolocation`);
  logger.log(`📊 Request logging enabled with IP and location tracking`);
}

function isValidBasicAuth(authHeader: string, username: string, password: string): boolean {
  const auth = Buffer.from(authHeader.replace('Basic ', ''), 'base64').toString();
  const [user, pass] = auth.split(':');
  return user === username && pass === password;
}

bootstrap();
