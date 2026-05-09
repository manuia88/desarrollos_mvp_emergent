// W4.2.5 — RiskWidgetPage.js
// Standalone embeddable risk widget: /widgets/risk/{slug}
// Foco en risk score letter + tier + sources count.
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const API = process.env.REACT_APP_BACKEND_URL;

function tierStyle(tier) {
  const t = (tier || '').toLowerCase();
  if (t === 'green') return { bg: 'rgba(34,197,94,0.10)', bd: '#22C55E', fg: '#15803D', label: 'Bajo' };
  if (t === 'yellow' || t === 'neutral') return { bg: 'rgba(234,179,8,0.10)', bd: '#EAB308', fg: '#A16207', label: 'Moderado' };
  if (t === 'red' || t === 'orange') return { bg: 'rgba(239,68,68,0.10)', bd: '#EF4444', fg: '#B91C1C', label: 'Alto' };
  return { bg: 'rgba(255,255,255,0.05)', bd: 'rgba(0,0,0,0.10)', fg: '#6B7280', label: 'N/D' };
}

export default function RiskWidgetPage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/api/widgets/risk/${slug}`)
      .then(async r => {
        if (cancelled) return;
        if (!r.ok) { setError(r.status === 404 ? 'not_found' : 'server_error'); return; }
        const d = await r.json();
        if (!cancelled) setData(d);
      })
      .catch(() => { if (!cancelled) setError('network_error'); });
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    document.body.style.margin = '0';
    document.body.style.background = 'transparent';
    return () => {
      document.body.style.margin = '';
      document.body.style.background = '';
    };
  }, []);

  if (error === 'not_found') {
    return (
      <div data-testid="risk-widget" style={emptyShellStyle}>
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#9CA3AF', textAlign: 'center' }}>
          Zona <strong>{slug}</strong> no encontrada.
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div data-testid="risk-widget" style={emptyShellStyle}>
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#9CA3AF' }}>Cargando…</div>
      </div>
    );
  }

  const t = tierStyle(data.risk_tier);

  return (
    <div data-testid="risk-widget" style={shellStyle}>
      {/* DMX signature gradient top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        backgroundImage: 'linear-gradient(90deg, #6366F1, #EC4899)',
        borderTopLeftRadius: 14, borderTopRightRadius: 14,
      }} />

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, gap: 10, marginTop: 4,
      }}>
        <div>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.16em', textTransform: 'uppercase',
            backgroundImage: 'linear-gradient(90deg, #6366F1, #EC4899)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Risk Score · DesarrollosMX
          </div>
          <div data-testid="risk-widget-zone" style={{
            fontFamily: 'Outfit, system-ui, sans-serif', fontWeight: 800,
            fontSize: 18, color: '#06080F', marginTop: 2, letterSpacing: '-0.01em',
          }}>
            {data.zone_name}
          </div>
          {data.alcaldia && (
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: '#6B7280', marginTop: 1 }}>
              {data.alcaldia}, CDMX
            </div>
          )}
        </div>
      </div>

      {/* Big risk letter */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '12px 14px', borderRadius: 12,
        background: t.bg, border: `1px solid ${t.bd}40`, marginBottom: 12,
      }}>
        <div data-testid="risk-widget-letter" style={{
          fontFamily: 'Outfit, system-ui, sans-serif', fontWeight: 800,
          fontSize: 44, color: t.fg, lineHeight: 1, letterSpacing: '-0.03em',
        }}>
          {data.risk_letter || '—'}
        </div>
        <div>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, color: t.fg,
            textTransform: 'uppercase', letterSpacing: '0.1em',
          }}>
            Riesgo {t.label}
          </div>
          <div style={{
            fontFamily: 'Outfit, system-ui, sans-serif', fontWeight: 700,
            fontSize: 16, color: '#06080F', marginTop: 2,
          }}>
            {data.risk_score != null ? `${data.risk_score}/100` : 'En cálculo'}
          </div>
          {!data.available && (
            <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>
              · Composite preliminar
            </div>
          )}
        </div>
      </div>

      {/* Sources count · dark glass card sobre cream para contraste DMX */}
      <div style={{
        padding: '8px 12px', borderRadius: 10,
        background: 'rgba(13,16,23,0.92)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.08)',
        marginBottom: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 9, fontWeight: 700,
            color: 'rgba(240,235,224,0.55)', textTransform: 'uppercase', letterSpacing: '0.1em',
          }}>
            Fuentes oficiales
          </div>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.85)', marginTop: 2,
          }}>
            SESNSP · CENAPRED · ENVIPE · RPP
          </div>
        </div>
        <div style={{
          fontFamily: 'Outfit, system-ui, sans-serif', fontWeight: 800,
          fontSize: 22, color: '#F0EBE0',
        }}>
          {data.sources_count}
        </div>
      </div>

      {/* Footer watermark */}
      <a
        href={data.deep_link || `https://desarrollosmx.io/zona/${slug}`}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="risk-widget-link"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontFamily: 'DM Sans', fontSize: 10.5, color: '#6366F1',
          textDecoration: 'none', paddingTop: 6,
          borderTop: '1px solid rgba(0,0,0,0.06)',
        }}
      >
        <span>Powered by <strong>DesarrollosMX</strong></span>
        <span>desarrollosmx.io →</span>
      </a>
    </div>
  );
}

const shellStyle = {
  width: '100%',
  maxWidth: 360,
  minWidth: 280,
  padding: 16,
  borderRadius: 14,
  background: '#F0EBE0',
  border: '1px solid rgba(13,16,23,0.10)',
  boxShadow: '0 4px 20px rgba(13,16,23,0.10)',
  fontFamily: 'system-ui, sans-serif',
  margin: 0,
  position: 'relative',
  overflow: 'hidden',
};

const emptyShellStyle = {
  ...shellStyle,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  minHeight: 80,
};
