import { createHash, randomUUID } from 'crypto';
import { ENV } from '../../shared/config/env';
import { AuthRepository } from './auth.repository';
import { JuegosRepository } from '../juegos/juegos.repository';
import { conexionesGlobales } from '../../index'; // ✅ IMPORTAMOS LAS CONEXIONES

// 🔥 Definir el tipo Publicador (ajusta la ruta si ya existe en otro lado)
type Publicador = (canal: string, mensaje: string) => void;

export class AuthService {
  private repo = new AuthRepository();
  private juegosRepo = new JuegosRepository();

  // Genera el token secreto para la URL del QR de cada mesa
  generarHashMesa(numeroMesa: number): string {
    console.log('🔑 [DEBUG] Leyendo ENV.MESA_HASH_SECRET:', ENV.MESA_HASH_SECRET ? '✅ Cargada' : '❌ VACÍA');
    return createHash('sha256')
      .update(`${numeroMesa}-${ENV.MESA_HASH_SECRET}`)
      .digest('hex')
      .slice(0, 16);
  }

  validarHashMesa(numeroMesa: number, token: string): boolean {
    return this.generarHashMesa(numeroMesa) === token;
  }

  // ✅ INICIAR SESIÓN POR QR
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

  // ✅ RECUPERAR SESIÓN (con fallback para staff en desarrollo)
  async recuperarSesion(sessionId: string) {
    // Primero buscar en la BD
    const sesion = await this.repo.buscarPorSessionId(sessionId);
    if (sesion) {
      return sesion;
    }

    // FALLBACK PARA DESARROLLO: Si es un sessionId de staff
    if (sessionId.startsWith('staff_')) {
      console.log(`🔧 [AuthService] Sesión de staff en modo desarrollo: ${sessionId}`);
      return {
        sessionId: sessionId,
        mesa: 0,
        rol: 'mesero',
      };
    }

    // FALLBACK PARA DESARROLLO: Si es un sessionId de mesa
    if (sessionId.startsWith('mesa_')) {
      const mesaMatch = sessionId.match(/mesa_(\d+)/);
      const mesa = mesaMatch ? parseInt(mesaMatch[1]) : 1;
      console.log(`🔧 [AuthService] Sesión de mesa en modo desarrollo: ${sessionId}`);
      return {
        sessionId: sessionId,
        mesa: mesa,
        rol: 'cliente',
      };
    }

    return null;
  }

  // 🔥 Cerrar mesa - ELIMINAR TODAS las sesiones y NOTIFICAR por WebSocket
  async cerrarMesa(numeroMesa: number, publicar?: Publicador) {
    console.log(`🧹 [AuthService] Cerrando mesa ${numeroMesa}...`);
    
    // 1. Eliminar TODAS las sesiones de la mesa
    const resultado = await this.repo.cerrarSesionesDeMesa(numeroMesa);
    console.log(`✅ [AuthService] ${resultado.deletedCount} sesiones eliminadas de mesa ${numeroMesa}`);

    // 2. Enviar evento WebSocket a los clientes de la mesa
    const mensajeMesa = JSON.stringify({
      tipo: 'EVENT:MESA_CERRADA',
      payload: {
        mesa: numeroMesa,
        mensaje: 'Tu sesión ha finalizado. ¡Gracias por visitarnos!',
      },
    });
    
    // 🔥🔥🔥 ENVÍO REAL Y DIRECTO: Recorremos las conexiones y usamos ws.send
    for (const ws of conexionesGlobales) {
      if (ws.data?.sesion?.mesa === numeroMesa) {
        // ✅ CAMBIO CORRECTO: En lugar de publicar en un canal que no existe, enviamos directo
        ws.send(mensajeMesa);
        console.log(`✅ [AuthService] MESA_CERRADA enviado directamente a la mesa ${numeroMesa}`);
      }
    }

    // 3. Enviar evento al staff (si hay publicador activo conectado)
    if (publicar) {
      const mensajeStaff = JSON.stringify({
        tipo: 'EVENT:MESA_CERRADA_STAFF',
        payload: { 
          mesa: numeroMesa,
          sesionesEliminadas: resultado.deletedCount 
        },
      });
      // ✅ CORRECCIÓN DE CANAL: Usamos 'room:staff' porque así se suscribió el staff
      publicar('room:staff', mensajeStaff);
      console.log(`📤 [AuthService] Evento MESA_CERRADA_STAFF enviado a staff`);
    }

    return {
      exito: true,
      sesionesEliminadas: resultado.deletedCount,
      mesa: numeroMesa,
    };
  }

  // ✅ INICIAR SESIÓN ADMIN
  async iniciarSesionAdmin(rol: 'admin' | 'dj' | 'mesero' = 'admin') {
    const sesionExistente = await this.repo.buscarPorRol(rol);
    if (sesionExistente) {
      console.log(`♻️ [AuthService] Reutilizando sesión existente para ${rol}: ${sesionExistente.sessionId}`);
      await this.juegosRepo.establecerSesionActiva(sesionExistente.sessionId);
      return sesionExistente;
    }

    const sessionId = randomUUID();
    const sesion = await this.repo.crearSesion(0, rol, sessionId);
    await this.juegosRepo.establecerSesionActiva(sessionId);
    console.log(`✅ [AuthService] Sesión creada para ${rol}: ${sessionId}`);
    return sesion;
  }

  // ✅ INICIAR SESIÓN STAFF CON TOKEN
  async iniciarSesionStaffConToken(token: string, rol: 'admin' | 'dj' | 'mesero' = 'mesero') {
    const TOKEN_STAFF_VALIDO = ENV.STAFF_SECRET || 'lasvegas_mesero_2026';

    if (token !== TOKEN_STAFF_VALIDO) {
      throw new Error('Token de Staff inválido');
    }

    return await this.iniciarSesionAdmin(rol);
  }

  // ✅ Generar token para staff en desarrollo
  generarTokenStaff() {
    return ENV.STAFF_SECRET || 'lasvegas_mesero_2026';
  }
}