/** Auditoría 07-17 · /superadmin/leads (antes ruta muerta desde la bandeja) + sección
 * "Pedido a los desarrolladores" del Inventario. Smoke: render completo sin errores de consola,
 * huérfanos VISIBLES con su etiqueta (no se esconden), filtros puros correctos. */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('../components/superadmin/SuperadminLayout', () => ({ __esModule: true, default: ({ children }) => children }));
jest.mock('mapbox-gl', () => ({}), { virtual: true });
const SuperadminLeads = require('../pages/superadmin/SuperadminLeads').default;
const { filtrarLeads } = require('../pages/superadmin/SuperadminLeads');
const { PedidosDevs, edadEnDias } = require('../pages/superadmin/SuperadminInventario');

const PAYLOAD_LEADS = {
  n: 3, n_proyecto_borrado: 1,
  totales: { por_status: { nuevo: 2, cita: 1 }, por_proyecto: { Almina: 2, 'altavista-polanco': 1 } },
  leads: [
    { id: 'l1', nombre: 'Ana López', email: 'ana@x.com', status: 'nuevo', fuente: 'inhouse', fecha: '2026-07-10', asesor: 'Ana Gutiérrez', inmobiliaria: null, presupuesto_mxn: 8000000, development_id: 'd1', proyecto: 'Almina', proyecto_borrado: false, demo: false },
    { id: 'l2', nombre: 'Prospecto 1', email: null, status: 'cita', fuente: 'broker', fecha: '2026-06-01', asesor: null, inmobiliaria: 'Livoo Bienes Raíces', presupuesto_mxn: null, development_id: 'altavista-polanco', proyecto: 'altavista-polanco', proyecto_borrado: true, nota: 'seed demo borrado 2026-07-14', demo: true },
    { id: 'l3', nombre: 'Luis Vega', email: 'luis@x.com', status: 'nuevo', fuente: 'caya_bubble', fecha: '2026-07-01', asesor: 'Carlos Méndez', inmobiliaria: null, presupuesto_mxn: null, development_id: 'd1', proyecto: 'Almina', proyecto_borrado: false, demo: false },
  ],
};

const PAYLOAD_SOLICITUDES = {
  n: 2, pendientes: 2,
  solicitudes: [
    { desarrollador: 'CLASS', tipo: 'lista_precios_illinois', que_falta: 'Lista de precios', proyecto: 'Illinois 70', proyectos: [], por_que: 'la carpeta no trae lista de precios; el brochure menciona 14 deptos (5 disponibles).', fecha: '2026-07-17', estado: 'pendiente' },
    { desarrollador: 'GDC', tipo: 'planos_por_tipo', que_falta: 'Planos por tipo de depto', proyecto: '26 proyectos', proyectos: ['Casa Colon', 'Casa Condesa', 'Icon Beyond', 'The Park', 'Vía Roma 386'], por_que: '', fecha: '2026-07-16', estado: 'pendiente' },
  ],
};

const PAYLOAD_PELEAS = {
  n: 6, umbral_dias: 10,
  por_ruta: { auto: 1, otro_doc: 3, dev: 2 },
  por_tipo: { m2_pelea: 1, inventario_pelea: 1, status_nota: 1, pelea_fuente: 2, solicitud: 1 },
  peleas: [
    { tipo: 'm2_pelea', desarrollo: 'NUA Interlomas', unidad: 'T2 - 2304', detalle: 'lista dice 124.98, plano dice 127.36', edad_dias: 2, ruta: 'otro_doc' },
    { tipo: 'inventario_pelea', desarrollo: 'Jai Reforma', unidad: '16G', detalle: 'lista no la ofrece; maestro sí', edad_dias: 27, ruta: 'dev' },
  ],
  envejecidas: [
    { tipo: 'inventario_pelea', desarrollo: 'Jai Reforma', unidad: '16G', detalle: 'lista no la ofrece; maestro sí', edad_dias: 27, ruta: 'dev' },
  ],
};

beforeEach(() => {
  global.fetch = jest.fn((url) => {
    const body = String(url).includes('/solicitudes-devs') ? PAYLOAD_SOLICITUDES
      : String(url).includes('/peleas') ? PAYLOAD_PELEAS
        : String(url).includes('/leads') ? PAYLOAD_LEADS : {};
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  });
});

