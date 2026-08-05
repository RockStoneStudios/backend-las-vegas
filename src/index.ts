import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import { Elysia } from 'elysia';
import { node } from '@elysiajs/node'; // ✅ ESTO ES OBLIGATORIO PARA NODE
import { cors } from '@elysiajs/cors';
import { ENV } from './shared/config/env';
import { conectarMongo } from './shared/database/mongo.connection';
import { Rooms, type WsSessionData } from './shared/websocket/socket.server';

import { authController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';

import { meseroController } from './modules/mesero/mesero.controller';
import { MeseroService } from './modules/mesero/mesero.service';
import { juegosController } from './modules/juegos/juegos.controller';
import { InteraccionesService } from './modules/interacciones/interacciones.service';
import { JuegosService } from './modules/juegos/juegos.service';
import { VotacionesService } from './modules/votaciones/votaciones.service';

// PASO 1: Conectar a MongoDB
await conectarMongo();

// PASO 2: Instanciar Services
const authService = new AuthService();
const meseroService = new MeseroService();
const interaccionesService = new InteraccionesService();
const juegosService = new JuegosService();
const votacionesService = new VotacionesService();

// PASO 3: App Elysia CON ADAPTER NODE (OBLIGATORIO)
const app = new Elysia({ adapter: node() }) // ✅ ESTO ES LO QUE FALTA
  .use(cors())
  .use(authController)
  .use(meseroController)
  .use(juegosController)
  .ws('/ws', {
    async open(ws) {
      console.log('🔵 [OPEN] NUEVA CONEXIÓN WEBSOCKET');
      
      const url = new URL(ws.data.request.url);
      const sessionId = url.searchParams.get('sessionId');

      console.log(`🔵 [OPEN] sessionId: ${sessionId}`);

      if (!sessionId) {
        console.log('🔴 [OPEN] Falta sessionId');
        ws.close(4001, 'Falta sessionId');
        return;
      }

      // ✅ FIX: ADMIN - CONEXIÓN DIRECTA SIN AUTENTICACIÓN
      if (sessionId.startsWith('a361')) {
        console.log('🟢 [OPEN] ADMIN - CONEXIÓN DIRECTA');
        
        const datosSesion: WsSessionData = {
          sessionId: sessionId,
          mesa: 0,
          rol: 'admin',
        };
        
        (ws.data as any).sesion = datosSesion;
        
        ws.subscribe(Rooms.general());
        ws.subscribe(Rooms.admin());
        ws.subscribe(Rooms.staff());
        
        ws.send(JSON.stringify({
          tipo: 'EVENT:CONEXION_EXITOSA',
          payload: { mesa: 0, rol: 'admin' }
        }));
        
        console.log(`✅ [OPEN] ADMIN CONECTADO`);
        return;
      }

      // ✅ CLIENTES NORMALES
      const sesion = await authService.recuperarSesion(sessionId);
      if (!sesion) {
        console.log(`🔴 [OPEN] Sesión NO encontrada: ${sessionId}`);
        ws.close(4002, 'Sesión inválida');
        return;
      }

      const datosSesion: WsSessionData = {
        sessionId: sesion.sessionId,
        mesa: sesion.mesa,
        rol: sesion.rol,
      };

      (ws.data as any).sesion = datosSesion;

      console.log(`🟢 [OPEN] ✅ CONECTADO - mesa=${datosSesion.mesa} rol=${datosSesion.rol}`);

      ws.subscribe(Rooms.general());
      if (sesion.mesa) ws.subscribe(Rooms.mesa(sesion.mesa));
      if (sesion.rol === 'admin' || sesion.rol === 'dj') ws.subscribe(Rooms.admin());
      if (['admin', 'dj', 'mesero'].includes(sesion.rol)) ws.subscribe(Rooms.staff());

      // =============================================================
      // 🔥 NUEVO: ENVIAR LA CONFIGURACIÓN DE PREMIOS AL CONECTARSE
      // =============================================================
      console.log('🚀 [OPEN] Entrando al bloque de envío de premios...');
      try {
        const premiosConfig = await juegosService.obtenerConfiguracionPremios();
        console.log('📦 [OPEN] Premios obtenidos del servicio:', premiosConfig);

        if (!premiosConfig || premiosConfig.length === 0) {
          console.warn('⚠️ [OPEN] El servicio devolvió una lista vacía de premios. No se envía nada.');
        } else {
          const mensaje = JSON.stringify({
            tipo: 'EVENT:RULETA_CONFIGURACION_INICIAL',
            payload: {
              premios: premiosConfig,
            },
          });
          console.log('📤 [OPEN] Enviando mensaje al cliente:', mensaje);
          ws.send(mensaje);
          console.log(`✅ [OPEN] Configuración de premios enviada a mesa ${sesion.mesa}`);
        }
      } catch (error) {
        console.error('❌ [OPEN] Error CRÍTICO al obtener o enviar premios:', error);
        console.trace('🧐 Traza del error:'); // Esto imprime el error en cadena
      }
      // =============================================================

      ws.send(JSON.stringify({
        tipo: 'EVENT:CONEXION_EXITOSA',
        payload: { mesa: sesion.mesa, rol: sesion.rol }
      }));
      
      console.log(`✅ [OPEN] Conexión exitosa - mesa=${sesion.mesa}`);
    },

    async message(ws, rawMessage) {
      const sesion = (ws.data as any).sesion as WsSessionData | undefined;
      if (!sesion) return;

      let data: any;
      try {
        data = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : rawMessage;
      } catch (e) {
        console.error('❌ Error parseando JSON:', e);
        return;
      }

      const { tipo, payload } = data ?? {};
      console.log(`📨 [MESSAGE] ${tipo} - mesa ${sesion.mesa}`);

      const publicar = (canal: string, mensaje: string) => {
        ws.publish(canal, mensaje);
      };

      try {
        switch (tipo) {
          case 'ACTION:SOLICITAR_ATENCION':
          case 'ACTION:LLAMAR_MESERO':
            await meseroService.solicitarMesero(sesion, publicar);
            break;

          case 'ACTION:ATENDER_MESA':
            await meseroService.atenderMesa(sesion, payload?.idAlerta, payload?.mesa, publicar);
            break;

          case 'ACTION:VOTACION_EXPRES_START':
            await votacionesService.iniciarVotacion(
              sesion,
              payload?.pregunta,
              payload?.opciones,
              payload?.duracion,
              publicar
            );
            break;

          case 'ACTION:VOTAR_OPCION':
            await votacionesService.votar(
              sesion,
              payload?.votacionId,
              payload?.opcionId,
              publicar
            );
            break;
           case 'ACTION:OBTENER_PREMIOS': {
            console.log('📦 [BACKEND] Cliente solicitó los premios activamente.');
            const premiosConfig = await juegosService.obtenerConfiguracionPremios();
            
            // 🛑 ESTO ES LO QUE FALTABA: Responder al cliente que preguntó, NO publicar a todos.
            ws.send(JSON.stringify({
              tipo: 'EVENT:RULETA_CONFIGURACION_INICIAL',
              payload: {
                premios: premiosConfig,
              },
            }));
            
            console.log('✅ [BACKEND] Premios reenviados al cliente.');
            break;
          }  

          case 'ACTION:GIRAR_RULETA': {
            const resultado = await juegosService.girarRuletaGeneral(
              sesion,
              {
                duracionSegundos: payload?.duracionSegundos,
                mesasManuales: payload?.mesasManuales,
              },
              publicar
            );
            ws.send(JSON.stringify({
              tipo: 'EVENT:SORTEO_MESA_RESULTADO',
              payload: resultado,
            }));
            break;
          }

          case 'ACTION:HABILITAR_JUEGO_PRIVADO':
            await juegosService.habilitarJuegoPrivado(
              sesion,
              payload?.juegoId,
              payload?.mesaDestino,
              publicar
            );
            break;

          case 'ACTION:GIRAR_RULETA_PREMIOS': {
            const resultado = await juegosService.girarRuletaPremios(sesion, publicar);

            ws.send(JSON.stringify({
              tipo: 'EVENT:RULETA_GIRAR',
              payload: {
                indiceGanador: resultado.indiceGanador,
                premio: resultado.premio,
                vueltas: resultado.vueltas,
                duracionMs: resultado.duracionMs,
                ejecutadoPorMesa: sesion.mesa,
                // 🔥 NUEVOS CAMPOS
                esGanador: resultado.esPremioMayor,
                color: resultado.color,
                icono: resultado.icono,
              }
            }));
            break;
          }
          case 'ACTION:MANDAR_BRINDIS':
            interaccionesService.mandarBrindis(sesion, payload?.mesaDestino, publicar);
            break;

          case 'ACTION:NOTIFICAR_CUMPLEAÑOS':
            interaccionesService.notificarCumpleanos(sesion, publicar);
            break;

          case 'ACTION:ENVIAR_REACCION':
            interaccionesService.registrarReaccion(payload?.emoji);
            break;

          case 'ACTION:FLASH_SYNC_START':
            interaccionesService.activarFlashSync(sesion, publicar);
            break;

          default:
            console.log(`⚠️ Evento no reconocido: ${tipo}`);
        }
      } catch (error) {
        console.error('❌ Error:', error);
        ws.send(JSON.stringify({
          tipo: 'ERROR',
          payload: { mensaje: (error as Error).message },
        }));
      }
    },

    close(ws, code, reason) {
      const sesion = (ws.data as any).sesion as WsSessionData | undefined;
      console.log(`🔴 [CLOSE] Conexión cerrada - mesa=${sesion?.mesa ?? '?'} código=${code}`);
    }
  });
 
  app.get("/ping", () => "pong");

app.listen(ENV.PORT, () => {
  console.log(`🎉 Servidor corriendo en http://localhost:${ENV.PORT}`);
  console.log(`📡 WebSocket en ws://localhost:${ENV.PORT}/ws`);
});

console.log('✅ Servidor iniciado');