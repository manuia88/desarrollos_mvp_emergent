import { fmtMXN, fmtPct } from '../calcV4';

describe('calcV4 — formateadores de la calculadora', () => {
  it('fmtMXN formatea pesos y maneja nulos/NaN', () => {
    expect(fmtMXN(null)).toBe('—');
    expect(fmtMXN(undefined)).toBe('—');
    expect(fmtMXN('abc')).toBe('—');
    const out = fmtMXN(1000000);
    expect(out).not.toBe('—');
    expect(out).toMatch(/\$/);
    // sin decimales (maximumFractionDigits: 0)
    expect(out).not.toMatch(/[.,]\d{2}$/);
  });

  it('fmtPct formatea con 1 decimal y maneja nulos/NaN', () => {
    expect(fmtPct(null)).toBe('—');
    expect(fmtPct('x')).toBe('—');
    expect(fmtPct(10)).toBe('10.0%');
    expect(fmtPct(7.16)).toBe('7.2%'); // redondea hacia arriba
    expect(fmtPct(7.13)).toBe('7.1%'); // redondea hacia abajo
    expect(fmtPct(0)).toBe('0.0%');
  });
});
