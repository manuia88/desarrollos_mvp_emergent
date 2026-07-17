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
const { PedidosDevs } = require('../pages/superadmin/SuperadminInventario');

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

beforeEach(() => {
  global.fetch = jest.fn((url) => {
    const body = String(url).includes('/solicitudes-devs') ? PAYLOAD_SOLICITUDES
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
