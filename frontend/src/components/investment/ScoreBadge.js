// F0.1 — ScoreBadge · DMX investment score (0-100 with letter tier).
import React, { useState } from 'react';

const TIER_COLOR = {
  AAA: { bg: 'rgba(34,197,94,0.18)',  fg: '#86efac', accent: '#22c55e' },
  AA:  { bg: 'rgba(34,197,94,0.14)',  fg: '#86efac', accent: '#16a34a' },
  A:   { bg: 'rgba(250,204,21,0.16)', fg: '#fde68a', accent: '#facc15' },
  BBB: { bg: 'rgba(250,204,21,0.12)', fg: '#fde68a', accent: '#eab308' },
  BB:  { bg: 'rgba(239,68,68,0.14)',  fg: '#fca5a5', accent: '#f87171' },
  B:   { bg: 'rgba(239,68,68,0.18)',  fg: '#fca5a5', accent: '#ef4444' },
};

const SIZE_MAP = {
  small:  { num: 18, label: 9,  pad: '4px 10px', gap: 6 },
  medium: { num: 26, label: 10, pad: '6px 14px', gap: 8 },
  large:  { num: 44, label: 11, pad: '10px 18px', gap: 10 },
};

export default function ScoreBadge({
  score,
  tier,
  label,
  factors,
  size = 'medium',
  showTooltip = true,
}) {
  const [open, setOpen] = useState(false);
  const t = TIER_COLOR[tier] || TIER_COLOR.B;
  const dims = SIZE_MAP[size] || SIZE_MAP.medium;

  return (
    <div
      data-testid="score-badge"
      onMouseEnter={() => showTooltip && setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: dims.gap,
        padding: dims.pad,
        borderRadius: 9999,
        background: t.bg,
        border: `1px solid ${t.accent}`,
        color: t.fg,
        fontFamily: 'Outfit',
        fontWeight: 700,
        cursor: showTooltip ? 'help' : 'default',
      }}
    >
      <span style={{ fontWeight: 800, fontSize: dims.num, color: t.fg, lineHeight: 1 }}>
        {Math.round(score ?? 0)}
      </span>
      <span style={{
        fontWeight: 700, fontSize: dims.label,
        letterSpacing: '0.08em',
        color: t.fg,
      }}>
        {tier || '—'} · DMX SCORE
      </span>

      {open && showTooltip && (
        <div
          data-testid="score-tooltip"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)', left: 0,
            zIndex: 100,
            minWidth: 240,
            background: 'rgba(13,16,23,0.96)',
            border: '1px solid rgba(240,235,224,0.15)',
            borderRadius: 12,
            padding: 12,
            backdropFilter: 'blur(16px)',
            boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: '#a0a4b0', marginBottom: 6, lineHeight: 1.5 }}>
            {label}
          </div>
          {factors && Object.entries(factors).map(([k, v]) => (
            <FactorRow key={k} k={k} v={v} accent={t.accent} />
          ))}
        </div>
      )}
    </div>
  );
}

const FACTOR_LABELS = {
  tir: 'TIR normalizada',
  zone: 'Zone Score',
  demand: 'Demand-Supply',
  stress: 'Resiliencia stress',
};

function FactorRow({ k, v, accent }) {
  const pct = Math.max(0, Math.min(Number(v?.value ?? 0), 100));
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontFamily: 'DM Sans', fontSize: 10, color: '#d4d4d8',
      }}>
        <span>{FACTOR_LABELS[k] || k}</span>
        <span style={{ color: '#a0a4b0' }}>{v.weight_pct}% · {v.contribution} pts</span>
      </div>
      <div style={{
        height: 4, marginTop: 2,
        background: 'rgba(240,235,224,0.08)',
        borderRadius: 9999,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', background: accent,
          transition: 'width 320ms ease',
        }} />
      </div>
    </div>
  );
}
