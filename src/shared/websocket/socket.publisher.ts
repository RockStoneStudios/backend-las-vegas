// shared/websocket/socket.publisher.ts

// let serverRef: any = null;

// export function registrarServidorWS(server: any) {
//   console.log('🧪 [DEBUG] Objeto recibido, keys:', Object.keys(server));
//   serverRef = server;
// }

// export function publicarEvento(canal: string, mensaje: string) {
//   console.log(`📤 [PUBLISHER] Publicando en ${canal}: ${mensaje}`);
  
//   if (!serverRef) {
//     console.warn('⚠️ [PUBLISHER] Server no registrado');
//     return;
//   }

//   // ✅ TODO EL TRUCO ESTÁ AQUÍ
//   if (typeof serverRef.publish === 'function') {
//     serverRef.publish(canal, mensaje);
//   } else {
//     console.error('❌ El servidor NO tiene la función publish.');
//   }
// }



let appRef: any = null;

export function registrarServidorWS(app: any) {
  console.log('🔧 [PUBLISHER] Registrando App de Elysia...');
  appRef = app;
}

export function publicarEvento(canal: string, mensaje: string) {
  if (!appRef) {
    console.error('❌ [PUBLISHER] App no registrada.');
    return;
  }

  try {
    // 🔥 EL TRUCO: En Elysia, el método publish puede estar en la app
    // o dentro de app.server (dependiendo de la versión/adaptador).
    if (typeof appRef.publish === 'function') {
      appRef.publish(canal, mensaje);
    } else if (appRef.server && typeof appRef.server.publish === 'function') {
      appRef.server.publish(canal, mensaje);
    } else {
      console.error('❌ [PUBLISHER] No se encontró la función publish en la app ni en app.server');
    }
  } catch (error) {
    console.error(`❌ [PUBLISHER] Error publicando en ${canal}:`, error);
  }
}