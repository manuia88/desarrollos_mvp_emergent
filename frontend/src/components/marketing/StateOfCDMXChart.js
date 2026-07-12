// W4.16 — StateOfCDMXChart · horizontal bars + bar chart helpers using recharts.
import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell,
} from 'recharts';

const PALETTE = {
  good: '#22c55e',
  neutral: '#F59E0B',
  bad: '#EF4444',
  indigo: '#6366F1',
  rose: '#EC4899',
};

export function HorizontalBars({ data, dataKey, labelKey = 'name', height = 380, valueFormatter }) {
  const fmt = valueFormatter || ((v) => v);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 80, right: 30, top: 10, bottom: 10 }}
      >
        <CartesianGrid stroke="#ECECEC" strokeDasharray="3 3" />
        <XAxis type="number" stroke="#6B7385" tick={{ fontSize: 11, fill: '#6B7385' }} />
        <YAxis dataKey={labelKey} type="category" stroke="#6B7385" tick={{ fontSize: 11, fill: '#6B7385' }} width={130} />
        <Tooltip
          contentStyle={{
            background: '#FFFFFF',
            border: '1px solid #E6E8EE',
            borderRadius: 10,
            color: '#1E2230',
            fontFamily: 'DM Sans', fontSize: 12,
          }}
          formatter={(v) => [fmt(v), '']}
        />
        <Bar dataKey={dataKey} fill="url(#hbarGradient)" radius={[0, 8, 8, 0]} />
        <defs>
          <linearGradient id="hbarGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={PALETTE.indigo} />
            <stop offset="100%" stopColor={PALETTE.rose} />
          </linearGradient>
        </defs>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function VelocityLineChart({ data, height = 320 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: 12, right: 24, top: 10, bottom: 10 }}>
        <CartesianGrid stroke="#ECECEC" strokeDasharray="3 3" />
        <XAxis dataKey="categoria" stroke="#6B7385" tick={{ fontSize: 11, fill: '#6B7385' }} />
        <YAxis stroke="#6B7385" tick={{ fontSize: 11, fill: '#6B7385' }} label={{ value: 'Meses', angle: -90, position: 'insideLeft', fill: '#6B7385', fontSize: 11 }} />
        <Tooltip
          contentStyle={{
            background: '#FFFFFF',
            border: '1px solid #E6E8EE',
            borderRadius: 10,
            color: '#1E2230',
            fontFamily: 'DM Sans', fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontFamily: 'DM Sans', fontSize: 11, color: '#6B7385' }} />
        <Line type="monotone" dataKey="meses" stroke={PALETTE.rose} strokeWidth={3} dot={{ r: 5, fill: PALETTE.indigo }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DemandSupplyBars({ data, height = 380 }) {
  // Color by gap_score

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 80, right: 30, top: 10, bottom: 10 }}>
        <CartesianGrid stroke="#ECECEC" strokeDasharray="3 3" />
        <XAxis type="number" stroke="#6B7385" tick={{ fontSize: 11, fill: '#6B7385' }} />
        <YAxis dataKey="name" type="category" stroke="#6B7385" tick={{ fontSize: 11, fill: '#6B7385' }} width={130} />
        <Tooltip
          contentStyle={{
            background: '#FFFFFF',
            border: '1px solid #E6E8EE',
            borderRadius: 10,
            color: '#1E2230',
            fontFamily: 'DM Sans', fontSize: 12,
          }}
        />
        <Bar dataKey="gap_score" radius={[0, 8, 8, 0]}>
          {data.map((d, i) => {
            // Escala del motor: índice 0-100 centrado en 50 (>65 demanda alta · >50 equilibrado).
            const fill = d.gap_score > 65 ? PALETTE.good
                       : d.gap_score > 50 ? PALETTE.neutral
                       : PALETTE.bad;
            return <Cell key={i} fill={fill} />;
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

