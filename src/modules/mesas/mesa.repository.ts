import { ObjectId } from 'mongodb';
import { getDb } from '../../shared/database/mongo.connection';
import { IMesa, CreateMesaDTO, UpdateLayoutItemDTO } from './types';

export class MesasRepository {
  private collectionName = 'mesas';

  private get collection() {
    return getDb().collection(this.collectionName);
  }

  // Obtener todas las mesas activas para construir el plano
  async findAll(): Promise<IMesa[]> {
    const docs = await this.collection.find({ activa: { $ne: false } }).toArray();
    
    return docs.map((doc) => ({
      id: doc._id.toString(),
      numero: doc.numero,
      tipo: doc.tipo,
      capacidad: doc.capacidad,
      posX: doc.posX,
      posY: doc.posY,
      width: doc.width,
      height: doc.height,
      activa: doc.activa ?? true,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    })) as unknown as IMesa[];
  }

  // Buscar por ID
  async findById(id: string): Promise<IMesa | null> {
    if (!ObjectId.isValid(id)) return null;

    const doc = await this.collection.findOne({ _id: new ObjectId(id) });
    if (!doc) return null;

    return {
      id: doc._id.toString(),
      numero: doc.numero,
      tipo: doc.tipo,
      capacidad: doc.capacidad,
      posX: doc.posX,
      posY: doc.posY,
      width: doc.width,
      height: doc.height,
      activa: doc.activa ?? true,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    } as unknown as IMesa;
  }

  // Crear una nueva mesa o elemento en el plano
  async create(data: CreateMesaDTO): Promise<IMesa> {
    const now = new Date();
    const doc = {
      numero: data.numero,
      tipo: data.tipo ?? 'MESA',
      capacidad: data.capacidad ?? 4,
      posX: data.posX ?? 0,
      posY: data.posY ?? 0,
      width: data.width ?? 64,
      height: data.height ?? 64,
      activa: data.activa ?? true,
      createdAt: now,
      updatedAt: now,
    };

    const result = await this.collection.insertOne(doc);

    return {
      id: result.insertedId.toString(),
      ...doc,
    } as unknown as IMesa;
  }

  // Actualizar posiciones de múltiples mesas en una sola escritura (Bulk Write Nativo)
  async updateLayout(items: UpdateLayoutItemDTO[]): Promise<boolean> {
    if (!items || items.length === 0) return true;

    const bulkOps = items
      .filter((item) => ObjectId.isValid(item.id))
      .map((item) => ({
        updateOne: {
          filter: { _id: new ObjectId(item.id) },
          update: {
            $set: {
              posX: item.posX,
              posY: item.posY,
              width: item.width,
              height: item.height,
              updatedAt: new Date(),
            },
          },
        },
      }));

    if (bulkOps.length > 0) {
      await this.collection.bulkWrite(bulkOps);
    }

    return true;
  }

  // Eliminar / Desactivar mesa (Soft Delete)
  async delete(id: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;

    await this.collection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          activa: false,
          updatedAt: new Date(),
        },
      }
    );

    return true;
  }
}