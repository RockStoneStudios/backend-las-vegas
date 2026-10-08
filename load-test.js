// load-test.js - v3
// Test de carga para Las Vegas Discobar
// Escenario: 200 usuarios concurrentes
// 
// Cambios v3:
// - Separa errores de negocio (YA_SOLICITADO) de errores técnicos WS
// - Baja frecuencia de OBTENER_PREMIOS (cada 30s por VU, no cada 4-8s)
// - Métrica de colgadas más realista
// - Cuenta PINGs y PONGs por separado

import ws from 'k6/ws';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const WS_URL = __ENV.WS_URL || 'ws://localhost:3001';
const MESAS_TOTALES = 30;
const USUARIOS_POR_MESA = 5;

// === Métricas de conexión ===
const wsConectados = new Counter('ws_conectados');
const wsErroresTecnicos = new Counter('ws_errores_tecnicos');
const wsCerrados = new Counter('ws_cerrados');
const colgadasAlCerrar = new Counter('colgadas_al_cerrar');

// === Métricas de mensajes ===
const mensajesEnviados = new Counter('mensajes_enviados');
const mensajesRecibidos = new Counter('mensajes_recibidos');
const erroresNegocio = new Counter('errores_negocio');
const pingsRecibidos = new Counter('pings_recibidos');
const pongsEnviados = new Counter('pongs_enviados');

// === Métricas de latencia ===
const tiempoConexion = new Trend('tiempo_conexion_ms', true);
const tiempoRespuestaWS = new Trend('tiempo_respuesta_ws_ms', true);

export const options = {
  scenarios: {
    carga_real: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 50 },
        { duration: '20s', target: 120 },
        { duration: '15s', target: 200 },
        { duration: '60s', target: 200 },
        { duration: '15s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    'ws_errores_tecnicos': ['count<20'],
    'tiempo_conexion_ms': ['p(95)<2000'],
    'tiempo_respuesta_ws_ms': ['p(95)<1000'],
  },
};

function obtenerMesaYDevice() {
  const mesaNum = (__VU % MESAS_TOTALES) + 1;
  const deviceNum = (__VU % USUARIOS_POR_MESA) + 1;
  return {
    mesa: mesaNum,
    deviceId: `k6-device-${mesaNum}-${deviceNum}-${__VU}`,
  };
}

export default function () {
  const { mesa } = obtenerMesaYDevice();
  const sessionId = `mesa_${mesa}_k6_${__VU}`;
  const url = `${WS_URL}/ws?sessionId=${sessionId}`;
  const inicioConexion = Date.now();

  let mensajesRecibidosEsteVU = 0;
  let mensajesEnviadosEsteVU = 0;
  let ultimoEnvio = 0;
  let ultimoPremios = 0;

  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      const tiempo = Date.now() - inicioConexion;
      tiempoConexion.add(tiempo);
      wsConectados.add(1);

      // === Acciones periódicas (cada 4-8s) ===
      socket.setInterval(() => {
        try {
          const random = Math.random();
          let tipoMensaje;
          let payload;

          if (random < 0.5) {
            // 50% reacciones
            tipoMensaje = 'ACTION:ENVIAR_REACCION';
            payload = { emoji: ['🔥', '❤️', '🍻', '🎉', '👍', '💃', '🍸'][Math.floor(Math.random() * 7)] };
          } else if (random < 0.8) {
            // 30% pedir atención al mesero
            tipoMensaje = 'ACTION:SOLICITAR_ATENCION';
            payload = { mesa };
          } else {
            // 20% brindis
            tipoMensaje = 'ACTION:MANDAR_BRINDIS';
            payload = { mesaDestino: (Math.floor(Math.random() * MESAS_TOTALES) + 1) };
          }

          socket.send(JSON.stringify({ tipo: tipoMensaje, payload }));
          mensajesEnviados.add(1);
          mensajesEnviadosEsteVU++;
          ultimoEnvio = Date.now();
        } catch (e) {}
      }, 4000 + Math.random() * 4000);

      // === OBTENER_PREMIOS cada 30s (separado, no en el interval de arriba) ===
      socket.setInterval(() => {
        try {
          socket.send(JSON.stringify({ tipo: 'ACTION:OBTENER_PREMIOS', payload: {} }));
          mensajesEnviados.add(1);
          mensajesEnviadosEsteVU++;
          ultimoPremios = Date.now();
        } catch (e) {}
      }, 30000);

      // === Cierre del VU ===
      socket.setTimeout(() => {
        try { socket.close(1000, 'k6 done'); } catch (e) {}
      }, 40000 + Math.random() * 30000);
    });

    socket.on('message', (data) => {
      mensajesRecibidos.add(1);
      mensajesRecibidosEsteVU++;

      try {
        const msg = JSON.parse(data);

        // 🔥 HEARTBEAT: responder PING con PONG
        if (msg.tipo === 'PING') {
          pingsRecibidos.add(1);
          socket.send(JSON.stringify({ tipo: 'PONG' }));
          pongsEnviados.add(1);
          return;
        }

        // 🔥 ERRORES DE NEGOCIO: no cuentan como error técnico
        if (msg.tipo === 'ERROR') {
          erroresNegocio.add(1);
          return;
        }

        // 🔥 Medir latencia solo para eventos que esperamos como respuesta
        if (msg.tipo === 'EVENT:MESERO_SOLICITADO') {
          if (ultimoEnvio > 0) {
            tiempoRespuestaWS.add(Date.now() - ultimoEnvio);
          }
        }
      } catch (e) {}
    });

    socket.on('error', () => {
      // Solo errores TÉCNICOS del WebSocket (no mensajes ERROR del backend)
      wsErroresTecnicos.add(1);
    });

    socket.on('close', () => {
      wsCerrados.add(1);
      // Si el VU nunca envió nada, cuenta como colgada al cerrar
      if (mensajesEnviadosEsteVU === 0) {
        colgadasAlCerrar.add(1);
      }
    });
  });

  check(res, {
    'conexión WS exitosa': (r) => r && r.status === 101,
  });
}

