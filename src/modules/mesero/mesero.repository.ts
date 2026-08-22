import { ObjectId } from 'mongodb';
import { getDb } from '../../shared/database/mongo.connection';
import type { InteraccionMesa } from './mesero.types';

export class MeseroRepository {
    private get coleccion() {
        return getDb().collection('alertas_mesero');
    }

    // 1. Crear una nueva llamada
    async crearLlamada(sessionId: string, mesa: number) {
        const doc: InteraccionMesa = {
            usuarioId: sessionId,
            mesa,
            tipo: 'llamar_mesero',
            estado: 'pendiente',
            createdAt: new Date()
        };
        const { insertedId } = await this.coleccion.insertOne(doc);
        return { ...doc, _id: insertedId };
    }

    // 2. Marcar una llamada como atendida
    async marcarAtendido(idAlerta: string) {
        await this.coleccion.updateOne(
            { _id: new ObjectId(idAlerta) },
            { $set: { estado: 'atendido', atendidoAt: new Date() } }
        );
    }

    // 3. Listar todas las llamadas pendientes
    async listarPendientes() {
        return this.coleccion.find({ estado: 'pendiente' }).toArray();
    }

    // 4. Resolver (cerrar) todos los llamados pendientes de una mesa
    async resolverLlamadosPendientesPorMesa(mesa: number) {
        return this.coleccion.updateMany(
            { mesa, estado: 'pendiente' },
            { $set: { estado: 'atendido', atendidoAt: new Date() } }
        );
    }

    // 5. ✅ CAMBIO: En lugar de ELIMINAR, ahora marca como ATENDIDO
    // Este método ya existe como 'marcarAtendido', así que solo redirigimos
    async eliminarLlamada(idAlerta: string) {
        // ❌ NO elimines, mejor marca como atendido
        await this.marcarAtendido(idAlerta);
        // O si quieres mantener el nombre 'eliminar' pero con nueva lógica:
        // await this.coleccion.updateOne(
        //     { _id: new ObjectId(idAlerta) },
        //     { $set: { estado: 'atendido', atendidoAt: new Date() } }
        // );
    }

    // 🆕 6. Contar pendientes (para el badge 🔔)
    async contarPendientes() {
        return this.coleccion.countDocuments({ estado: 'pendiente' });
    }
}