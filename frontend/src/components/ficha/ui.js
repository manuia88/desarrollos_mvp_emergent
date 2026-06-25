/**
 * Ficha · sistema visual ÚNICO (rebuild limpio). Una sola tarjeta, una sola sección, un solo Stat — para que TODA la ficha
 * use el mismo lenguaje (la lección de "todo mezclado": no más plano/gradiente/pill revueltos). Serif editorial en títulos.
 */
import React from 'react';

export const SERIF = "'Playfair Display', Georgia, serif";
export const SANS = "'DM Sans', sans-serif";
export const HEAD = "'Outfit', sans-serif";

// La ÚNICA tarjeta del sistema: superficie blanca, borde fino, sombra suave. Nada de gradientes/pills sueltos.
export function Card({ children, style, ...rest }) {
  return (
    <div
      style={{
        background: 'var(--surface-card, #fff)',
        border: '1px solid var(--card-border, var(--border))',
        borderRadius: 18,
        boxShadow: '0 1px 2px rgba(16,18,28,0.04), 0 14px 34px rgba(16,18,28,0.05)',
        padding: 'clamp(18px, 2.2vw, 26px)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

// Sección estándar: eyebrow (acento) + título serif + espacio generoso + ancla para la nav.
export function Section({ id, eyebrow, title, intro, children, style }) {
  return (
    <section data-testid={id} id={id} style={{ marginTop: 'clamp(44px, 5.5vw, 68px)', scrollMarginTop: 112, ...style }}>
      {(eyebrow || title) && (
        <header style={{ marginBottom: title ? 22 : 12 }}>
          {eyebrow && <div style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--theme)' }}>{eyebrow}</div>}
          {title && <h2 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 'clamp(24px, 3.2vw, 40px)', letterSpacing: '-0.01em', color: 'var(--cream)', margin: '7px 0 0', lineHeight: 1.06 }}>{title}</h2>}
          {intro && <p style={{ fontFamily: SANS, fontSize: 14.5, color: 'var(--cream-3)', margin: '10px 0 0', maxWidth: 640, lineHeight: 1.6 }}>{intro}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

// Número grande + etiqueta (la pieza atómica de datos). `sm` = tiles compactos (evita que texto largo se corte).
export function Stat({ value, label, accent, sub, sm }) {
  if (value == null || value === '') return null;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: sm ? 'clamp(15px,1.6vw,19px)' : 'clamp(18px,2.2vw,26px)', color: accent || 'var(--cream)', lineHeight: 1.05, letterSpacing: '-0.02em', wordBreak: 'break-word' }}>{value}</div>
      <div style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-3)', marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>{label}</div>
      {sub && <div style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-2)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// Botón primario (gradiente de marca) y secundario (contorno) — consistentes en toda la ficha.
export function BtnPrimary({ children, style, ...rest }) {
  return (
    <button style={{ padding: '14px 24px', borderRadius: 13, border: 'none', background: 'var(--grad)', color: '#fff', fontFamily: HEAD, fontWeight: 800, fontSize: 15, cursor: 'pointer', width: '100%', boxShadow: '0 10px 26px rgba(99,102,241,0.28)', ...style }} {...rest}>
      {children}
    </button>
  );
}
export function BtnGhost({ children, style, ...rest }) {
  return (
    <button style={{ padding: '13px 22px', borderRadius: 13, border: '1px solid var(--card-border, var(--border))', background: 'transparent', color: 'var(--cream)', fontFamily: HEAD, fontWeight: 700, fontSize: 14, cursor: 'pointer', width: '100%', ...style }} {...rest}>
      {children}
    </button>
  );
}
