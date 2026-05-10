// W4.14 — CashFlowChart · gráfico de flujo de caja mes a mes (recharts)
import React, { useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';

const COLORS = {
  conservador: '#6B7280',
  base: '#6366F1',
  optimista: '#10B981',
};

function fmt(n) {
  if (n == null) return '—';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${Math.round(n)}`;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(13,16,23,0.98)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12,
    }}>
      <div style={{ color: 'var(--cream-3)', marginBottom: 6, fontFamily: 'DM Sans' }}>Mes {label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, fontFamily: 'DM Sans', fontWeight: 600, marginBottom: 3 }}>
          {p.name}: {fmt(p.value)}
        </div>
      ))}
    </div>
  );
};

export default function CashFlowChart({ conservador, base, optimista, metric = 'valor_propiedad' }) {
  const data = useMemo(() => {
    const len = Math.max(
      (conservador || []).length,
      (base || []).length,
      (optimista || []).length,
    );
    return Array.from({ length: len }, (_, i) => ({
      mes: i + 1,
      conservador: conservador?.[i]?.[metric],
      base: base?.[i]?.[metric],
      optimista: optimista?.[i]?.[metric],
    }));
  }, [conservador, base, optimista, metric]);

  if (!data.length) return null;

  return (
    <div
      data-testid="cashflow-chart"
      style={{
        background: 'rgba(13,16,23,0.85)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12, padding: '16px 4px 8px',
      }}
    >
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="mes"
            tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'DM Sans' }}
            axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
            tickLine={false}
            label={{ value: 'Meses', position: 'insideBottom', offset: -2, fill: '#6b7280', fontSize: 10 }}
          />
          <YAxis
            tickFormatter={fmt}
            tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'DM Sans' }}
            axisLine={false}
            tickLine={false}
            width={60}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontFamily: 'DM Sans', fontSize: 11, paddingTop: 8 }}
            formatter={(name) => ({ conservador: 'Conservador', base: 'Base', optimista: 'Optimista' }[name] || name)}
          />
          <Line type="monotone" dataKey="conservador" stroke={COLORS.conservador} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
          <Line type="monotone" dataKey="base" stroke={COLORS.base} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="optimista" stroke={COLORS.optimista} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
