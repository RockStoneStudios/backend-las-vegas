import {Elysia,t} from 'elysia';

import { AuthService } from './auth.service';

const authService = new AuthService();

export const authController = new Elysia({prefix : '/api/auth'})

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
).get('/staff-login', async ({ query, set }) => {
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