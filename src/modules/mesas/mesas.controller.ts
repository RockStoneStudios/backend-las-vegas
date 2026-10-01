import { Elysia, t } from 'elysia';
import { MesasService } from './mesas.service';
import { CreateMesaSchema, UpdateLayoutSchema } from './types';

const mesasService = new MesasService();

export const mesasController = new Elysia({ prefix: '/mesas' })
  // 1. PUT /mesas/layout (Ruta estática SIEMPRE antes de rutas dinámicas como /:id)
  .put(
    '/layout',
    async ({ body, set }) => {
      try {
        return await mesasService.guardarLayout(body);
      } catch (error) {
        set.status = 400;
        return { error: (error as Error).message };
      }
    },
    {
      body: UpdateLayoutSchema,
    }
  )

  // 2. GET /mesas -> Obtener todos los elementos del plano
  .get('/', async ({ set }) => {
    try {
      const plano = await mesasService.getPlanoCompleto();
      return plano ?? [];
    } catch (error) {
      console.error('Error en GET /mesas:', error);
      set.status = 500;
      return { error: 'Error al obtener el plano de mesas: ' + (error as Error).message };
    }
  })

  // 3. POST /mesas -> Crear una mesa o elemento nuevo
  .post(
    '/',
    async ({ body, set }) => {
      try {
        return await mesasService.crearElemento(body);
      } catch (error) {
        set.status = 400;
        return { error: (error as Error).message };
      }
    },
    {
      body: CreateMesaSchema,
    }
  )

  // 4. DELETE /mesas/:id -> Eliminar una mesa
  .delete(
    '/:id',
    async ({ params, set }) => {
      try {
        return await mesasService.eliminarMesa(params.id);
      } catch (error) {
        set.status = 400;
        return { error: (error as Error).message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
    }
  );