import { JuegosRepository, type PremioConfig } from './juegos.repository';
import { Rooms, type WsSessionData } from '../../shared/websocket/socket.server';
import type { JuegoId, TipoJuego } from './juegos.types';

type Publicador = (canal: string, mensaje: string) => void;

let BOTELLAS_ENTREGADAS_HOY = 0;
const MAX_BOTELLAS_PERMITIDAS = 2;


const SIMBOLOS = ['🍒', '🍋', '🍊', '🔔', '💎', '7️⃣'];
const PREMIOS_SLOT = {
  '💎💎💎': 100,
  '7️⃣7️⃣7️⃣': 50,
  '🔔🔔🔔': 20,
  '🍊🍊🍊': 10,
  '🍒🍒🍒': 5,
};

export class JuegosService {
  private repo = new JuegosRepository();

  // Registrar el ingreso de una mesa conectada vía QR
  async registrarIngresoMesa(numeroMesa: number) {
    // Si tu repo maneja la sesión/asistencia por QR
    // await this.repo.registrarMesaConectada(numeroMesa);
  }
  async obtenerSesionActiva() {
    try {
      const sessionId = await this.repo.obtenerSesionActiva();

      if (!sessionId) {
        return {
          success: false,
          sessionId: null,
          message: 'No hay ninguna sesión activa en MongoDB',
        };
      }

      return {
        success: true,
        sessionId,
      };
    } catch (error: any) {
      console.error('❌ Error al obtener la sesión activa:', error);
      return {
        success: false,
        sessionId: null,
        error: error?.message || 'Error al consultar la sesión en la base de datos',
      };
    }
  }
  async cambiarSesionActiva(nuevaSesionId: string) {
    if (!nuevaSesionId || nuevaSesionId.trim() === '') {
      throw new Error('El ID de la sesión no puede estar vacío');
    }

    const sessionId = await this.repo.actualizarSesionActiva(nuevaSesionId.trim());
    return {
      success: true,
      mensaje: 'Sesión activa actualizada correctamente',
      sessionId,
    };
  }
   async obtenerConfiguracionPremios() {
    return this.repo.obtenerPremiosConfigurados();
  }

  // =====================================================================
  // 🎟️ 1. RULETA GENERAL / SORTEO DE MESAS (Iniciado por DJ / Staff)
async girarRuletaGeneral(
  sesion: WsSessionData,
  opciones: {
    duracionSegundos?: number;
    mesasManuales?: number | number[]; // 👈 Acepta la cantidad (ej: 12) o la lista explícita (ej: [1, 2, 5])
  },
  publicar: Publicador
) {
  if (sesion.rol !== 'dj' && sesion.rol !== 'admin') {
    throw new Error('No autorizado: solo el DJ o Admin pueden iniciar la Ruleta General');
  }

  let mesasParticipantes: number[] = [];

  // 1. EVALUAR SI SE PASÓ NÚMERO MANUAL O ARRAY DE MESAS
  if (typeof opciones.mesasManuales === 'number' && opciones.mesasManuales > 0) {
    // Si envió un número (ej. 15), generamos automáticamente [1, 2, 3, ..., 15]
    mesasParticipantes = Array.from({ length: opciones.mesasManuales }, (_, i) => i + 1);
  } else if (Array.isArray(opciones.mesasManuales) && opciones.mesasManuales.length > 0) {
    // Si envió una lista específica de números de mesa
    mesasParticipantes = opciones.mesasManuales;
  } else {
    // Si no envió nada manual, consultamos las mesas activas en la BD
    mesasParticipantes = await this.repo.obtenerMesasActivasRegistradas();
  }

  if (!mesasParticipantes || mesasParticipantes.length === 0) {
    throw new Error('No hay mesas activas registradas en este momento para el sorteo');
  }

  // 2. CÁLCULO DE DURACIÓN DE LA ANIMACIÓN
  let duracionMs: number;
  if (opciones.duracionSegundos && opciones.duracionSegundos >= 5) {
    duracionMs = opciones.duracionSegundos * 1000;
  } else {
    const minSeg = 9;
    const maxSeg = 16;
    duracionMs = (minSeg + Math.random() * (maxSeg - minSeg)) * 1000;
  }

  // 3. ELECCIÓN AZAROSA DE MESA GANADORA Y CÁLCULO DE ÍNDICE GANADOR (ÚNICO Y CENTRALIZADO)
  const indiceGanador = Math.floor(Math.random() * mesasParticipantes.length);
  const mesaGanadora = mesasParticipantes[indiceGanador];

  await this.repo.registrarActivacion('ruleta', 'global', null);

  const payloadSincronizado = {
    mesaGanadora,
    indiceGanador,
    mesasParticipantes,
    totalMesasParticipantes: mesasParticipantes.length,
    duracionAnimacionMs: Math.round(duracionMs),
    duracionSegundos: Math.round(duracionMs / 1000), // 👈 Añadido para compatibilidad
    ejecutadoPor: sesion.rol,
  };

  // 📣 1. Anuncio a TODAS las pantallas de la discoteca (Opera, TVs, etc.)
  publicar(
    Rooms.general(),
    JSON.stringify({
      tipo: 'EVENT:SORTEO_MESA_RESULTADO',
      payload: payloadSincronizado,
    })
  );

  // 📣 2. Notificación en privado a la mesa afortunada (Ganador)
  publicar(
    Rooms.mesa(mesaGanadora),
    JSON.stringify({
      tipo: 'EVENT:TURNO_RULETA_HABILITADO',
      payload: {
        mensaje: '¡Su mesa fue seleccionada! Preparen su pantalla para girar la ruleta.',
        duracionEsperaMs: Math.round(duracionMs),
      },
    })
  );

  // 📣 3. Notificación en privado a las mesas perdedoras
  for (const mesaNum of mesasParticipantes) {
    if (mesaNum !== mesaGanadora) {
      publicar(
        Rooms.mesa(mesaNum),
        JSON.stringify({
          tipo: 'EVENT:SORTEO_PERDEDOR',
          payload: {
            mensaje: '¡Suerte para la próxima! Esta vez el premio fue para otra mesa.',
            duracionEsperaMs: Math.round(duracionMs),
          },
        })
      );
    }
  }

  // 👈 RETORNAMOS TODO EL PAYLOAD PARA PODER RESPONDERLE AL EMISOR (EDGE)
  return payloadSincronizado;
}
  // =====================================================================
  // 🎰 2. RULETA DE LA FORTUNA / PREMIOS (Con Dinamismo desde BD + Pesos)
  // =====================================================================

