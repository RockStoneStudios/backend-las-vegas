import { Elysia, t } from 'elysia';
import { AuthService } from './auth.service';
import { publicarEvento } from '../../shared/websocket/socket.publisher';

const authService = new AuthService();

export const authController = new Elysia({ prefix: '/api/auth' })

  // Test de vida
  .get('/test', async () => {
    console.log('🧪 [BACKEND] Endpoint /test llamado');
    return {
      ok: true,
      mensaje: 'El backend está vivo!',
      timestamp: new Date().toISOString(),
    };
  })

  // Generar token QR para una mesa
  .get('/mesa/:numeroMesa/token', async ({ params }) => {
    const numeroMesa = Number(params.numeroMesa);
    const token = authService.generarHashMesa(numeroMesa);

    console.log(`🔑 Token para mesa ${numeroMesa}: ${token}`);

    return {
      mesa: numeroMesa,
      token: token,
      url: `/mesa/${numeroMesa}?token=${token}`,
    };
  })

  // Iniciar sesión por QR
  .get(
    '/mesa/:numeroMesa',
    async ({ params, query, set }) => {
      try {
        const numeroMesa = Number(params.numeroMesa);
        const token = query.token;
        const deviceId = query.deviceId;

        const sesion = await authService.iniciarSesionPorQR(
          numeroMesa,
          token,
          deviceId
        );

        return {
          sessionId: sesion.sessionId,
          mesa: sesion.mesa,
        };
      } catch (error) {
        set.status = 401;
        return {
          error: (error as Error).message,
        };
      }
    },
    {
      query: t.Object({
        token: t.String({ minLength: 8, maxLength: 128 }),
        deviceId: t.String({ minLength: 16, maxLength: 128 }),
      }),
    }
  )

  // Login Admin/DJ
  .post(
    '/admin/login',
    async ({ body, set }) => {
      try {
        const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1234';

        if (body.password !== ADMIN_PASSWORD) {
          set.status = 401;
          return { error: 'Contraseña de cabina incorrecta' };
        }

        const sesion = await authService.iniciarSesionAdmin(body.rol);
        return { sessionId: sesion.sessionId, rol: sesion.rol, mesa: sesion.mesa };
      } catch (error) {
        set.status = 500;
        return { error: (error as Error).message };
      }
    },
    {
      body: t.Object({
        rol: t.Union([t.Literal('admin'), t.Literal('dj'), t.Literal('mesero')]),
        password: t.String({ minLength: 1 }),
      }),
    }
  )

  // Cerrar mesa (con logs limpios, sin ruido)
  .post('/cerrar-mesa/:numeroMesa', async ({ params, headers, set }) => {
    try {
      const numeroMesa = Number(params.numeroMesa);
      const sessionId = headers['x-session-id'];

      // 1. Validar sessionId
      if (!sessionId) {
        set.status = 401;
        return { ok: false, error: 'No autorizado: falta sessionId' };
      }

      // 2. Recuperar sesión del staff (ahora usa cache!)
      const sesionStaff = await authService.recuperarSesion(sessionId);

      if (!sesionStaff) {
        set.status = 401;
        return { ok: false, error: 'Session inválida o expirada' };
      }

      // 3. Validar rol
      if (!['admin', 'dj', 'mesero'].includes(sesionStaff.rol)) {
        set.status = 403;
        return { ok: false, error: 'No autorizado. Solo el staff puede cerrar mesas.' };
      }

      // 4. Cerrar la mesa
      // ✅ Mantenemos el segundo argumento por compatibilidad,
      // pero internamente ya NO se usa (usa publicarEvento directo)
      const resultado = await authService.cerrarMesa(numeroMesa, publicarEvento);

      return {
        ok: true,
        mesa: numeroMesa,
        sesionesEliminadas: resultado.sesionesEliminadas,
        mensaje: `Mesa ${numeroMesa} cerrada correctamente`,
      };
    } catch (error) {
      console.error('❌ [BACKEND] Error en cerrar-mesa:', error);
      set.status = 500;
      return { ok: false, error: (error as Error).message };
    }
  })

  // Login Staff con token
  .get(
    '/staff-login',
    async ({ query, set }) => {
      try {
        const token = query.token as string;
        const sesion = await authService.iniciarSesionStaffConToken(token, 'mesero');

        return {
          success: true,
          sessionId: sesion.sessionId,
          rol: sesion.rol,
        };
      } catch (err) {
        set.status = 401;
        return {
          success: false,
          mensaje: (err as Error).message,
        };
      }
    },
    {
      query: t.Object({
        token: t.String(),
      }),
    }
  );

