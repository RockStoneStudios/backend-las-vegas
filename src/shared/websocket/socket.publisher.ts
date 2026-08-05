import type { Server } from 'bun';
import type { WsSessionData } from './socket.server'; // Revisa que la ruta apunte correctamente a donde está tu archivo con Rooms y WsSessionData

// Le pasamos <WsSessionData> a Server
let serverRef: Server<WsSessionData> | null = null;

export function registrarServidorWS(server: Server<WsSessionData>) {
  serverRef = server;
}

export function publicarEvento(canal: string, mensaje: string) {
  if (!serverRef) {
    console.warn('⚠️ Intento de publicar antes de registrar el servidor WS');
    return;
  }
  serverRef.publish(canal, mensaje);
}