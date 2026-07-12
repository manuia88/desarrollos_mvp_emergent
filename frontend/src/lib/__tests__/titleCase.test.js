import { tc } from '../titleCase';

describe('titleCase (tc)', () => {
  it('capitaliza palabras significativas y deja minúsculas las cortas (no-primeras)', () => {
    expect(tc('mapa de valores')).toBe('Mapa de Valores');
    expect(tc('probabilidad de cierre')).toBe('Probabilidad de Cierre');
  });

  it('capitaliza la PRIMERA palabra aunque sea una palabra corta', () => {
    expect(tc('el índice')).toBe('El Índice');
    expect(tc('de compras')).toBe('De Compras');
  });

  it('respeta acrónimos en mayúsculas (DMX, API, IE)', () => {
    expect(tc('DMX picks')).toBe('DMX Picks');
    expect(tc('datos por API')).toBe('Datos por API');
  });

  it('deja intactas palabras con números', () => {
    expect(tc('state of cdmx 2026')).toContain('2026');
  });

  it('es seguro con entradas vacías o no-string', () => {
    expect(tc('')).toBe('');
    expect(tc(null)).toBeNull();
    expect(tc(undefined)).toBeUndefined();
    expect(tc(42)).toBe(42);
  });

  it('preserva espacios y puntuación', () => {
    expect(tc('comprar · vender')).toBe('Comprar · Vender');
  });
});
