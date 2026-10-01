import { MesasRepository } from './mesa.repository';
import { CreateMesaDTO, UpdateLayoutItemDTO, IMesa } from './types';

export class MesasService {
  private repository: MesasRepository;

  constructor() {
    this.repository = new MesasRepository();
  }

  async getPlanoCompleto(): Promise<IMesa[]> {
    return await this.repository.findAll();
  }

  async crearElemento(data: CreateMesaDTO): Promise<IMesa> {
    // Aquí puedes agregar validaciones (ej: que el número de mesa no esté duplicado)
    return await this.repository.create(data);
  }

  async guardarLayout(items: UpdateLayoutItemDTO[]): Promise<{ message: string }> {
    if (!items || items.length === 0) {
      throw new Error('No se enviaron posiciones para actualizar');
    }
    await this.repository.updateLayout(items);
    return { message: 'Plano actualizado correctamente' };
  }

  async eliminarMesa(id: string): Promise<{ message: string }> {
    await this.repository.delete(id);
    return { message: 'Mesa desactivada con éxito' };
  }
}