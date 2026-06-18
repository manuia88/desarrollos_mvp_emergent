// B2.4 · Plusvalía pública — % desde lanzamiento + histórico de precios embebido.
// El histórico viene dentro de GET /api/developments/{id} (dev.price_history) → dato público.
// NO existe un endpoint público dedicado de price-history (ver reporte); usamos lo embebido.
// Fail-open: sin % ni histórico, no renderiza nada.
import React from 'react';
import { tc } from '../../lib/titleCase';

const mxn = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
};

// Sparkline SVG sencilla a partir de los puntos del histórico.
function Sparkline({ points, w = 520, h = 90 }) {
  const vals = points.map((p) => Number(p.price)).filter(Number.isFinite);
  if (vals.length < 2) return null;
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const n = vals.length;
  const x = (i) => (i / (n - 1)) * (w - 8) + 4;
  const y = (v) => h - 8 - ((v - min) / span) * (h - 24);
  const line = vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(n - 1).toFixed(1)} ${h} L ${x(0).toFixed(1)} ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" data-testid="plusvalia-sparkline">
      <defs>
        <linearGradient id="plus-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(34,197,94,0.30)" />
          <stop offset="100%" stopColor="rgba(34,197,94,0)" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#plus-fill)" />
      <path d={line} fill="none" stroke="#22c55e" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {vals.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill="#22c55e" />)}
    </svg>
  );
}

export default function PlusvaliaCard({ plusvaliaPct, priceHistory }) {
  const pct = Number(plusvaliaPct);
  const hasPct = Number.isFinite(pct) && pct !== 0;
  const history = Array.isArray(priceHistory) ? priceHistory.filter((p) => p && Number.isFinite(Number(p.price))) : [];
  const hasHistory = history.length >= 2;
  if (!hasPct && !hasHistory) return null;

  return (
    <section data-testid="plusvalia-card" style={{
      marginTop: 20, padding: '22px 24px', borderRadius: 16,
      background: 'linear-gradient(180deg, rgba(34,197,94,0.06), rgba(34,197,94,0.02))',
      border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)', margin: 0 }}>{tc('Plusvalía desde el lanzamiento')}</h3>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', marginTop: 4 }}>
            Cómo se ha movido el precio de este desarrollo.
          </div>
        </div>
        {hasPct && (
          <div data-testid="plusvalia-pct" style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 34, color: pct > 0 ? '#86efac' : 'var(--cream)', lineHeight: 1 }}>
              {pct > 0 ? '+' : ''}{pct}%
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>desde el lanzamiento</div>
          </div>
        )}
      </div>

      {hasHistory && (
        <>
          <Sparkline points={history} />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {history.map((p, i) => (
              <div key={i} style={{ textAlign: i === 0 ? 'left' : i === history.length - 1 ? 'right' : 'center', flex: '1 1 0' }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>{mxn(p.price)}</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 2 }}>{p.date}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
