import { Rooms, type WsSessionData } from "../../shared/websocket/socket.server";
import { getDb } from '../../shared/database/mongo.connection';   // 🆕

type Publicador = (canal: string, mensaje: string) => void;

// Acumulador de reacciones EN MEMORIA
const contadorReacciones: Record<string, number> = {};
let totalReaccionesGlobal = 0;

// Variable global para controlar si las mesas pueden pedir canciones
let modoPedirCancionActivo = false;
// 🆕 Guardamos el turnoId activo también en memoria para responder rápido
let turnoIdActivo: string | null = null;

// 🔥 Throttle del termómetro
let termometroDirty = false;
let termometroTimer: NodeJS.Timeout | null = null;
const TERMOMETRO_THROTTLE_MS = 500;

export class InteraccionesService {

  mandarBrindis(sesion: WsSessionData, mesaDestino: number, publicar: Publicador) {
    if (!mesaDestino || mesaDestino === sesion.mesa) return;
    publicar(
      Rooms.mesa(mesaDestino),
      JSON.stringify({
        tipo: 'EVENT:BRINDIS_RECIBIDO',
        payload: {
          mesaOrigen: sesion.mesa,
          mensaje: `La Mesa ${sesion.mesa} les manda un saludo`,
        },
      })
    );
  }

  notificarCumpleanos(sesion: WsSessionData, publicar: Publicador) {
    publicar(
      Rooms.admin(),
      JSON.stringify({
        tipo: 'EVENT:CUMPLEAÑOS_MESA',
        payload: { mesa: sesion.mesa },
      })
    );
  }

  registrarReaccion(emoji: string, publicar: Publicador) {
    if (!emoji) return;

    // 1. Acumulamos la energía
    totalReaccionesGlobal += 1;
    contadorReacciones[emoji] = (contadorReacciones[emoji] || 0) + 1;

    // 🔥 SIN console.log (era el cuello de botella #1)

    // 2. Emoji SOLO a las pantallas (admin)
    publicar(
      Rooms.admin(),
      JSON.stringify({
        tipo: 'EVENT:NUEVO_EMOJI_EN_TV',
        payload: { emoji },
      })
    );

    // 🔥 3. Termómetro con THROTTLE (máx 1 cada 500ms)
    termometroDirty = true;
    if (!termometroTimer) {
      termometroTimer = setTimeout(() => {
        termometroTimer = null;
        if (termometroDirty) {
          publicar(
            Rooms.admin(),
            JSON.stringify({
              tipo: 'EVENT:ACTUALIZAR_TERMOMETRO',
              payload: { total: totalReaccionesGlobal },
            })
          );
          termometroDirty = false;
        }
      }, TERMOMETRO_THROTTLE_MS);
    }
  }

  obtenerEstadoTermometro(publicar: Publicador) {
    const entradas = Object.entries(contadorReacciones);
    const emojisOrdenados = entradas.sort((a, b) => b[1] - a[1]);

    publicar(
      Rooms.admin(),
      JSON.stringify({
        tipo: 'EVENT:ACTUALIZAR_TERMOMETRO',
        payload: {
          total: totalReaccionesGlobal,
          emojiTop: emojisOrdenados.length > 0 ? emojisOrdenados[0][0] : null,
        },
      })
    );
  }

  reiniciarTermometro(publicar: Publicador) {
    for (const key in contadorReacciones) delete contadorReacciones[key];
    totalReaccionesGlobal = 0;

    publicar(
      Rooms.admin(),
      JSON.stringify({
        tipo: 'EVENT:TERMOMETRO_REINICIADO',
        payload: { mensaje: '¡El termómetro se ha reiniciado!' },
      })
    );
  }

  activarFlashSync(sesion: WsSessionData, publicar: Publicador) {
    if (sesion.rol !== 'dj' && sesion.rol !== 'admin') {
      throw new Error('No autorizado: solo el DJ puede activar el modo luces');
    }

    // ✅ Flash sync va a todos (es intencional, es un efecto global)
    publicar(
      Rooms.general(),
      JSON.stringify({
        tipo: 'EVENT:FLASH_SYNC_START',
        payload: { duracionSegundos: 10, colores: ['#fff', '#f00', '#0ff'] },
      })
    );
  }

  // =============================================================
  // CONTROL DE "PEDIR CANCIÓN"
  // =============================================================

 async toggleModoPedirCancion(activo: boolean, publicar: Publicador) {
  console.log('🚀 [TOGGLE] ENTRÓ AL MÉTODO toggleModoPedirCancion. activo =', activo);
  
  const db = getDb();
  console.log('🚀 [TOGGLE] db obtenida OK');

  if (activo) {
    console.log('🚀 [TOGGLE] Cerrando turnos previos...');
    const cierre = await db.collection('turnos_canciones').updateMany(
      { activo: true },
      { $set: { activo: false, cerradoAt: new Date() } }
    );
    console.log('🚀 [TOGGLE] Turnos cerrados:', cierre.modifiedCount);

    console.log('🚀 [TOGGLE] Insertando turno nuevo...');
    const turno = await db.collection('turnos_canciones').insertOne({
      activo: true,
      iniciadoAt: new Date(),
    });
    console.log('🚀 [TOGGLE] Turno insertado:', turno.insertedId.toString());

    turnoIdActivo = turno.insertedId.toString();
    modoPedirCancionActivo = true;
    console.log(`🎵 [CANCIONES] Turno INICIADO: ${turnoIdActivo}`);
  } else {
    // ...lo que ya tenías
  }

  publicar(
    Rooms.general(),
    JSON.stringify({
      tipo: 'EVENT:MODO_PEDIR_CANCION',
      payload: { activo },
    })
  );
  console.log('🚀 [TOGGLE] Broadcast enviado');
}
  obtenerEstadoPedirCancion(): boolean {
    return modoPedirCancionActivo;
  }

  // 🆕 Getter por si otro módulo necesita el turnoId activo
  obtenerTurnoActivoId(): string | null {
    return turnoIdActivo;
  }
}