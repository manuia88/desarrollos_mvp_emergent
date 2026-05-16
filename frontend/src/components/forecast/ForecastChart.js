/**
 * W5.3 Parte 1 Sub-C — ForecastChart embeddable.
 *
 * Modos:
 *   - `zone`: fetch /api/forecast-public/zone/{slug} · valores en índice DRPI
 *   - `property`: fetch /api/forecast-public/property?... · valores en MXN
 *
 * Composición: recharts AreaChart con CI95 sombreado + LineChart valor central
 * + tooltip formateado + badge narrative con delta_pct color-coded.
 */
import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip,
} from 'recharts';
import { fetchZoneForecast, fetchPropertyForecast } from '../../api/forecast';

function fmtMXN(n) {
  if (n == null) return '—';
  try { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n); } catch { return `$${n}`; }
}
function fmtNumber(n) {
  if (n == null) return '—';
  try { return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(n); } catch { return String(n); }
}

function deltaTone(pct) {
  if (pct == null) return { bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.30)', fg: '#a5b4fc' };
  if (pct > 5)   return { bg: 'rgba(163,230,53,0.10)', border: 'rgba(163,230,53,0.35)', fg: '#a3e635' };
  if (pct < -5)  return { bg: 'rgba(252,165,165,0.10)', border: 'rgba(252,165,165,0.35)', fg: '#fca5a5' };
  return { bg: 'rgba(240,235,224,0.05)', border: 'rgba(240,235,224,0.2)', fg: 'rgba(240,235,224,0.7)' };
}

function Skeleton() {
  return (
    <div
      data-testid="forecast-chart-skeleton"
      style={{
        height: 240,
        borderRadius: 16,
        background: 'linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.08), rgba(255,255,255,0.04))',
        backgroundSize: '200% 100%',
        animation: 'forecast-shimmer 1.4s linear infinite',
      }}
    />
  );
}

function ErrorState({ message }) {
  return (
    <div
      data-testid="forecast-chart-error"
      style={{
        padding: 16,
        borderRadius: 14,
        background: 'rgba(255,255,255,0.04)',
        border: '1px dashed rgba(255,255,255,0.15)',
        color: 'rgba(240,235,224,0.6)',
        fontFamily: 'DM Sans',
        fontSize: 12.5,
        textAlign: 'center',
      }}
    >
      {message}
    </div>
  );
}

function buildChartData(mode, payload) {
  if (!payload) return [];
  if (mode === 'zone') {
    const baseline = payload.baseline || 0;
    const data = [{ label: 'Hoy', months: 0, value: baseline, low: baseline, high: baseline }];
    for (const h of payload.horizons || []) {
      data.push({
        label: `${h.months}m`,
        months: h.months,
        value: h.value,
        low: h.low95,
        high: h.high95,
      });
    }
    return data;
  }
  // property
  const now = payload.avm_now || 0;
  const data = [{ label: 'Hoy', months: 0, value: now, low: payload.avm_low || now, high: payload.avm_high || now }];
  for (const h of payload.horizons || []) {
    data.push({
      label: `${h.months}m`,
      months: h.months,
      value: h.value,
      low: h.low95,
      high: h.high95,
    });
  }
  return data;
}

function CustomTooltip({ active, payload, mode }) {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;
  const fmt = mode === 'property' ? fmtMXN : fmtNumber;
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 12,
        background: 'rgba(6,8,15,0.96)',
        border: '1px solid rgba(99,102,241,0.4)',
        color: '#F0EBE0',
        fontFamily: 'DM Sans',
        fontSize: 12,
        minWidth: 180,
      }}
    >
      <div style={{ color: '#a5b4fc', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
        {point.label}
      </div>
      <div style={{ fontWeight: 700 }}>{fmt(point.value)}</div>
      {point.months > 0 && (
        <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.55)', marginTop: 2 }}>
          CI95: {fmt(point.low)} — {fmt(point.high)}
        </div>
      )}
    </div>
  );
}

