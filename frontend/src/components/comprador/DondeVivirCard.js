// "¿Dónde vivirías feliz?" — el lente ESPACIAL del comprador (cuña brújula). Rankea colonias por calidad de vida + tu
// presupuesto + afinidad con las zonas que te gustan. Reusa /api/buyer/donde-vivir (visitor_taste + db.colonias).
// Hide-if-empty. Es el espejo de comprador de la tarjeta "¿dónde construir?" del founder.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { visitorId } from '../../lib/buyerSignal';
import { tc } from '../../lib/titleCase';

const API = process.env.REACT_APP_BACKEND_URL;
const HEAD = "'Outfit',sans-serif";

export default function DondeVivirCard() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/buyer/donde-vivir?visitor_id=${encodeURIComponent(visitorId())}&limit=8`)
      .then((r) => r.json()).then((d) => { if (alive) setData(d); }).catch(() => { if (alive) setData({ colonias: [] }); });
    return () => { alive = false; };
  }, []);

  const cols = data ? (data.colonias || []) : null;
  if (cols && cols.length === 0) return null;

  return (
    <section data-testid="donde-vivir" style={{ marginTop: 26 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 18, color: 'var(--cream)', margin: 0, letterSpacing: '-0.02em' }}>¿Dónde vivirías feliz?</h2>
        <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>
          {data?.basis === 'gusto' ? 'según tu gusto y presupuesto'
            : data?.basis === 'coldstart' ? 'según lo que buscaste'
              : 'mejor calidad de vida — se afina conforme exploras'}
        </span>
      </div>
      {!cols ? (
        <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', padding: 10 }}>Buscando tu zona…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {cols.map((c) => (
            <Link key={c.id} to={`/zona/${c.id}`} data-testid={`donde-${c.id}`} className="dmx-card" style={{
              textDecoration: 'none', padding: '14px 16px', borderRadius: 14, background: 'var(--surface-card)',
              border: '1px solid var(--card-border)', display: 'block',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>{tc(c.nombre || c.id)}</span>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 700, color: 'var(--theme, #6D4AFF)' }}>{c.score}</span>
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 2 }}>{tc(c.alcaldia || '')}{c.tier ? ` · ${c.tier}` : ''}</div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', marginTop: 8, lineHeight: 1.45 }}>{c.por_que}</div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
