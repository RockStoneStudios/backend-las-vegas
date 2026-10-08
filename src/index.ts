import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import { Elysia } from 'elysia';
import { node } from '@elysiajs/node';
import { cors } from '@elysiajs/cors';
import { ENV } from './shared/config/env';
import { conectarMongo } from './shared/database/mongo.connection';
import { Rooms, type WsSessionData } from './shared/websocket/socket.server';
import { registrarServidorWS } from './shared/websocket/socket.publisher';
import { logWS } from './shared/utils/logs';

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

// =============================================================
// 🔥 HEARTBEAT (un solo intervalo global para todas las conexiones)
// =============================================================
// El cliente tiene un watchdog de 60s: el intervalo de PING debe ser menor a eso.
// El timeout es generoso (~3 pings perdidos) porque los celulares pausan el JS
// de la pestaña en segundo plano y no pueden responder el PONG.
const HEARTBEAT_INTERVALO = 25_000; // 25s entre PINGs
const HEARTBEAT_TIMEOUT = 75_000;   // 75s sin actividad -> se cierra (código 4003)

// Conexiones con heartbeat activo. Se guarda el `ws` del evento open.
// El último pong y el flag "cerrado" viven en ws.data (que es estable entre eventos).
const conexionesHeartbeat = new Set<any>();

function iniciarHeartbeat(ws: any) {
  (ws.data as any).ultimoPong = Date.now();
  conexionesHeartbeat.add(ws);
}

setInterval(() => {
  const ahora = Date.now();

  for (const ws of conexionesHeartbeat) {
    const data = (ws.data ?? {}) as any;

    // Conexión ya cerrada: limpiar
    if (data.cerrado) {
      conexionesHeartbeat.delete(ws);
      continue;
    }

    // Demasiado tiempo sin actividad: cerrar
    if (ahora - (data.ultimoPong ?? 0) > HEARTBEAT_TIMEOUT) {
      logWS(`💀 [HEARTBEAT] Conexión muerta, cerrando mesa=${data.sesion?.mesa ?? '?'}`);
      conexionesHeartbeat.delete(ws);
      try { ws.close(4003, 'Heartbeat timeout'); } catch {}
      continue;
    }

    // Enviar PING
    try {
      ws.send(JSON.stringify({ tipo: 'PING', payload: { ts: ahora } }));
    } catch {
      conexionesHeartbeat.delete(ws);
    }
  }
}, HEARTBEAT_INTERVALO);

// =============================================================
// 🔐 ADMIN DIRECTO (LEGADO)
// =============================================================
// ⚠️ SEGURIDAD: cualquier cliente que conecte con un sessionId que empiece por
// 'a361' obtiene rol admin SIN validar nada contra la BD.
// Cuando tu panel admin use una sesión real (AuthService.iniciarSesionAdmin),
// pon WS_ADMIN_BYPASS=false en tu .env para cerrar este atajo.
const ADMIN_BYPASS = process.env.WS_ADMIN_BYPASS !== 'false';
const ADMIN_PREFIX = 'a361';

