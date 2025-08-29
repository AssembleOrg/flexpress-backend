import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface Response<T> {
  data: T;
  message: string;
  success: boolean;
  timestamp: string;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    return next.handle().pipe(
      map((data) => ({
        data,
        message: 'Operación exitosa',
        success: true,
        timestamp: new Date().toISOString(),
      })),
      catchError((error) => {
        if (error instanceof HttpException) {
          return throwError(() => error);
        }

        // Handle unexpected errors in Spanish
        const spanishError = new HttpException(
          {
            message: 'Error interno del servidor',
            error: 'Internal Server Error',
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );

        return throwError(() => spanishError);
      }),
    );
  }
} 