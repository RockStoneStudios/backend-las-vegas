import {ObjectId} from 'mongodb';
import {getDb} from '../../shared/database/mongo.connection';
import type {InteraccionMesa} from './mesero.types';


export class MeseroRepository {
    private get coleccion(){
      return getDb().collection('alertas_mesero')
    }

    async crearLlamada(usuarioId: string, mesa:number){
        const doc : InteraccionMesa = {
            usuarioId,
            mesa,
            tipo : 'llamar_mesero',
            estado : 'pendiente',
            createdAt : new Date()
        };
        const {insertedId} = await this.coleccion.insertOne(doc);
        return {...doc,_id : insertedId}
    }
    // Marca una llamada como atendida cuando el staff presiona "Atender"
    // en el panel de admin. Guarda también CUÁNDO fue atendida (atendidoAt),
    // útil para medir tiempos de respuesta del servicio.
    async marcarAtendido(idAlerta: string) {
        await this.coleccion.updateOne(
            { _id: new ObjectId(idAlerta) },
            { $set: { estado: 'atendido', atendidoAt: new Date() } }
        );
    }

     // Devuelve todas las llamadas aún sin atender. Se usa cuando el panel
  // de admin se recarga/abre por primera vez, para mostrar el estado
  // inicial sin depender solo de eventos de WebSocket en tiempo real.
    async listarPendientes() {
    return this.coleccion.find({ estado: 'pendiente' }).toArray();
  }

   // NUEVO: Resuelve en bloque TODOS los llamados pendientes de una mesa
  // específica de una sola vez. Se usa cuando el mesero/admin libera la
  // mesa (ej. los clientes ya se fueron) — evita que quede una alerta
  // "fantasma" de "llamar mesero" abierta para una mesa que ya está vacía.
  // updateMany() actualiza todos los documentos que coincidan (por si
  // hubo más de una llamada pendiente de esa misma mesa a la vez).
  async resolverLlamadosPendientesPorMesa(mesa: number) {
    return this.coleccion.updateMany(
      { mesa, estado: 'pendiente' },
      { $set: { estado: 'atendido', atendidoAt: new Date() } }
    );
  }


}