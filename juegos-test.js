// juegos-test.js
// Test de carga para el módulo de juegos (WS)
// Escenario: 200 VUs conectados + eventos del DJ

import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const WS_URL = __ENV.WS_URL || 'ws://localhost:3001';
const API_URL = __ENV.API_URL || 'http://localhost:3001';

const MESAS_TOTALES = 30;

// === Métricas específicas de juegos ===
const conexionesOk = new Counter('conexiones_ok');
const erroresWS = new Counter('errores_ws');
const pingsRecibidos = new Counter('pings_recibidos');
const pongsEnviados = new Counter('pongs_enviados');

const ruletasGeneralesRecibidas = new Counter('ruletas_generales_recibidas');
const ruletasPremiosRecibidas = new Counter('ruletas_premios_recibidas');
const slotsRecibidos = new Counter('slots_recibidos');
const vecesGanador = new Counter('veces_ganador');
const vecesPerdedor = new Counter('veces_perdedor');

const accionesEnviadas = new Counter('acciones_enviadas');
const erroresNegocio = new Counter('errores_negocio');

const tiempoRespuestaRuleta = new Trend('tiempo_respuesta_ruleta_ms', true);
const tiempoRespuestaSlot = new Trend('tiempo_respuesta_slot_ms', true);

export const options = {
  scenarios: {
    // Escenario 1: muchos clientes conectados girando ruleta de premios y slot
    clientes: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 50 },
        { duration: '20s', target: 150 },
        { duration: '15s', target: 200 },
        { duration: '60s', target: 200 }, // 1 minuto sostenido
        { duration: '15s', target: 0 },
      ],
      gracefulRampDown: '15s',
      exec: 'clienteJugando',
    },
  },
  thresholds: {
    'errores_ws': ['count<20'],
    'tiempo_respuesta_ruleta_ms': ['p(95)<3000'], // la ruleta tiene animación de ~11s, pero la respuesta del backend debe ser < 3s
    'tiempo_respuesta_slot_ms': ['p(95)<1000'],
  },
};

function generarSessionId(mesa) {
  return `mesa_${mesa}_k6_juegos_${__VU}_${__ITER}`;
}

// Escenario: cliente que juega
export function clienteJugando() {
  const mesa = (__VU % MESAS_TOTALES) + 1;
  const sessionId = generarSessionId(mesa);
  const url = `${WS_URL}/ws?sessionId=${sessionId}`;

  let ultimoEnvioRuleta = 0;
  let ultimoEnvioSlot = 0;

  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      conexionesOk.add(1);

      // === Cada 20-30 segundos: girar ruleta de premios ===
      socket.setInterval(() => {
        try {
          socket.send(JSON.stringify({
            tipo: 'ACTION:GIRAR_RULETA_PREMIOS',
            payload: {},
          }));
          accionesEnviadas.add(1);
          ultimoEnvioRuleta = Date.now();
        } catch (e) {}
      }, 20000 + Math.random() * 10000);

      // === Cada 25-40 segundos: girar slot ===
      socket.setInterval(() => {
        try {
          socket.send(JSON.stringify({
            tipo: 'ACTION:GIRAR_SLOT',
            payload: {},
          }));
          accionesEnviadas.add(1);
          ultimoEnvioSlot = Date.now();
        } catch (e) {}
      }, 25000 + Math.random() * 15000);

      // === Cerrar después de 90-120 segundos ===
      socket.setTimeout(() => {
        try { socket.close(1000, 'k6 done'); } catch (e) {}
      }, 90000 + Math.random() * 30000);
    });

    socket.on('message', (data) => {
      try {
        const msg = JSON.parse(data);

        // 🔥 HEARTBEAT
        if (msg.tipo === 'PING') {
          pingsRecibidos.add(1);
          socket.send(JSON.stringify({ tipo: 'PONG' }));
          pongsEnviados.add(1);
          return;
        }

        // 🔥 ERRORES DE NEGOCIO
        if (msg.tipo === 'ERROR') {
          erroresNegocio.add(1);
          return;
        }

        // === EVENTOS DE JUEGOS ===
        if (msg.tipo === 'EVENT:SORTEO_MESA_RESULTADO') {
          ruletasGeneralesRecibidas.add(1);
          if (msg.payload?.mesaGanadora === mesa) {
            vecesGanador.add(1);
          }
        }

        if (msg.tipo === 'EVENT:TURNO_RULETA_HABILITADO' || msg.tipo === 'EVENT:SORTEO_PERDEDOR') {
          ruletasGeneralesRecibidas.add(1);
        }

        if (msg.tipo === 'EVENT:RULETA_GIRAR') {
          ruletasPremiosRecibidas.add(1);
          if (ultimoEnvioRuleta > 0) {
            tiempoRespuestaRuleta.add(Date.now() - ultimoEnvioRuleta);
            ultimoEnvioRuleta = 0;
          }
        }

        if (msg.tipo === 'EVENT:SLOT_RESULTADO') {
          slotsRecibidos.add(1);
          if (ultimoEnvioSlot > 0) {
            tiempoRespuestaSlot.add(Date.now() - ultimoEnvioSlot);
            ultimoEnvioSlot = 0;
          }
        }

        if (msg.tipo === 'EVENT:CONEXION_EXITOSA' || msg.tipo === 'EVENT:RULETA_CONFIGURACION_INICIAL') {
          // ok, ignoramos
        }

      } catch (e) {}
    });

    socket.on('error', () => {
      erroresWS.add(1);
    });
  });

  check(res, {
    'conexión WS exitosa': (r) => r && r.status === 101,
  });
}

