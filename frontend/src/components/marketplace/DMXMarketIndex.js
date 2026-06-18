// Fase 4 · Índice DMX de Mercado — el cubo anónimo como producto público (transparency
// index / data marketplace). Precio/m², absorción e inventario por colonia, sin exponer
// ningún proyecto. Público, sin auth. "DMX no opina, mide."
import React, { useEffect, useState } from 'react';
import { tc } from '../../lib/titleCase';

const API = process.env.REACT_APP_BACKEND_URL;
const fmt = (n) => (n ? `$${Math.round(n / 1000)}k` : '—');

export default function DMXMarketIndex() {
  const [d, setD] = useState(null);
  useEffect(() => {
    fetch(`${API}/api/public/market/index`)
      .then(r => (r.ok ? r.json() : null))
      .then(setD)
      .catch(() => setD(null));
  }, []);
  if (!d || !(d.index || []).length) return null;

  const maxP = Math.max(1, ...d.index.map(r => r.precio_m2 || 0));
  return (
    <section data-testid="dmx-market-index" style={{
      padding: 22, marginBottom: 40,
      background: 'linear-gradient(140deg, rgba(31,160,106,0.07), rgba(99,102,241,0.03))',
      border: '1px solid var(--border)', borderRadius: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <div className="eyebrow" style={{ margin: 0 }}>{tc('Índice DMX de Mercado · público')}</div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>{d.count} colonias · {d.fuente}</div>
      </div>
      <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(18px, 2.6vw, 26px)', letterSpacing: '-0.02em', color: 'var(--cream)', margin: '4px 0 14px' }}>
        {tc('Precio/m² y absorción por colonia')}
      </h2>

      {/* header */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 0.9fr 0.7fr', gap: 10, padding: '0 4px 8px', borderBottom: '1px solid var(--border)' }}>
        {['Colonia', 'Precio / m²', 'Absorción', 'Inv.'].map((h, i) => (
          <div key={i} style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--cream-3)', textAlign: i === 0 ? 'left' : 'right' }}>{h}</div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {d.index.slice(0, 12).map((r, i) => (
          <div key={i} data-testid={`mkt-index-${r.colonia}`} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 0.9fr 0.7fr', gap: 10, padding: '10px 4px', alignItems: 'center', borderBottom: '1px solid rgba(var(--cream-rgb),0.05)' }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700, color: 'var(--cream)', textTransform: 'capitalize' }}>{String(r.colonia).replace(/-/g, ' ')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
              <div style={{ flex: 1, maxWidth: 90, height: 6, borderRadius: 3, background: 'rgba(var(--cream-rgb),0.08)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${((r.precio_m2 || 0) / maxP) * 100}%`, background: 'var(--theme)', borderRadius: 3 }} />
              </div>
              <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 700, color: 'var(--cream)', minWidth: 44, textAlign: 'right' }}>{fmt(r.precio_m2)}</span>
            </div>
            <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', textAlign: 'right' }}>{r.absorcion_pct != null ? `${r.absorcion_pct}%` : '—'}</span>
            <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', textAlign: 'right' }}>{r.inventario ?? '—'}</span>
          </div>
        ))}
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 10 }}>{d.metodologia} · disponible vía API</div>
    </section>
  );
}
