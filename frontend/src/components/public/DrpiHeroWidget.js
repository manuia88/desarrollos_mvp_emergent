// W3.3 ZZ.3 — DrpiHeroWidget
// Mounted in landing pages (Home / Inteligencia) to surface DRPI nationally
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, ArrowRight } from 'lucide-react';
import { fetchNational, fetchSnapshot } from '../../api/drpi';

const TOP_ZONES = [
  { id: 'polanco',   name: 'Polanco' },
  { id: 'roma',      name: 'Roma' },
  { id: 'lomas',     name: 'Lomas' },
  { id: 'condesa',   name: 'Condesa' },
  { id: 'del_valle', name: 'Del Valle' },
  { id: 'coyoacan',  name: 'Coyoacán' },
];

function fmtPct(v) {
  if (v == null) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function periodNow() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function periodLabel(period) {
  if (!period) return '—';
  const [y, m] = period.split('-').map(Number);
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${meses[m - 1] || ''} ${y}`;
}

export default function DrpiHeroWidget() {
  const [national, setNational] = useState(null);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const period = periodNow();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const nat = await fetchNational(period).catch(() => null);
        const snaps = await Promise.all(TOP_ZONES.map(z =>
          fetchSnapshot(z.id, { tier: 'colonia', period })
            .then(s => ({ ...z, snap: s.snapshot }))
            .catch(() => ({ ...z, snap: { available: false } }))
        ));
        if (!alive) return;
        setNational(nat);
        setZones(snaps);
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [period]);

  return (
    <section
      data-testid="drpi-hero-widget"
      style={{
        margin: '40px auto', maxWidth: 1200, padding: '0 24px',
      }}
    >
      <div style={{
        background: 'rgba(13,16,23,0.55)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 22,
        padding: 'clamp(20px, 3vw, 36px)',
        backdropFilter: 'blur(20px)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(circle at 0% 0%, rgba(var(--theme-rgb),0.10), transparent 60%), radial-gradient(circle at 100% 100%, rgba(var(--theme-rgb),0.08), transparent 60%)',
        }} />

        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          <div>
            <div style={{
              fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
              textTransform: 'uppercase',
              backgroundImage: 'linear-gradient(90deg, var(--theme), var(--theme-3))',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              DMX Residential Price Index · DRPI
            </div>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(22px, 2.6vw, 32px)', color: 'var(--cream)', margin: '8px 0 4px', letterSpacing: '-0.02em' }}>
              DRPI {periodLabel(period)}
            </h2>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', margin: 0, maxWidth: 640 }}>
              Índice mensual basado en regresión hedónica sobre cierres verificados. Sigue las
              colonias clave de CDMX. Metodología abierta y reproducible.
            </p>
          </div>
          <Link
            to="/methodology" data-testid="drpi-hero-methodology-link"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '10px 18px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)',
              color: 'var(--cream)', textDecoration: 'none',
              fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
            }}
          >
            Metodología <ArrowRight size={14} />
          </Link>
        </div>

        {loading ? (
          <div style={{ fontFamily: 'DM Sans', color: 'var(--cream-3)', fontSize: 13 }}>Cargando…</div>
        ) : (
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <div data-testid="drpi-national-card" style={{
              background: 'rgba(var(--theme-rgb),0.10)',
              border: '1px solid rgba(var(--theme-rgb),0.32)',
              borderRadius: 14, padding: 14,
            }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Nacional CDMX
              </div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', marginTop: 6 }}>
                {national?.available ? national.national_index?.toFixed(2) : '—'}
              </div>
              <div style={{
                fontFamily: 'DM Sans', fontSize: 12, color: 'var(--theme)',
                display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4,
              }}>
                <TrendingUp size={12} /> {fmtPct(national?.national_delta_pct)}
              </div>
            </div>
            {zones.map(z => (
              <div
                key={z.id}
                data-testid={`drpi-hero-zone-${z.id}`}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: 14, padding: 14,
                }}
              >
                <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {z.name}
                </div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', marginTop: 6 }}>
                  {z.snap?.available ? Number(z.snap.index_value).toFixed(2) : '—'}
                </div>
                <div style={{
                  fontFamily: 'DM Sans', fontSize: 12,
                  color: (z.snap?.delta_pct ?? 0) > 0 ? '#86efac' : '#fca5a5',
                  marginTop: 4,
                }}>
                  {fmtPct(z.snap?.delta_pct)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
