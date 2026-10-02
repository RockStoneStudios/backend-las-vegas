import { getDb } from '../../shared/database/mongo.connection';
import type { UsuarioSesion } from './auth.types';

export class AuthRepository {
  private get coleccion() {
    return getDb().collection<UsuarioSesion>('usuarios_sesiones');
  }

  async buscarPorSessionId(sessionId: string) {
    return this.coleccion.findOne({ sessionId });
  }

  async buscarPorRol(rol: string) {
    return this.coleccion.findOne({ rol: rol as UsuarioSesion['rol'] });
  }

  async crearORecuperarSesionDispositivo(
    mesa: number,
    deviceId: string,
    sessionIdNuevo: string
  ) {
    return this.coleccion.findOneAndUpdate(
      {
        mesa,
        deviceId,
        rol: 'cliente',
      },
      {
        $setOnInsert: {
          sessionId: sessionIdNuevo,
          mesa,
          deviceId,
          rol: 'cliente',
          createdAt: new Date(),
        },
        $set: {
          lastSeenAt: new Date(),
        },
      },
      {
        upsert: true,
        returnDocument: 'after',
      }
    );
  }

  async actualizarUltimaConexion(sessionId: string) {
    await this.coleccion.updateOne(
      { sessionId },
      { $set: { lastSeenAt: new Date() } }
    );
  }

  async crearSesion(
    mesa: number,
    rol: UsuarioSesion['rol'],
    sessionId: string
  ) {
    const doc: UsuarioSesion = {
      sessionId,
      mesa,
      rol,
      createdAt: new Date(),
      lastSeenAt: new Date(),
    };

    await this.coleccion.insertOne(doc);
    return doc;
  }

  async cerrarSesionesDeMesa(numeroMesa: number) {
    return this.coleccion.deleteMany({
      mesa: numeroMesa,
      rol: 'cliente',
    });
  }

  async buscarTodasPorMesa(numeroMesa: number) {
    return this.coleccion.find({ mesa: numeroMesa }).toArray();
  }
}