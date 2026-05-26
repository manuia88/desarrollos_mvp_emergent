// W7.AS.3.H · Round 3 · ConfidenceIndicator — dot de confianza IA por mensaje.
// Standalone embebible. Prop `value` (0-100): verde≥70 / amarillo 50-70 / rojo<50.
// Tooltip "Confianza IA: N%" + razón opcional. Aurora rounded-full, sin emoji.
// i18n namespace 'conversation_confidence' (con defaults · funciona sin registrar).
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

// Tokens var(--theme*) con fallback hex (aurora design system · paridad fix E.12 R2).
const COLORS = {
  green: { dot: 'var(--theme-success, #22c55e)', glow: 'rgba(34,197,94,0.35)' },
  yellow: { dot: 'var(--theme-warning, #f59e0b)', glow: 'rgba(245,158,11,0.35)' },
  red: { dot: 'var(--theme-danger, #ef4444)', glow: 'rgba(239,68,68,0.40)' },
};

function bandOf(value) {
  if (value >= 70) return 'green';
  if (value >= 50) return 'yellow';
  return 'red';
}

export default function ConfidenceIndicator({ value, reason, size = 9 }) {
  const { t } = useTranslation('conversation_confidence');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Conditional render: sin dato → nada (stub-aware).
  const hasValue = value !== null && value !== undefined && !Number.isNaN(Number(value));

  // ESC cierra el tooltip + scroll lock mientras está abierto (clausula "si modal").
  const onKey = useCallback((e) => { if (e.key === 'Escape') setOpen(false); }, []);
  useEffect(() => {
    if (!open) return undefined;
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onKey]);

  if (!hasValue) return null;

  const v = Math.max(0, Math.min(100, Math.round(Number(value))));
  const band = bandOf(v);
  const c = COLORS[band];
  const label = t('indicator.tooltip', 'Confianza IA: {{value}}%', { value: v });
  const a11y = t(`indicator.band.${band}`, band);

  return (
    <span
      ref={wrapRef}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`${label} · ${a11y}`}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: size, height: size, borderRadius: '9999px',
          background: c.dot, boxShadow: `0 0 0 3px ${c.glow}`,
          border: 'none', padding: 0, cursor: 'pointer', display: 'inline-block',
        }}
      />
      {open && (
        <span
          role="tooltip"
          style={{
            position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(18,16,24,0.97)', border: '1px solid var(--border, rgba(255,255,255,0.12))',
            borderRadius: 10, padding: '8px 10px', minWidth: 150, maxWidth: 240, zIndex: 50,
            fontSize: 12, lineHeight: 1.4, color: 'var(--text, #f0ebe0)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)', whiteSpace: 'normal', textAlign: 'left',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
            <span style={{ width: 8, height: 8, borderRadius: '9999px', background: c.dot, display: 'inline-block' }} />
            {label}
          </span>
          {reason ? (
            <span style={{ display: 'block', marginTop: 4, opacity: 0.75 }}>
              {t('indicator.reason_label', 'Motivo')}: {reason}
            </span>
          ) : null}
        </span>
      )}
    </span>
  );
}