     async girarSlot(sesion: WsSessionData, publicar: Publicador) {
    // 1. Definir los símbolos y sus pesos (El Jackpot '7️⃣' casi no sale)
    const SIMBOLOS_CON_PESOS = [
      { simbolo: '🍸', peso: 30 },  // Muy común
      { simbolo: '🍷', peso: 25 },  // Común
      { simbolo: '🍺', peso: 20 },  // Normal
      { simbolo: '🎲', peso: 15 },  // Raro
      { simbolo: '💎', peso: 8 },   // Muy raro
      { simbolo: '7️⃣', peso: 2 }    // ¡Jackpot LAS VEGAS! (Rarísimo)
    ];

    // 2. Función local para elegir un símbolo usando el sistema ponderado (El tuyo)
    const seleccionarSimbolo = (): string => {
      const sumaPesos = SIMBOLOS_CON_PESOS.reduce((acc, s) => acc + s.peso, 0);
      let rand = Math.random() * sumaPesos;
      for (const s of SIMBOLOS_CON_PESOS) {
        if (rand < s.peso) return s.simbolo;
        rand -= s.peso;
      }
      return '🍸'; // Fallback
    };

    // 3. Generar los 3 rodillos con la selección ponderada
    const rodillos = Array.from({ length: 3 }, () => {
      return [seleccionarSimbolo(), seleccionarSimbolo(), seleccionarSimbolo()];
    });

    // 4. Determinar el resultado (combinación central)
    const resultadoFinal = rodillos.map(r => r[1]); // La fila del medio
    const clave = resultadoFinal.join('');
    
    // 5. Premio según la combinación
    const PREMIOS_SLOT = {
      '7️⃣7️⃣7️⃣': 100, // Jackpot
      '💎💎💎': 50,
      '🍸🍸🍸': 20,
      '🍷🍷🍷': 15,
      '🍺🍺🍺': 10,
      '🎲🎲🎲': 5,
    };
    const premio = PREMIOS_SLOT[clave as keyof typeof PREMIOS_SLOT] || 0;

    // 6. Emitir el evento SOLO a la mesa que jugó
    publicar(Rooms.mesa(sesion.mesa), JSON.stringify({
      tipo: 'EVENT:SLOT_RESULTADO',
      payload: { rodillos, premio, ganador: premio > 0 }
    }));

    return { rodillos, premio };
  }



async girarRuletaPremios(sesion: WsSessionData, publicar: Publicador) {
  // 1. Cargar los premios dinámicos configurados por el Admin en la BD
  const premiosBD = await this.repo.obtenerPremiosConfigurados();

  if (!premiosBD || premiosBD.length === 0) {
    throw new Error('No hay premios configurados en el sistema');
  }

  let premiosDisponibles = premiosBD.map(p => ({ ...p, pesoActual: p.pesoBase }));

  // Regla 1: Protección de Stock para premios mayores
  if (BOTELLAS_ENTREGADAS_HOY >= MAX_BOTELLAS_PERMITIDAS) {
    premiosDisponibles = premiosDisponibles.map(p =>
      p.esPremioMayor ? { ...p, pesoActual: 0 } : p
    );
  }

  // Regla 2: Algoritmo de Hora Pico (23:00 a 03:00 hs)
  const horaActual = new Date().getHours();
  const esHoraPico = horaActual >= 23 || horaActual < 3;

  if (esHoraPico) {
    premiosDisponibles = premiosDisponibles.map(p => {
      if (!p.esPremioMayor && p.nombre.toLowerCase().includes('intentando')) {
        return { ...p, pesoActual: p.pesoActual * 1.8 };
      }
      return p;
    });
  }

  // Selección ponderada según los pesos actuales
  const indiceGanador = esteSeleccionarIndicePonderado(premiosDisponibles);
  const premioObtenido = premiosDisponibles[indiceGanador];

  if (premioObtenido.esPremioMayor) {
    BOTELLAS_ENTREGADAS_HOY++;
  }

  const vueltas = 15 + Math.floor(Math.random() * 10);
  const duracionMs = 11000 + Math.random() * 3000;
  const numeroMesa = Number(sesion.mesa);

  // 🔥 1. Obtener el color y el icono de la BD (con fallbacks por si están vacíos)
  const colorPremio = premioObtenido.color || '#ff007f';
  const iconoPremio = premioObtenido.icono || 'Sparkle';

  // 🎯 Creamos el mensaje con los datos de la animación para ambos
    const eventoAnimacionRuleta = JSON.stringify({
      tipo: 'EVENT:RULETA_GIRAR',
      payload: {
        indiceGanador,
        premio: premioObtenido.nombre,
        vueltas,
        duracionMs,
        ejecutadoPorMesa: numeroMesa,
        // 🔥 2. AGREGAMOS ESTOS 3 CAMPOS AL PAYLOAD:
        esGanador: premioObtenido.esPremioMayor,
        color: colorPremio,
        icono: iconoPremio,
      },
    });

    // 📣 1. Animación para la MESA que jugó
    if (!isNaN(numeroMesa) && numeroMesa > 0) {
      publicar(Rooms.mesa(numeroMesa), eventoAnimacionRuleta);
    }

    // 📣 2. La MISMA animación para el ADMIN (para que su ruleta gire en sincronía)
    publicar(Rooms.admin(), eventoAnimacionRuleta);

    // 🔥 3. DEVOLVEMOS TODOS LOS DATOS (Para que coincida con lo que espera el case del socket)
    return {
      indiceGanador,
      premio: premioObtenido.nombre,
      vueltas,
      duracionMs,
      esPremioMayor: premioObtenido.esPremioMayor,
      color: colorPremio,
      icono: iconoPremio
    };
  }

