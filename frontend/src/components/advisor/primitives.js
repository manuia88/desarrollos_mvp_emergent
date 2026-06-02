// Shared primitives for advisor portal
import React from 'react';
import { Z } from '../../styles/zIndex';

export function PageHeader({ eyebrow, title, sub, actions }) {
  return (
    <div data-testid="page-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
      <div>
        {eyebrow && <div className="eyebrow" style={{ marginBottom: 8 }}>{eyebrow}</div>}
        <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(26px, 3.2vw, 36px)', letterSpacing: '-0.028em', color: 'var(--cream)', margin: 0, lineHeight: 1.05 }}>
          {title}
        </h1>
        {sub && <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-3)', margin: '8px 0 0', maxWidth: 680 }}>{sub}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

export function Card({ children, style, hover = false, ...rest }) {
  // Tema claro (.portal-asesor): superficie sólida + sombra real (nivel Mis Leads).
  // Oscuro (usuarios reales): fallback al valor previo → SIN cambios.
  return (
    <div
      {...rest}
      className={`${hover ? 'asr-premium asr-premium--hover ' : ''}${rest.className || ''}`.trim() || undefined}
      style={{
        background: 'var(--surface, rgba(255,255,255,0.03))',
        border: '1px solid var(--border)',
        borderRadius: 16,
        boxShadow: 'var(--asr-shadow, none)',
        padding: 18,
        ...style,
      }}>
      {children}
    </div>
  );
}

export function Stat({ label, value, sub, accent }) {
  return (
    <Card
      style={{
        display: 'flex', flexDirection: 'column', gap: 5, position: 'relative', overflow: 'hidden',
        borderColor: 'var(--border-2, var(--border))', paddingLeft: 18,
        transition: 'transform .16s, box-shadow .16s, border-color .16s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 12px 24px -12px rgba(109,74,255,0.40)';
        e.currentTarget.style.borderColor = 'rgba(109,74,255,0.45)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.boxShadow = '';
        e.currentTarget.style.borderColor = 'var(--border-2, var(--border))';
      }}
    >
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: accent || 'var(--theme, #6D4AFF)' }} />
      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700, color: 'var(--cream-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, letterSpacing: '-0.02em', color: accent || 'var(--cream)', lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      {sub && <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)' }}>{sub}</div>}
    </Card>
  );
}

export function Badge({ children, tone = 'neutral' }) {
  // SÓLIDOS con texto blanco → el nombre NO se pierde (alto contraste, vivo, en claro y oscuro).
  const palette = {
    neutral: { bg: 'var(--surface-2, rgba(255,255,255,0.06))', fg: 'var(--cream-2)', solid: false },
    ok:      { bg: '#1FA06A', fg: '#fff', solid: true },
    warn:    { bg: '#C77F12', fg: '#fff', solid: true },
    bad:     { bg: '#E0463D', fg: '#fff', solid: true },
    brand:   { bg: '#6D4AFF', fg: '#fff', solid: true },
    pink:    { bg: '#C63FAE', fg: '#fff', solid: true },
  };
  const p = palette[tone] || palette.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 11px', borderRadius: 9999,
      background: p.bg, border: p.solid ? 'none' : '1px solid var(--border-2, var(--border))', color: p.fg,
      fontFamily: 'DM Sans', fontWeight: 800, fontSize: 10,
      textTransform: 'uppercase', letterSpacing: '0.05em',
      boxShadow: p.solid ? '0 2px 6px -2px rgba(0,0,0,0.25)' : 'none',
    }}>{children}</span>
  );
}

export function Empty({ title, sub, cta }) {
  return (
    <div style={{
      padding: '44px 22px', textAlign: 'center',
      background: 'rgba(255,255,255,0.02)',
      border: '1px dashed var(--border-2)',
      borderRadius: 16,
    }}>
      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)' }}>{title}</div>
      {sub && <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', marginTop: 6 }}>{sub}</div>}
      {cta && <div style={{ marginTop: 14 }}>{cta}</div>}
    </div>
  );
}

export function Toast({ kind = 'info', text, onClose }) {
  const tones = {
    info: { bg: 'rgba(var(--theme-rgb),0.18)', bo: 'rgba(var(--theme-rgb),0.42)', fg: '#e0e7ff' },
    success: { bg: 'rgba(34,197,94,0.18)', bo: 'rgba(34,197,94,0.42)', fg: '#bbf7d0' },
    error: { bg: 'rgba(239,68,68,0.18)', bo: 'rgba(239,68,68,0.42)', fg: '#fecaca' },
  };
  const p = tones[kind] || tones.info;
  return (
    <div
      data-testid="toast"
      role="alert"
      aria-live="assertive"
      tabIndex={0}
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClose(); }}
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: Z.STICKY,
        padding: '12px 18px', borderRadius: 12,
        background: p.bg, border: `1px solid ${p.bo}`, color: p.fg,
        fontFamily: 'DM Sans', fontWeight: 500, fontSize: 13,
        backdropFilter: 'blur(12px)',
        maxWidth: 340,
        cursor: 'pointer',
      }}>{text}</div>
  );
}

export function Drawer({ open, onClose, title, children, width = 520 }) {
  React.useEffect(() => {
    if (!open) return;
    const onEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onEsc); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: Z.DROPDOWN,
        background: 'rgba(6,8,15,0.72)', backdropFilter: 'blur(10px)',
        display: 'flex', justifyContent: 'flex-end',
      }}
    >
      <div
        data-testid="drawer"
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        style={{
        width, maxWidth: '100vw', height: '100vh',
        background: 'linear-gradient(180deg, #0E1220, #08090D)',
        borderLeft: '1px solid var(--border)',
        padding: 22, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)', letterSpacing: '-0.02em' }}>{title}</div>
          <button onClick={onClose} data-testid="drawer-close" className="btn-icon-circle">
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Money formatter
export const fmtMXN = (n) => '$' + Math.round(n).toLocaleString('es-MX');
export const fmt0 = (n) => Math.round(n).toLocaleString('es-MX');

// Humanize date relative
export function relDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = d - new Date();
  const abs = Math.abs(diff);
  const hr = 3600000;
  if (abs < hr * 24) {
    const h = Math.round(diff / hr);
    if (h === 0) return 'Ahora';
    if (h > 0) return `en ${h}h`;
    return `hace ${-h}h`;
  }
  const day = Math.round(diff / (hr * 24));
  if (day === 0) return 'Hoy';
  if (day > 0) return `en ${day}d`;
  return `hace ${-day}d`;
}

export function isOverdue(iso) {
  return iso ? new Date(iso) < new Date() : false;
}
