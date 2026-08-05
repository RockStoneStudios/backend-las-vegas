import { Elysia, t } from 'elysia';
import { JuegosService } from './juegos.service';

const juegosService = new JuegosService();

export const juegosController = new Elysia({ prefix: '/api/juegos' })

  // =====================================================================
  // 🔑 1. SESIÓN ACTIVA GLOBAL (Utilizado por el QR de las Mesas)
  // =====================================================================
  // GET /api/juegos/sesion-activa
 .get('/sesion-activa', async ({ set }) => {
    try {
      const respuesta = await juegosService.obtenerSesionActiva();

      // Si el repo no encontró sesión (sessionId es null)
      if (!respuesta.success || !respuesta.sessionId) {
        set.status = 404;
        return {
          success: false,
          sessionId: null,
          message: 'No hay ninguna sesión activa en MongoDB',
        };
      }

      // Si existe, devolvemos el ID real de la BD
      return {
        success: true,
        sessionId: respuesta.sessionId,
      };
    } catch (error: any) {
      set.status = 500;
      return {
        success: false,
        sessionId: null,
        error: error?.message || 'Error al consultar la sesión activa',
      };
    }
  })

  // POST /api/juegos/sesion-activa (Admin cambia/reinicia sala)
  .post(
    '/sesion-activa',
    async ({ body, set }) => {
      try {
        return await juegosService.cambiarSesionActiva(body.sessionId);
      } catch (error: any) {
        set.status = 400;
        return { ok: false, error: error.message };
      }
    },
    {
      body: t.Object({
        sessionId: t.String({ minLength: 1 }),
      }),
    }
  )

  // =====================================================================
  // 🎁 2. CONFIGURACIÓN DE PREMIOS (Utilizado por el Admin)
  // =====================================================================
  // GET /api/juegos/premios
  .get('/premios', async () => {
    // Usamos el servicio pasando por el repo para mantener consistencia
    const repo = (juegosService as any).repo;
    const premios = await repo.obtenerPremiosConfigurados();
    return { ok: true, data: premios };
  })

  // PUT /api/juegos/premios
  .put(
    '/premios',
    async ({ body, set }) => {
      try {
        const repo = (juegosService as any).repo;
        await repo.guardarPremiosConfigurados(body.premios);
        return {
          ok: true,
          mensaje: 'Configuración de premios guardada exitosamente',
        };
      } catch (error: any) {
        set.status = 500;
        return {
          ok: false,
          error: error.message || 'Error al guardar los premios',
        };
      }
    },
    {
      body: t.Object({
        premios: t.Array(
          t.Object({
            id: t.String(),
            nombre: t.String(),
            pesoBase: t.Number({ minimum: 0 }),
            esPremioMayor: t.Boolean(),
          })
        ),
      }),
    }
  )

  // =====================================================================
  // 📊 3. ESTADO DEL JUEGO Y MESAS
  // =====================================================================
  // GET /api/juegos/estado
  .get('/estado', async () => {
    const estado = await juegosService.consultarEstadoActual();
    return { ok: true, data: estado };
  })

  // GET /api/juegos/mesas-activas
  .get('/mesas-activas', async () => {
    const repo = (juegosService as any).repo;
    const mesas = await repo.obtenerMesasActivasRegistradas();
    return { ok: true, data: mesas };
  });