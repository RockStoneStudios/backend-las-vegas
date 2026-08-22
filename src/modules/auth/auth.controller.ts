import {Elysia,t} from 'elysia';

import { AuthService } from './auth.service';
import { publicarEvento } from '../../shared/websocket/socket.publisher'; 
const authService = new AuthService();

export const authController = new Elysia({prefix : '/api/auth'})

// auth.controller.ts - Agrega esto AL INICIO del controller

.get('/test', async () => {
  console.log('🧪 [BACKEND] Endpoint /test llamado');
  return { 
    ok: true, 
    mensaje: 'El backend está vivo!',
    timestamp: new Date().toISOString()
  };
})
.get('/mesa/:numeroMesa/token', async ({params}) => {
    const numeroMesa = Number(params.numeroMesa);
    const token = authService.generarHashMesa(numeroMesa);
    
    console.log(`🔑 Token para mesa ${numeroMesa}: ${token}`);
    
    return {
      mesa: numeroMesa,
      token: token,
      url: `/mesa/${numeroMesa}?token=${token}`
    };
})
.get(
    '/mesa/:numeroMesa',
    async ({params,query,set})=>{
        const numeroMesa = Number(params.numeroMesa);
        const token = query.token;
        console.log(`🔑 TOKEN ESPERADO PARA MESA ${numeroMesa}:`, authService.generarHashMesa(numeroMesa));
        try{
          const sesion = await authService.iniciarSesionPorQR(numeroMesa,token);
          return {sessionId : sesion.sessionId, mesa : sesion.mesa}
        }catch(error){
          set.status = 401;
          return {error : (error as Error).message}
        }
    }
).post(
  '/admin/login',
  async ({ body, set }) => {
    try {
      // Clave maestra del DJ/Admin (puedes moverla a tu .env como process.env.ADMIN_PASSWORD)
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
      password: t.String({ minLength: 1 }), // Validación de la clave de acceso
    }),
  }
)

.post('/cerrar-mesa/:numeroMesa', async ({ params, headers, set }) => {
  console.log('🧹 [BACKEND] ===== INICIO cerrar-mesa =====');
  console.log('🧹 [BACKEND] params:', params);
  console.log('🧹 [BACKEND] headers:', headers);
  
  try {
    const numeroMesa = Number(params.numeroMesa);
    const sessionId = headers['x-session-id'];
    
    console.log(`🧹 [BACKEND] Mesa: ${numeroMesa}, SessionId: ${sessionId}`);
    
    // 1. Validar sessionId
    if (!sessionId) {
      console.log('❌ [BACKEND] No hay sessionId');
      set.status = 401;
      return { ok: false, error: 'No autorizado: falta sessionId' };
    }
    
    // 2. Recuperar sesión del staff
    console.log('🧹 [BACKEND] Buscando sesión del staff...');
    const sesionStaff = await authService.recuperarSesion(sessionId);
    console.log('🧹 [BACKEND] SesionStaff encontrada:', sesionStaff);
    
    if (!sesionStaff) {
      console.log('❌ [BACKEND] Sesión no encontrada');
      set.status = 401;
      return { ok: false, error: 'Session inválida o expirada' };
    }
    
    // 3. Validar rol
    console.log('🧹 [BACKEND] Rol del staff:', sesionStaff.rol);
    if (!['admin', 'dj', 'mesero'].includes(sesionStaff.rol)) {
      console.log('❌ [BACKEND] Rol no autorizado');
      set.status = 403;
      return { ok: false, error: 'No autorizado. Solo el staff puede cerrar mesas.' };
    }
    
    // 4. Cerrar la mesa
    console.log(`🧹 [BACKEND] Cerrando mesa ${numeroMesa}...`);
    const resultado = await authService.cerrarMesa(numeroMesa, publicarEvento);
    console.log('🧹 [BACKEND] Resultado:', resultado);
    
    return {
      ok: true,
      mesa: numeroMesa,
      sesionesEliminadas: resultado.sesionesEliminadas,
      mensaje: `Mesa ${numeroMesa} cerrada correctamente`
    };
    
  } catch (error) {
    console.error('❌ [BACKEND] Error en cerrar-mesa:', error);
    set.status = 500;
    return { ok: false, error: (error as Error).message };
  }
})
.get('/staff-login', async ({ query, set }) => {
    try {
      const token = query.token as string;
      const sesion = await authService.iniciarSesionStaffConToken(token, 'mesero');
      
      return {
        success: true,
        sessionId: sesion.sessionId,
        rol: sesion.rol,
      };
    } catch (err) {
      // Asignamos el código HTTP 401 usando 'set.status'
      set.status = 401;
      return {
        success: false,
        mensaje: (err as Error).message,
      };
    }
  }, {
    query: t.Object({
      token: t.String(),
    })
  });

  console.log('✅ [AuthController] Endpoints registrados:');
console.log('  - GET  /api/auth/test');
console.log('  - GET  /api/auth/mesa/:numeroMesa/token');
console.log('  - GET  /api/auth/mesa/:numeroMesa');
console.log('  - POST /api/auth/admin/login');
console.log('  - POST /api/auth/cerrar-mesa/:numeroMesa  ✅'); // 👈 ESTE DEBE APARECER
console.log('  - GET  /api/auth/staff-login');