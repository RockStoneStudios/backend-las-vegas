

export const Rooms = {
    // Canal masivo : todos los clientes conectados a la discoteca
    general : ()=> 'room:general',
    staff: () => 'room:staff',

  // Canal privado por mesa: solo los dispositivos de esa mesa específica
  mesa: (numeroMesa: number) => `room:mesa-${numeroMesa}`,

  // Canal exclusivo de staff: DJ y admins (alertas de mesero, cumpleaños, termómetro)
  admin: () => 'room:admin',

  
}
export type Rol = 'cliente' | 'dj' | 'admin' | 'mesero';
// para saber quién envió el mensaje, de qué mesa es, y si tiene permisos.
export interface WsSessionData {
  sessionId: string;
  mesa: number;
  rol: Rol;
}
