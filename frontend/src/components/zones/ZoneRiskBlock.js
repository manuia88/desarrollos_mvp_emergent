// Riesgo NATURAL real de la zona (motor natural_risk_engine · Atlas de Riesgos CDMX): sísmico, inundación, hundimiento.
// El dato de seguridad más honesto para el comprador. Reusa /api/zona/{slug}/riesgo. Hide-if-empty (null sin Atlas).
import React, { useEffect, useState } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;
const GREEN = '#0E7A53'; const AMBER = '#C98A1A'; const ORANGE = '#D4711A'; const RED = '#D14343';
const SISMIC = { A: { l: 'Bajo', c: GREEN }, B: { l: 'Medio', c: AMBER }, C: { l: 'Alto', c: ORANGE }, D: { l: 'Muy alto', c: RED } };
const scaleLabel = (v, lo, hi) => (v == null ? null : v < lo ? { l: 'Bajo', c: GREEN } : v <= hi ? { l: 'Medio', c: AMBER } : { l: 'Alto', c: RED });

function Item({ icon, titulo, valor, eval: ev }) {
  if (!ev) return null;
  return (
    <div style={{ flex: '1 1 200px', background: '#fff', border: '1px solid rgba(16,18,28,0.08)', borderRadius: 14, padding: '16px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13.5, color: '#10121C' }}>{icon} {titulo}</span>
        <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: ev.c, background: `${ev.c}14`, border: `1px solid ${ev.c}44`, padding: '3px 11px', borderRadius: 9999 }}>{ev.l}</span>
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#8A8FA6', marginTop: 7 }}>{valor}</div>
    </div>
  );
}

export default function ZoneRiskBlock({ slug, name }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    let alive = true;
    if (!slug) return undefined;
    fetch(`${API}/api/zona/${encodeURIComponent(slug)}/riesgo`)
      .then((r) => r.json()).then((j) => { if (alive) setD(j && j.available ? j : null); })
      .catch(() => { if (alive) setD(null); });
    return () => { alive = false; };
  }, [slug]);

  if (!d) return null;   // hide-if-empty
  const sis = SISMIC[d.sismic_zone];
  const flood = scaleLabel(d.flood_pct, 10, 25);
  const sub = scaleLabel(d.subsidence_mm_year, 10, 30);
  if (!sis && !flood && !sub) return null;

  return (
    <section style={{ width: '100%', background: '#fff', padding: 'clamp(50px,7vw,82px) 0', borderTop: '1px solid rgba(16,18,28,0.06)' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '0 28px' }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 800, background: 'linear-gradient(90deg,#6366F1,#EC4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Seguridad honesta</div>
        <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(26px,3.6vw,40px)', letterSpacing: '-0.03em', color: '#10121C', margin: '8px 0 0', lineHeight: 1.06 }}>
          Riesgo natural de {name || 'la zona'}
        </h2>
        <p style={{ fontFamily: 'DM Sans', fontSize: 15.5, color: '#5B5F76', maxWidth: 620, margin: '12px 0 0', lineHeight: 1.6 }}>
          Lo que nadie te dice y tú sí mereces saber — del Atlas de Riesgos oficial de la CDMX.
        </p>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 22 }}>
          <Item icon="🌋" titulo="Sísmico" valor={`Zona ${d.sismic_zone}`} eval={sis} />
          <Item icon="🌊" titulo="Inundación" valor={`${d.flood_pct}% de riesgo`} eval={flood} />
          <Item icon="🏗️" titulo="Hundimiento" valor={`${d.subsidence_mm_year} mm por año`} eval={sub} />
        </div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: '#A2A6BC', marginTop: 14 }}>Fuente: {d.fuente || 'Atlas de Riesgos CDMX'}. Informativo, no sustituye un estudio de suelo.</div>
      </div>
    </section>
  );
}
