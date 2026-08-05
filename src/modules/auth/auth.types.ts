

export interface UsuarioSesion{
    sessionId : string;
    mesa : number;
    rol : 'cliente' | 'dj'| 'admin' | 'mesero';
    createdAt : Date;
}