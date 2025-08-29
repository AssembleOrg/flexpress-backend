import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');

  // Enable CORS
  // app.enableCors();

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
  
  console.log(`🚀 Application is running on: http://localhost:${port}/api/v1`);
  // if (isDevelopment) {
    console.log(`📚 Swagger documentation available at: http://localhost:${port}/api/v1/api-docs`);
  // }
}

function isValidBasicAuth(authHeader: string, username: string, password: string): boolean {
  const auth = Buffer.from(authHeader.replace('Basic ', ''), 'base64').toString();
  const [user, pass] = auth.split(':');
  return user === username && pass === password;
}

bootstrap();
