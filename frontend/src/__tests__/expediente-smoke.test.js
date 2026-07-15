/** Smoke del Expediente (founder 07-15: errores en consola con F12) — renderiza la página
 * completa con datos NUA-like; cualquier error de runtime o de consola truena aquí. */
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

jest.mock('../components/superadmin/SuperadminLayout', () => ({ __esModule: true, default: ({ children }) => children }));
jest.mock('mapbox-gl', () => ({}), { virtual: true });
const SuperadminExpediente = require('../pages/superadmin/SuperadminExpediente').default;

const REAL = require('./fixtures_expediente_nua.json');   // payload de producción, congelado
const PAYLOAD = {
  desarrollo: { id: 'dev1', name: 'NUA Interlomas', published: false, juez_pct: 100, juez_gate: true, ciudad: 'Huixquilucan' },
  unidades: [{ id: 'u1', unit_number: 'T2 - 3704', prototype_id: 'p06', level: 37, status: 'disponible', price_mxn: 10812800, size_m2: 124.98 }],
  n_unidades: 1,
  prototipos: [{ prototype_id: 'p06', nombre: '2R·2.5B·126m²', unidades_total: 21, estado: 'activo', precio_desde_mxn: 9564700 }],
  metricas_moldes: { p06: { colocacion: { total: 21, vendidas: 0, pct: 0 }, absorcion: { nota: 'x' }, curva_precio: [], premium_piso: [] } },
  programas: {}, cotejo: { checks: [], resumen: { coincide: 0, contradice: 0, solo_una_fuente: 0 } },
  playbook: { nota: 'aún sin ajustes', n_eventos: 0 },
  bitacora: { eventos: 147, ultima_foto: '2026-07-15' },
  sello_capas: { aritmetica: true, cruce: true, porton: true, auditor: false, juez: true, completas: 4 },
  posicion_unidades: {}, multimedia: { locales: [], drive: {} }, pagos: [],
  avance: {}, comercializacion: { configurada: true, comision_pct: 3.5 },
  legal: { docs: 0 }, amenidades: ['alberca'], servicios: {},
  completitud: { pct: 50, passed: 5, total: 10, missing: [{ label: 'Fotos del proyecto' }], publishable: false },
};
const RESPUESTAS = {
  '/expediente/': PAYLOAD,
  '/auditoria': { ts: null, hallazgos: [], resumen: {} },
  '/pedidos/': { dev: 'CLASS', al_dia: false, n_puntos: 2, pct: 50, secciones: [{ titulo: 'X', puntos: ['a', 'b'] }], texto: 'hola' },
  '/diff-listas/': { listo: false, fotos: 1, nota: 'se activa con la 2ª lista' },
};

beforeEach(() => {
  global.fetch = jest.fn((url) => {
    const k = Object.keys(RESPUESTAS).find((p) => String(url).includes(p));
    return Promise.resolve({ ok: true, json: () => Promise.resolve(k ? RESPUESTAS[k] : {}) });
  });
});

test('el Expediente renderiza completo sin errores de consola', async () => {
  const errores = [];
  const orig = console.error;
  console.error = (...a) => { errores.push(a.map(String).join(' ')); orig(...a); };
  const { findByText } = render(
    <MemoryRouter initialEntries={['/superadmin/expediente/dev1']}>
      <Routes><Route path="/superadmin/expediente/:devId" element={<SuperadminExpediente user={{}} onLogout={() => {}} />} /></Routes>
    </MemoryRouter>
  );
  await findByText(/NUA Interlomas/);
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  console.error = orig;
  const graves = errores.filter((e) => !e.includes('act') && !e.includes('Future Flag'));
  expect(graves).toEqual([]);
});

test('el Expediente renderiza el payload REAL de NUA sin errores', async () => {
  RESPUESTAS['/expediente/'] = REAL;
  const errores = [];
  const orig = console.error;
  console.error = (...a) => { errores.push(a.map(String).join(' ')); orig(...a); };
  const { findByText } = render(
    <MemoryRouter initialEntries={['/superadmin/expediente/dev1']}>
      <Routes><Route path="/superadmin/expediente/:devId" element={<SuperadminExpediente user={{}} onLogout={() => {}} />} /></Routes>
    </MemoryRouter>
  );
  await findByText(/NUA Interlomas/);
  console.error = orig;
  const graves = errores.filter((e) => !e.includes('act') && !e.includes('Future Flag'));
  expect(graves).toEqual([]);
});
