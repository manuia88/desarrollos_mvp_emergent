// W4.2.5 — ScoreWidgetPage.js
// Standalone embeddable widget: /widgets/score/{slug}
// SIN Navbar, SIN footer landing — diseñado para iframe en blogs de terceros.
// 320px-1200px responsive, branded watermark "Powered by DesarrollosMX".
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const API = process.env.REACT_APP_BACKEND_URL;

function tierColor(tier) {
  const t = (tier || '').toLowerCase();
  if (t === 'green') return { bg: 'rgba(34,197,94,0.14)', bd: '#22C55E', fg: '#22C55E' };
  if (t === 'yellow') return { bg: 'rgba(234,179,8,0.14)', bd: '#EAB308', fg: '#EAB308' };
  if (t === 'red' || t === 'orange') return { bg: 'rgba(239,68,68,0.14)', bd: '#EF4444', fg: '#EF4444' };
  return { bg: 'rgba(255,255,255,0.05)', bd: 'rgba(255,255,255,0.18)', fg: 'rgba(255,255,255,0.65)' };
}

function nfMxn(value) {
  if (value == null || isNaN(value)) return null;
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency', currency: 'MXN', maximumFractionDigits: 0,
    }).format(value);
  } catch { return `$${Math.round(value).toLocaleString('es-MX')}`; }
}

export default function ScoreWidgetPage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/api/widgets/score/${slug}`)
      .then(async r => {
        if (cancelled) return;
        if (!r.ok) { setError(r.status === 404 ? 'not_found' : 'server_error'); return; }
        const d = await r.json();
        if (!cancelled) setData(d);
      })
      .catch(() => { if (!cancelled) setError('network_error'); });
    return () => { cancelled = true; };
  }, [slug]);

  // Apply transparent body so iframe can blend
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
      <div data-testid="score-widget" style={emptyShellStyle}>
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#9CA3AF', textAlign: 'center' }}>
          Zona <strong>{slug}</strong> no encontrada en DesarrollosMX.
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div data-testid="score-widget" style={emptyShellStyle}>
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#9CA3AF' }}>Cargando…</div>
      </div>
    );
  }

  const tColor = tierColor(data.risk_tier);
  const score = data.ie_score_avg != null ? Math.round(data.ie_score_avg) : '—';
  const scoreColor = data.ie_score_avg == null
    ? '#94A3B8'
    : data.ie_score_avg >= 75 ? '#22C55E'
    : data.ie_score_avg >= 60 ? '#EAB308'
    : '#EF4444';

  return (
    <div data-testid="score-widget" style={shellStyle}>
      {/* DMX signature gradient top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        backgroundImage: 'linear-gradient(90deg, #6366F1, #EC4899)',
        borderTopLeftRadius: 14, borderTopRightRadius: 14,
      }} />
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10, gap: 10,
      }}>
        <div>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.16em', textTransform: 'uppercase',
            backgroundImage: 'linear-gradient(90deg, #6366F1, #EC4899)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Score IE · DesarrollosMX
          </div>
          <div data-testid="score-widget-zone" style={{
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
        <div style={{ textAlign: 'right' }}>
          <div data-testid="score-widget-value" style={{
            fontFamily: 'Outfit, system-ui, sans-serif', fontWeight: 800,
            fontSize: 36, color: scoreColor, lineHeight: 1, letterSpacing: '-0.025em',
          }}>
            {score}
          </div>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 10, color: '#9CA3AF',
            textTransform: 'uppercase', letterSpacing: '0.1em',
          }}>
            de 100
          </div>
        </div>
      </div>

      {/* Mini stats inline */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
        padding: '10px 12px', borderRadius: 10,
        background: 'rgba(13,16,23,0.92)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.08)',
        marginBottom: 10,
      }}>
        <MiniStat
          dark
          label="DRPI/m²"
          value={data.drpi_value ? nfMxn(data.drpi_value) : '—'}
          delta={data.drpi_delta_30d_pct}
        />
        <MiniStat
          dark
          label="Risk"
          value={data.risk_letter || '—'}
          color={tColor.fg}
        />
        <MiniStat
          dark
          label="Muestra IE"
          value={`${data.ie_sample_size}`}
        />
      </div>

      {/* Footer watermark */}
      <a
        href={data.deep_link || `https://desarrollosmx.io/zona/${slug}`}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="score-widget-link"
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

function MiniStat({ label, value, color, delta, dark }) {
  const labelColor = dark ? 'rgba(240,235,224,0.55)' : '#6B7280';
  const valueColor = color || (dark ? '#F0EBE0' : '#06080F');
  return (
    <div>
      <div style={{
        fontFamily: 'DM Sans', fontSize: 9, fontWeight: 700,
        color: labelColor, textTransform: 'uppercase', letterSpacing: '0.1em',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'Outfit, system-ui, sans-serif', fontWeight: 700,
        fontSize: 13, color: valueColor, marginTop: 2,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {value}
      </div>
      {delta != null && (
        <div style={{
          fontFamily: 'DM Sans', fontSize: 10,
          color: delta > 0 ? '#22C55E' : delta < 0 ? '#EF4444' : '#9CA3AF',
          marginTop: 1,
        }}>
          {delta > 0 ? '+' : ''}{Number(delta).toFixed(1)}% · 30d
        </div>
      )}
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
