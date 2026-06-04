/**
 * Espejo JS de backend/payment_schemes.py — para preview instantáneo en la UI
 * (config sin guardar, recálculo de la lista, comparador). El servidor sigue
 * siendo la fuente de verdad (validación + cotización autoritativa).
 */
export const SCHEME_MAX = 5;

const f = (v, d = 0) => { const n = parseFloat(v); return isNaN(n) ? d : n; };

export function schemeSum(s) {
  return f(s.firma_pct) + f(s.mensualidades_pct) + f(s.escritura_pct);
}
export function schemeSumOk(s) {
  return Math.abs(schemeSum(s) - 100) <= 0.5;
}
export function appliedPrice(base, descuentoPct) {
  return Math.round(f(base) * (1 - f(descuentoPct) / 100));
}

function parseYM(v) {
  if (!v) return null;
  const s = String(v).slice(0, 10).replace(/\//g, '-').split('-');
  if (s[0] && s[0].length === 4) return { y: +s[0], m: +s[1] };
  if (s.length >= 3) return { y: +s[2], m: +s[1] };
  return null;
}
export function autoMonths(fIni, fEnt) {
  const a = parseYM(fIni), b = parseYM(fEnt);
  if (!a || !b) return null;
  return Math.max(1, (b.y - a.y) * 12 + (b.m - a.m));
}
export function resolveMonths(s, fIni, fEnt) {
  const ov = s.meses_override;
  if (ov !== null && ov !== undefined && ov !== '') {
    const m = parseInt(ov, 10);
    if (m >= 1) return m;
  }
  return autoMonths(fIni, fEnt);
}

export function breakdown(base, s, fIni, fEnt) {
  const b = f(base), desc = f(s.descuento_pct);
  const aplicado = Math.round(b * (1 - desc / 100));
  const firma = Math.round(aplicado * f(s.firma_pct) / 100);
  const mensTotal = Math.round(aplicado * f(s.mensualidades_pct) / 100);
  const escritura = aplicado - firma - mensTotal;     // absorbe redondeo
  const meses = resolveMonths(s, fIni, fEnt);
  const mensualidad = (meses && mensTotal) ? Math.round(mensTotal / meses) : 0;
  // En vivo: meses transcurridos/restantes según la fecha de hoy.
  let transcurridos = null, restantes = meses;
  if (meses && fIni) {
    const a = parseYM(fIni);
    if (a) {
      const now = new Date();
      const elapsed = (now.getFullYear() - a.y) * 12 + (now.getMonth() + 1 - a.m);
      transcurridos = Math.max(0, Math.min(meses, elapsed));
      restantes = meses - transcurridos;
    }
  }
  return {
    precio_base: Math.round(b), descuento_pct: desc, precio_aplicado: aplicado,
    ahorro: Math.round(b) - aplicado, apartado: Math.round(f(s.apartado_mxn)),
    firma_pct: f(s.firma_pct), firma,
    mensualidades_pct: f(s.mensualidades_pct), mensualidades_total: mensTotal,
    meses, mensualidad,
    meses_transcurridos: transcurridos, meses_restantes: restantes,
    mensualidades_pagadas: transcurridos ? transcurridos * mensualidad : 0,
    mensualidades_restantes_monto: (restantes && mensualidad) ? restantes * mensualidad : 0,
    escritura_pct: f(s.escritura_pct), escrituracion: escritura,
  };
}

export function discountForEnganche(schemes, eng) {
  const pts = [...new Set((schemes || []).map(s => `${f(s.firma_pct)}|${f(s.descuento_pct)}`))]
    .map(x => x.split('|').map(Number)).sort((a, b) => a[0] - b[0]);
  if (!pts.length) return 0;
  const e = Math.max(0, Math.min(100, f(eng)));
  if (e <= pts[0][0]) return pts[0][1];
  if (e >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if (x0 <= e && e <= x1) {
      if (x1 === x0) return y0;
      return Math.round((y0 + (e - x0) / (x1 - x0) * (y1 - y0)) * 100) / 100;
    }
  }
  return pts[pts.length - 1][1];
}

export function emptyScheme() {
  return {
    id: `esq_${Math.random().toString(36).slice(2, 8)}`, nombre: '',
    firma_pct: 20, mensualidades_pct: 10, escritura_pct: 70,
    descuento_pct: 0, apartado_mxn: 50000, meses_override: '',
  };
}
