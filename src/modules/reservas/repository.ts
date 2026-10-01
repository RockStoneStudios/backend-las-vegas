import { ObjectId } from 'mongodb';
import { getDb } from '../../shared/database/mongo.connection';
import { IReserva, CreateReservaDTO } from './types';

export class ReservasRepository {
  private collectionName = 'reservas';

  private get collection() {
    return getDb().collection(this.collectionName);
  }

  // Buscar si la mesa ya está reservada para una fecha específica (excluyendo canceladas)
  async findReservaActivaByMesaYFecha(mesaId: string, fecha: string) {
    return await this.collection.findOne({
      mesaId: new ObjectId(mesaId),
      fecha,
      estado: { $ne: 'CANCELADA' },
    });
  }

  // Obtener todas las reservas de una fecha dada con Join (Lookup) a la colección de mesas
  async findByFecha(fecha: string) {
    return await this.collection
      .aggregate([
        { $match: { fecha } },
        {
          $lookup: {
            from: 'mesas',
            localField: 'mesaId',
            foreignField: '_id',
            as: 'mesa',
          },
        },
        { $unwind: { path: '$mesa', preserveNullAndEmptyArrays: true } },
      ])
      .toArray();
  }

  // Crear reserva
  async create(data: CreateReservaDTO): Promise<IReserva> {
    const doc = {
      mesaId: new ObjectId(data.mesaId),
      clienteNombre: data.clienteNombre,
      clienteTelefono: data.clienteTelefono,
      fecha: data.fecha,
      montoAnticipo: data.montoAnticipo ?? 0,
      observaciones: data.observaciones ?? '',
      estado: 'CONFIRMADA',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await this.collection.insertOne(doc);
    return {
      id: result.insertedId.toString(),
      ...doc,
      mesaId: data.mesaId,
    } as unknown as IReserva;
  }

  // Cambiar estado (CONFIRMADA, CANCELADA, COMPLETADA)
  async updateEstado(id: string, estado: string) {
    const result = await this.collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      {
        $set: {
          estado,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    return result;
  }
}