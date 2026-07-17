import { zonaBase, nombreZona } from '../zonaPack';

test('agrupa sub-colonias por zona base', () => {
  expect(zonaBase('roma-norte')).toBe('roma');
  expect(zonaBase('roma-sur')).toBe('roma');
  expect(zonaBase('del-valle-centro')).toBe('del-valle');
  expect(zonaBase('roma-norte-cuauhtemoc')).toBe('roma');
});

test('adyacencia: San Miguel Chapultepec y Escandón son Condesa; Granada es Polanco', () => {
  expect(zonaBase('san-miguel-chapultepec')).toBe('condesa');
  expect(zonaBase('escandon')).toBe('condesa');
  expect(zonaBase('granada')).toBe('polanco');
  expect(zonaBase('hipodromo')).toBe('condesa');
});

test('nombre bonito con primera palabra en mayúscula', () => {
  expect(nombreZona('del-valle')).toBe('Del Valle');
  expect(nombreZona('roma')).toBe('Roma');
});
