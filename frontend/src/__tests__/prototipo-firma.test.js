/** Prototipo = combinación ÚNICA de m²+recámaras+baños+cajones (+torre si el desarrollo
 *  tiene varias) — regla founder 07-16. GDC/ingesta traen prototype='depto' genérico y sin
 *  esta firma la ficha colapsaba 85 unidades en una sola tarjeta "Modelo depto". */
import { modelScheme, torreOf } from '../pages/FichaVenta';

const u = (unit_number, bedrooms, bathrooms, parking_spots, m2, extra = {}) => ({
  unit_number, bedrooms, bathrooms, parking_spots, m2_total: m2, prototype: 'depto', ...extra,
});

test('torreOf saca la torre del número de unidad', () => {
  expect(torreOf(u('A-1104', 2, 2.5, 2, 113))).toBe('A');
  expect(torreOf(u('B S3 - 1', 3, 2, 2, 164))).toBe('B');
  expect(torreOf(u('PB 107', 3, 2, 2, 146))).toBe(null);
  expect(torreOf({ unit_number: '501', tower: 'c' })).toBe('C'); // campo explícito manda
});

test('misma rec pero distintos baños/m² = prototipos DISTINTOS', () => {
  const units = [u('101', 2, 2.5, 2, 100), u('102', 2, 2.0, 2, 100), u('103', 2, 2.5, 2, 130)];
  const { keyOf, labelFor } = modelScheme(units);
  const llaves = new Set(units.map(keyOf));
  expect(llaves.size).toBe(3);
  expect(labelFor([units[0]])).toBe('2 rec · 2.5 baños · 100 m²');
});

test('multi-torre: mismo combo en Torre A y B son prototipos distintos y se etiquetan', () => {
  const units = [u('A-201', 2, 2, 2, 112), u('B-201', 2, 2, 2, 112)];
  const { keyOf, labelFor } = modelScheme(units);
  expect(keyOf(units[0])).not.toBe(keyOf(units[1]));
  expect(labelFor([units[0]])).toBe('Torre A · 2 rec · 2 baños · 112 m²');
  expect(labelFor([units[1]])).toBe('Torre B · 2 rec · 2 baños · 112 m²');
});

test('una sola torre: la etiqueta NO menciona torre', () => {
  const units = [u('A-201', 2, 2, 2, 112), u('A-301', 3, 2, 2, 130)];
  const { labelFor } = modelScheme(units);
  expect(labelFor([units[0]])).toBe('2 rec · 2 baños · 112 m²');
});

test('prototipos con NOMBRE real (CLASS) se respetan tal cual', () => {
  const units = [
    { unit_number: '101', prototype: 'Tipo 4', bedrooms: 3 },
    { unit_number: '102', prototype: 'Tipo 7', bedrooms: 2 },
  ];
  const { keyOf, labelFor } = modelScheme(units);
  expect(keyOf(units[0])).toBe('Tipo 4');
  expect(labelFor([units[1]])).toBe('Modelo Tipo 7');
});

test('m² se redondea a entero para no fragmentar por decimales', () => {
  const units = [u('101', 2, 2.5, 2, 112.95), u('201', 2, 2.5, 2, 113.0)];
  const { keyOf } = modelScheme(units);
  expect(keyOf(units[0])).toBe(keyOf(units[1]));   // 112.95 y 113.0 = mismo molde
});

test('FLEX: plano 3 rec + lista 2 rec (misma huella) = prototipo "2–3 rec (FLEX)"', () => {
  const flex = { unit_number: 'A-1104', bedrooms: 2, bathrooms: 2.5, parking_spots: 2,
    m2_total: 113, prototype: 'depto', flex_rec: [2, 3] };
  const fija = u('A-704', 3, 2.5, 2, 113);
  const { keyOf, labelFor } = modelScheme([flex, fija]);
  expect(labelFor([flex])).toBe('2–3 rec (FLEX) · 2.5 baños · 113 m²');
  expect(keyOf(flex)).not.toBe(keyOf(fija));   // el FLEX es SU PROPIO prototipo
});

test('torres multi-carácter (NUA: T1/T2) también se detectan', () => {
  expect(torreOf({ unit_number: 'T2 - 3904' })).toBe('T2');
  expect(torreOf({ unit_number: 'T1 1701' })).toBe('T1');
});
