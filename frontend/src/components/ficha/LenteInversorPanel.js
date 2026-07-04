/**
 * LenteInversorPanel — surfacea el motor `composites/inversor` (moat construido y ANTES sin UI): las métricas
 * compuestas de INVERSOR de la colonia (cap rate ajustado a riesgo, spread vs CETES, plusvalía×demanda, liquidez,
 * Sharpe de la zona, yield corto vs largo). Datos reales por colonia; join con el catálogo (n → nombre + qué descubre).
 */
import React, { useEffect, useMemo, useState } from 'react';
import ProbabilityBadge from '../shared/ProbabilityBadge';   // W5.19 · prob. pública de plusvalía de la zona (drpi_up)

const API = process.env.REACT_APP_BACKEND_URL;
// métricas curadas del lente inversor (n del catálogo) + cómo formatear el valor
const METRICS = [
  { n: '30', pct: true }, { n: '24', pct: true }, { n: '28', pct: true },
  { n: '29', pct: false }, { n: '23', pct: false }, { n: '26', pct: true },
];

export default function LenteInversorPanel({ coloniaId, coloniaName }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!coloniaId) return undefined;
    let alive = true;
    fetch(`${API}/api/composites/inversor?colonia=${encodeURIComponent(coloniaId)}`)
      .then((r) => r.json())
      .then((d) => { if (alive && d && d.por_zona) setData(d); })
      .catch(() => { /* fail-open */ });
    return () => { alive = false; };
  }, [coloniaId]);

  const cat = useMemo(() => Object.fromEntries((data?.catalogo || []).map((c) => [String(c.n), c])), [data]);
  const slug = String(coloniaId || '').toLowerCase();
  const zona = useMemo(() => {
    const zs = data?.por_zona || [];
    return zs.find((z) => String(z.zona || '').toLowerCase() === slug) || zs[0] || null;
  }, [data, slug]);

  if (!zona || !zona.valores) return null;
  const rows = METRICS
    .map((m) => ({ ...m, def: cat[m.n], val: zona.valores[m.n] }))
    .filter((m) => m.def && typeof m.val === 'number');
  if (!rows.length) return null;
  const fmt = (v, pct) => (pct ? `${(+v).toFixed(1)}%` : (+v).toFixed(2));

  return (
    <div style={{ background: '#fff', border: '1px solid #ECECEC', borderRadius: 16, boxShadow: '0 6px 20px rgba(16,18,28,.05)', padding: '20px 22px', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: '#1E2230' }}>🎯 Lente inversor · {coloniaName || zona.nombre}</div>
        {zona.tier && <span style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 11, color: '#6D4AFF', background: 'rgba(109,74,255,0.1)', borderRadius: 9999, padding: '3px 11px' }}>{zona.tier}</span>}
        {/* Prob. pública de que la plusvalía de la zona suba (forecast ARIMA W5.3). Se auto-oculta si no hay datos. */}
        {coloniaId && <ProbabilityBadge type="drpi_up" entity_id={String(coloniaId)} params={{ months: 3 }} format="medium" />}
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: '#5B5F76', marginTop: 4, lineHeight: 1.5 }}>
        Señales de inversión de la zona — comportamiento del comprador × mercado (motores fusionados). Datos reales de la colonia.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginTop: 14 }}>
        {rows.map((m) => (
          <div key={m.n} style={{ background: '#fafafb', border: '1px solid #ECECEC', borderRadius: 12, padding: '13px 14px' }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: '#5A5F6E', fontWeight: 700, lineHeight: 1.25 }}>{m.def.nombre}</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: '#6D4AFF', marginTop: 5, letterSpacing: '-0.01em' }}>{fmt(m.val, m.pct)}</div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: '#9AA0AE', marginTop: 4, lineHeight: 1.4 }}>{m.def.descubre}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
