import { unitMatchesCriteria } from '../unitMatch';

const UNIT = {
  status: 'disponible', bedrooms: 2, bathrooms: 2, parking_spots: 1,
  m2_total: 80, price: 5000000, orientation: 'Sur',
};

describe('unitMatchesCriteria', () => {
  it('una unidad que cumple todos los criterios → true', () => {
    expect(unitMatchesCriteria(UNIT, { beds: 2, baths: 1, min_sqm: 60, max_price: 6000000 })).toBe(true);
  });

  it('unidad no disponible → false', () => {
    expect(unitMatchesCriteria({ ...UNIT, status: 'vendido' }, { beds: 1 })).toBe(false);
  });

  it('menos recámaras/baños/cajones de los pedidos → false', () => {
    expect(unitMatchesCriteria(UNIT, { beds: 3 })).toBe(false);
    expect(unitMatchesCriteria(UNIT, { baths: 3 })).toBe(false);
    expect(unitMatchesCriteria(UNIT, { parking: 2 })).toBe(false);
  });

  it('fuera del rango de m² o precio → false', () => {
    expect(unitMatchesCriteria(UNIT, { min_sqm: 100 })).toBe(false);
    expect(unitMatchesCriteria(UNIT, { max_price: 4000000 })).toBe(false);
    expect(unitMatchesCriteria(UNIT, { min_price: 6000000 })).toBe(false);
  });

  it('feature requerida ausente → false', () => {
    expect(unitMatchesCriteria(UNIT, { unit_feature: ['balcon'] })).toBe(false);
    expect(unitMatchesCriteria({ ...UNIT, balcon: true }, { unit_feature: ['balcon'] })).toBe(true);
  });

  it('orientación filtra (case-insensitive)', () => {
    expect(unitMatchesCriteria(UNIT, { orientacion: ['sur'] })).toBe(true);
    expect(unitMatchesCriteria(UNIT, { orientacion: ['norte'] })).toBe(false);
  });

  it('seguro con entradas nulas', () => {
    expect(unitMatchesCriteria(null, {})).toBe(false);
    expect(unitMatchesCriteria(UNIT, null)).toBe(false);
  });
});
