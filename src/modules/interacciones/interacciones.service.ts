import { Rooms, type WsSessionData } from "../../shared/websocket/socket.server";

type Publicador = (canal : string,mensaje:string) => void;


// Acumulador de reacciones EN MEMORIA (no en DB, según spec 4.C).
// Vive aquí, a nivel de módulo, porque solo necesita existir mientras
// el proceso del servidor está corriendo — si el server se reinicia,
// perder este conteo no importa (es solo un "termómetro" en vivo).

const contadorReacciones : Record<string,number> = {};

export class InteraccionesService {
    mandarBrindis(sesion : WsSessionData,mesaDestino : number,publicar:Publicador){
        if(!mesaDestino || mesaDestino ==sesion.mesa) return;
        publicar(
            Rooms.mesa(mesaDestino),
            JSON.stringify({
                type : 'EVENT:BRINDIS_RECIBIDO',
                payload :{
                    mesaOrigen :sesion.mesa,
                    mensaje : `La Mesa ${sesion.mesa} les manda un saludo`
                }
            })
        )
    }
    notificarCumpleanos(sesion: WsSessionData, publicar: Publicador) {
        publicar(
            Rooms.admin(),
            JSON.stringify({ tipo: 'EVENT:CUMPLEAÑOS_MESA', payload: { mesa: sesion.mesa } })
        );
    }
    
    registrarReaccion(emoji:string){
        if(!emoji) return;
        contadorReacciones[emoji] = (contadorReacciones[emoji] ?? 0)+1
    }

    iniciarPulsoTermometro(publicar: Publicador) {
    setInterval(() => {
      const entradas = Object.entries(contadorReacciones);
      if (entradas.length === 0) return;

      const total = entradas.reduce((suma, [, cantidad]) => suma + cantidad, 0);
      const [emojiTop] = entradas.sort((a, b) => b[1] - a[1])[0];

      publicar(
        Rooms.admin(),
        JSON.stringify({
          tipo: 'EVENT:TERMOMETRO_RUMBA',
          payload: { totalReaccionesSec: total, emojiTop },
        })
      );

      // Reset: el próximo pulso empieza a contar desde cero.
      for (const key in contadorReacciones) delete contadorReacciones[key];
    }, 2000);
  }
  activarFlashSync(sesion: WsSessionData, publicar: Publicador) {
    if (sesion.rol !== 'dj' && sesion.rol !== 'admin') {
      throw new Error('No autorizado: solo el DJ puede activar el modo luces');
    }

    publicar(
      Rooms.general(),
      JSON.stringify({
        tipo: 'EVENT:FLASH_SYNC_START',
        payload: { duracionSegundos: 10, colores: ['#fff', '#f00', '#0ff'] },
      })
    );
  }

}