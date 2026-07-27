import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/**
 * Traduce errores de Prisma a respuestas HTTP con sentido.
 *
 * Sin esto, un P2002 o una violación de CHECK salían como 500 con el mensaje
 * crudo del driver, que incluye nombres de tabla y de columna. Además el
 * cliente no podía distinguir "ya existe" de "se rompió el servidor".
 */
@Catch()
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    // Las HttpException ya vienen con status y mensaje pensados: pasan derecho.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return response.status(status).json(this.body(exception.getResponse(), status));
    }

    const mapped = this.mapPrisma(exception);
    if (mapped) {
      this.logger.warn(
        `${request.method} ${request.url} -> ${mapped.status} (${mapped.code})`,
      );
      return response.status(mapped.status).json(this.body(mapped.message, mapped.status));
    }

    // Cualquier otra cosa es un bug nuestro: se loguea entero del lado del
    // servidor y al cliente le llega un mensaje genérico.
    this.logger.error(
      `${request.method} ${request.url} -> 500`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    return response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(this.body('Error interno del servidor', HttpStatus.INTERNAL_SERVER_ERROR));
  }

  private mapPrisma(
    exception: unknown,
  ): { status: number; message: string; code: string } | null {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': {
          const target = (exception.meta?.target as string[] | undefined)?.join(', ');
          return {
            status: HttpStatus.CONFLICT,
            code: 'P2002',
            message: target
              ? `Ya existe un registro con ese valor (${target})`
              : 'Ya existe un registro con esos datos',
          };
        }
        case 'P2025':
          return {
            status: HttpStatus.NOT_FOUND,
            code: 'P2025',
            message: 'El registro no existe o ya fue modificado',
          };
        case 'P2003':
          return {
            status: HttpStatus.BAD_REQUEST,
            code: 'P2003',
            message: 'Referencia inválida a otro registro',
          };
        case 'P2034':
          return {
            status: HttpStatus.CONFLICT,
            code: 'P2034',
            message: 'Conflicto de concurrencia, reintentá la operación',
          };
        default:
          return null;
      }
    }

    // Violación de CHECK (users_credits_non_negative y similares). Prisma la
    // reporta como error no tipado, así que se detecta por el código 23514 de
    // Postgres dentro del mensaje.
    if (
      exception instanceof Error &&
      (exception.message.includes('23514') ||
        exception.message.includes('users_credits_non_negative'))
    ) {
      return {
        status: HttpStatus.CONFLICT,
        code: '23514',
        message: 'La operación dejaría un saldo inválido',
      };
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'validation',
        message: 'Datos inválidos para la operación',
      };
    }

    return null;
  }

  private body(message: unknown, statusCode: number) {
    if (typeof message === 'object' && message !== null) {
      return message;
    }
    return { statusCode, message };
  }
}