// =============================================================
// 📦 ESTADO INICIAL (para clientes que conectan o reconectan)
// =============================================================
// Mientras un cliente estuvo desconectado se perdió eventos. Al abrir el socket
// le enviamos el estado actual para que se re-sincronice.
async function enviarEstadoInicial(ws: any) {
  try {
    const votacionSync = votacionesService.obtenerEstadoInicial();

    // 1. Envía el estado inicial consolidado (incluyendo pedir canciones)
    ws.send(JSON.stringify({
      tipo: 'EVENT:ESTADO_INICIAL',
      payload: {
        votacionActiva: votacionSync ? votacionSync.payload : null,
        modoPedirCancion: interaccionesService.obtenerEstadoPedirCancion(),
      },
    }));

    // 2. Dispara el evento de sincronización de votación con el tiempo restante exacto
    if (votacionSync) {
      ws.send(JSON.stringify(votacionSync));
    }
  } catch (error) {
    console.error('❌ [OPEN] Error enviando estado inicial:', error);
  }
}

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
      logWS('🔵 [OPEN] NUEVA CONEXIÓN WEBSOCKET');

      const url = new URL(ws.data.request.url);
      const sessionId = url.searchParams.get('sessionId');

      logWS(`🔵 [OPEN] sessionId: ${sessionId}`);

      if (!sessionId) {
        console.error('🔴 [OPEN] Falta sessionId');
        ws.close(4001, 'Falta sessionId');
        return;
      }

      // ADMIN - CONEXIÓN DIRECTA (legado, ver ADMIN_BYPASS arriba)
      if (ADMIN_BYPASS && sessionId.startsWith(ADMIN_PREFIX)) {
        logWS('🟢 [OPEN] ADMIN - CONEXIÓN DIRECTA');

        const datosSesion: WsSessionData = {
          sessionId: sessionId,
          mesa: 0,
          rol: 'admin',
        };

        (ws.data as any).sesion = datosSesion;

        ws.subscribe(Rooms.general());
        ws.subscribe(Rooms.admin());
        ws.subscribe(Rooms.staff());

        iniciarHeartbeat(ws);

        await enviarEstadoInicial(ws);

        ws.send(JSON.stringify({
          tipo: 'EVENT:CONEXION_EXITOSA',
          payload: { mesa: 0, rol: 'admin' }
        }));

        logWS(`✅ [OPEN] ADMIN CONECTADO`);
        return;
      }

      // CLIENTES NORMALES
      let sesion: any;
      try {
        sesion = await authService.recuperarSesion(sessionId);
      } catch (error) {
        // Si Mongo falla NO dejamos el socket abierto "a medias":
        // 1011 no está en NO_RECONECTAR del cliente, así que reintenta con backoff.
        console.error('❌ [OPEN] Error recuperando sesión:', error);
        try { ws.close(1011, 'Error interno'); } catch {}
        return;
      }

      if (!sesion) {
        logWS(`🔴 [OPEN] Sesión NO encontrada: ${sessionId}`);
        ws.close(4002, 'Sesión inválida');
        return;
      }

      // Escritura en BD sin bloquear la apertura (en reconexiones masivas ahorra latencia)
      authService.registrarConexion(sesion.sessionId).catch((e) => {
        console.error('⚠️ [OPEN] Error registrando conexión:', e);
      });

      const datosSesion: WsSessionData = {
        sessionId: sesion.sessionId,
        mesa: sesion.mesa,
        rol: sesion.rol as WsSessionData['rol'],
      };

      (ws.data as any).sesion = datosSesion;

      logWS(`🟢 [OPEN] ✅ CONECTADO - mesa=${datosSesion.mesa} rol=${datosSesion.rol}`);

      ws.subscribe(Rooms.general());
      if (sesion.mesa) ws.subscribe(Rooms.mesa(sesion.mesa));
      if (sesion.rol === 'admin' || sesion.rol === 'dj') ws.subscribe(Rooms.admin());
      if (['admin', 'dj', 'mesero'].includes(sesion.rol)) ws.subscribe(Rooms.staff());

      // El heartbeat arranca ya, para que ninguna espera posterior deje un socket sin vigilar
      iniciarHeartbeat(ws);

      // ENVIAR CONFIGURACIÓN DE PREMIOS
      try {
        const premiosConfig = await juegosService.obtenerConfiguracionPremios();

        if (!premiosConfig || premiosConfig.length === 0) {
          console.warn('⚠️ [OPEN] El servicio devolvió una lista vacía de premios. No se envía nada.');
        } else {
          ws.send(JSON.stringify({
            tipo: 'EVENT:RULETA_CONFIGURACION_INICIAL',
            payload: { premios: premiosConfig },
          }));
          logWS(`✅ [OPEN] Configuración de premios enviada a mesa ${sesion.mesa}`);
        }
      } catch (error) {
        console.error('❌ [OPEN] Error al obtener o enviar premios:', error);
      }

      // ESTADO ACTUAL (votación activa, modo pedir canción)
      await enviarEstadoInicial(ws);

      ws.send(JSON.stringify({
        tipo: 'EVENT:CONEXION_EXITOSA',
        payload: { mesa: sesion.mesa, rol: sesion.rol }
      }));

      logWS(`✅ [OPEN] Conexión exitosa - mesa=${sesion.mesa}`);
    },

    async message(ws, rawMessage) {
      const sesion = (ws.data as any).sesion as WsSessionData | undefined;
      if (!sesion) return;

      // 🔥 Cualquier mensaje del cliente cuenta como "está vivo"
      (ws.data as any).ultimoPong = Date.now();

      let data: any;
      try {
        data = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : rawMessage;
      } catch (e) {
        console.error('❌ Error parseando JSON:', e);
        return;
      }

      const { tipo, payload } = data ?? {};

      // HEARTBEAT: el PONG ya se registró arriba
      if (tipo === 'PONG') return;

      logWS(`📨 [MESSAGE] ${tipo} - mesa ${sesion.mesa}`);

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
            logWS('📦 [BACKEND] Cliente solicitó los premios activamente.');
            const premiosConfig = await juegosService.obtenerConfiguracionPremios();

            ws.send(JSON.stringify({
              tipo: 'EVENT:RULETA_CONFIGURACION_INICIAL',
              payload: { premios: premiosConfig },
            }));

            logWS('✅ [BACKEND] Premios reenviados al cliente.');
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
            logWS(`🎵 [BACKEND] Admin cambió estado a: ${payload.activo}`);
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
            logWS(`⚠️ Evento no reconocido: ${tipo}`);
        }
      } catch (error) {
        console.error('❌ Error:', error);
        try {
          ws.send(JSON.stringify({
            tipo: 'ERROR',
            payload: { mensaje: (error as Error).message },
          }));
        } catch {}
      }
    },

    close(ws, code, reason) {
      const sesion = (ws.data as any).sesion as WsSessionData | undefined;

      // Marcamos la conexión como cerrada; el intervalo global la limpia del Set
      (ws.data as any).cerrado = true;

      logWS(`🔴 [CLOSE] Conexión cerrada - mesa=${sesion?.mesa ?? '?'} código=${code}`);
    }
  });

app.get("/ping", () => "pong");

// ✅ INICIAR SERVIDOR
const server = app.listen(ENV.PORT, () => {
  console.log(`🎉 Servidor corriendo en http://localhost:${ENV.PORT}`);
  console.log(`📡 WebSocket en ws://localhost:${ENV.PORT}/ws`);
});

// 🔥 REGISTRAR EL SERVIDOR DESPUÉS DE QUE YA ESTÉ ESCUCHANDO
// ⚠️ TODO: `app.ws` es el método de Elysia para declarar rutas WebSocket, NO el servidor,
// y siempre es truthy. Revisar socket.publisher.ts para pasar aquí el objeto correcto.
const bunServer = app.ws;
if (bunServer) {
  registrarServidorWS(bunServer);
  console.log('✅ Servidor WebSocket registrado en publicador');
} else {
  console.error('❌ No se pudo obtener el servidor de Bun');
}

console.log('✅ Servidor iniciado');