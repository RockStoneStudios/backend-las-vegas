import { Rooms, type WsSessionData } from "../../shared/websocket/socket.server";

type Publicador = (canal : string,mensaje:string) => void;

// Acumulador de reacciones EN MEMORIA (NO se reinicia solo)
const contadorReacciones : Record<string,number> = {};
let totalReaccionesGlobal = 0;

// 🆕 Variable global para controlar si las mesas pueden pedir canciones
let modoPedirCancionActivo = false;

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
    
    registrarReaccion(emoji:string, publicar: Publicador){
        if(!emoji) return;
        
        // 🔥 1. ACUMULAMOS LA ENERGÍA (Aumentamos el total)
        totalReaccionesGlobal += 1; // Cada emoji suma 1 punto

        console.log(`🔥 Reacción recibida: ${emoji}. Total acumulado: ${totalReaccionesGlobal}`);

        // 2. Emitimos el emoji en tiempo real a las TVs
        publicar(
            Rooms.general(),
            JSON.stringify({
                tipo: 'EVENT:NUEVO_EMOJI_EN_TV',
                payload: { emoji }
            })
        );

        // 🔥 3. Emitimos el nuevo nivel del termómetro INMEDIATAMENTE
        // Calculamos el porcentaje (asumimos que 1000 es el máximo para llegar al 100%)
        const porcentaje = Math.min(100, Math.round((totalReaccionesGlobal / 1000) * 100));
        
        publicar(
            Rooms.general(),
            JSON.stringify({
                tipo: 'EVENT:ACTUALIZAR_TERMOMETRO',
                payload: { total: totalReaccionesGlobal }
            })
        );
    }

    // 🔥 ESTO SE ACTIVA DESDE EL ADMIN (no se llama sola)
    obtenerEstadoTermometro(publicar: Publicador) {
        const entradas = Object.entries(contadorReacciones);
        const emojisOrdenados = entradas.sort((a, b) => b[1] - a[1]);

        publicar(
            Rooms.general(),
            JSON.stringify({
                tipo: 'EVENT:ACTUALIZAR_TERMOMETRO',
                payload: { 
                    total: totalReaccionesGlobal,
                    emojiTop: emojisOrdenados.length > 0 ? emojisOrdenados[0][0] : null
                }
            })
        );
    }

    // 🔥 BOTÓN EN ADMIN: Reiniciar el contador
    reiniciarTermometro(publicar: Publicador) {
        for (const key in contadorReacciones) delete contadorReacciones[key];
        totalReaccionesGlobal = 0;

        publicar(
            Rooms.general(),
            JSON.stringify({
                tipo: 'EVENT:TERMOMETRO_REINICIADO',
                payload: { mensaje: '¡El termómetro se ha reiniciado!' }
            })
        );
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

    // =============================================================
    // 🆕 NUEVAS FUNCIONES: CONTROL DE "PEDIR CANCIÓN"
    // =============================================================

    // 1. El Admin activa o desactiva el modo
    toggleModoPedirCancion(activo: boolean, publicar: Publicador) {
        modoPedirCancionActivo = activo;
        console.log(`🎵 Modo "Pedir Canción" ${activo ? 'ACTIVADO' : 'DESACTIVADO'}`);

        publicar(
            Rooms.general(),
            JSON.stringify({
                tipo: 'EVENT:MODO_PEDIR_CANCION',
                payload: { activo }
            })
        );
    }

    // 2. Consultar el estado actual (para el Admin o para depuración)
    obtenerEstadoPedirCancion(): boolean {
        return modoPedirCancionActivo;
    }
}