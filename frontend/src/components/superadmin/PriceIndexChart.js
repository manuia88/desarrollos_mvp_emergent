// W3.2 PriceIndexChart — SVG line chart for price index per zone (12 periods)
import React, { useEffect, useState, useCallback } from 'react';
import { getPriceIndex } from '../../api/superadminTransactionNetwork';

const TYPES = ['depto', 'casa', 'loft', 'town', 'PH'];
const PERIODS = [{ value: 'month', label: 'Mensual' }, { value: 'week', label: 'Semanal' }];

function fmtK(v) {
  if (v == null) return '—';
  return `$${(v / 1000).toFixed(0)}k/m²`;
}

function SparkArea({ data, keyY = 'median_price_per_m2' }) {
  if (!data || data.length < 2) return (
    <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', padding: 20, textAlign: 'center' }}>
      Sin historial disponible aún.
    </div>
  );
  const W = 400, H = 80;
  const vals = data.map(d => d[keyY] || 0);
  const min = Math.min(...vals);
  const max = Math.max(...vals) || 1;
  const range = max - min || 1;
  const pts = vals.map((v, i) => ({
    x: (i / (vals.length - 1)) * (W - 20) + 10,
    y: H - 12 - ((v - min) / range) * (H - 24),
  }));
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${H} L${pts[0].x},${H} Z`;

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }} data-testid="price-index-sparkline">
        <defs>
          <linearGradient id="pi_grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--theme)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--theme)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#pi_grad)" />
        <path d={linePath} fill="none" stroke="var(--theme)" strokeWidth="2" strokeLinecap="round" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3} fill="var(--theme)" opacity={0.8} />
            {i % Math.max(1, Math.floor(pts.length / 6)) === 0 && (
              <text x={p.x} y={H - 1} textAnchor="middle" fontSize="7"
                fill="rgba(240,235,224,0.35)" fontFamily="DM Mono, monospace">
                {data[i]?.computed_at?.slice(5, 10)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function PriceIndexChart({ zone_id }) {
  const [period, setPeriod] = useState('month');
  const [type, setType]     = useState('depto');
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!zone_id) return;
    setLoading(true);
    try {
      setData(await getPriceIndex(zone_id, { period, type }));
    } catch {}
    finally { setLoading(false); }
  }, [zone_id, period, type]);

  useEffect(() => { load(); }, [load]);

  const current = data?.current || {};
  const history = data?.history || [];

  return (
    <div data-testid="price-index-chart" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>
          Índice de precios
        </span>
        {zone_id && (
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>· {zone_id}</span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {PERIODS.map(p => (
            <button key={p.value}
              data-testid={`pi-period-${p.value}`}
              onClick={() => setPeriod(p.value)}
              style={{
                padding: '4px 10px', borderRadius: 9999, cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 11,
                background: period === p.value ? 'rgba(var(--theme-rgb),0.2)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${period === p.value ? 'rgba(var(--theme-rgb),0.5)' : 'rgba(255,255,255,0.08)'}`,
                color: period === p.value ? 'var(--theme)' : 'var(--cream-3)',
              }}>
              {p.label}
            </button>
          ))}
        </div>
        <select
          data-testid="pi-type-select"
          value={type}
          onChange={e => setType(e.target.value)}
          style={{
            padding: '4px 10px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)', color: 'var(--cream-2)',
            fontFamily: 'DM Sans', fontSize: 11, cursor: 'pointer',
          }}
        >
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {loading && <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>Calculando…</div>}

      {!loading && (
        <>
          {/* Current KPIs */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 120px', padding: '10px 12px', borderRadius: 10, background: 'rgba(var(--theme-rgb),0.08)', border: '1px solid rgba(var(--theme-rgb),0.2)' }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 9, color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', marginBottom: 3 }}>Mediana /m²</div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
                {fmtK(current.median_price_per_m2)}
              </div>
            </div>
            <div style={{ flex: '1 1 100px', padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 9, color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', marginBottom: 3 }}>IQR</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 14, color: 'var(--cream-2)' }}>
                {fmtK(current.iqr)}
              </div>
            </div>
            <div style={{ flex: '1 1 100px', padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 9, color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', marginBottom: 3 }}>Transacciones</div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)' }}>
                {current.transactions_count ?? '—'}
              </div>
            </div>
            {current.median_discount_pct != null && (
              <div style={{ flex: '1 1 100px', padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 9, color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', marginBottom: 3 }}>Descuento med.</div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 14, color: current.median_discount_pct < 0 ? '#fca5a5' : '#86efac' }}>
                  {current.median_discount_pct > 0 ? '+' : ''}{current.median_discount_pct?.toFixed(1)}%
                </div>
              </div>
            )}
          </div>

          {/* Chart */}
          <SparkArea data={history} keyY="median_price_per_m2" />

          {history.length > 0 && (
            <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(240,235,224,0.3)' }}>
              {history.length} períodos · últimos datos: {history[history.length - 1]?.computed_at?.slice(0, 10)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
