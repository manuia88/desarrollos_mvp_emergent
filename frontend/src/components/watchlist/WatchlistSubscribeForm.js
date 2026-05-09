// W3.9c — generic Watchlist subscription form
// Used by MethodologyPage, RiskScoreSubscribeWidget, RiskWatchlist
import React, { useState } from 'react';
import { subscribeWatchlist } from '../../api/watchlist';

const SCOPE_LABELS = {
  bulletins: 'Boletines mensuales',
  risk_alerts: 'Alertas de riesgo',
  both: 'Boletines + alertas',
};

export default function WatchlistSubscribeForm({
  defaultScope = 'both',
  defaultZoneIds = [],
  showScopeSelector = true,
  showZonesField = true,
  zoneFieldLabel = 'Zonas (slugs separados por coma)',
  ctaLabel = 'Suscribirme',
  compact = false,
}) {
  const [email, setEmail] = useState('');
  const [scope, setScope] = useState(defaultScope);
  const [zonesText, setZonesText] = useState(defaultZoneIds.join(', '));
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [message, setMessage] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setStatus('submitting');
    setMessage('');
    const zone_ids = zonesText.split(',').map(z => z.trim()).filter(Boolean);
    try {
      const r = await subscribeWatchlist({ email, zone_ids, scope });
      setStatus('success');
      setMessage(r.message || 'Te enviamos un correo de confirmación.');
      if (r.status !== 'already_active') setEmail('');
    } catch (err) {
      setStatus('error');
      setMessage(err?.detail || err?.message || 'No se pudo procesar la suscripción.');
    }
  };

  const inputStyle = {
    width: '100%',
    padding: compact ? '8px 12px' : '10px 14px',
    borderRadius: 9999,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(13,16,23,0.6)',
    color: 'var(--cream)',
    fontFamily: 'DM Sans',
    fontSize: compact ? 13 : 14,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    display: 'block',
    fontFamily: 'DM Sans',
    fontSize: 12,
    color: 'var(--cream-3)',
    marginBottom: 6,
  };

  return (
    <form
      data-testid="watchlist-subscribe-form"
      onSubmit={onSubmit}
      style={{ display: 'grid', gap: compact ? 10 : 14 }}
    >
      <div>
        <label style={labelStyle}>Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="tu@correo.com"
          style={inputStyle}
          data-testid="watchlist-email-input"
        />
      </div>

      {showZonesField && (
        <div>
          <label style={labelStyle}>{zoneFieldLabel}</label>
          <input
            type="text"
            value={zonesText}
            onChange={e => setZonesText(e.target.value)}
            placeholder="polanco, condesa, roma_norte"
            style={inputStyle}
            data-testid="watchlist-zones-input"
          />
        </div>
      )}

      {showScopeSelector && (
        <div>
          <label style={labelStyle}>Suscripción</label>
          <select
            value={scope}
            onChange={e => setScope(e.target.value)}
            style={{ ...inputStyle, appearance: 'none' }}
            data-testid="watchlist-scope-select"
          >
            {Object.entries(SCOPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'submitting'}
        className="btn btn-primary"
        style={{
          padding: compact ? '10px 18px' : '12px 24px',
          fontSize: compact ? 13 : 14,
          opacity: status === 'submitting' ? 0.6 : 1,
        }}
        data-testid="watchlist-submit-btn"
      >
        {status === 'submitting' ? 'Enviando...' : ctaLabel}
      </button>

      {message && (
        <div
          style={{
            fontFamily: 'DM Sans',
            fontSize: 12,
            color: status === 'success' ? '#a3e635' : status === 'error' ? '#fca5a5' : 'var(--cream-3)',
            marginTop: 4,
          }}
          data-testid={`watchlist-${status}-message`}
        >
          {message}
        </div>
      )}

      <p style={{
        fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)',
        margin: 0, lineHeight: 1.5,
      }}>
        Doble opt-in: te enviaremos un correo para confirmar. Puedes cancelar tu suscripción
        en cualquier momento. LFPDPPP Compliant México.
      </p>
    </form>
  );
}
