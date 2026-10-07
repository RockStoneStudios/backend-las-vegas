import { MeseroRepository } from './mesero.repository';
import { AuthService } from '../auth/auth.service';
import { Rooms, type WsSessionData } from '../../shared/websocket/socket.server';

type Publicador = (canal: string, mensaje: string) => void;

export class MeseroService {
  private repo = new MeseroRepository();
  private authService = new AuthService();

  // 1. Cliente en la mesa presiona "Llamar Mesero"
  async solicitarMesero(sesion: WsSessionData, publicar: Publicador) {
    console.log(`🔵 [solicitarMesero] INICIO - mesa: ${sesion.mesa}, sessionId: ${sesion.sessionId}`);

    // 🔥 Verificar si ya existe una solicitud PENDIENTE para esta mesa
    const pendientes = await this.repo.listarPendientes();
    const solicitudExistente = pendientes.find((p) => p.mesa === sesion.mesa);

    if (solicitudExistente) {
      console.log(`⚠️ [solicitarMesero] La mesa ${sesion.mesa} YA tiene solicitud pendiente (ID: ${solicitudExistente._id})`);

      // 🆕 Emitir estado BLOQUEADO a TODOS los clientes de la mesa
      // (por si alguno se conectó después y no lo sabe)
      const mensajeMesa = JSON.stringify({
        tipo: 'EVENT:MESERO_SOLICITADO',
        payload: {
          mesa: sesion.mesa,
          bloqueado: true,
          idAlerta: solicitudExistente._id!.toString(),
          hora: solicitudExistente.createdAt.toISOString(),
        },
      });
      console.log(`📤 [solicitarMesero] Publicando BLOQUEO en ${Rooms.mesa(sesion.mesa)}`);
      publicar(Rooms.mesa(sesion.mesa), mensajeMesa);

      // 🆕 Lanzar error específico para que el controller responda 409
      throw new Error('YA_SOLICITADO');
    }

    // ✅ No existe solicitud pendiente, crear una nueva
    console.log(`✅ [solicitarMesero] No hay solicitud pendiente, creando nueva...`);
    const alerta = await this.repo.crearLlamada(sesion.sessionId, sesion.mesa);
    console.log(`✅ [solicitarMesero] Alerta creada: ${alerta._id}`);

    // 1. Notificar al staff/admin (para el panel de alertas)
    const mensajeStaff = JSON.stringify({
      tipo: 'ALERT:LLAMADO_MESERO',
      payload: {
        idAlerta: alerta._id!.toString(),
        mesa: sesion.mesa,
        hora: alerta.createdAt.toISOString(),
      },
    });
    console.log(`📤 [solicitarMesero] Publicando en ${Rooms.staff()}:`, mensajeStaff);
    publicar(Rooms.staff(), mensajeStaff);
    publicar(Rooms.admin(), mensajeStaff);
    console.log(`✅ [solicitarMesero] Mensaje publicado en staff`);

    // 2. 🆕 Notificar a TODOS los clientes de la mesa (para bloquear el botón)
    const mensajeMesa = JSON.stringify({
      tipo: 'EVENT:MESERO_SOLICITADO',
      payload: {
        mesa: sesion.mesa,
        bloqueado: true,
        idAlerta: alerta._id!.toString(),
        hora: alerta.createdAt.toISOString(),
      },
    });
    const canalMesa = Rooms.mesa(sesion.mesa);
    console.log(`📤 [solicitarMesero] Publicando en ${canalMesa}:`, mensajeMesa);
    publicar(canalMesa, mensajeMesa);
    console.log(`✅ [solicitarMesero] Mensaje publicado en mesa ${sesion.mesa}`);

    return alerta;
  }

