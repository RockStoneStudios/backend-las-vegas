import { createHash, randomUUID } from 'crypto';
import { ENV } from '../../shared/config/env';
import { AuthRepository } from './auth.repository';
import { JuegosRepository } from '../juegos/juegos.repository';
import { Rooms } from '../../shared/websocket/socket.server';
import { publicarEvento } from '../../shared/websocket/socket.publisher';

// Tipo Publicador (compatibilidad hacia atrás)
type Publicador = (canal: string, mensaje: string) => void;

export class AuthService {
  private repo = new AuthRepository();
  private juegosRepo = new JuegosRepository();

  // 🆕 Cache de sesiones en memoria (TTL 60s)
  private cacheSesiones = new Map<string, { sesion: any; expires: number }>();
  private TTL_SESION_MS = 60_000;

  constructor() {
    // Limpieza automática del cache cada 5 minutos
    setInterval(() => {
      const ahora = Date.now();
      for (const [k, v] of this.cacheSesiones) {
        if (v.expires < ahora) this.cacheSesiones.delete(k);
      }
    }, 5 * 60_000);
  }

  generarHashMesa(numeroMesa: number): string {
    return createHash('sha256')
      .update(`${numeroMesa}-${ENV.MESA_HASH_SECRET}`)
      .digest('hex')
      .slice(0, 16);
  }

  validarHashMesa(numeroMesa: number, token: string): boolean {
    return this.generarHashMesa(numeroMesa) === token;
  }

  async iniciarSesionPorQR(
    numeroMesa: number,
    token: string,
    deviceId: string
  ) {
    if (!Number.isInteger(numeroMesa) || numeroMesa <= 0) {
      throw new Error('Número de mesa inválido');
    }
    if (!deviceId || deviceId.length < 16 || deviceId.length > 128) {
      throw new Error('Identificador de dispositivo inválido');
    }
    const esValido = this.validarHashMesa(numeroMesa, token);
    if (!esValido) {
      throw new Error('Token de mesa inválido');
    }
    const sesion = await this.repo.crearORecuperarSesionDispositivo(
      numeroMesa,
      deviceId,
      randomUUID()
    );
    if (!sesion) {
      throw new Error('No fue posible crear o recuperar la sesión');
    }
    return sesion;
  }

  async registrarConexion(sessionId: string) {
    await this.repo.actualizarUltimaConexion(sessionId);
  }

  // 🔥 RECUPERAR SESIÓN CON CACHE
  async recuperarSesion(sessionId: string) {
    const ahora = Date.now();

    // 1. Intentar desde el cache primero
    const cacheado = this.cacheSesiones.get(sessionId);
    if (cacheado && cacheado.expires > ahora) {
      return cacheado.sesion;
    }

    // 2. Si no está en cache, buscar en BD
    const sesion = await this.repo.buscarPorSessionId(sessionId);
    if (sesion) {
      this.cacheSesiones.set(sessionId, {
        sesion,
        expires: ahora + this.TTL_SESION_MS,
      });
      return sesion;
    }

    // 3. Fallbacks para desarrollo (idénticos a antes)
    if (sessionId.startsWith('staff_')) {
      const sesionDev = { sessionId, mesa: 0, rol: 'mesero' as const };
      this.cacheSesiones.set(sessionId, {
        sesion: sesionDev,
        expires: ahora + this.TTL_SESION_MS,
      });
      return sesionDev;
    }

    if (sessionId.startsWith('mesa_')) {
      const mesaMatch = sessionId.match(/mesa_(\d+)/);
      const mesa = mesaMatch ? parseInt(mesaMatch[1]) : 1;
      const sesionDev = { sessionId, mesa, rol: 'cliente' as const };
      this.cacheSesiones.set(sessionId, {
        sesion: sesionDev,
        expires: ahora + this.TTL_SESION_MS,
      });
      return sesionDev;
    }

    return null;
  }

  // 🆕 Método auxiliar para invalidar cache manualmente
  invalidarCacheSesion(sessionId: string) {
    this.cacheSesiones.delete(sessionId);
  }

  // 🔥 Cerrar mesa - AHORA USA Rooms.mesa() (O(1) en vez de O(n))
  // El parámetro "publicar" se mantiene por compatibilidad pero NO se usa
  async cerrarMesa(numeroMesa: number, _publicar?: Publicador) {
    // 1. Eliminar TODAS las sesiones de la mesa
    const resultado = await this.repo.cerrarSesionesDeMesa(numeroMesa);

    // 2. Invalidar cache de sesiones de esa mesa (opcional, por limpieza)
    // No podemos saber todos los sessionId de una mesa fácilmente,
    // pero el TTL de 60s los limpia solo.

    // 3. Enviar evento WebSocket a TODOS los clientes de la mesa
    // ✅ CAMBIO CLAVE: Antes recorría TODAS las conexiones (O(n)),
    // ahora publica directamente a la sala de la mesa (O(1))
    const mensajeMesa = JSON.stringify({
      tipo: 'EVENT:MESA_CERRADA',
      payload: {
        mesa: numeroMesa,
        bloqueado: false,
        mensaje: 'Tu sesión ha finalizado. ¡Gracias por visitarnos!',
      },
    });
    publicarEvento(Rooms.mesa(numeroMesa), mensajeMesa);

    // 4. Notificar al staff
    const mensajeStaff = JSON.stringify({
      tipo: 'EVENT:MESA_CERRADA_STAFF',
      payload: {
        mesa: numeroMesa,
        sesionesEliminadas: resultado.deletedCount,
      },
    });
    publicarEvento(Rooms.staff(), mensajeStaff);

    return {
      exito: true,
      sesionesEliminadas: resultado.deletedCount,
      mesa: numeroMesa,
    };
  }

  async iniciarSesionAdmin(rol: 'admin' | 'dj' | 'mesero' = 'admin') {
    const sesionExistente = await this.repo.buscarPorRol(rol);
    if (sesionExistente) {
      await this.juegosRepo.establecerSesionActiva(sesionExistente.sessionId);
      return sesionExistente;
    }

    const sessionId = randomUUID();
    const sesion = await this.repo.crearSesion(0, rol, sessionId);
    await this.juegosRepo.establecerSesionActiva(sessionId);
    return sesion;
  }

  async iniciarSesionStaffConToken(token: string, rol: 'admin' | 'dj' | 'mesero' = 'mesero') {
    const TOKEN_STAFF_VALIDO = ENV.STAFF_SECRET || 'lasvegas_mesero_2026';
    if (token !== TOKEN_STAFF_VALIDO) {
      throw new Error('Token de Staff inválido');
    }
    return await this.iniciarSesionAdmin(rol);
  }

  generarTokenStaff() {
    return ENV.STAFF_SECRET || 'lasvegas_mesero_2026';
  }
}