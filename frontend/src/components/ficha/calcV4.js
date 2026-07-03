/**
 * calcV4 — tokens y átomos del "look v4" (light + degradado morado→rosa) para las
 * calculadoras standalone de la ficha (hipotecario, ISAI, inversión). Motores intactos;
 * esto es solo la piel. Degradado y estilos = fuente única aquí.
 */
import React from 'react';

export const GRAD = 'linear-gradient(120deg, #6D4AFF, #C63FAE)';   // morado→rosa v4 (index.css .theme-light-scope)
export const V4 = {
  ink: '#1E2230', ink2: '#5A5F6E', ink3: '#9AA0AE',
  card: '#FFFFFF', surface: '#FAFAFB', line: '#ECECEC',
  green: '#0E9F6E', amber: '#E0A33E', red: '#DC2626',
  theme: '#6D4AFF', themeRgb: '109,74,255',
};
export const HEAD = "'Outfit', system-ui, -apple-system, sans-serif";
export const SANS = "'DM Sans', system-ui, -apple-system, sans-serif";

export const fmtMXN = (n) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
export const fmtPct = (n) => (n == null || isNaN(n)) ? '—' : `${Number(n).toFixed(1)}%`;

export const cardV4 = { background: V4.card, border: `1px solid ${V4.line}`, borderRadius: 16, boxShadow: '0 6px 20px rgba(16,18,28,0.05)', padding: 22 };
export const inpV4 = { width: '100%', padding: '11px 13px', borderRadius: 11, border: `1px solid ${V4.line}`, fontFamily: SANS, fontSize: 14, color: V4.ink, background: '#fff', outline: 'none', boxSizing: 'border-box' };
export const labV4 = { display: 'block', fontFamily: SANS, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: V4.ink2, fontWeight: 700, marginBottom: 6 };

// Input de dinero: muestra "$1,999,999" mientras se escribe; guarda el número puro (string de dígitos).
export function MoneyInput({ value, onChange, placeholder, style }) {
  const display = (value === '' || value == null || isNaN(Number(value))) ? '' : `$${Number(value).toLocaleString('es-MX')}`;
  return (
    <input type="text" inputMode="numeric" value={display} placeholder={placeholder || '$0'}
      onChange={(e) => onChange((e.target.value || '').replace(/[^\d]/g, ''))}
      style={style || inpV4} />
  );
}

// Borde con degradado (double-background trick, sin pseudo-elementos, respeta border-radius)
export const gradBorder = (fill = '#FFFFFF', radius = 16) => ({ borderRadius: radius, border: '1.5px solid transparent', backgroundImage: `linear-gradient(${fill},${fill}), ${GRAD}`, backgroundOrigin: 'border-box', backgroundClip: 'padding-box, border-box', WebkitBackgroundClip: 'padding-box, border-box' });

export function BtnV4({ onClick, disabled, children, style, full }) {
  return (
    <button className="dmx-press" onClick={onClick} disabled={disabled} style={{ width: full ? '100%' : undefined, background: disabled ? '#ccc7ea' : GRAD, color: '#fff', border: 'none', borderRadius: 12, fontFamily: HEAD, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 13, padding: '13px 22px', cursor: disabled ? 'not-allowed' : 'pointer', boxShadow: disabled ? 'none' : '0 8px 22px rgba(109,74,255,0.28)', ...style }}>{children}</button>
  );
}

export function Field({ label, hint, required, children }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ ...labV4 }}>{label}{required && <span style={{ color: V4.theme }}> *</span>}</div>
      {children}
      {hint && <div style={{ fontFamily: SANS, fontSize: 11, color: V4.ink3, marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

// Tarjeta de resultado con barra de acento superior + valor grande + líneas label↔value
export function ResultCard({ eyebrow, value, sub, lines, accent = V4.theme }) {
  return (
    <div className="dmx-card" style={{ ...cardV4, position: 'relative', overflow: 'hidden', paddingTop: 24 }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: accent === V4.theme ? GRAD : accent }} />
      {eyebrow && <div style={{ fontFamily: SANS, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: V4.ink2, fontWeight: 700 }}>{eyebrow}</div>}
      <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 34, letterSpacing: '-0.02em', color: V4.ink, marginTop: 4, lineHeight: 1.05 }}>{value}</div>
      {sub && <div style={{ fontFamily: SANS, fontSize: 12.5, color: V4.ink2, marginTop: 3 }}>{sub}</div>}
      {lines && lines.length > 0 && (
        <div style={{ marginTop: 14 }}>
          {lines.filter(Boolean).map((l, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: i ? `1px solid ${V4.line}` : 'none' }}>
              <span style={{ fontFamily: SANS, fontSize: 13, color: V4.ink2 }}>{l[0]}</span>
              <span style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 700, color: l[2] || V4.ink }}>{l[1]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CalcHeader({ eyebrow, title, subtitle }) {
  return (
    <div style={{ marginBottom: 18 }}>
      {eyebrow && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 11px', borderRadius: 9999, background: 'rgba(109,74,255,0.10)', border: '1px solid rgba(109,74,255,0.24)', fontFamily: SANS, fontSize: 10, fontWeight: 700, color: V4.theme, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>✦ {eyebrow}</div>}
      <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 24, letterSpacing: '-0.02em', color: V4.ink }}>{title}</div>
      {subtitle && <div style={{ fontFamily: SANS, fontSize: 13, color: V4.ink2, marginTop: 4 }}>{subtitle}</div>}
    </div>
  );
}

export function Disclaimer({ children }) {
  return <div style={{ borderLeft: `3px solid ${V4.theme}`, background: 'rgba(109,74,255,0.04)', borderRadius: '0 10px 10px 0', padding: '12px 14px', fontFamily: SANS, fontSize: 11.5, color: V4.ink2, lineHeight: 1.55 }}>{children}</div>;
}
