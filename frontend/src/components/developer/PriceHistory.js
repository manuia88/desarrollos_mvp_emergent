/**
 * PriceHistory — Historial de precios / plusvalía (curva de crecimiento desde el lanzamiento).
 * Primer ladrillo del dato-moat: serie real (price_events) con fallback honesto al seed.
 * Cierra el círculo: captura → curva → % desde lanzamiento → alimenta AVM/forecast.
 */
import React, { useEffect, useState } from 'react';
import { getPriceHistory } from '../../api/developer';
import { fmtMXN, fmtFull, grid, Block, Stat } from './cockpitUI';

function AreaChart({ series }) {
  if (!series || series.length < 2) return null;
  const W = 640, H = 150, pad = 28;
  const idx = series.map(s => s.index ?? 100);
  const min = Math.min(...idx, 100), max = Math.max(...idx);
  const rng = (max - min) || 1;
  const x = (i) => pad + i * (W - 2 * pad) / (series.length - 1);
  const y = (v) => H - pad - ((v - min) / rng) * (H - 2 * pad);
  const line = series.map((s, i) => `${x(i)},${y(s.index ?? 100)}`).join(' ');
  const area = `M${x(0)},${H - pad} L${line.split(' ').join(' L')} L${x(series.length - 1)},${H - pad} Z`;
  const fmtMonth = (p) => {
    const [yy, mm] = p.split('-');
    return `${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][+mm - 1]} ${yy.slice(2)}`;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id="phArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(109,74,255,0.22)" />
          <stop offset="1" stopColor="rgba(109,74,255,0.02)" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#phArea)" />
      <polyline points={line} fill="none" stroke="var(--theme)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {series.map((s, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(s.index ?? 100)} r="3.5" fill="#fff" stroke="var(--theme)" strokeWidth="2" />
          <text x={x(i)} y={H - 9} textAnchor="middle" fontSize="10" fill="var(--cream-3)" fontFamily="DM Sans">{fmtMonth(s.period)}</text>
          <text x={x(i)} y={y(s.index ?? 100) - 9} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="var(--cream-2)" fontFamily="DM Sans">{fmtMXN(s.price)}</text>
        </g>
      ))}
    </svg>
  );
}

export default function PriceHistory({ slug }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    setD(null); setErr(false);
    getPriceHistory(slug).then(r => { if (alive) setD(r); }).catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [slug]);

  if (err) return null;
  if (!d) return <div style={{ fontSize: 12.5, color: 'var(--cream-3)', padding: '8px 0' }}>Cargando historial de precios…</div>;

  const real = d.source === 'eventos_reales';
  const since = d.since_launch_pct;
  const protos = d.by_prototype || [];

  return (
    <div data-testid="price-history" style={{ marginBottom: 22 }}>
      <Block title="Historial de precios" hint="cuánto se ha apreciado desde el lanzamiento">
        <div className="dmx-card" style={{ background: '#fff', padding: '16px 16px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 8, padding: '0 4px' }}>
            <span style={{ fontFamily: 'Outfit,sans-serif', fontSize: 30, fontWeight: 800, color: '#15803d', letterSpacing: '-.02em' }}>
              {since != null ? `+${since}%` : '—'}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--cream-2)', fontWeight: 600 }}>
              desde el lanzamiento{d.months_span ? ` (${d.months_span} meses)` : ''}{d.annualized_pct != null ? ` · ${d.annualized_pct}%/año` : ''}
            </span>
          </div>
          <AreaChart series={d.series} />
          {!real && <div style={{ fontSize: 10, color: 'var(--cream-3)', fontStyle: 'italic', textAlign: 'center', marginTop: 4 }}>○ estimado desde el lanzamiento · se afina con cada cambio de precio que registres</div>}
        </div>
      </Block>

      <Block title="Precio por prototipo" hint="punto de partida de cada tipo hoy">
        <div style={grid(190)}>
          {protos.map((p) => (
            <Stat key={p.prototype} label={`Prototipo ${p.prototype}`} value={fmtMXN(p.desde)} tone="flat"
              framing={`${p.pm2 ? `${fmtFull(p.pm2)}/m² · ` : ''}${p.units} unidad${p.units !== 1 ? 'es' : ''}`} />
          ))}
        </div>
      </Block>
    </div>
  );
}
