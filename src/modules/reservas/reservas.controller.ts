import { Elysia, t } from 'elysia';
import { ReservasService } from './reservas.service';
import { CreateReservaSchema, UpdateEstadoReservaSchema } from './types';

const reservasService = new ReservasService();

export const reservasController = new Elysia({ prefix: '/reservas' })

  // GET /reservas/disponibilidad?fecha=YYYY-MM-DD
  // Retorna el plano de mesas con el flag `isReserved` (true/false) para la fecha consultada
  .get(
    '/disponibilidad',
    async ({ query, set }) => {
      try {
        return await reservasService.getDisponibilidadPlano(query.fecha);
      } catch (error) {
        set.status = 400;
        return { error: (error as Error).message };
      }
    },
    {
      query: t.Object({
        fecha: t.String({ description: 'Fecha en formato YYYY-MM-DD' }),
      }),
    }
  )

  // GET /reservas?fecha=YYYY-MM-DD
  // Obtener el listado detallado de reservas de un día (para el Admin/Staff)
  .get(
    '/',
    async ({ query }) => {
      return await reservasService.obtenerReservasPorFecha(query.fecha);
    },
    {
      query: t.Object({
        fecha: t.String(),
      }),
    }
  )

  // POST /reservas -> Crear una reserva
  .post(
    '/',
    async ({ body, set }) => {
      try {
        return await reservasService.crearReserva(body);
      } catch (error) {
        set.status = 400;
        return { error: (error as Error).message };
      }
    },
    {
      body: CreateReservaSchema,
    }
  )

  // PATCH /reservas/:id/estado -> Cambiar estado (PENDIENTE, CONFIRMADA, CANCELADA, COMPLETADA)
  .patch(
    '/:id/estado',
    async ({ params, body, set }) => {
      try {
        return await reservasService.cambiarEstado(params.id, body.estado);
      } catch (error) {
        set.status = 400;
        return { error: (error as Error).message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: UpdateEstadoReservaSchema,
    }
  );