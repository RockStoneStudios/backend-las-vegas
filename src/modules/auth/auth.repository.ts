import { getDb } from '../../shared/database/mongo.connection';
import type { UsuarioSesion } from './auth.types';

export class AuthRepository {
    private get coleccion() {
        return getDb().collection('usuarios_sesiones');
    }

    // Inserta una nueva sesión anónima en la DB cuando alguien escanea el QR
    async crearSesion(mesa: number, rol: UsuarioSesion['rol'], sessionId: string) {
        const doc: UsuarioSesion = { sessionId, mesa, rol, createdAt: new Date() };
        await this.coleccion.insertOne(doc);
        return doc;
    }

    async buscarPorSessionId(sessionId: string) {
        return this.coleccion.findOne({ sessionId });
    }

    // ✅ BUSCAR POR MESA (NUEVO)
    async buscarPorMesa(numeroMesa: number) {
        return this.coleccion.findOne({ mesa: numeroMesa });
    }

    // ✅ BUSCAR POR ROL (NUEVO)
    async buscarPorRol(rol: string) {
        return this.coleccion.findOne({ rol });
    }

    // Cerrar sesiones de mesa
    async cerrarSesionesDeMesa(numeroMesa: number) {
        return await this.coleccion.deleteMany({ mesa: numeroMesa });
    }

    async buscarTodasPorMesa(numeroMesa: number) {
    return this.coleccion.find({ mesa: numeroMesa }).toArray();
}
}