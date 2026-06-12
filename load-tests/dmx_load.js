// DMX — Load test (k6) · escala progresiva hasta 10,000 VUs
// ⚠️ CORRER SOLO CONTRA STAGING. NUNCA producción. Verificar TOS del hosting antes.
//
// Uso:
//   BASE_URL=https://staging.desarrollosmx.io  k6 run dmx_load.js
//   (opcional) TOKEN=<jwt_de_un_usuario_de_prueba> para los journeys autenticados
//
// Instala k6: https://k6.io/docs/get-started/installation/
// Empieza CHICO (escala STAGE_MAX=200) y sube gradualmente. 10k VUs requiere
// una máquina de carga potente o k6 Cloud; no lo lances de golpe.

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://localhost:8000';
const TOKEN = __ENV.TOKEN || '';
const MAX = parseInt(__ENV.STAGE_MAX || '10000', 10);

const errors = new Rate('dmx_errors');
const tApi = new Trend('dmx_api_latency', true);

export const options = {
  // Rampa progresiva: 0 → 10% → 50% → 100% → bajada. Ajusta a tu capacidad.
  stages: [
    { duration: '2m', target: Math.round(MAX * 0.1) },
    { duration: '3m', target: Math.round(MAX * 0.5) },
    { duration: '5m', target: MAX },
    { duration: '5m', target: MAX },   // sostenido (caza fugas de memoria/recursos)
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],            // SLA del plan: <1% errores
    dmx_errors: ['rate<0.01'],
    // SLA del plan: p95 < 500ms en LECTURAS (las rutas calientes del 70% de tráfico).
    // Se evalúan por separado de las escrituras vía los tags name: de cada request.
    'http_req_duration{name:marketplace_list}': ['p95<500'],
    'http_req_duration{name:avm_top}': ['p95<500'],
    'http_req_duration{name:dashboard}': ['p95<800'],   // autenticado · cómputo
    'http_req_duration{name:grafo}': ['p95<1500'],      // full-scan conocido · techo más alto
    'http_req_duration{name:lead_capture}': ['p95<800'],// escritura
    http_req_duration: ['p95<1000', 'p99<3000'],        // global de seguridad
  },
};

const authHeaders = TOKEN ? { headers: { Authorization: `Bearer ${TOKEN}` } } : {};

export default function () {
  // Journey 1 — Marketplace público (búsqueda) · el más golpeado y sin auth
  group('marketplace_search', () => {
    const r = http.get(`${BASE}/api/developments?limit=20`, { tags: { name: 'marketplace_list' } });
    tApi.add(r.timings.duration);
    errors.add(r.status >= 400);
    check(r, { 'list 200': (x) => x.status === 200 });
  });

  // Journey 2 — AVM público / valor de zona (cómputo + posible LLM/score)
  group('avm_public', () => {
    const r = http.get(`${BASE}/api/avm-public/colonias/top`, { tags: { name: 'avm_top' } });
    tApi.add(r.timings.duration);
    errors.add(r.status >= 400);
  });

  // Journey 3 — Dashboard / Intelligence (autenticado · recálculo pesado)
  if (TOKEN) {
    group('dashboard_ie', () => {
      const r = http.get(`${BASE}/api/desarrollador/dashboard`, { ...authHeaders, tags: { name: 'dashboard' } });
      tApi.add(r.timings.duration);
      errors.add(r.status >= 400);
    });
    // Journey 4 — Estudio de mercado / Grafo (FULL-SCAN por request → bottleneck esperado)
    group('estudio_grafo', () => {
      const r = http.get(`${BASE}/api/dev/grafo-comprador?colonia_id=polanco`, { ...authHeaders, tags: { name: 'grafo' } });
      tApi.add(r.timings.duration);
      errors.add(r.status >= 400);
    });
  }

  // Journey 5 — Captura de lead (escritura · marketplace)
  group('lead_capture', () => {
    const payload = JSON.stringify({ name: `LoadTest ${__VU}-${__ITER}`, email: `lt_${__VU}_${__ITER}@example.com`, phone: '5500000000', source: 'loadtest' });
    const r = http.post(`${BASE}/api/landing/demo/lead`, payload, { headers: { 'Content-Type': 'application/json' }, tags: { name: 'lead_capture' } });
    tApi.add(r.timings.duration);
    // 429 (rate-limit) NO cuenta como error: es comportamiento deseado bajo abuso.
    errors.add(r.status >= 400 && r.status !== 429);
  });

  sleep(Math.random() * 2 + 1); // think time 1-3s
}
