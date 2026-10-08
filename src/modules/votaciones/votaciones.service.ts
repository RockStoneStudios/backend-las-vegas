import { VotacionesRepository } from './votaciones.repository';
import { Rooms, type WsSessionData } from '../../shared/websocket/socket.server';

type Publicador = (canal: string, mensaje: string) => void;

// 🔥 Estado global en memoria
interface VotacionEnMemoria {
  votacionId: string;
  pregunta: string;
  opciones: { id: number; texto: string; votos: number }[];
  activa: boolean;
  iniciadaEn: number;
  duracionSegundos: number;
  broadcastTimer: NodeJS.Timeout | null;
  timeoutCierre: NodeJS.Timeout | null;
}

let votacionActiva: VotacionEnMemoria | null = null;

export class VotacionesService {
  private repo = new VotacionesRepository();

  /**
   * Abre una nueva votación exprés.
   * Estado en memoria + cierre automático específico.
   */
  async iniciarVotacion(
    sesion: WsSessionData,
    pregunta: string,
    opciones: string[],
    duracionSegundos: number,
    publicar: Publicador
  ) {
    // 1. Control de acceso
    if (sesion.rol !== 'dj' && sesion.rol !== 'admin') {
      throw new Error('No autorizado: solo el DJ o un Admin pueden abrir una votación');
    }

    // 🔥 Si hay votación anterior, limpiar ANTES de crear la nueva
    this.limpiarVotacionAnterior();

    // 2. Crear en MongoDB
    const doc = await this.repo.crearVotacion(pregunta, opciones);

    // 3. Crear estado en memoria
    votacionActiva = {
      votacionId: doc.votacionId,
      pregunta: doc.pregunta,
      opciones: doc.opciones.map((o: any) => ({
        id: o.id,
        texto: o.texto,
        votos: o.votos || 0,
      })),
      activa: true,
      iniciadaEn: Date.now(),
      duracionSegundos,
      broadcastTimer: null,
      timeoutCierre: null,
    };

    // 4. Emitir evento inicial
    publicar(
      Rooms.general(),
      JSON.stringify({
        tipo: 'EVENT:VOTACION_EXPRES_START',
        payload: {
          id: doc.votacionId,
          pregunta: doc.pregunta,
          opciones: doc.opciones,
          duracion: duracionSegundos,
        },
      })
    );

    // 🔥 5. Cierre automático ESPECÍFICO (no "la activa")
    const timeoutCierre = setTimeout(() => {
      this.cerrarVotacion(doc.votacionId, publicar).catch((err) => {
        console.error('❌ Error cerrando votación:', err);
      });
    }, duracionSegundos * 1000);

    votacionActiva.timeoutCierre = timeoutCierre;

    return doc;
  }

  /**
   * Registra el voto de un usuario.
   * Actualiza DB + memoria + broadcast con throttle.
   */
  async votar(
    sesion: WsSessionData,
    votacionId: string,
    opcionId: number,
    publicar?: Publicador
  ) {
    // 1. Verificar que la votación esté activa
    if (!votacionActiva || votacionActiva.votacionId !== votacionId || !votacionActiva.activa) {
      return { exito: false, mensaje: 'Votación no activa' };
    }

    // 2. Registrar en DB (anti-duplicados)
    const resultado = await this.repo.registrarVoto(votacionId, sesion.sessionId, opcionId);

    if (!resultado.exito) {
      return resultado;
    }

    // 3. Actualizar contador en memoria
    if (resultado.votacionActualizada) {
      const opcionActualizada = resultado.votacionActualizada.opciones.find(
        (o: any) => o.id === opcionId
      );
      if (opcionActualizada) {
        const opcionEnMemoria = votacionActiva.opciones.find((o) => o.id === opcionId);
        if (opcionEnMemoria) {
          opcionEnMemoria.votos = opcionActualizada.votos;
        }
      }
    }

    // 🔥 4. Broadcast con throttle (máx 1 cada 500ms)
    if (publicar) {
      this.programarBroadcast(publicar);
    }

    return resultado;
  }

  /**
   * Cierra la votación ESPECÍFICA.
   */
  async cerrarVotacion(votacionId: string, publicar: Publicador) {
    if (!votacionActiva || votacionActiva.votacionId !== votacionId) {
      return;
    }

    votacionActiva.activa = false;

    // Limpiar timers
    if (votacionActiva.broadcastTimer) {
      clearTimeout(votacionActiva.broadcastTimer);
      votacionActiva.broadcastTimer = null;
    }
    if (votacionActiva.timeoutCierre) {
      clearTimeout(votacionActiva.timeoutCierre);
      votacionActiva.timeoutCierre = null;
    }

    // Cerrar en DB
    try {
      await this.repo.cerrarVotacion(votacionId);
    } catch (err) {
      console.error('❌ Error cerrando votación en DB:', err);
    }

    publicar(
      Rooms.general(),
      JSON.stringify({
        tipo: 'EVENT:VOTACION_CERRADA',
        payload: { id: votacionId },
      })
    );

    votacionActiva = null;
  }

  async obtenerVotacionActiva() {
    if (!votacionActiva || !votacionActiva.activa) return null;
    return votacionActiva;
  }

  // =====================================================================
  // 🔧 Helpers privados
  // =====================================================================

  private limpiarVotacionAnterior() {
    if (!votacionActiva) return;

    console.log(`🧹 Cerrando votación anterior: ${votacionActiva.votacionId}`);

    votacionActiva.activa = false;
    if (votacionActiva.broadcastTimer) {
      clearTimeout(votacionActiva.broadcastTimer);
      votacionActiva.broadcastTimer = null;
    }
    if (votacionActiva.timeoutCierre) {
      clearTimeout(votacionActiva.timeoutCierre);
      votacionActiva.timeoutCierre = null;
    }
    votacionActiva = null;
  }

  private programarBroadcast(publicar: Publicador) {
    if (!votacionActiva || votacionActiva.broadcastTimer) {
      return; // ya hay uno pendiente
    }

    votacionActiva.broadcastTimer = setTimeout(() => {
      if (!votacionActiva || !votacionActiva.activa) return;

      publicar(
        Rooms.general(),
        JSON.stringify({
          tipo: 'EVENT:VOTACION_ACTUALIZADA',
          payload: {
            id: votacionActiva.votacionId,
            opciones: votacionActiva.opciones,
          },
        })
      );

      if (votacionActiva) votacionActiva.broadcastTimer = null;
    }, 500);
  }
}