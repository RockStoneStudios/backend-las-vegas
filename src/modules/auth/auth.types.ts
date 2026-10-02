
export type Rol = 'cliente' | 'admin' | 'dj' | 'mesero';


export interface UsuarioSesion{
    sessionId : string;
    mesa : number;
    deviceId?: string;
    rol : Rol;
    createdAt : Date;
    lastSeenAt?:Date
}