test('la página de Leads renderiza completa: huérfano ETIQUETADO y visible, sin errores de consola', async () => {
  const errores = [];
  const orig = console.error;
  console.error = (...a) => { errores.push(a.map(String).join(' ')); orig(...a); };
  render(<MemoryRouter><SuperadminLeads user={{}} onLogout={() => {}} /></MemoryRouter>);
  await screen.findByText('Ana López');
  // el huérfano NO se esconde: etiqueta clara + id conservado
  expect(screen.getByText(/proyecto ya no existe \(demo borrada\)/)).toBeInTheDocument();
  expect(screen.getByText('altavista-polanco')).toBeInTheDocument();
  // totales por status y resumen de huérfanos
  expect(screen.getByText('Nuevo: 2')).toBeInTheDocument();
  expect(screen.getByText(/1 apuntan a proyectos que ya no existen/)).toBeInTheDocument();
  // fuente en humano
  expect(screen.getByText('Chat de Caya')).toBeInTheDocument();
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  console.error = orig;
  const graves = errores.filter((e) => !e.includes('act') && !e.includes('Future Flag'));
  expect(graves).toEqual([]);
});

test('la sección "Pedido a los desarrolladores" del Inventario muestra los pedidos en humano', async () => {
  render(<MemoryRouter><PedidosDevs /></MemoryRouter>);
  await screen.findByText(/Pedido a los desarrolladores/);
  expect(screen.getByText(/2 pendientes/)).toBeInTheDocument();
  expect(screen.getByText('Illinois 70')).toBeInTheDocument();
  expect(screen.getByText(/el brochure menciona 14 deptos/)).toBeInTheDocument();
  expect(screen.getByText('CLASS')).toBeInTheDocument();
  expect(screen.getByText('GDC')).toBeInTheDocument();
  expect(screen.getByText(/\+1 más/)).toBeInTheDocument();   // 5 proyectos → 4 + "+1 más"
  // EDAD de cada pedido: cuántos días lleva esperando (o "pedido hoy")
  expect(screen.getAllByText(/lleva \d+ días? esperando|pedido hoy/).length).toBeGreaterThanOrEqual(1);
});

test('el contador de peleas resume las disputas entre fuentes, con las envejecidas marcadas', async () => {
  render(<MemoryRouter><PedidosDevs /></MemoryRouter>);
  await screen.findByTestId('contador-peleas');
  expect(screen.getByText(/6 datos donde las fuentes no coinciden/)).toBeInTheDocument();
  const linea = screen.getByTestId('contador-peleas').textContent;
  expect(linea).toMatch(/1 se corrigen solos con la próxima lista/);
  expect(linea).toMatch(/3 los resuelve otro documento/);
  expect(linea).toMatch(/2 esperan respuesta del desarrollador/);
  expect(linea).toMatch(/1 llevan más de 10 días/);
});

test('edadEnDias: pura y sin sorpresas', () => {
  const hoy = new Date('2026-07-17T12:00:00').getTime();
  expect(edadEnDias('2026-07-10', hoy)).toBe(7);
  expect(edadEnDias('2026-07-17', hoy)).toBe(0);
  expect(edadEnDias(null, hoy)).toBe(null);
  expect(edadEnDias('no-es-fecha', hoy)).toBe(null);
});

test('filtrarLeads: status + proyecto + texto libre', () => {
  const L = PAYLOAD_LEADS.leads;
  expect(filtrarLeads(L, {})).toHaveLength(3);
  expect(filtrarLeads(L, { status: 'cita' }).map((l) => l.id)).toEqual(['l2']);
  expect(filtrarLeads(L, { proyecto: 'Almina' })).toHaveLength(2);
  expect(filtrarLeads(L, { texto: 'luis' }).map((l) => l.id)).toEqual(['l3']);
  expect(filtrarLeads(L, { texto: 'gutiérrez' }).map((l) => l.id)).toEqual(['l1']);   // por asesor
  expect(filtrarLeads(L, { status: 'nuevo', texto: 'ana' }).map((l) => l.id)).toEqual(['l1']);
});
