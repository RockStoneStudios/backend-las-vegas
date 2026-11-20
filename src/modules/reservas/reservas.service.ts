import { ReservasRepository } from './repository';
import { MesasRepository } from '../mesas/mesa.repository';
import { CreateReservaDTO } from './types';
// Importamos la función de correos (Ajusta la ruta si tu carpeta services está en otro nivel)
import { enviarCorreoReserva } from '../../services/emailService'; 

export class ReservasService {
  private repository: ReservasRepository;
  private mesasRepository: MesasRepository;

  constructor() {
    this.repository = new ReservasRepository();
    this.mesasRepository = new MesasRepository();
  }

  // 🎯 Cruza el plano de mesas con las reservas de la fecha para marcar cuáles están ocupadas/reservadas
  async getDisponibilidadPlano(fecha: string) {
    const mesas = await this.mesasRepository.findAll();
    const reservasFecha = await this.repository.findByFecha(fecha);

    // Mapeamos los IDs de mesas que tienen reserva activa en esa fecha
    const reservadasSet = new Set(
      reservasFecha
        .filter((r) => r.estado !== 'CANCELADA')
        .map((r) => {
          const mId = r.mesaId;
          return typeof mId === 'object' && mId !== null ? mId.toString() : String(mId);
        })
    );

    return mesas.map((mesa) => ({
      ...mesa,
      isReserved: reservadasSet.has(mesa.id),
    }));
  }

  async crearReserva(data: CreateReservaDTO) {
    // 1. Validar que la mesa exista
    const mesa = await this.mesasRepository.findById(data.mesaId);
    if (!mesa) {
      throw new Error('La mesa seleccionada no existe');
    }

    // 2. Validar que la mesa no esté reservada para esa fecha
    const existe = await this.repository.findReservaActivaByMesaYFecha(
      data.mesaId,
      data.fecha
    );

    if (existe) {
      throw new Error('La mesa ya cuenta con una reserva activa para esa fecha');
    }

    // 3. Guardar la reserva en la base de datos
    const nuevaReserva = await this.repository.create(data);

    // 4. 🚀 Enviar los correos (Cliente y Discoteca)
    try {
      await enviarCorreoReserva({
        clienteNombre: data.clienteNombre,
        clienteEmail: data.clienteEmail,
        clienteTelefono: data.clienteTelefono,
        // Como en la BD solo guardamos el ID de la mesa, aquí usamos el nombre o número 
        // que viene del objeto 'mesa' que consultamos en el paso 1
        mesa:  `Mesa ${mesa.numero}` || String(mesa.numero || 'Mesa asignada'), 
        fecha: data.fecha,
        hora: data.hora,
        personas: data.personas,
      });
    } catch (errorCorreo) {
      // Si el correo falla, solo lo mostramos en consola. La reserva ya fue exitosa.
      console.error('⚠️ La reserva se guardó en BD, pero falló el envío del correo:', errorCorreo);
    }

    // Retornamos la reserva creada para que el Controller se la envíe al Frontend
    return nuevaReserva;
  }

  async cambiarEstado(id: string, estado: string) {
    const actualizada = await this.repository.updateEstado(id, estado);
    if (!actualizada) {
      throw new Error('Reserva no encontrada');
    }
    return actualizada;
  }

  async obtenerReservasPorFecha(fecha: string) {
    return await this.repository.findByFecha(fecha);
  }
}