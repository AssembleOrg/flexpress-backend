import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
  const run = async (payload: unknown) => {
    const interceptor = new ResponseInterceptor();
    const next: CallHandler = { handle: () => of(payload) };
    return lastValueFrom(
      interceptor.intercept({} as ExecutionContext, next) as never,
    ) as Promise<{ success: boolean; data: unknown; message: string }>;
  };

  it('envuelve un payload plano', async () => {
    const result = await run({ id: 'u1', name: 'Test' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: 'u1', name: 'Test' });
  });

  it('no vuelve a envolver lo que el servicio ya envolvió', async () => {
    const result = await run({ success: true, data: { id: 'm1' } });
    // Antes esto quedaba como data: { success: true, data: { id: 'm1' } }
    expect(result.data).toEqual({ id: 'm1' });
  });

  it('conserva el mensaje del servicio cuando lo trae', async () => {
    const result = await run({
      success: true,
      message: 'Viaje creado exitosamente',
      data: { id: 't1' },
    });
    expect(result.message).toBe('Viaje creado exitosamente');
  });

  it('usa el mensaje por defecto si el sobre no trae uno', async () => {
    const result = await run({ success: true, data: [] });
    expect(result.message).toBe('Operación exitosa');
  });

  it('no confunde un array con un sobre', async () => {
    const result = await run([{ id: 1 }, { id: 2 }]);
    expect(result.data).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('no aplana un objeto de dominio que casualmente tenga data', async () => {
    // Sin `success` booleano no es un sobre nuestro.
    const payload = { data: 'algo', otro: 1 };
    const result = await run(payload);
    expect(result.data).toEqual(payload);
  });

  it('tolera null', async () => {
    const result = await run(null);
    expect(result.data).toBeNull();
    expect(result.success).toBe(true);
  });
});