function HeaderBadge({ narrative, delta }) {
  const tone = deltaTone(delta);
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
      <div>
        <div style={{ fontSize: 11, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 4 }}>
          Proyección multi-horizonte
        </div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'rgba(240,235,224,0.85)' }}>
          {narrative}
        </div>
      </div>
      {delta != null && (
        <span
          data-testid="forecast-delta-badge"
          style={{
            padding: '6px 12px',
            borderRadius: 9999,
            background: tone.bg,
            border: `1px solid ${tone.border}`,
            color: tone.fg,
            fontFamily: 'DM Sans',
            fontSize: 11.5,
            fontWeight: 700,
          }}
        >
          {delta >= 0 ? '+' : ''}{Number(delta).toFixed(1)}% / 12m
        </span>
      )}
    </div>
  );
}

export default function ForecastChart({ mode, slug, params }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setData(null);

    const promise = mode === 'zone'
      ? fetchZoneForecast(slug)
      : fetchPropertyForecast(params || {});

    promise
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(e); setLoading(false); } });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, slug, JSON.stringify(params || {})]);

  // Inyectar keyframes una sola vez
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const id = 'forecast-shimmer-kf';
    if (document.getElementById(id)) return;
    const s = document.createElement('style');
    s.id = id;
    s.textContent = '@keyframes forecast-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }';
    document.head.appendChild(s);
  }, []);

  const cardStyle = {
    padding: 20,
    borderRadius: 18,
    background: 'rgba(13,16,23,0.92)',
    backdropFilter: 'blur(24px)',
    border: '1px solid rgba(255,255,255,0.10)',
    marginBottom: 24,
  };

  if (loading) {
    return (
      <section data-testid="forecast-chart" aria-label="Proyección multi-horizonte" style={cardStyle}>
        <Skeleton />
      </section>
    );
  }

  if (error) {
    return (
      <section data-testid="forecast-chart" aria-label="Proyección no disponible" style={cardStyle}>
        <ErrorState message="Forecast no disponible para esta zona." />
      </section>
    );
  }

  if (!data) return null;

  const chartData = buildChartData(mode, data);
  const delta12 = (data.horizons || []).find(h => h.months === 12)?.delta_pct
                 ?? (data.horizons || []).slice(-1)[0]?.delta_pct;
  const yFmt = mode === 'property'
    ? (v) => `$${Math.round(v / 1000)}k`
    : (v) => Number(v).toFixed(0);

  return (
    <section data-testid="forecast-chart" aria-label="Proyección multi-horizonte" style={cardStyle}>
      <HeaderBadge narrative={data.narrative} delta={delta12} />

      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="fcArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#6366F1" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#EC4899" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="fcLine" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stopColor="#6366F1" />
                <stop offset="100%" stopColor="#EC4899" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="rgba(240,235,224,0.5)"
              tick={{ fontSize: 11, fontFamily: 'DM Sans' }}
              axisLine={{ stroke: 'rgba(255,255,255,0.10)' }}
              tickLine={false}
            />
            <YAxis
              stroke="rgba(240,235,224,0.5)"
              tick={{ fontSize: 11, fontFamily: 'DM Sans' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={yFmt}
            />
            <Tooltip content={<CustomTooltip mode={mode} />} cursor={{ stroke: 'rgba(165,180,252,0.4)', strokeDasharray: '3 3' }} />
            {/* CI95 banda */}
            <Area
              type="monotone"
              dataKey="high"
              stroke="none"
              fill="url(#fcArea)"
              activeDot={false}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="low"
              stroke="none"
              fill="rgba(6,8,15,0.92)"
              activeDot={false}
              isAnimationActive={false}
            />
            {/* Línea central */}
            <Line
              type="monotone"
              dataKey="value"
              stroke="url(#fcLine)"
              strokeWidth={2.5}
              dot={{ r: 4, fill: '#F0EBE0', stroke: '#6366F1', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: '#EC4899', stroke: '#F0EBE0', strokeWidth: 2 }}
              isAnimationActive
              animationDuration={700}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ marginTop: 10, fontSize: 10.5, color: 'rgba(240,235,224,0.4)', fontStyle: 'italic' }}>
        Proyección estadística ARIMA con intervalo de confianza al 95%. No constituye recomendación de inversión.
      </div>
    </section>
  );
}
