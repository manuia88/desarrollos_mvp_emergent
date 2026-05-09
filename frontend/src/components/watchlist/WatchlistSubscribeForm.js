// W3.9c — WatchlistSubscribeForm (genérico, reusable)
import React, { useState } from 'react';
import { subscribeWatchlist } from '../../api/watchlist';

const SCOPE_LABELS = {
  bulletins: 'Boletines mensuales',
  risk_alerts: 'Alertas de riesgo',
  both: 'Boletines + alertas',
};

const inputBase = {
  width: '100%',
  padding: '9px 14px',
  borderRadius: 9999,
  background: 'rgba(13,16,23,0.6)',
  border: '1px solid rgba(240,235,224,0.12)',
  color: 'var(--cream)',
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 13,
  outline: 'none',
};

const labelBase = {
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 12,
  color: 'var(--cream-3)',
  marginBottom: 4,
  display: 'block',
};

export default function WatchlistSubscribeForm({
  defaultScope = 'both',
  defaultZoneIds = [],
  showScopeSelector = true,
  showZonesField = true,
  zoneFieldLabel = 'Zonas a vigilar (separadas por coma)',
  ctaLabel = 'Suscribirme',
  compact = false,
}) {
  const [email, setEmail] = useState('');
  const [scope, setScope] = useState(defaultScope);
  const [zonesText, setZonesText] = useState((defaultZoneIds || []).join(', '));
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setStatus('error');
      setMessage('Ingresa tu email.');
      return;
    }
    setStatus('submitting');
    setMessage('');
    const zone_ids = zonesText
      .split(',')
      .map((z) => z.trim())
      .filter(Boolean);
    try {
      const resp = await subscribeWatchlist({ email: email.trim(), zone_ids, scope });
      setStatus('success');
      setMessage(resp?.message || 'Suscripción registrada.');
      if (resp?.status && resp.status !== 'already_active') {
        setEmail('');
      }
    } catch (err) {
      setStatus('error');
      const detail = err?.body?.detail;
      setMessage(typeof detail === 'string' ? detail : 'No se pudo procesar la suscripción.');
    }
  };

  const gap = compact ? 8 : 12;

  return (
    <form
      data-testid="watchlist-subscribe-form"
      onSubmit={handleSubmit}
      style={{ display: 'grid', gap }}
    >
      <div>
        <label style={labelBase} htmlFor="watchlist-email">Email</label>
        <input
          id="watchlist-email"
          data-testid="watchlist-email-input"
          type="email"
          placeholder="tu@correo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputBase}
          disabled={status === 'submitting'}
        />
      </div>

      {showZonesField && (
        <div>
          <label style={labelBase} htmlFor="watchlist-zones">{zoneFieldLabel}</label>
          <input
            id="watchlist-zones"
            data-testid="watchlist-zones-input"
            type="text"
            placeholder="polanco, roma_norte, condesa"
            value={zonesText}
            onChange={(e) => setZonesText(e.target.value)}
            style={inputBase}
            disabled={status === 'submitting'}
          />
        </div>
      )}

      {showScopeSelector && (
        <div>
          <label style={labelBase} htmlFor="watchlist-scope">Tipo de notificación</label>
          <select
            id="watchlist-scope"
            data-testid="watchlist-scope-select"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            style={{ ...inputBase, appearance: 'none' }}
            disabled={status === 'submitting'}
          >
            {Object.entries(SCOPE_LABELS).map(([k, label]) => (
              <option key={k} value={k} style={{ background: '#0D1017', color: 'var(--cream)' }}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        type="submit"
        data-testid="watchlist-submit-btn"
        className="btn btn-primary"
        disabled={status === 'submitting'}
        style={{ padding: compact ? '8px 18px' : '11px 22px', fontSize: 13, justifyContent: 'center' }}
      >
        {status === 'submitting' ? 'Enviando…' : ctaLabel}
      </button>

      {message && (
        <div
          data-testid="watchlist-status-message"
          style={{
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 12,
            padding: '8px 12px',
            borderRadius: 12,
            color: status === 'error' ? '#FB7185' : '#34D399',
            background: status === 'error'
              ? 'rgba(251,113,133,0.08)'
              : 'rgba(52,211,153,0.08)',
            border: `1px solid ${status === 'error' ? 'rgba(251,113,133,0.25)' : 'rgba(52,211,153,0.25)'}`,
          }}
        >
          {message}
        </div>
      )}

      <p style={{
        margin: 0,
        fontSize: 11,
        color: 'rgba(240,235,224,0.45)',
        fontFamily: 'DM Sans, sans-serif',
        lineHeight: 1.5,
      }}>
        LFPDPPP — DesarrollosMX nunca compartirá tu correo. Audit trail conservado por compliance.
        Puedes darte de baja en cualquier momento desde el correo de gestión.
      </p>
    </form>
  );
}
