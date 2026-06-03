// Fase 3.4 · Lente del comprador — "Por qué vale" (inteligencia de mercado pública).
// Muestra qué atributos suben el valor en el mercado (cubo anónimo) para que el
// comprador entienda el precio ("zero fear buying"). Público, sin auth.
import React, { useEffect, useState } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function MarketValueCard({ colonia }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    let alive = true;
    const fetchRanker = (qs) => fetch(`${API}/api/public/market/amenity-ranker${qs}`).then(r => (r.ok ? r.json() : null));
    (async () => {
      // 1) acotado a la colonia; 2) fallback al mercado CDMX si sale vacío (muestra chica/sin varianza)
      let r = colonia ? await fetchRanker(`?colonia=${encodeURIComponent(colonia)}`).catch(() => null) : null;
      const hasPos = r && (r.amenity_ranker || []).some(a => a.significativo && a.impacto_pct_precio_m2 > 0);
      if (!hasPos) r = await fetchRanker('').catch(() => null);
      if (alive) setD(r);
    })();
    return () => { alive = false; };
  }, [colonia]);
  if (!d) return null;
  const pos = (d.amenity_ranker || []).filter(a => a.significativo && a.impacto_pct_precio_m2 > 0);
  if (!pos.length) return null;

  return (
    <section data-testid="dev-market-value" style={{
      marginTop: 20, padding: '22px 24px',
      background: 'linear-gradient(180deg, rgba(31,160,106,0.06), rgba(99,102,241,0.03))',
      border: '1px solid var(--border)', borderRadius: 16,
    }}>
      <div className="eyebrow" style={{ margin: 0, letterSpacing: '0.14em' }}>Por qué vale · inteligencia de mercado</div>
      <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(18px, 2.4vw, 24px)', letterSpacing: '-0.02em', color: 'var(--cream)', margin: '4px 0 4px' }}>
        Lo que sube el valor en este mercado
      </h2>
      <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', marginBottom: 14, lineHeight: 1.5 }}>
        DMX midió <strong style={{ color: 'var(--cream)' }}>{d.sample_size} unidades</strong> reales (R² {d.r_squared}). Estos atributos suman al precio/m² — <strong style={{ color: 'var(--cream)' }}>no es opinión, es dato.</strong>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {pos.map((a, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 9999,
            background: 'rgba(31,160,106,0.10)', border: '1px solid rgba(31,160,106,0.28)',
          }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)', fontWeight: 600 }}>{a.atributo}</span>
            <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: 'var(--ok, #1FA06A)' }}>+{a.impacto_pct_precio_m2}%</span>
          </div>
        ))}
      </div>
    </section>
  );
}
