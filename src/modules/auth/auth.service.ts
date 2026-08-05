import { createHash, randomUUID } from 'crypto';
import { ENV } from '../../shared/config/env';
import { AuthRepository } from './auth.repository';
import { JuegosRepository } from '../juegos/juegos.repository';

export class AuthService {
  private repo = new AuthRepository();
  private juegosRepo = new JuegosRepository();

  // Genera el token secreto para la URL del QR de cada mesa
  generarHashMesa(numeroMesa: number): string {
    return createHash('sha256')
      .update(`${numeroMesa}-${ENV.MESA_HASH_SECRET}`)
      .digest('hex')
      .slice(0, 16);
  }

  validarHashMesa(numeroMesa: number, token: string): boolean {
    return this.generarHashMesa(numeroMesa) === token;
  }

  // ✅ INICIAR SESIÓN POR QR - CORREGIDO
  async iniciarSesionPorQR(numeroMesa: number, token: string) {
    const esValido = this.validarHashMesa(numeroMesa, token);
    if (!esValido) {
      throw new Error('Token de mesa inválido');
    }

    // ✅ VERIFICAR SI YA EXISTE UNA SESIÓN PARA ESTA MESA
    const sesionExistente = await this.repo.buscarPorMesa(numeroMesa);
    if (sesionExistente) {
      console.log(`♻️ [AuthService] Reutilizando sesión existente para mesa ${numeroMesa}: ${sesionExistente.sessionId}`);
      return sesionExistente;
    }

    const sessionId = randomUUID();
    const sesion = await this.repo.crearSesion(numeroMesa, 'cliente', sessionId);
    console.log(`✅ [AuthService] Sesión creada para mesa ${numeroMesa}: ${sessionId}`);
    return sesion;
  }

  // ✅ RECUPERAR SESIÓN - CORREGIDO (con fallback para staff en desarrollo)
  async recuperarSesion(sessionId: string) {
    // Primero buscar en la BD
    const sesion = await this.repo.buscarPorSessionId(sessionId);
    if (sesion) {
      return sesion;
    }

    // ✅ FALLBACK PARA DESARROLLO: Si es un sessionId de staff (empieza con "staff_")
    if (sessionId.startsWith('staff_')) {
      console.log(`🔧 [AuthService] Sesión de staff en modo desarrollo: ${sessionId}`);
      return {
        sessionId: sessionId,
        mesa: 0,
        rol: 'mesero',
      };
    }

    // ✅ FALLBACK PARA DESARROLLO: Si es un sessionId de mesa (empieza con "mesa_")
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

  // Cerrar mesa - eliminar todas las sesiones de esa mesa
  async cerrarMesa(numeroMesa: number) {
    const resultado = await this.repo.cerrarSesionesDeMesa(numeroMesa);
    return {
      exito: true,
      sesionesEliminadas: resultado.deletedCount,
    };
  }

  // ✅ INICIAR SESIÓN ADMIN - CORREGIDO
  async iniciarSesionAdmin(rol: 'admin' | 'dj' | 'mesero' = 'admin') {
    // ✅ VERIFICAR SI YA EXISTE UNA SESIÓN PARA ESTE ROL
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

  // ✅ INICIAR SESIÓN STAFF CON TOKEN - CORREGIDO
  async iniciarSesionStaffConToken(token: string, rol: 'admin' | 'dj' | 'mesero' = 'mesero') {
    const TOKEN_STAFF_VALIDO = ENV.STAFF_SECRET || 'lasvegas_mesero_2026';

    if (token !== TOKEN_STAFF_VALIDO) {
      throw new Error('Token de Staff inválido');
    }

    return await this.iniciarSesionAdmin(rol);
  }

  // ✅ NUEVO: Generar token para staff en desarrollo
  generarTokenStaff() {
    return ENV.STAFF_SECRET || 'lasvegas_mesero_2026';
  }
}