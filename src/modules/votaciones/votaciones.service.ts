import { VotacionesRepository } from './votaciones.repository';
import { Rooms, type WsSessionData } from '../../shared/websocket/socket.server';

// Tipo helper para la función de transmisión en tiempo real vía WebSocket
type Publicador = (canal: string, mensaje: string) => void;

export class VotacionesService {
  private repo = new VotacionesRepository();

  /**
   * Abre una nueva votación exprés en el sistema.
   * Valida permisos, guarda en base de datos, notifica a los clientes vía WebSocket
   * y programa los temporizadores de sincronización y cierre automático.
   */
  async iniciarVotacion(
    sesion: WsSessionData,
    pregunta: string,
    opciones: string[],
    duracionSegundos: number,
    publicar: Publicador
  ) {
    // 1. Control de acceso: Únicamente los usuarios con rol DJ o Admin pueden crear encuestas
    if (sesion.rol !== 'dj' && sesion.rol !== 'admin') {
      throw new Error('No autorizado: solo el DJ o un Admin pueden abrir una votación');
    }

    // 2. Desactiva encuestas anteriores e inserta la nueva votación en MongoDB
    const doc = await this.repo.crearVotacion(pregunta, opciones);

    // 3. Emite el evento inicial a la sala general (Room General) para abrir la interfaz en los clientes
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

    // 4. Temporizador de actualización periódica (cada 2 segundos)
    // Mantiene los conteos/porcentajes de votos sincronizados en vivo en las pantallas
    const intervaloActualizacion = setInterval(async () => {
      const actual = await this.repo.obtenerActiva();

      // Si la encuesta se cerró o cambió por otra, cancelamos este intervalo
      if (!actual || actual.votacionId !== doc.votacionId) {
        clearInterval(intervaloActualizacion);
        return;
      }

      publicar(
        Rooms.general(),
        JSON.stringify({
          tipo: 'EVENT:VOTACION_ACTUALIZADA',
          payload: {
            id: actual.votacionId,
            opciones: actual.opciones,
          },
        })
      );
    }, 2000);

    // 5. Temporizador de cierre automático al expirar la duración especificada
    setTimeout(async () => {
      await this.repo.cerrarVotacionActiva();
      clearInterval(intervaloActualizacion); // Detiene las actualizaciones periódicas

      // Notifica a los clientes que la votación terminó para congelar la UI
      publicar(
        Rooms.general(),
        JSON.stringify({
          tipo: 'EVENT:VOTACION_CERRADA',
          payload: { id: doc.votacionId },
        })
      );
    }, duracionSegundos * 1000);

    return doc;
  }

  /**
   * Registra el voto de una mesa/usuario asegurando idempotencia (máximo 1 voto por sesión)
   * y transmite los resultados actualizados inmediatamente si el voto fue válido.
   */
  async votar(
    sesion: WsSessionData,
    votacionId: string,
    opcionId: number,
    publicar?: Publicador
  ) {
    // 1. Ejecuta la operación atómica anti-duplicados en la base de datos
    const resultado = await this.repo.registrarVoto(votacionId, sesion.sessionId, opcionId);

    // 2. Si el voto se procesó con éxito, emite la actualización instantánea por WebSocket
    if (resultado.exito && resultado.votacionActualizada && publicar) {
      publicar(
        Rooms.general(),
        JSON.stringify({
          tipo: 'EVENT:VOTACION_ACTUALIZADA',
          payload: {
            id: resultado.votacionActualizada.votacionId,
            opciones: resultado.votacionActualizada.opciones,
          },
        })
      );
    }

    return resultado;
  }

  /**
   * Obtiene la votación activa actual para clientes que recién abren la app o reconectan su sesión.
   */
  async obtenerVotacionActiva() {
    return this.repo.obtenerActiva();
  }
}