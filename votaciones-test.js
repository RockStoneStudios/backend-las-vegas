// votaciones-test.js - v2
// Comparación antes/después con el mismo escenario
// Escenario: DJ abre votación + 200 clientes votan

import ws from 'k6/ws';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const WS_URL = __ENV.WS_URL || 'ws://localhost:3001';
const MESAS_TOTALES = 30;

// === Métricas ===
const conexionesOk = new Counter('conexiones_ok');
const erroresWS = new Counter('errores_ws');
const erroresNegocio = new Counter('errores_negocio');
const pingsRecibidos = new Counter('pings_recibidos');
const pongsEnviados = new Counter('pongs_enviados');

const votosEnviados = new Counter('votos_enviados');
const votosExitosos = new Counter('votos_exitosos');
const votosDuplicados = new Counter('votos_duplicados');
const votacionesRecibidas = new Counter('votaciones_recibidas');
const actualizacionesRecibidas = new Counter('actualizaciones_recibidas');
const cierresRecibidos = new Counter('cierres_recibidos');

const tiempoRespuestaVoto = new Trend('tiempo_respuesta_voto_ms', true);

export const options = {
  scenarios: {
    votacion_masiva: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 50 },
        { duration: '15s', target: 150 },
        { duration: '10s', target: 200 },
        { duration: '45s', target: 200 },
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    'errores_ws': ['count<50'],
    'tiempo_respuesta_voto_ms': ['p(95)<1000'],
  },
};

export default function () {
  const esDJ = __VU === 1;
  const mesa = esDJ ? 0 : ((__VU % MESAS_TOTALES) + 1);
  const sessionId = esDJ ? 'a361_dj_k6' : `mesa_${mesa}_k6_${__VU}`;
  const url = `${WS_URL}/ws?sessionId=${sessionId}`;

  let votacionId = null;
  let ultimoEnvioVoto = 0;
  let yaVoto = false;

  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      conexionesOk.add(1);

      // 🔥 Si es DJ: abrir votación a los 15s
      if (esDJ) {
        socket.setTimeout(() => {
          try {
            socket.send(JSON.stringify({
              tipo: 'ACTION:VOTACION_EXPRES_START',
              payload: {
                pregunta: '¿Qué canción ponemos?',
                opciones: ['Reggaetón', 'Salsa', 'Electrónica', 'Pop'],
                duracion: 40,
              },
            }));
          } catch (e) {}
        }, 15000);
      }

      // 🔥 Clientes: votar 3s después de recibir la votación
      socket.setTimeout(() => {
        if (votacionId && !yaVoto && !esDJ) {
          try {
            const opcionId = 1 + Math.floor(Math.random() * 4);
            socket.send(JSON.stringify({
              tipo: 'ACTION:VOTAR_OPCION',
              payload: { votacionId, opcionId },
            }));
            votosEnviados.add(1);
            ultimoEnvioVoto = Date.now();
            yaVoto = true;
          } catch (e) {}
        }
      }, 18000);

      // Cerrar después de 70s
      socket.setTimeout(() => {
        try { socket.close(1000, 'k6 done'); } catch (e) {}
      }, 70000);
    });

    socket.on('message', (data) => {
      try {
        const msg = JSON.parse(data);

        if (msg.tipo === 'PING') {
          pingsRecibidos.add(1);
          socket.send(JSON.stringify({ tipo: 'PONG' }));
          pongsEnviados.add(1);
          return;
        }

        if (msg.tipo === 'ERROR') {
          erroresNegocio.add(1);
          if (msg.payload?.mensaje?.includes('ya habías votado')) {
            votosDuplicados.add(1);
          }
          return;
        }

        if (msg.tipo === 'EVENT:VOTACION_EXPRES_START') {
          votacionesRecibidas.add(1);
          votacionId = msg.payload.id;
        }

        if (msg.tipo === 'EVENT:VOTACION_ACTUALIZADA') {
          actualizacionesRecibidas.add(1);

          // 🔥 Si enviamos un voto hace menos de 3s, es un voto exitoso
          if (ultimoEnvioVoto > 0) {
            const delta = Date.now() - ultimoEnvioVoto;
            if (delta < 3000) {
              votosExitosos.add(1);
              tiempoRespuestaVoto.add(delta);
            }
            ultimoEnvioVoto = 0;
          }
        }

        if (msg.tipo === 'EVENT:VOTACION_CERRADA') {
          cierresRecibidos.add(1);
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
    'votaciones-test-result.json': JSON.stringify(data, null, 2),
    stdout: `
========================================
  TEST DE VOTACIONES - 200 VUs (v2)
========================================
Conexiones exitosas:       ${conectados}
Errores técnicos WS:       ${erroresTec} ${erroresTec > 50 ? '🚨' : '✅'}
Errores de negocio:        ${erroresNeg}

Pings/Pongs:               ${data.metrics.pings_recibidos?.values?.count || 0} / ${data.metrics.pongs_enviados?.values?.count || 0}

Votos enviados:            ${data.metrics.votos_enviados?.values?.count || 0}
Votos exitosos:            ${data.metrics.votos_exitosos?.values?.count || 0}
Votos duplicados:          ${data.metrics.votos_duplicados?.values?.count || 0}

Votaciones recibidas:      ${data.metrics.votaciones_recibidas?.values?.count || 0}
Actualizaciones recibidas: ${data.metrics.actualizaciones_recibidas?.values?.count || 0}
Cierres recibidos:         ${data.metrics.cierres_recibidos?.values?.count || 0}

⏱️  LATENCIAS:
  Respuesta voto p95:      ${data.metrics.tiempo_respuesta_voto_ms?.values?.['p(95)']?.toFixed(2) || 'N/A'} ms
  Respuesta voto avg:      ${data.metrics.tiempo_respuesta_voto_ms?.values?.avg?.toFixed(2) || 'N/A'} ms

========================================
  ${erroresTec < 50 ? '✅ VOTACIONES OK' : '🚨 REVISAR'}
========================================
    `,
  };
}