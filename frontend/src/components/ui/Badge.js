import React from 'react';

/**
 * DMX UI · Badge — etiqueta semántica única (estado/categoría). Sobre los tokens → claro u oscuro
 * según el scope. tone: 'neutral' | 'theme' | 'green' | 'amber' | 'red' | 'soft'
 */
const TONES = {
  neutral: { bg: 'rgba(var(--cream-rgb),0.08)', fg: 'var(--cream-2)' },
  theme: { bg: 'rgba(var(--theme-rgb),0.12)', fg: 'var(--theme)' },
  green: { bg: 'rgba(34,197,94,0.14)', fg: 'var(--green, #1FA06A)' },
  amber: { bg: 'rgba(245,158,11,0.16)', fg: 'var(--warm, #E2982E)' },
  red: { bg: 'rgba(239,68,68,0.14)', fg: 'var(--red, #F2635B)' },
  soft: { bg: 'var(--bg-3)', fg: 'var(--cream-2)' },
};

export default function Badge({ children, tone = 'neutral', size = 'sm', style, ...rest }) {
  const t = TONES[tone] || TONES.neutral;
  const fontSize = size === 'xs' ? 10 : size === 'md' ? 12.5 : 11;
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize, lineHeight: 1.4,
        padding: '2px 9px', borderRadius: 'var(--r-pill)',
        background: t.bg, color: t.fg, whiteSpace: 'nowrap', ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
