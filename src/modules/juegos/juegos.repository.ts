import { getDb } from '../../shared/database/mongo.connection';
import type { EstadoJuegoDB, JuegoId, TipoJuego ,IPremioConfig } from './juegos.types';

export interface PremioConfig {
  id: string;
  nombre: string;
  pesoBase: number;
  esPremioMayor: boolean;
}

export class JuegosRepository {
  private get coleccion() {
    return getDb().collection<EstadoJuegoDB>('estado_juegos');
  }

  private get coleccionPremios() {
    return getDb().collection<IPremioConfig>('config_premios');
  }

  // Getter para consultar la colección de sesiones de MongoDB
  private get coleccionSesiones() {
    return getDb().collection<{ sessionId: string; activo: boolean; createdAt: Date }>('sesiones_globales');
  }

  // =====================================================================
  // 1. SESIÓN ACTIVA GLOBAL (Para que el QR y los clientes se conecten)
  // =====================================================================
  async obtenerSesionActiva(): Promise<string | null> {
    const sesion = await this.coleccionSesiones.findOne({ activo: true });
    
    // 🟢 Si no hay sesión en BD, devolvemos NULL (¡sin fallbacks inventados!)
    if (!sesion) {
      return null;
    }

    return sesion.sessionId;
  }

  async actualizarSesionActiva(nuevaSesionId: string): Promise<string> {
    // Desactivamos la sesión previa
    await this.coleccionSesiones.updateMany({ activo: true }, { $set: { activo: false } });

    // Guardamos la nueva sesión activa en MongoDB
    await this.coleccionSesiones.insertOne({
      sessionId: nuevaSesionId,
      activo: true,
      createdAt: new Date(),
    });

    return nuevaSesionId;
  }

  // 🔑 Alias para mantener compatibilidad total con AuthService
  async establecerSesionActiva(nuevaSesionId: string): Promise<string> {
    return this.actualizarSesionActiva(nuevaSesionId);
  }

  // =====================================================================
  // 2. CONFIGURACIÓN DE PREMIOS (Para que el Admin los manipule)
  // =====================================================================
 async obtenerPremiosConfigurados(): Promise<IPremioConfig[]> {
  const premios = await this.coleccionPremios.find({}).toArray();

  if (!premios || premios.length === 0) {
    return [
      { id: 'nada', nombre: 'Sigue intentando', pesoBase: 50, esPremioMayor: false, color: '#2a1a3a', icono: 'Frown' },
      { id: 'shot', nombre: 'Shot de Tequila', pesoBase: 35, esPremioMayor: false, color: '#ffd700', icono: 'GlassWater' },
      { id: 'descuento', nombre: '10% OFF en Botella', pesoBase: 12, esPremioMayor: false, color: '#ff007f', icono: 'Tag' },
      { id: 'botella', nombre: 'Botella Gratis', pesoBase: 3, esPremioMayor: true, color: '#ff6b6b', icono: 'Wine' },
    ];
  }

  return premios;
}

  async guardarPremiosConfigurados(premios: IPremioConfig[]): Promise<void> {
    await this.coleccionPremios.deleteMany({});
    if (premios.length > 0) {
      await this.coleccionPremios.insertMany(premios);
    }
  }

  // =====================================================================
  // 3. CONSULTA DE MESAS ACTIVAS POR QR
  // =====================================================================
  async obtenerMesasActivasRegistradas(): Promise<number[]> {
    const db = getDb();
    const mesas = await db
      .collection<{ mesa: number; activo: boolean }>('sesiones')
      .distinct('mesa', { activo: true });

    return mesas.filter((m): m is number => typeof m === 'number');
  }

  // =====================================================================
  // 4. MÉTODOS DE ESTADO DEL JUEGO
  // =====================================================================
  async registrarActivacion(
    juegoId: JuegoId,
    tipo: TipoJuego,
    mesaPermitida: number | null
  ) {
    await this.coleccion.updateMany({ activo: true }, { $set: { activo: false } });

    const doc: EstadoJuegoDB = {
      juegoId,
      tipo,
      mesaPermitida,
      activo: true,
      createdAt: new Date(),
    };

    const result = await this.coleccion.insertOne(doc);
    return { ...doc, _id: result.insertedId };
  }

  async obtenerJuegoActivo() {
    return this.coleccion.findOne({ activo: true });
  }

  async desactivarActual() {
    await this.coleccion.updateMany({ activo: true }, { $set: { activo: false } });
  }
}