  // 2. Staff presiona "Atender" en su panel
  async atenderMesa(
    sesion: WsSessionData,
    idAlerta: string,
    mesa: number,
    publicar: Publicador
  ) {
    console.log(`🔵 [atenderMesa] INICIO - mesa: ${mesa}, alerta: ${idAlerta}`);
    console.log(`🔵 [atenderMesa] sesion.rol: ${sesion.rol}`);

    const rolesPermitidos = ['admin', 'dj', 'mesero'];

    if (!rolesPermitidos.includes(sesion.rol)) {
      console.log(`🔴 [atenderMesa] Rol no autorizado: ${sesion.rol}`);
      throw new Error('No autorizado: solo el staff puede atender llamadas');
    }

    console.log(`✅ [atenderMesa] Rol autorizado: ${sesion.rol}`);

    // ✅ Marcar como ATENDIDA (NO eliminar)
    await this.repo.marcarAtendido(idAlerta);
    console.log(`✅ [atenderMesa] Alerta ${idAlerta} marcada como ATENDIDA`);

    // ✅ Avisa a todo el staff para que remuevan la alerta de sus pantallas
    const mensajeStaff = JSON.stringify({
      tipo: 'EVENT:LLAMADO_ATENDIDO',
      payload: { idAlerta, mesa },
    });
    console.log(`📤 [atenderMesa] Publicando en ${Rooms.staff()}:`, mensajeStaff);
    publicar(Rooms.staff(), mensajeStaff);
    console.log(`✅ [atenderMesa] Mensaje publicado en staff`);

    // 🆕 Avisa a TODA la mesa: desbloquear el botón
    if (mesa) {
      const mensajeMesa = JSON.stringify({
        tipo: 'EVENT:MESERO_ATENDIDO',
        payload: {
          mesa,
          bloqueado: false,
          mensaje: 'Un mesero va en camino a tu mesa.',
        },
      });
      const canalMesa = Rooms.mesa(mesa);
      console.log(`📤 [atenderMesa] Publicando en ${canalMesa}:`, mensajeMesa);
      publicar(canalMesa, mensajeMesa);
      console.log(`✅ [atenderMesa] Mensaje publicado en mesa ${mesa}`);
    } else {
      console.warn(`⚠️ [atenderMesa] No hay número de mesa para publicar`);
    }

    console.log(`✅ [atenderMesa] FIN - mesa ${mesa} atendida`);
    return { idAlerta, mesa, atendido: true };
  }

  // 3. Obtener todas las llamadas pendientes
  async obtenerPendientes() {
    console.log(`🔵 [obtenerPendientes] Listando llamadas pendientes`);
    const pendientes = await this.repo.listarPendientes();
    console.log(`✅ [obtenerPendientes] ${pendientes.length} llamadas pendientes`);
    return pendientes;
  }

  // 4. Obtener solo el conteo de pendientes (para el badge 🔔)
  async obtenerConteoPendientes() {
    console.log(`🔵 [obtenerConteoPendientes] Contando llamadas pendientes`);
    const conteo = await this.repo.contarPendientes();
    console.log(`✅ [obtenerConteoPendientes] ${conteo} llamadas pendientes`);
    return conteo;
  }

  // 🆕 4.5. Verificar si una mesa tiene solicitud de mesero pendiente (para re-sync)
  async mesaTieneSolicitudPendiente(mesa: number): Promise<boolean> {
    console.log(`🔵 [mesaTieneSolicitudPendiente] Verificando mesa ${mesa}`);
    const pendientes = await this.repo.listarPendientes();
    const hayPendiente = pendientes.some((p) => p.mesa === mesa);
    console.log(`✅ [mesaTieneSolicitudPendiente] Mesa ${mesa} → ${hayPendiente ? 'BLOQUEADA' : 'libre'}`);
    return hayPendiente;
  }

  // 5. Cierre / Liberación de Mesa
  async liberarMesa(
    sesionSolicitante: WsSessionData,
    numeroMesa: number,
    publicar: Publicador
  ) {
    console.log(`🔵 [liberarMesa] INICIO - mesa: ${numeroMesa}, rol: ${sesionSolicitante.rol}`);

    if (sesionSolicitante.rol !== 'admin' && sesionSolicitante.rol !== 'dj') {
      console.log(`🔴 [liberarMesa] Rol no autorizado: ${sesionSolicitante.rol}`);
      throw new Error('No autorizado: solo el staff puede liberar una mesa');
    }

    console.log(`✅ [liberarMesa] Rol autorizado: ${sesionSolicitante.rol}`);

    // Marcar todos los llamados pendientes de esta mesa como atendidos
    await this.repo.resolverLlamadosPendientesPorMesa(numeroMesa);
    console.log(`✅ [liberarMesa] Llamados pendientes resueltos para mesa ${numeroMesa}`);

    const resultadoCierre = await this.authService.cerrarMesa(numeroMesa);
    console.log(`✅ [liberarMesa] Mesa ${numeroMesa} cerrada`);

    const mensaje = JSON.stringify({
      tipo: 'EVENT:MESA_CERRADA',
      payload: {
        mesa: numeroMesa,
        bloqueado: false,
        mensaje: 'Tu sesión ha finalizado. ¡Gracias por visitarnos!',
      },
    });
    const canalMesa = Rooms.mesa(numeroMesa);
    console.log(`📤 [liberarMesa] Publicando en ${canalMesa}:`, mensaje);
    publicar(canalMesa, mensaje);
    console.log(`✅ [liberarMesa] Mensaje publicado en mesa ${numeroMesa}`);

    console.log(`✅ [liberarMesa] FIN - mesa ${numeroMesa} liberada`);
    return resultadoCierre;
  }
}