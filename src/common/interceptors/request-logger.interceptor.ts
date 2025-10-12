import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { GeolocationService } from '../services/geolocation.service';

@Injectable()
export class RequestLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly geolocationService: GeolocationService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, headers } = request;
    const startTime = Date.now();

    // Extract IP and location info
    const locationInfo = this.geolocationService.getLocationFromRequest(request);
    
    // Log incoming request
    const userAgent = headers['user-agent'] || 'Unknown';
    const userId = request.user?.id || 'Anonymous';
    
    this.logger.log(
      `📥 ${method} ${url} | IP: ${locationInfo.ip} | Location: ${locationInfo.formatted} | User: ${userId}`
    );

    // Log request body for non-GET requests (excluding sensitive data)
    if (method !== 'GET' && body && Object.keys(body).length > 0) {
      const sanitizedBody = this.sanitizeBody(body);
      this.logger.debug(`Request Body: ${JSON.stringify(sanitizedBody)}`);
    }

    return next.handle().pipe(
      tap({
        next: (response) => {
          const duration = Date.now() - startTime;
          const statusCode = context.switchToHttp().getResponse().statusCode;
          
          this.logger.log(
            `📤 ${method} ${url} | Status: ${statusCode} | Duration: ${duration}ms | IP: ${locationInfo.ip}`
          );
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const statusCode = error.status || 500;
          
          this.logger.error(
            `❌ ${method} ${url} | Status: ${statusCode} | Duration: ${duration}ms | IP: ${locationInfo.ip} | Error: ${error.message}`
          );
        },
      })
    );
  }

  /**
   * Sanitize request body to remove sensitive information
   */
  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'apiKey',
      'api_key',
      'accessToken',
      'access_token',
      'refreshToken',
      'refresh_token',
      'authorization',
    ];

    const sanitized = { ...body };

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '***REDACTED***';
      }
    }

    // Recursively sanitize nested objects
    for (const key in sanitized) {
      if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeBody(sanitized[key]);
      }
    }

    return sanitized;
  }
}

