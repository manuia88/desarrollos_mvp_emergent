// W4.9.6 — Tour3DStatusBadge
// Badge color según status del scan.
import React from 'react';

const COLORS = {
  pending:    { bg: 'rgba(160,164,176,0.16)', fg: '#a0a4b0', dot: '#a0a4b0', label: 'Pendiente' },
  processing: { bg: 'rgba(99,102,241,0.16)',  fg: '#a5b4fc', dot: '#6366F1', label: 'Procesando' },
  ready:      { bg: 'rgba(34,197,94,0.14)',   fg: '#86efac', dot: '#22c55e', label: 'Listo' },
  failed:     { bg: 'rgba(239,68,68,0.14)',   fg: '#fca5a5', dot: '#ef4444', label: 'Falló' },
};

export default function Tour3DStatusBadge({ status, sizeKb, format, capturedAt }) {
  const s = COLORS[status] || COLORS.pending;
  const tip = [
    `Estado: ${s.label}`,
    sizeKb ? `${sizeKb} KB` : null,
    format ? `Formato: ${format}` : null,
    capturedAt ? `Capturado: ${String(capturedAt).slice(0, 16).replace('T', ' ')}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <span
      data-testid={`tour-status-badge-${status || 'pending'}`}
      title={tip}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '3px 10px',
        borderRadius: 9999,
        background: s.bg,
        color: s.fg,
        fontFamily: 'DM Sans',
        fontWeight: 600,
        fontSize: 11,
        letterSpacing: '0.04em',
      }}
    >
      <span style={{
        width: 7, height: 7, borderRadius: 9999,
        background: s.dot,
        boxShadow: status === 'processing' ? `0 0 0 0 ${s.dot}` : 'none',
        animation: status === 'processing' ? 'tour3dPulse 1.4s ease-in-out infinite' : 'none',
      }} />
      {s.label}
      <style>{`
        @keyframes tour3dPulse {
          0%   { box-shadow: 0 0 0 0 rgba(99,102,241,0.55); }
          70%  { box-shadow: 0 0 0 6px rgba(99,102,241,0); }
          100% { box-shadow: 0 0 0 0 rgba(99,102,241,0); }
        }
      `}</style>
    </span>
  );
}
