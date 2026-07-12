import {
  schemeSum, schemeSumOk, appliedPrice, autoMonths, resolveMonths,
  breakdown, discountForEnganche, emptyScheme, SCHEME_MAX,
} from '../paymentSchemes';

describe('paymentSchemes — espejo JS de la cotización', () => {
  it('schemeSum suma los 3 tramos y schemeSumOk tolera ±0.5', () => {
    expect(schemeSum({ firma_pct: 20, mensualidades_pct: 10, escritura_pct: 70 })).toBe(100);
    expect(schemeSumOk({ firma_pct: 20, mensualidades_pct: 10, escritura_pct: 70 })).toBe(true);
    expect(schemeSumOk({ firma_pct: 20, mensualidades_pct: 10, escritura_pct: 70.3 })).toBe(true);
    expect(schemeSumOk({ firma_pct: 20, mensualidades_pct: 10, escritura_pct: 69 })).toBe(false);
  });

  it('appliedPrice aplica el descuento y redondea', () => {
    expect(appliedPrice(1000000, 10)).toBe(900000);
    expect(appliedPrice(1000000, 0)).toBe(1000000);
    expect(appliedPrice('1000000', '5')).toBe(950000);
  });

  it('autoMonths cuenta meses entre fechas YYYY-MM-DD (mín 1)', () => {
    expect(autoMonths('2026-01-01', '2026-07-01')).toBe(6);
    expect(autoMonths('2026-01-01', '2027-01-01')).toBe(12);
    expect(autoMonths('2026-05-01', '2026-05-01')).toBe(1); // max(1, 0)
    expect(autoMonths(null, '2026-07-01')).toBeNull();
  });

  it('resolveMonths respeta meses_override cuando es válido', () => {
    expect(resolveMonths({ meses_override: 24 }, '2026-01-01', '2026-07-01')).toBe(24);
    expect(resolveMonths({ meses_override: '' }, '2026-01-01', '2026-07-01')).toBe(6);
    expect(resolveMonths({ meses_override: 0 }, '2026-01-01', '2026-07-01')).toBe(6); // 0 no es válido → auto
  });

  it('breakdown NO pierde dinero: firma + mensualidades + escritura === precio_aplicado', () => {
    const b = breakdown(1234567, { firma_pct: 20, mensualidades_pct: 10, escritura_pct: 70, descuento_pct: 7 }, null, null);
    expect(b.firma + b.mensualidades_total + b.escrituracion).toBe(b.precio_aplicado);
    expect(b.precio_aplicado).toBe(appliedPrice(1234567, 7));
    expect(b.ahorro).toBe(Math.round(1234567) - b.precio_aplicado);
  });

  it('breakdown reparte la mensualidad entre los meses', () => {
    const b = breakdown(1000000, { firma_pct: 20, mensualidades_pct: 10, escritura_pct: 70, descuento_pct: 0, meses_override: 10 }, '2026-01-01', '2026-11-01');
    expect(b.meses).toBe(10);
    expect(b.mensualidades_total).toBe(100000);
    expect(b.mensualidad).toBe(10000);
  });

  it('discountForEnganche interpola entre puntos de enganche', () => {
    const schemes = [{ firma_pct: 20, descuento_pct: 5 }, { firma_pct: 40, descuento_pct: 10 }];
    expect(discountForEnganche(schemes, 20)).toBe(5);   // <= mínimo
    expect(discountForEnganche(schemes, 40)).toBe(10);  // >= máximo
    expect(discountForEnganche(schemes, 30)).toBe(7.5); // interpolado
    expect(discountForEnganche([], 30)).toBe(0);        // sin esquemas
  });

  it('emptyScheme es un esquema válido (suma 100) y SCHEME_MAX es 5', () => {
    const e = emptyScheme();
    expect(schemeSumOk(e)).toBe(true);
    expect(e.firma_pct + e.mensualidades_pct + e.escritura_pct).toBe(100);
    expect(SCHEME_MAX).toBe(5);
  });
});
