/** Reclamo founder 07-15: "los depas no se iluminan de acuerdo al prototipo". */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
// la página arrastra el layout (react-markdown ESM rompe jest) — se mockea
jest.mock('../components/superadmin/SuperadminLayout', () => ({ __esModule: true, default: ({ children }) => children }));
jest.mock('mapbox-gl', () => ({}), { virtual: true });
const { Torre, PALETA_MOLDE } = require('../pages/superadmin/SuperadminInventario');

const UNITS = [
  { id: 'u1', unit_number: 'T2 - 3704', prototype_id: 'p06', level: 37, status: 'disponible', price_mxn: 10_812_800, size_m2: 124.98 },
  { id: 'u2', unit_number: 'T2 - 3705', prototype_id: 'p03', level: 37, status: 'disponible', price_mxn: 9_000_000, size_m2: 117 },
];
const PROTOS = [{ prototype_id: 'p03' }, { prototype_id: 'p06' }];
const colorDeMolde = (pid) => {
  const i = PROTOS.findIndex((p) => p.prototype_id === pid);
  return i >= 0 ? PALETA_MOLDE[i % PALETA_MOLDE.length] : null;
};

test('cada depa lleva el COLOR de su molde (fondo teñido + borde)', () => {
  render(<MemoryRouter><Torre unidades={UNITS} onUnidad={() => {}} colorDeMolde={colorDeMolde} moldeSel={null} posicion={{}} /></MemoryRouter>);
  const b1 = screen.getByTestId('unidad-T2 - 3704');
  const b2 = screen.getByTestId('unidad-T2 - 3705');
  expect(b1.style.background).toContain('74, 222, 128');   // #4ADE80 en rgba
  expect(b2.style.background).toContain('88, 166, 255');   // #58A6FF en rgba
});

test('seleccionar un molde ILUMINA los suyos (color pleno) y apaga el resto', () => {
  render(<MemoryRouter><Torre unidades={UNITS} onUnidad={() => {}} colorDeMolde={colorDeMolde} moldeSel={'p06'} posicion={{}} /></MemoryRouter>);
  const suyo = screen.getByTestId('unidad-T2 - 3704');
  expect(suyo.style.background).toBe('rgb(74, 222, 128)'); // color PLENO
  expect(suyo.style.opacity).toBe('1');
  expect(screen.getByTestId('unidad-T2 - 3705').style.opacity).toBe('0.15');
});
