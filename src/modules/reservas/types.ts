import { t, Static } from 'elysia';

// Esquema para crear una reserva
export const CreateReservaSchema = t.Object({
  mesaId: t.String({ description: 'ID de la mesa en MongoDB' }),
  clienteNombre: t.String({ description: 'Nombre completo del cliente' }),
  clienteTelefono: t.String({ description: 'Teléfono de contacto' }),
  clienteEmail: t.String({ format: 'email', description: 'Correo electrónico del cliente' }), // <-- NUEVO
  fecha: t.String({ description: 'Fecha en formato YYYY-MM-DD' }),
  hora: t.String({ description: 'Hora de la reserva (ej. 20:00)' }), // <-- NUEVO
  personas: t.Number({ minimum: 1, description: 'Cantidad de personas' }), // <-- NUEVO
  montoAnticipo: t.Optional(t.Number({ default: 0 })),
  observaciones: t.Optional(t.String()),
});

// Esquema para cambiar estado de la reserva
export const UpdateEstadoReservaSchema = t.Object({
  estado: t.Union([
    t.Literal('PENDIENTE'),
    t.Literal('CONFIRMADA'),
    t.Literal('CANCELADA'),
    t.Literal('COMPLETADA'),
  ]),
});

export type CreateReservaDTO = Static<typeof CreateReservaSchema>;
export type UpdateEstadoReservaDTO = Static<typeof UpdateEstadoReservaSchema>;

export interface IReserva {
  id?: string;
  mesaId: string;
  clienteNombre: string;
  clienteTelefono: string;
  clienteEmail: string; // <-- NUEVO
  fecha: string;
  hora: string;         // <-- NUEVO
  personas: number;     // <-- NUEVO
  estado: 'PENDIENTE' | 'CONFIRMADA' | 'CANCELADA' | 'COMPLETADA';
  montoAnticipo?: number;
  observaciones?: string;
  createdAt?: Date;
  updatedAt?: Date;
}