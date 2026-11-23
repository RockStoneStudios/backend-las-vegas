import { getDb } from '../../shared/database/mongo.connection';
import type { UsuarioSesion } from './auth.types';

// Tipo para la lápida - lo que queda guardado cuando cierran una mesa
type MesaCerrada = {
  mesa: number;
  cerradaEn: Date;
  motivo: 'CERRADA_POR_ADMIN';
  sessionId?: string;
};

export class AuthRepository {
  private get coleccion() {
    return getDb().collection<UsuarioSesion>('usuarios_sesiones');
  }

  // 🔥 NUEVO - Colección donde guardamos las lápidas
  // Es aparte para no mezclar con las sesiones activas
  private get coleccionMesasCerradas() {
    return getDb().collection<MesaCerrada>('mesas_cerradas');
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

  // ======================================================
  // 🔥 NUEVO - LÁPIDA PARA LA VIDA REAL (WhatsApp / Facebook)
  // ======================================================

  // Se llama en cerrarMesa ANTES de borrar las sesiones.
  // Si no guardamos esto, cuando el cliente vuelva de WhatsApp
  // y pregunte "¿sigo vivo?", no vamos a saber si lo cerraron.
  async marcarMesaComoCerrada(numeroMesa: number) {
    return this.coleccionMesasCerradas.updateOne(
      { mesa: numeroMesa },
      {
        $set: {
          mesa: numeroMesa,
          cerradaEn: new Date(),
          motivo: 'CERRADA_POR_ADMIN' as const,
        },
      },
      { upsert: true } // Si ya existía una lápida vieja, la actualiza con la fecha nueva
    );
  }

  // Lo llama el endpoint GET /auth/sesion/estado cuando el cliente
  // vuelve a la app después de estar en WhatsApp/Facebook.
  // Solo buscamos las cerradas en los últimos 30 min,
  // para que no le salga un modal de hace 3 días.
  async buscarMesaCerradaReciente(numeroMesa: number) {
    const hace30Min = new Date(Date.now() - 30 * 60 * 1000);
    return this.coleccionMesasCerradas.findOne({
      mesa: numeroMesa,
      cerradaEn: { $gte: hace30Min },
    });
  }
}