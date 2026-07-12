import { scoreWord, riskWord, tierLabel } from '../scoreWord';

describe('scoreWord', () => {
  it('mapea el score a la palabra correcta por umbral', () => {
    expect(scoreWord(90)).toBe('Va muy bien');
    expect(scoreWord(75)).toBe('Va muy bien');
    expect(scoreWord(60)).toBe('Va bien');
    expect(scoreWord(45)).toBe('Va con problemas');
    expect(scoreWord(10)).toBe('Necesita atención');
  });
  it('acepta strings numéricos', () => {
    expect(scoreWord('80')).toBe('Va muy bien');
  });
  it('devuelve "Sin Dato Aún" solo para valores NO numéricos (NaN)', () => {
    expect(scoreWord('abc')).toBe('Sin Dato Aún');
    expect(scoreWord(undefined)).toBe('Sin Dato Aún');
    // Nota: Number(null) === 0 (no NaN), así que null cae en el bucket bajo (comportamiento real).
    expect(scoreWord(null)).toBe('Necesita atención');
  });
});

describe('riskWord', () => {
  it('mapea el riesgo por umbral', () => {
    expect(riskWord(80)).toBe('Riesgo Alto');
    expect(riskWord(70)).toBe('Riesgo Alto');
    expect(riskWord(50)).toBe('Riesgo Medio');
    expect(riskWord(10)).toBe('Riesgo Bajo');
  });
  it('valor no numérico → "Sin Dato Aún" (null coacciona a 0 → Riesgo Bajo)', () => {
    expect(riskWord(undefined)).toBe('Sin Dato Aún');
    expect(riskWord('n/a')).toBe('Sin Dato Aún');
    expect(riskWord(null)).toBe('Riesgo Bajo');
  });
});

describe('tierLabel', () => {
  it('reconoce premium por varios alias', () => {
    expect(tierLabel('premium')).toBe('Premium');
    expect(tierLabel('a')).toBe('Premium');
    expect(tierLabel('tier_1')).toBe('Premium');
    expect(tierLabel('1')).toBe('Premium');
  });
  it('vacío → ""', () => {
    expect(tierLabel('')).toBe('');
    expect(tierLabel(null)).toBe('');
  });
});
