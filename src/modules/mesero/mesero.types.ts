import type { ObjectId } from 'mongodb';

// Tu interfaz existente para registrar llamadas al mesero (¡está perfecta!)
export interface InteraccionMesa {
  _id?: ObjectId;
  usuarioId: string; // O ObjectId según manejes la referencia del cliente
  mesa: number;
  tipo: 'llamar_mesero';
  estado: 'pendiente' | 'atendido';
  createdAt: Date;
  atendidoAt?: Date;
}

// 🆕 INTERFAZ NUEVA: Estado general de una mesa en la discoteca
export interface EstadoMesa {
  mesa: number;
  activa: boolean; // true si tiene clientes con sesión abierta, false si está libre
  totalSesionesActivas: number; // Cuántos celulares están conectados en esa mesa
  ultimaInteraccion?: Date;
}

// 🆕 INTERFAZ NUEVA: DTO/Payload para la acción de cerrar la mesa
export interface CerrarMesaDTO {
  numeroMesa: number;
  meseroId?: string; // Opcional: Para auditoría de qué mesero/admin cerró la mesa
}