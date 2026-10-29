import { Elysia, t } from 'elysia';
import { SubastasService } from './subastas.service';

const service = new SubastasService();

export const subastasController = new Elysia({ prefix: '/api/subastas' })

  // ADMIN: crear subasta
  .post('/', async ({ body, set }) => {
    try {
      const creada = await service.crear(body);
      return { ok: true, data: creada };
    } catch (e: any) {
      set.status = 400;
      return { ok: false, error: e.message };
    }
  }, {
    body: t.Object({
      producto: t.String(),
      descripcion: t.Optional(t.String()),
      precioBase: t.Number(),
      cierraA: t.String(),
    })
  })

  .delete('/api/subastas/historial', async () => {
    const result = await service.borrarHistorial();
    return { ok: true, data: result };
  })

  // MESAS: ver subasta activa
  .get('/activa', async ({ set }) => {
    try {
      const activa = await service.obtenerActiva();
      return { ok: true, data: activa };
    } catch (e: any) {
      set.status = 404;
      return { ok: false, error: e.message };
    }
  })

  // ADMIN: ver historial
  .get('/', async () => {
    const todas = await service.obtenerTodas();
    return { ok: true, data: todas };
  })

  // MESAS: pujar
  .post('/:id/pujar', async ({ params, body, set }) => {
    try {
      const actualizada = await service.pujar(params.id, body);
      return { ok: true, data: actualizada };
    } catch (e: any) {
      set.status = 400;
      return { ok: false, error: e.message };
    }
  }, {
    body: t.Object({
      mesa: t.Number(),
      monto: t.Number(),
    })
  })

  // ADMIN: cerrar manual
  .post('/:id/cerrar', async ({ params, set }) => {
    try {
      const cerrada = await service.cerrar(params.id);
      return { ok: true, data: cerrada };
    } catch (e: any) {
      set.status = 400;
      return { ok: false, error: e.message };
    }
  });