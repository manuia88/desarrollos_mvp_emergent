// W4.2D3 — LandingLeadCaptureForm.js
// Form anti-doorway "Avísame cuando haya inventario" para landing pages sin
// inventario propio (tier 2 colonias / alcaldías sin colonias seedeadas / intents).
//
// Props:
//   zoneInterest: string (ej. "zone-granada", "alcaldia-iztapalapa", "intent-preventa")
//   sourceUrl:    string (opcional, ej. window.location.pathname)
//   title:        string opcional para el header
//   description:  string opcional para el body
import React, { useState } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function LandingLeadCaptureForm({
  zoneInterest,
  sourceUrl = '',
  title = 'Avísame cuando haya inventario aquí',
  description = 'Te enviaremos un correo en cuanto publiquemos desarrollos verificados en esta zona. Cero spam, cancela cuando quieras.',
}) {
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | ok | error
  const [errorMsg, setErrorMsg] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Ingresa un email válido.');
      setStatus('error');
      return;
    }
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch(`${API}/api/public/landing/lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          zone_interest: zoneInterest,
          notes: notes.trim().slice(0, 500),
          source_url: sourceUrl || (typeof window !== 'undefined' ? window.location.pathname : ''),
          // C3 Privacidad · el aviso se muestra junto al botón (consentimiento informado)
          consents: { privacy_policy: true, marketing: true },
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErrorMsg(j.detail || 'No pudimos registrar tu suscripción. Intenta de nuevo.');
        setStatus('error');
        return;
      }
      setStatus('ok');
      setEmail('');
      setNotes('');
    } catch (err) {
      setErrorMsg('Error de red. Intenta de nuevo.');
      setStatus('error');
    }
  };

  if (status === 'ok') {
    return (
      <div
        data-testid="landing-lead-capture-success"
        style={{
          padding: '20px 22px', borderRadius: 16,
          border: '1px solid rgba(34,197,94,0.30)',
          background: 'rgba(34,197,94,0.08)',
        }}
      >
        <div style={{
          fontFamily: 'Outfit', fontWeight: 700, fontSize: 16,
          color: '#22C55E', marginBottom: 6,
        }}>
          ¡Suscripción registrada!
        </div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.6 }}>
          Te enviaremos un correo cuando DesarrollosMX publique inventario verificado en esta zona.
        </div>
      </div>
    );
  }

  return (
    <form
      data-testid="landing-lead-capture"
      onSubmit={submit}
      style={{
        padding: '22px 24px', borderRadius: 18,
        border: '1px solid rgba(var(--theme-rgb),0.25)',
        background: 'rgba(var(--theme-rgb),0.06)',
        backdropFilter: 'blur(14px)',
      }}
    >
      <div
        style={{
          fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          marginBottom: 8,
          backgroundImage: 'linear-gradient(90deg, var(--theme), var(--theme-3))',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}
      >
        Alerta de inventario
      </div>
      <h3 style={{
        fontFamily: 'Outfit', fontWeight: 700, fontSize: 20,
        color: 'var(--cream)', margin: '0 0 8px',
        letterSpacing: '-0.015em',
      }}>
        {title}
      </h3>
      <p style={{
        fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)',
        lineHeight: 1.6, margin: '0 0 16px',
      }}>
        {description}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="tu@email.com"
          data-testid="landing-lead-email"
          autoComplete="email"
          style={inputStyle}
        />
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="¿Qué buscas? (opcional · 2-3 recámaras, presupuesto, etc.)"
          data-testid="landing-lead-notes"
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
        />

        {status === 'error' && (
          <div
            data-testid="landing-lead-error"
            style={{
              fontFamily: 'DM Sans', fontSize: 13, color: '#FCA5A5',
              padding: '8px 12px', borderRadius: 10,
              background: 'rgba(239,68,68,0.10)',
              border: '1px solid rgba(239,68,68,0.25)',
            }}
          >
            {errorMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={status === 'loading'}
          data-testid="landing-lead-submit"
          style={{
            fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14,
            padding: '11px 22px', borderRadius: 9999,
            background: status === 'loading'
              ? 'rgba(var(--theme-rgb),0.40)'
              : 'linear-gradient(90deg, var(--theme), var(--theme-3))',
            color: '#fff', border: 'none',
            cursor: status === 'loading' ? 'wait' : 'pointer',
            transition: 'opacity 0.18s ease',
            alignSelf: 'flex-start',
          }}
          onMouseEnter={e => { if (status !== 'loading') e.currentTarget.style.opacity = '0.85'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
        >
          {status === 'loading' ? 'Registrando…' : 'Avísame cuando haya inventario'}
        </button>

        {/* C3 Privacidad · aviso informado */}
        <p style={{
          margin: '2px 0 0', fontFamily: 'DM Sans', fontSize: 11,
          color: 'var(--cream-2)', lineHeight: 1.5,
        }}>
          Usamos tu correo solo para avisarte de inventario en esta zona. Consulta el{' '}
          <a href="/comprador/privacidad" target="_blank" rel="noopener noreferrer"
             style={{ color: 'var(--cream)', textDecoration: 'underline' }}>Aviso de Privacidad</a>.
          Cancela cuando quieras.
        </p>
      </div>
    </form>
  );
}

const inputStyle = {
  fontFamily: 'DM Sans', fontSize: 14,
  padding: '10px 14px', borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(13,16,23,0.55)',
  color: 'var(--cream)',
  outline: 'none',
};
