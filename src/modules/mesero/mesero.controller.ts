import { Elysia, t } from 'elysia';
import { MeseroService } from './mesero.service';
import { AuthService } from '../auth/auth.service';
import { publicarEvento } from '../../shared/websocket/socket.publisher';
import type { WsSessionData } from '../../shared/websocket/socket.server';

const meseroService = new MeseroService();
const authService = new AuthService();

export const meseroController = new Elysia({ prefix: '/api/mesero' })

  // 1. Obtener todas las llamadas pendientes
  .get('/pendientes', async () => {
    const pendientes = await meseroService.obtenerPendientes();
    return { pendientes };
  })// En mesero.controller.ts
.post(
  '/llamar',
  async ({ body, headers, set }) => {
    // 1. Exigir la sesión real que viene en el header o en el body
    const sessionId = headers['x-session-id'] || body.sessionId;

    if (!sessionId) {
      set.status = 401;
      return { error: 'No autorizado: falta sessionId de la mesa' };
    }

    // 2. Recuperar la sesión REAL de la base de datos/Redis
    const sesionMesa = await authService.recuperarSesion(sessionId);

    if (!sesionMesa) {
      set.status = 401;
      return { error: 'Sesión invalida o expirada. Escanea el QR de nuevo.' };
    }

    // 3. Pasar los datos reales de la sesión
    const datosSesion: WsSessionData = {
      sessionId: sesionMesa.sessionId,
      mesa: sesionMesa.mesa,
      rol: 'cliente'
    };

    try {
      const alerta = await meseroService.solicitarMesero(
        datosSesion,
        publicarEvento
      );
      return { ok: true, alerta };
    } catch (error) {
      set.status = 500;
      return { error: (error as Error).message };
    }
  },
  {
    body: t.Object({
      mesa: t.Number(),
      sessionId: t.Optional(t.String()),
    }),
  }
)

  // 🟢 2. Atender la llamada de una mesa
  .post(
    '/atender',
    async ({ body, headers, set }) => {
      const sessionIdStaff = headers['x-session-id'];

      if (!sessionIdStaff) {
        set.status = 401;
        return { error: 'Falta el header x-session-id' };
      }

      const sesionStaff = await authService.recuperarSesion(sessionIdStaff);

      if (!sesionStaff) {
        set.status = 401;
        return { error: 'Session Staff invalida o expirada' };
      }

      const datosSesionStaff: WsSessionData = {
        sessionId: sesionStaff.sessionId,
        mesa: sesionStaff.mesa,
        rol: sesionStaff.rol,
      };

      try {
        const resultado = await meseroService.atenderMesa(
          datosSesionStaff,
          body.idAlerta,
          body.mesa,
          publicarEvento
        );
        return { ok: true, ...resultado };
      } catch (error) {
        set.status = 403;
        return { error: (error as Error).message };
      }
    },
    {
      headers: t.Object({ 'x-session-id': t.String() }),
      body: t.Object({
        idAlerta: t.String(),
        mesa: t.Number(),
      }),
    }
  )

  // 🔴 3. Liberar / Cerrar una mesa
  .post(
    '/liberar/mesa/:numeroMesa',
    async ({ params, headers, set }) => {
      const numeroMesa = Number(params.numeroMesa);
      const sessionIdStaff = headers['x-session-id'];

      if (!sessionIdStaff) {
        set.status = 401;
        return { error: 'Falta el header x-session-id' };
      }

      const sesionStaff = await authService.recuperarSesion(sessionIdStaff);

      if (!sesionStaff) {
        set.status = 401;
        return { error: 'Session Staff invalida o expirada' };
      }

      const datosSesionStaff: WsSessionData = {
        sessionId: sesionStaff.sessionId,
        mesa: sesionStaff.mesa,
        rol: sesionStaff.rol,
      };

      try {
        const resultado = await meseroService.liberarMesa(
          datosSesionStaff,
          numeroMesa,
          publicarEvento
        );
        return { ok: true, mesa: numeroMesa, ...resultado };
      } catch (error) {
        set.status = 403;
        return { error: (error as Error).message };
      }
    },
    {
      headers: t.Object({ 'x-session-id': t.String() }),
    }
  );