export function handleSummary(data) {
  const conectados = data.metrics.conexiones_ok?.values?.count || 0;
  const erroresTec = data.metrics.errores_ws?.values?.count || 0;
  const erroresNeg = data.metrics.errores_negocio?.values?.count || 0;

  return {
    'juegos-test-result.json': JSON.stringify(data, null, 2),
    stdout: `
========================================
  TEST DE JUEGOS - 200 VUs
========================================
Conexiones exitosas:       ${conectados}
Errores técnicos WS:       ${erroresTec} ${erroresTec > 20 ? '🚨' : '✅'}
Errores de negocio:        ${erroresNeg}

Pings/Pongs:               ${data.metrics.pings_recibidos?.values?.count || 0} / ${data.metrics.pongs_enviados?.values?.count || 0}

Acciones enviadas:         ${data.metrics.acciones_enviadas?.values?.count || 0}

Ruletas generales:         ${data.metrics.ruletas_generales_recibidas?.values?.count || 0}
Ruletas de premios:        ${data.metrics.ruletas_premios_recibidas?.values?.count || 0}
Slots recibidos:           ${data.metrics.slots_recibidos?.values?.count || 0}

Veces ganador:             ${data.metrics.veces_ganador?.values?.count || 0}
Veces perdedor:            ${data.metrics.veces_perdedor?.values?.count || 0}

⏱️  LATENCIAS:
  Respuesta ruleta p95:    ${data.metrics.tiempo_respuesta_ruleta_ms?.values?.['p(95)']?.toFixed(2) || 'N/A'} ms
  Respuesta ruleta avg:    ${data.metrics.tiempo_respuesta_ruleta_ms?.values?.avg?.toFixed(2) || 'N/A'} ms

  Respuesta slot p95:      ${data.metrics.tiempo_respuesta_slot_ms?.values?.['p(95)']?.toFixed(2) || 'N/A'} ms
  Respuesta slot avg:      ${data.metrics.tiempo_respuesta_slot_ms?.values?.avg?.toFixed(2) || 'N/A'} ms

========================================
  ${erroresTec < 20 ? '✅ JUEGOS OK' : '🚨 REVISAR ERRORES'}
========================================
    `,
  };
}