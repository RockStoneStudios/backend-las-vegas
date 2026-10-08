// auth-test.js
// Test de carga para el flujo de autenticación por QR
// Escenario: 200 usuarios concurrentes haciendo login

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const API_URL = __ENV.API_URL || 'http://localhost:3001';

const MESAS_TOTALES = 30;
const DEVICES_POR_MESA = 7; // 5 esperados + 2 de margen

// === Métricas ===
const loginsExitosos = new Counter('logins_exitosos');
const loginsFallidos = new Counter('logins_fallidos');
const tokensGenerados = new Counter('tokens_generados');
const erroresTokenInvalido = new Counter('errores_token_invalido');
const erroresDeviceInvalido = new Counter('errores_device_invalido');
const tiempoLogin = new Trend('tiempo_login_ms', true);
const tiempoToken = new Trend('tiempo_token_ms', true);

export const options = {
  scenarios: {
    logins_masivos: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 50 },   // Apertura
        { duration: '20s', target: 150 },  // Llegada masiva
        { duration: '15s', target: 200 },  // Pico
        { duration: '30s', target: 200 },  // Sostener 30s
        { duration: '10s', target: 0 },    // Cierre
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    'logins_fallidos': ['count<20'],
    'tiempo_login_ms': ['p(95)<1000'],
    'tiempo_token_ms': ['p(95)<500'],
  },
};

// Genera un deviceId único por VU (16+ caracteres)
function generarDeviceId(vu, iter) {
  const base = `k6-vu-${vu}-iter-${iter}-device`;
  return base.padEnd(32, 'x'); // garantiza al menos 32 chars
}

export default function () {
  const mesa = (__VU % MESAS_TOTALES) + 1;
  const deviceId = generarDeviceId(__VU, __ITER);

  // === Paso 1: Pedir token de la mesa (simula escanear QR) ===
  const urlToken = `${API_URL}/api/auth/mesa/${mesa}/token`;
  const resToken = http.get(urlToken);

  const tokenOk = check(resToken, {
    'token: status 200': (r) => r.status === 200,
    'token: devuelve token': (r) => {
      try {
        const body = JSON.parse(r.body);
        return typeof body.token === 'string' && body.token.length > 0;
      } catch {
        return false;
      }
    },
  });

  if (!tokenOk) {
    loginsFallidos.add(1);
    return;
  }

  tokensGenerados.add(1);
  tiempoToken.add(resToken.timings.duration);

  const token = JSON.parse(resToken.body).token;

  // === Paso 2: Login con el token ===
  const urlLogin = `${API_URL}/api/auth/mesa/${mesa}?token=${token}&deviceId=${deviceId}`;
  const resLogin = http.get(urlLogin);

  const loginOk = check(resLogin, {
    'login: status 200': (r) => r.status === 200,
    'login: devuelve sessionId': (r) => {
      try {
        const body = JSON.parse(r.body);
        return typeof body.sessionId === 'string' && body.sessionId.length > 0;
      } catch {
        return false;
      }
    },
    'login: devuelve mesa correcta': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.mesa === mesa;
      } catch {
        return false;
      }
    },
  });

  if (loginOk) {
    loginsExitosos.add(1);
    tiempoLogin.add(resLogin.timings.duration);
  } else {
    loginsFallidos.add(1);

    // Diagnóstico: diferenciar tipos de error
    if (resLogin.status === 401) {
      try {
        const body = JSON.parse(resLogin.body);
        if (body.error?.includes('Token')) erroresTokenInvalido.add(1);
        if (body.error?.includes('deviceId') || body.error?.includes('dispositivo')) {
          erroresDeviceInvalido.add(1);
        }
      } catch {}
    }
  }

  // Simular comportamiento humano: pausa entre 2-5s
  sleep(2 + Math.random() * 3);
}

export function handleSummary(data) {
  const exitosos = data.metrics.logins_exitosos?.values?.count || 0;
  const fallidos = data.metrics.logins_fallidos?.values?.count || 0;
  const total = exitosos + fallidos;
  const tasaExito = total > 0 ? ((exitosos / total) * 100).toFixed(2) : '0';

  return {
    'auth-test-result.json': JSON.stringify(data, null, 2),
    stdout: `
========================================
  TEST DE AUTENTICACIÓN POR QR
========================================
Tiempo total:            ${(data.state.testRunDurationMs / 1000).toFixed(1)} s

Logins exitosos:         ${exitosos}
Logins fallidos:         ${fallidos}
Tasa de éxito:           ${tasaExito}%

Tokens generados:        ${data.metrics.tokens_generados?.values?.count || 0}
Errores token inválido:  ${data.metrics.errores_token_invalido?.values?.count || 0}
Errores device inválido: ${data.metrics.errores_device_invalido?.values?.count || 0}

⏱️  LATENCIAS:
  Token p95:             ${data.metrics.tiempo_token_ms?.values?.['p(95)']?.toFixed(2) || 'N/A'} ms
  Token avg:             ${data.metrics.tiempo_token_ms?.values?.avg?.toFixed(2) || 'N/A'} ms
  Token max:             ${data.metrics.tiempo_token_ms?.values?.max?.toFixed(2) || 'N/A'} ms

  Login p95:             ${data.metrics.tiempo_login_ms?.values?.['p(95)']?.toFixed(2) || 'N/A'} ms
  Login avg:             ${data.metrics.tiempo_login_ms?.values?.avg?.toFixed(2) || 'N/A'} ms
  Login max:             ${data.metrics.tiempo_login_ms?.values?.max?.toFixed(2) || 'N/A'} ms

HTTP Requests:
  Total:                 ${data.metrics.http_reqs?.values?.count || 0}
  Fallidos:              ${data.metrics.http_req_failed?.values?.rate ? (data.metrics.http_req_failed.values.rate * 100).toFixed(2) : 0}%

========================================
  ${fallidos === 0 ? '✅ SIN FALLOS' : fallidos < 20 ? '⚠️  POCOS FALLOS' : '🚨 MUCHOS FALLOS'}
========================================
    `,
  };
}