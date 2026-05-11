/**
 * W4.18.3 Sub-B — WaitlistForm
 * Email input + UTM capture (URL params) → POST /api/waitlist/signup.
 * Idempotente: email duplicado retorna mismo success card.
 */
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const API = process.env.REACT_APP_BACKEND_URL;

export default function WaitlistForm() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [utm, setUtm] = useState({ utm_source: '', utm_medium: '', utm_campaign: '' });

  useEffect(() => {
    setUtm({
      utm_source:   searchParams.get('utm_source')   || '',
      utm_medium:   searchParams.get('utm_medium')   || '',
      utm_campaign: searchParams.get('utm_campaign') || '',
    });
  }, [searchParams]);

  const submit = async (e) => {
    e?.preventDefault();
    if (!email || !email.includes('@')) { setError('Correo inválido'); return; }
    setError(null); setSubmitting(true);
    try {
      const r = await fetch(`${API}/api/waitlist/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, ...utm }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || `Error ${r.status}`);
      }
      setSuccess(true);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div
        data-testid="waitlist-success"
        style={{
          padding: 28, borderRadius: 20,
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)',
          backdropFilter: 'blur(24px)', textAlign: 'center', fontFamily: 'DM Sans',
        }}
      >
        <div style={{ fontFamily: 'Outfit', fontSize: 22, fontWeight: 800, color: '#F0EBE0', marginBottom: 8 }}>
          Estás en la lista
        </div>
        <div style={{ fontSize: 13, color: 'rgba(240,235,224,0.7)', maxWidth: 420, margin: '0 auto' }}>
          Te avisaremos al lanzar. Mientras tanto, si eres broker con código de invitación, accede directo desde la página de brokers.
        </div>
      </div>
    );
  }

  return (
    <form
      data-testid="waitlist-form"
      onSubmit={submit}
      style={{
        padding: 28, borderRadius: 20,
        background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <label htmlFor="waitlist-email-input" style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.5)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block' }}>
        Correo electrónico
      </label>
      <input
        id="waitlist-email-input"
        data-testid="waitlist-email"
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="tu@correo.com"
        required
        aria-invalid={!!error}
        aria-describedby={error ? 'waitlist-error' : undefined}
        style={{
          width: '100%', padding: '14px 18px', borderRadius: 9999,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: '#F0EBE0', fontFamily: 'DM Sans', fontSize: 14,
          marginBottom: 14,
        }}
      />
      <button
        data-testid="waitlist-submit"
        type="submit"
        disabled={submitting}
        style={{
          width: '100%', padding: '14px 24px', borderRadius: 9999, border: 'none',
          background: 'linear-gradient(90deg,#6366F1,#EC4899)', color: '#fff',
          fontFamily: 'DM Sans', fontSize: 14, fontWeight: 700,
          cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.6 : 1,
        }}
      >{submitting ? 'Uniéndote…' : 'Únete a la waitlist'}</button>
      {error && (
        <div id="waitlist-error" role="alert" style={{ marginTop: 12, padding: '8px 12px', borderRadius: 10, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 12 }}>
          {error}
        </div>
      )}
    </form>
  );
}
