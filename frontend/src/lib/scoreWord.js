// Salud/score del proyecto en PALABRA (nunca "/100"). Fuente única reusable.
// El número crudo (0-100) se queda solo para tooltips de detalle, nunca como titular.

export const scoreWord = (s) => {
  const n = Number(s);
  if (!Number.isFinite(n)) return 'Sin Dato Aún';
  if (n >= 75) return 'Va muy bien';
  if (n >= 60) return 'Va bien';
  if (n >= 45) return 'Va con problemas';
  return 'Necesita atención';
};

// Riesgo: alto número = más riesgo (se invierte la lectura).
export const riskWord = (s) => {
  const n = Number(s);
  if (!Number.isFinite(n)) return 'Sin Dato Aún';
  if (n >= 70) return 'Riesgo Alto';
  if (n >= 45) return 'Riesgo Medio';
  return 'Riesgo Bajo';
};

// Nivel de zona en palabra de persona (antes salía "tier_1"/"A" crudo).
export const tierLabel = (t) => {
  if (!t) return '';
  const s = String(t).toLowerCase();
  if (s.includes('premium') || s.includes('alto') || s === 'a' || s === 'tier_1' || s === '1') return 'Premium';
  if (s.includes('medio') || s.includes('mid') || s === 'b' || s === 'tier_2' || s === '2') return 'Medio';
  if (s.includes('econom') || s.includes('bajo') || s === 'c' || s === 'tier_3' || s === '3') return 'Económico';
  return String(t).charAt(0).toUpperCase() + String(t).slice(1);
};

// Banda neutra (señal): de Muy Baja a Muy Alta, sin "/100".
export const bandWord = (s) => {
  const n = Number(s);
  if (!Number.isFinite(n)) return 'Sin Dato Aún';
  if (n >= 80) return 'Muy Alta';
  if (n >= 60) return 'Alta';
  if (n >= 40) return 'Media';
  if (n >= 20) return 'Baja';
  return 'Muy Baja';
};
