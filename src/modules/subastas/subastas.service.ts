import { SubastasRepository } from './subastas.repository';
import { CreateSubastaDTO, PujarDTO } from './types';

export class SubastasService {
  private repo = new SubastasRepository();

  // ADMIN: crea la subasta - Ej: Botella Whisky, 150000, "23:00"
  async crear(data: CreateSubastaDTO) {
    return await this.repo.create(data);
  }

  // MESAS: ven la subasta activa para pujar
  async obtenerActiva() {
    const activa = await this.repo.findActiva();
    if (!activa) throw new Error('No hay subasta activa');
    return activa;
  }

  async obtenerTodas() {
    return await this.repo.findAll();
  }

  async borrarHistorial() {
    const result = await this.repo.eliminarCerradas();
    return { eliminadas: result.deletedCount || 0 };
  }
  // MESAS: pujar - tiene que ser MAYOR al precio actual
  async pujar(id: string, data: PujarDTO) {
    const subasta = await this.repo.findById(id);
    
    if (!subasta) throw new Error('Subasta no encontrada');
    if (subasta.estado !== 'ACTIVA') throw new Error('La subasta ya está cerrada');

    // 👇 LA VALIDACIÓN CLAVE
    if (data.monto <= subasta.precioActual) {
      throw new Error(`La puja debe ser mayor a $${subasta.precioActual}`);
    }

    return await this.repo.agregarPuja(id, data);
  }

  // ADMIN: cierra manual y devuelve ganador
  async cerrar(id: string) {
    const subasta = await this.repo.findById(id);
    if (!subasta) throw new Error('Subasta no encontrada');
    if (subasta.estado === 'CERRADA') throw new Error('Ya está cerrada');

    const cerrada = await this.repo.cerrar(id);

    return {
      ...cerrada,
      mensaje: cerrada?.mesaGanadora 
        ? `Ganó mesa ${cerrada.mesaGanadora} con $${cerrada.precioActual}` 
        : 'Sin pujas',
    };
  }
}