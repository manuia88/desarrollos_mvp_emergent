/**
 * RiesgosHonestos — Acto 7 (risk-reversal Hormozi): le decimos al comprador lo que NO es perfecto, con dato REAL y lectura
 * balanceada (verde/ámbar/rojo). La transparencia construye confianza. Fuentes reales: Atlas de Riesgos CDMX (sísmico/PML +
 * inundación + hundimiento, vía /api/inversion-v4/zona-contexto) + estado de preventa del dev + absorción de la zona.
 * Sin inventar: si no hay dato para un factor, ese factor no aparece.
 */
import React, { useEffect, useState } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;
const TONE = {
  green: { fg: '#059669', bg: 'rgba(16,185,129,0.07)', bd: 'rgba(16,185,129,0.22)' },
  amber: { fg: '#B45309', bg: 'rgba(245,158,11,0.08)', bd: 'rgba(245,158,11,0.25)' },
  red: { fg: '#DC2626', bg: 'rgba(220,38,38,0.07)', bd: 'rgba(220,38,38,0.22)' },
};

export default function RiesgosHonestos({ dev }) {
  const [ctx, setCtx] = useState(null);
  useEffect(() => {
    const z = dev.zone_id || dev.colonia_id || dev.colonia;
    if (!z) return undefined;
    let alive = true;
    fetch(`${API}/api/inversion-v4/zona-contexto?zone_id=${encodeURIComponent(z)}`).then((r) => r.json()).then((d) => { if (alive) setCtx(d); }).catch(() => {});
    return () => { alive = false; };
  }, [dev.zone_id, dev.colonia_id, dev.colonia]);

  const factores = [];

  // 1 · Preventa → esperas a la entrega (real: stage + delivery_estimate del dev)
  if (dev.stage === 'preventa' && dev.delivery_estimate) {
    factores.push({ icon: '🏗️', tone: 'amber', t: 'Es preventa', d: `Entregan ~${dev.delivery_estimate}. Hasta entonces no puedes vivir ni rentar — a cambio, entras al precio más bajo.` });
  }

  const r = ctx && ctx.riesgo;
  const pml = r && r.pml;
  // 2 · Sísmico (Atlas de Riesgos CDMX · PML)
  if (pml && pml.sismic_zone) {
    const z = pml.sismic_zone;
    const tone = (z === 'A' || z === 'B') ? 'green' : z === 'C' ? 'amber' : 'red';
    factores.push({
      icon: '🌐', tone, t: `Zona sísmica ${z}`,
      d: tone === 'green'
        ? `Suelo de los más firmes de CDMX. En un sismo fuerte la pérdida esperada es baja (~${pml.sel_pct}% del valor).`
        : `En un sismo fuerte la pérdida esperada ronda ${pml.sel_pct}% del valor (Atlas de Riesgos CDMX). Pide el dictamen estructural del edificio.`,
    });
  }
  // 3 · Inundación
  if (r && r.flood_risk != null) {
    const f = Math.round(r.flood_risk);
    const tone = f < 15 ? 'green' : f < 30 ? 'amber' : 'red';
    factores.push({ icon: '💧', tone, t: 'Inundación', d: tone === 'green' ? `Riesgo bajo (${f}%).` : `Riesgo ${f}% — pregunta por drenaje y nivel de planta baja.` });
  }
  // 4 · Oferta / absorción de la zona
  const ab = ctx && ctx.absorcion;
  if (ab && ab.meses_para_agotar) {
    const m = ab.meses_para_agotar;
    const tone = m < 18 ? 'green' : m < 36 ? 'amber' : 'red';
    factores.push({
      icon: '📦', tone, t: 'Oferta en la zona',
      d: `${ab.n_proyectos ? `${ab.n_proyectos} ${ab.n_proyectos === 1 ? 'desarrollo compitiendo' : 'desarrollos compitiendo'} · ` : ''}~${m} ${m === 1 ? 'mes' : 'meses'} para que se agote la oferta actual. ${tone === 'green' ? 'Se vende rápido.' : 'Hay competencia — tienes margen para negociar.'}`,
    });
  }

  if (!factores.length) return null;

  return (
    <section data-testid="riesgos-honestos" style={{ marginTop: 24, borderRadius: 20, border: '1px solid var(--card-border, var(--border))', background: 'var(--surface-card)', padding: 'clamp(18px,2.4vw,26px)' }}>
      <div className="eyebrow" style={{ color: 'var(--theme)' }}>Sin letras chiquitas</div>
      <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(20px,2.6vw,28px)', letterSpacing: '-0.02em', color: 'var(--cream)', margin: '4px 0 6px' }}>Lo que debes saber antes de comprar</h2>
      <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', margin: '0 0 18px', maxWidth: 560 }}>No te ocultamos nada. Esto es lo que cualquiera debería revisar — con dato real, no opinión.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 12 }}>
        {factores.map((f, i) => {
          const tn = TONE[f.tone];
          return (
            <div key={i} style={{ padding: '14px 16px', borderRadius: 14, background: tn.bg, border: `1px solid ${tn.bd}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 16 }}>{f.icon}</span>
                <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: tn.fg }}>{f.t}</span>
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5 }}>{f.d}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
