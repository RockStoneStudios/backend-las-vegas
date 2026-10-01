import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import { Elysia } from 'elysia';
import { node } from '@elysiajs/node';
import { cors } from '@elysiajs/cors';
import { ENV } from './shared/config/env';
import { conectarMongo } from './shared/database/mongo.connection';
import { Rooms, type WsSessionData } from './shared/websocket/socket.server';
import { registrarServidorWS } from './shared/websocket/socket.publisher'; // ✅ IMPORTAMOS EL REGISTRO

import { authController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';
import { meseroController } from './modules/mesero/mesero.controller';
import { MeseroService } from './modules/mesero/mesero.service';
import { juegosController } from './modules/juegos/juegos.controller';
import { cancionesController } from './modules/canciones/canciones.controller';
import { mesasController } from './modules/mesas/mesas.controller';
import { reservasController } from './modules/reservas/reservas.controller';
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

// 🗄️ VARIABLE GLOBAL PARA GUARDAR TODAS LAS CONEXIONES WEBSOCKET ACTIVAS
export const conexionesGlobales: any[] = [];

// PASO 3: App Elysia CON ADAPTER NODE
const app = new Elysia({ adapter: node() })
  .use(cors({
  origin: [
    'https://lasvegasdiscobar.netlify.app',
    'https://las-vegas-woad.vercel.app',
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id']
}))
  .use(authController)
  .use(meseroController)
  .use(juegosController)
  .use(cancionesController)
  .use(mesasController)
  .use(reservasController)
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

      // ADMIN - CONEXIÓN DIRECTA
      if (sessionId.startsWith('a361')) {
        console.log('🟢 [OPEN] ADMIN - CONEXIÓN DIRECTA');
        
        const datosSesion: WsSessionData = {
          sessionId: sessionId,
          mesa: 0,
          rol: 'admin',
        };
        
        (ws.data as any).sesion = datosSesion;
        
        // 🔥 GUARDAMOS LA CONEXIÓN
        conexionesGlobales.push(ws);
        
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

      // CLIENTES NORMALES
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

      // 🔥 GUARDAMOS LA CONEXIÓN
      conexionesGlobales.push(ws);

      console.log(`🟢 [OPEN] ✅ CONECTADO - mesa=${datosSesion.mesa} rol=${datosSesion.rol}`);

      ws.subscribe(Rooms.general());
      if (sesion.mesa) ws.subscribe(Rooms.mesa(sesion.mesa));
      if (sesion.rol === 'admin' || sesion.rol === 'dj') ws.subscribe(Rooms.admin());
      if (['admin', 'dj', 'mesero'].includes(sesion.rol)) ws.subscribe(Rooms.staff());

      // ENVIAR CONFIGURACIÓN DE PREMIOS
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
        console.trace('🧐 Traza del error:');
      }

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

      // Creamos la función publicar con la referencia directa al WebSocket actual
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
                esGanador: resultado.esPremioMayor,
                color: resultado.color,
                icono: resultado.icono,
              }
            }));
            break;
          }

          case 'ACTION:TOGGLE_PEDIR_CANCION': {
            console.log(`🎵 [BACKEND] Admin cambió estado a: ${payload.activo}`);
            interaccionesService.toggleModoPedirCancion(payload.activo, publicar);
            break;
          }

          case 'ACTION:GIRAR_SLOT': {
            const resultado = await juegosService.girarSlot(sesion, publicar);

            ws.send(JSON.stringify({
              tipo: 'EVENT:SLOT_RESULTADO',
              payload: {
                rodillos: resultado.rodillos,
                premio: resultado.premio,
                ganador: resultado.premio > 0,
              },
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
            interaccionesService.registrarReaccion(payload?.emoji, publicar);
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
      
      // 🔥 ELIMINAMOS LA CONEXIÓN CERRADA
      const index = conexionesGlobales.indexOf(ws);
      if (index > -1) conexionesGlobales.splice(index, 1);
      
      console.log(`🔴 [CLOSE] Conexión cerrada - mesa=${sesion?.mesa ?? '?'} código=${code}`);
    }
  });

app.get("/ping", () => "pong");

// ✅ INICIAR SERVIDOR
const server = app.listen(ENV.PORT, () => {
  console.log(`🎉 Servidor corriendo en http://localhost:${ENV.PORT}`);
  console.log(`📡 WebSocket en ws://localhost:${ENV.PORT}/ws`);
});

// 🔥 REGISTRAR EL SERVIDOR DESPUÉS DE QUE YA ESTÉ ESCUCHANDO
// ⚠️⚠️⚠️ CORRECCIÓN CRÍTICA: Elysia NO usa app.server para publish, usa app.ws
const bunServer = app.ws; // ⬅️ ESTA es la instancia que tiene el método publish
if (bunServer) {
  registrarServidorWS(bunServer);
  console.log('✅ Servidor WebSocket registrado en publicador');
} else {
  console.error('❌ No se pudo obtener el servidor de Bun');
}

console.log('✅ Servidor iniciado');