export function handleSummary(data) {
  const conectados = data.metrics.ws_conectados?.values?.count || 0;
  const cerrados = data.metrics.ws_cerrados?.values?.count || 0;
  const colgadasAlFinal = conectados - cerrados;
  const erroresTec = data.metrics.ws_errores_tecnicos?.values?.count || 0;
  const erroresNeg = data.metrics.errores_negocio?.values?.count || 0;

  return {
    'hardcore-200.json': JSON.stringify(data, null, 2),
    stdout: `
========================================
  TEST DE CARGA - 200 VUs (v3)
========================================
Conexiones exitosas:        ${conectados}
Errores técnicos WS:        ${erroresTec} ${erroresTec > 20 ? '🚨' : '✅'}
Errores de negocio:         ${erroresNeg}  (reglas: YA_SOLICITADO, etc.)
Cierres limpios:            ${cerrados}
Colgadas al terminar test:  ${colgadasAlFinal}  (el server las cierra con heartbeat)

Pings recibidos:            ${data.metrics.pings_recibidos?.values?.count || 0}
Pongs enviados:             ${data.metrics.pongs_enviados?.values?.count || 0}

Mensajes enviados:          ${data.metrics.mensajes_enviados?.values?.count || 0}
Mensajes recibidos:         ${data.metrics.mensajes_recibidos?.values?.count || 0}

⏱️  LATENCIAS:
  Tiempo conexión p95:      ${data.metrics.tiempo_conexion_ms?.values?.['p(95)']?.toFixed(2) || 'N/A'} ms
  Tiempo conexión p99:      ${data.metrics.tiempo_conexion_ms?.values?.['p(99)']?.toFixed(2) || 'N/A'} ms
  Tiempo conexión avg:      ${data.metrics.tiempo_conexion_ms?.values?.avg?.toFixed(2) || 'N/A'} ms

  Respuesta WS p95:         ${data.metrics.tiempo_respuesta_ws_ms?.values?.['p(95)']?.toFixed(2) || 'N/A'} ms
  Respuesta WS avg:         ${data.metrics.tiempo_respuesta_ws_ms?.values?.avg?.toFixed(2) || 'N/A'} ms

========================================
  VEREDICTO:
  - Errores técnicos: ${erroresTec === 0 ? '✅ CERO' : erroresTec < 20 ? '⚠️  POCOS' : '🚨 MUCHOS'}
  - Heartbeat:        ${(data.metrics.pings_recibidos?.values?.count || 0) > 0 ? '✅ FUNCIONA' : '❌ NO LLEGAN PINGS'}
  - Errores negocio:  ${erroresNeg} (esto es correcto, es la regla YA_SOLICITADO)
========================================
    `,
  };
}