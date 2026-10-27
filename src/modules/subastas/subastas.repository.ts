import { ObjectId } from 'mongodb';
import { getDb } from '../../shared/database/mongo.connection';
import { ISubasta, CreateSubastaDTO, IPuja } from './types';

export class SubastasRepository {
  private collectionName = 'subastas';

  private get collection() {
    return getDb().collection(this.collectionName);
  }

  async create(data: CreateSubastaDTO): Promise<ISubasta> {
    const doc = {
      producto: data.producto,
      descripcion: data.descripcion ?? '',
      precioBase: data.precioBase,
      precioActual: data.precioBase,
      cierraA: data.cierraA,
      mesaGanadora: null,
      estado: 'ACTIVA',
      pujas: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await this.collection.insertOne(doc);
    return {
      id: result.insertedId.toString(),
      ...doc,
    } as unknown as ISubasta;
  }

  async findActiva() {
    return await this.collection.findOne({ estado: 'ACTIVA' });
  }

  async findById(id: string) {
    return await this.collection.findOne({ _id: new ObjectId(id) });
  }

  async findAll() {
    return await this.collection.find().sort({ createdAt: -1 }).toArray();
  }

  async agregarPuja(id: string, puja: IPuja) {
    return await this.collection.findOneAndUpdate(
      { _id: new ObjectId(id), estado: 'ACTIVA' },
      {
        $set: {
          precioActual: puja.monto,
          mesaGanadora: puja.mesa,
          updatedAt: new Date(),
        },
       $push: { pujas: { ...puja, fecha: new Date() } } as any,
      },
      { returnDocument: 'after' }
    );
  }

  async cerrar(id: string) {
    return await this.collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      {
        $set: {
          estado: 'CERRADA',
          updatedAt: new Date(),
          cerradaEn: new Date(),
        },
      },
      { returnDocument: 'after' }
    );
  }
}