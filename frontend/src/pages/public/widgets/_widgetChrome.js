// W3.6 — Shared chrome para widgets B2B embebibles (iframe).
import React from 'react';

export function WidgetShell({ title, eyebrow, children }) {
  return (
    <div data-testid="widget-shell" style={{
      minHeight: '100vh',
      background: 'var(--bg, #06080F)',
      padding: '20px 16px 32px',
      fontFamily: 'DM Sans, system-ui, sans-serif',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div data-testid="widget-header" style={{ marginBottom: 22 }}>
          {eyebrow && (
            <div style={{
              fontSize: 10.5, fontWeight: 700, letterSpacing: '0.18em',
              textTransform: 'uppercase',
              backgroundImage: 'linear-gradient(90deg,#6366F1,#EC4899)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              marginBottom: 6,
            }}>{eyebrow}</div>
          )}
          <h1 style={{
            fontFamily: 'Outfit, system-ui, sans-serif',
            fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 800,
            color: 'var(--cream, #F0EBE0)', margin: 0,
            letterSpacing: '-0.025em', lineHeight: 1.1,
          }}>{title}</h1>
        </div>
        {children}
        <PoweredBy />
      </div>
    </div>
  );
}

export function PoweredBy() {
  return (
    <div data-testid="widget-powered-by" style={{
      marginTop: 32, paddingTop: 16,
      borderTop: '1px solid rgba(255,255,255,0.08)',
      textAlign: 'center',
      fontSize: 10.5, color: 'rgba(240,235,224,0.45)',
      letterSpacing: '0.12em', textTransform: 'uppercase',
    }}>
      Powered by{' '}
      <a href="https://desarrollosmx.com/docs/api"
        target="_blank" rel="noopener noreferrer"
        style={{
          backgroundImage: 'linear-gradient(90deg,#6366F1,#EC4899)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          fontWeight: 700, textDecoration: 'none',
        }}>
        DesarrollosMX
      </a>
    </div>
  );
}

export function WidgetCard({ children, style }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 16, padding: 18, ...style,
    }}>
      {children}
    </div>
  );
}

export function WidgetField({ label, required, children }) {
  return (
    <label style={{ display: 'block', marginTop: 12 }}>
      <span style={{
        fontSize: 11, fontWeight: 600,
        color: 'rgba(240,235,224,0.6)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>{label}{required && ' *'}</span>
      {children}
    </label>
  );
}

export const widgetInputStyle = {
  width: '100%', padding: '10px 12px', marginTop: 6, borderRadius: 10,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: 'var(--cream, #F0EBE0)', fontFamily: 'DM Sans, system-ui',
  fontSize: 13, outline: 'none',
};

export const widgetBtnPrimary = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  width: '100%', padding: '11px 18px', borderRadius: 9999,
  backgroundImage: 'linear-gradient(90deg,#6366F1,#EC4899)',
  border: '1px solid rgba(255,255,255,0.16)',
  color: '#fff', cursor: 'pointer',
  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14,
};

export function ApiKeyMissing() {
  return (
    <WidgetCard style={{ borderColor: 'rgba(245,158,11,0.40)' }}>
      <p data-testid="widget-no-apikey" style={{
        fontSize: 13, color: '#fcd34d', margin: 0, lineHeight: 1.6,
      }}>
        API key faltante. Agrega <code>?api_key=dmx_...</code> al URL para usar
        este widget. Obtén tu key en{' '}
        <a href="/docs/api" style={{ color: '#fcd34d', textDecoration: 'underline' }}>
          /docs/api
        </a>.
      </p>
    </WidgetCard>
  );
}

export function ResultRow({ label, value, accent }) {
  return (
    <div data-testid={`widget-result-${label.replace(/\s+/g,'-').toLowerCase()}`} style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      <span style={{ fontSize: 12, color: 'rgba(240,235,224,0.65)', fontFamily: 'DM Sans' }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'Outfit', fontWeight: 700, fontSize: 14,
        color: accent || 'var(--cream, #F0EBE0)',
      }}>{value}</span>
    </div>
  );
}

export function useApiKeyFromUrl() {
  const [apiKey, setApiKey] = React.useState(null);
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setApiKey(params.get('api_key') || null);
  }, []);
  return apiKey;
}

export function fmtMxn(v) {
  if (v === null || v === undefined) return '—';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', maximumFractionDigits: 0,
  }).format(v);
}
export function fmtPct(v, digits = 1) {
  if (v === null || v === undefined) return '—';
  return `${Number(v).toFixed(digits)}%`;
}
export function fmtNum(v) {
  if (v === null || v === undefined) return '—';
  return new Intl.NumberFormat('es-MX').format(v);
}
