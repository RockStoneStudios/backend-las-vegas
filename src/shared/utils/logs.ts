// src/shared/utils/log.ts
// Helper de logs condicionales.
// En desarrollo: activa con DEBUG_WS=true
// En producción: desactiva con DEBUG_WS=false (o sin definir)

const DEBUG_WS = process.env.DEBUG_WS === 'true';
const DEBUG_VOTACIONES = process.env.DEBUG_VOTACIONES === 'true';
const DEBUG_MESERO = process.env.DEBUG_MESERO === 'true';

/**
 * Log de WebSocket (mensajes, conexiones, cierres)
 */
export function logWS(...args: any[]) {
  if (DEBUG_WS) console.log(...args);
}

/**
 * Log de votaciones
 */
export function logVotaciones(...args: any[]) {
  if (DEBUG_VOTACIONES) console.log(...args);
}

/**
 * Log de meseros
 */
export function logMesero(...args: any[]) {
  if (DEBUG_MESERO) console.log(...args);
}

/**
 * Log genérico de debug (se activa con DEBUG_WS=true)
 */
export function logDebug(...args: any[]) {
  if (DEBUG_WS) console.log(...args);
}