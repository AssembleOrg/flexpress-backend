import {
  ArgumentsHost,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaExceptionFilter } from './prisma-exception.filter';

/**
 * Lo que importa acá: que un error de Prisma no salga como 500 con el mensaje
 * crudo del driver (que incluye nombres de tabla y columna), y que las
 * HttpException que ya lanzan los servicios sigan pasando intactas.
 */
describe('PrismaExceptionFilter', () => {
  let filter: PrismaExceptionFilter;
  let status: jest.Mock;
  let json: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    // El filtro loguea a propósito (warn en los mapeados, error con stack en
    // los desconocidos). Se silencia para que la salida de los tests se lea.
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();

    filter = new PrismaExceptionFilter();
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'POST', url: '/api/v1/x' }),
      }),
    } as unknown as ArgumentsHost;
  });

  afterEach(() => jest.restoreAllMocks());

  const knownError = (code: string, meta?: Record<string, unknown>) =>
    new Prisma.PrismaClientKnownRequestError('boom', {
      code,
      clientVersion: '6.19.3',
      meta,
    });

  it('P2002 (unique) → 409 nombrando el campo', () => {
    filter.catch(knownError('P2002', { target: ['email'] }), host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('email') }),
    );
  });

  it('P2025 (no encontrado) → 404', () => {
    filter.catch(knownError('P2025'), host);
    expect(status).toHaveBeenCalledWith(404);
  });

  it('P2003 (FK inválida) → 400', () => {
    filter.catch(knownError('P2003'), host);
    expect(status).toHaveBeenCalledWith(400);
  });

  it('violación del CHECK de créditos → 409', () => {
    filter.catch(
      new Error(
        'new row for relation "users" violates check constraint "users_credits_non_negative" (23514)',
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'La operación dejaría un saldo inválido' }),
    );
  });

  it('deja pasar las HttpException con su status y mensaje', () => {
    filter.catch(new ConflictException('El pago ya fue procesado'), host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'El pago ya fue procesado' }),
    );
  });

  it('respeta el 404 de NotFoundException', () => {
    filter.catch(new NotFoundException('Viaje no encontrado'), host);
    expect(status).toHaveBeenCalledWith(404);
  });

  it('un error desconocido sale como 500 genérico, sin filtrar el interno', () => {
    filter.catch(
      new Error('column "users"."secret_column" does not exist'),
      host,
    );

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Error interno del servidor',
    });
    expect(JSON.stringify(json.mock.calls)).not.toContain('secret_column');
  });
});
