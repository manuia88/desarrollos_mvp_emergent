// W2.3 SA4 — ModelMixChart (SVG donut, no nivo deps)
import React from 'react';

const COLORS = {
  haiku: '#4ADE80',
  sonnet: '#818CF8',
  other: 'rgba(240,235,224,0.40)',
};

function fmtMxn(v) {
  if (v == null) return '—';
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

export default function ModelMixChart({ split, total, items = [] }) {
  // split: {haiku:{mxn,calls}, sonnet:{...}, other:{...}}
  const h = split?.haiku?.mxn || 0;
  const s = split?.sonnet?.mxn || 0;
  const o = split?.other?.mxn || 0;
  const tot = h + s + o || 1;

  // Donut math
  const radius = 48;
  const stroke = 14;
  const circ = 2 * Math.PI * radius;
  const slices = [
    { key: 'haiku', mxn: h, color: COLORS.haiku, label: 'Haiku' },
    { key: 'sonnet', mxn: s, color: COLORS.sonnet, label: 'Sonnet' },
    { key: 'other', mxn: o, color: COLORS.other, label: 'Otros' },
  ];

  let offset = 0;
  return (
    <div data-testid="model-mix-chart" style={{
      padding: '14px 16px', borderRadius: 12,
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        Mezcla de modelos
      </div>
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 130, height: 130 }}>
          <svg width="130" height="130" viewBox="0 0 130 130">
            <circle cx="65" cy="65" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
            {slices.map(sl => {
              const len = (sl.mxn / tot) * circ;
              const dasharray = `${len} ${circ}`;
              const el = (
                <circle key={sl.key} cx="65" cy="65" r={radius} fill="none"
                  stroke={sl.color} strokeWidth={stroke}
                  strokeDasharray={dasharray}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 65 65)" strokeLinecap="butt" />
              );
              offset += len;
              return el;
            })}
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 9, color: 'rgba(240,235,224,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Total</span>
            <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)' }}>{fmtMxn(total ?? tot)}</span>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 140, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {slices.map(sl => {
            const pct = tot ? Math.round((sl.mxn / tot) * 100) : 0;
            const calls = split?.[sl.key]?.calls || 0;
            return (
              <div key={sl.key} data-testid={`mix-row-${sl.key}`}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 9px', borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: sl.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream)', fontWeight: 600 }}>
                  {sl.label}
                </span>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240,235,224,0.65)' }}>
                  {fmtMxn(sl.mxn)} · {pct}%
                </span>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'rgba(240,235,224,0.40)', minWidth: 50, textAlign: 'right' }}>
                  {calls} calls
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {/* Detail table */}
      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 80px', gap: 8, padding: '0 8px', fontFamily: 'DM Sans', fontSize: 9.5, color: 'rgba(240,235,224,0.40)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            <span>Modelo</span><span style={{ textAlign: 'right' }}>Calls</span><span style={{ textAlign: 'right' }}>Total</span><span style={{ textAlign: 'right' }}>Avg/call</span>
          </div>
          {items.map(it => (
            <div key={it.model} data-testid={`model-row-${it.model_class}`}
              style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 80px', gap: 8, padding: '5px 8px', borderRadius: 7, background: 'rgba(255,255,255,0.02)', alignItems: 'center' }}>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'var(--cream)', wordBreak: 'break-all' }}>
                {it.model}
              </span>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240,235,224,0.55)', textAlign: 'right' }}>{it.calls}</span>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--cream)', textAlign: 'right' }}>{fmtMxn(it.mxn)}</span>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240,235,224,0.55)', textAlign: 'right' }}>${(it.avg_cost_per_call_mxn || 0).toFixed(3)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
