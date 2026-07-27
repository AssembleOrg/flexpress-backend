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

/**
 * ¿El handler ya devolvió algo con forma de sobre `{ success, data }`?
 *
 * 24 métodos de servicio arman ese sobre a mano y después pasaban igual por
 * este interceptor, así que el cliente recibía `{ success, data: { success,
 * data: X } }` en unos endpoints y `{ success, data: X }` en otros. El frontend
 * terminó con desenvoltura defensiva en siete archivos para tolerar las dos
 * formas, y algún call site igual quedó leyendo el sobre interno como si fuera
 * el dato.
 */
function isAlreadyEnveloped(
  value: unknown,
): value is { success: boolean; data: unknown; message?: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'success' in value &&
    'data' in value &&
    typeof (value as { success: unknown }).success === 'boolean'
  );
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    return next.handle().pipe(
      map((payload) => {
        // Se aplana el sobre que ya venía armado en vez de anidar otro, para
        // que todos los endpoints devuelvan la misma forma.
        const alreadyEnveloped = isAlreadyEnveloped(payload);

        return {
          data: (alreadyEnveloped ? payload.data : payload) as T,
          message: alreadyEnveloped
            ? (payload.message ?? 'Operación exitosa')
            : 'Operación exitosa',
          success: true,
          timestamp: new Date().toISOString(),
        };
      }),
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