  // =====================================================================
  // 🔓 3. DESBLOQUEO DE JUEGO POR MESA (Activado Individualmente)
  // =====================================================================
  async habilitarJuegoPrivado(
    sesion: WsSessionData,
    juegoId: JuegoId,
    mesaDestino: number,
    publicar: Publicador
  ) {
    if (sesion.rol !== 'dj' && sesion.rol !== 'admin') {
      throw new Error('No autorizado');
    }

    await this.repo.registrarActivacion(juegoId, 'por_mesa', mesaDestino);

    publicar(
      Rooms.mesa(mesaDestino),
      JSON.stringify({
        tipo: 'EVENT:JUEGO_PRIVADO_DESBLOQUEADO',
        payload: { juegoId, mesa: mesaDestino },
      })
    );
  }

  // =====================================================================
  // ⚙️ 4. ACTIVAR JUEGO (General o Por Mesa)
  // =====================================================================
  async activarJuego(
    sesion: WsSessionData,
    juegoId: JuegoId,
    tipo: TipoJuego,
    mesaPermitida: number | null,
    publicar: Publicador
  ) {
    if (sesion.rol !== 'admin' && sesion.rol !== 'dj') {
      throw new Error('No autorizado: solo el staff o DJ pueden activar juegos');
    }

    const juego = await this.repo.registrarActivacion(juegoId, tipo, mesaPermitida);
    const canal = tipo === 'global' ? Rooms.general() : Rooms.mesa(mesaPermitida!);

    publicar(
      canal,
      JSON.stringify({
        tipo: 'EVENT:JUEGO_ACTIVADO',
        payload: {
          juegoId: juego.juegoId,
          tipo: juego.tipo,
          mesaObjetivo: juego.mesaPermitida,
          activo: true,
        },
      })
    );

    return juego;
  }

  // =====================================================================
  // 🛑 5. CONTROL Y ESTADO
  // =====================================================================
  async cerrarJuego(sesion: WsSessionData, publicar: Publicador) {
    if (sesion.rol !== 'admin' && sesion.rol !== 'dj') {
      throw new Error('No autorizado');
    }

    await this.repo.desactivarActual();

    publicar(
      Rooms.general(),
      JSON.stringify({
        tipo: 'EVENT:JUEGO_CERRADO',
        payload: { activo: false },
      })
    );
  }

  async consultarEstadoActual() {
    return this.repo.obtenerJuegoActivo();
  }
}

// Selección ponderada matemática basada en los pesos configurados
function esteSeleccionarIndicePonderado(premios: { pesoActual: number }[]): number {
  const sumaPesos = premios.reduce((acc, p) => acc + p.pesoActual, 0);
  if (sumaPesos <= 0) return 0;

  let numeroRandom = Math.random() * sumaPesos;

  for (let i = 0; i < premios.length; i++) {
    if (numeroRandom < premios[i].pesoActual) {
      return i;
    }
    numeroRandom -= premios[i].pesoActual;
  }

  return 0;
}