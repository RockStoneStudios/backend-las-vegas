// shared/websocket/socket.publisher.ts

let serverRef: any = null;

export function registrarServidorWS(server: any) {
  console.log('🧪 [DEBUG] Objeto recibido, keys:', Object.keys(server));
  serverRef = server;
}

export function publicarEvento(canal: string, mensaje: string) {
  console.log(`📤 [PUBLISHER] Publicando en ${canal}: ${mensaje}`);
  
  if (!serverRef) {
    console.warn('⚠️ [PUBLISHER] Server no registrado');
    return;
  }

  // ✅ TODO EL TRUCO ESTÁ AQUÍ
  if (typeof serverRef.publish === 'function') {
    serverRef.publish(canal, mensaje);
  } else {
    console.error('❌ El servidor NO tiene la función publish.');
  }
}