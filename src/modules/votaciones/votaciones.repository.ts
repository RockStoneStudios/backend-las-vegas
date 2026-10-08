import { getDb } from '../../shared/database/mongo.connection';
import type { EstadoVotacionDB, OpcionVotacion } from './votaciones.types';

export class VotacionesRepository {
  private get coleccion() {
    return getDb().collection<EstadoVotacionDB>('votaciones');
  }

  // Crear o activar una nueva votación
  async crearVotacion(pregunta: string, opcionesTexto: string[]): Promise<EstadoVotacionDB> {
    // 1. Desactivar cualquier votación que esté corriendo
    await this.coleccion.updateMany(
      { activa: true },
      { $set: { activa: false, closedAt: new Date() } }
    );

    // 2. Mapear opciones con IDs numéricos y votos en 0
    const opciones: OpcionVotacion[] = opcionesTexto.map((texto, index) => ({
      id: index + 1,
      texto,
      votos: 0,
    }));

    const doc: EstadoVotacionDB = {
      votacionId: `vot_${Date.now()}`,
      pregunta,
      opciones,
      votosUsuarios: [],
      activa: true,
      createdAt: new Date(),
    };

    const res = await this.coleccion.insertOne(doc);
    return { ...doc, _id: res.insertedId };
  }

  // Registrar un voto validado POR DISPOSITIVO (Operación atómica en MongoDB)
  async registrarVoto(
    votacionId: string,
    deviceId: string, // 🔥 Ahora valida por dispositivo
    opcionId: number
  ): Promise<{ exito: boolean; votacionActualizada?: EstadoVotacionDB; mensaje?: string }> {
    const resultado = await this.coleccion.findOneAndUpdate(
      {
        votacionId,
        activa: true,
        'votosUsuarios.deviceId': { $ne: deviceId }, // 🔥 Previene que el mismo dispositivo vote dos veces
        'opciones.id': opcionId,
      },
      {
        $addToSet: {
          votosUsuarios: { deviceId, opcionId, fecha: new Date() } as any, // 🔥 Guarda el ID del dispositivo
        },
        $inc: { 'opciones.$.votos': 1 },
      },
      { returnDocument: 'after' }
    );

    if (!resultado) {
      return {
        exito: false,
        mensaje: 'No se pudo registrar el voto (Votación cerrada, opción inválida o este dispositivo ya votó)',
      };
    }

    return {
      exito: true,
      votacionActualizada: resultado,
    };
  }

  // Obtener la votación activa actual
  async obtenerActiva(): Promise<EstadoVotacionDB | null> {
    return this.coleccion.findOne({ activa: true });
  }

  // Cerrar UNA votación específica
  async cerrarVotacion(votacionId: string): Promise<EstadoVotacionDB | null> {
    return this.coleccion.findOneAndUpdate(
      { votacionId, activa: true },
      { $set: { activa: false, closedAt: new Date() } },
      { returnDocument: 'after' }
    );
  }

  // Cerrar la votación activa (compatibilidad)
  async cerrarVotacionActiva(): Promise<EstadoVotacionDB | null> {
    return this.coleccion.findOneAndUpdate(
      { activa: true },
      { $set: { activa: false, closedAt: new Date() } },
      { returnDocument: 'after' }
    );
  }
}