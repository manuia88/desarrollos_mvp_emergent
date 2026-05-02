// Phase 4 Batch 3 · /aceptar-invitacion/:token — Public activation page
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as api from '../../api/developer';
import { CheckCircle, AlertTriangle, Sparkle } from '../../components/icons';

const ROLE_LABELS = {
  admin: 'Administrador',
  commercial_director: 'Director Comercial',
  comercial: 'Comercial',
  obras: 'Residente de obra',
  marketing: 'Marketing',
};

export default function AceptarInvitacion() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading]   = useState(true);
  const [invite, setInvite]     = useState(null);
  const [error, setError]       = useState(null);
  const [pwd, setPwd]           = useState('');
  const [pwd2, setPwd2]         = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.verifyInvitation(token)
      .then(setInvite)
      .catch(e => setError({ status: e.status, msg: e.body?.detail || 'Invitación inválida' }))
      .finally(() => setLoading(false));
  }, [token]);

  const pwdTooShort = pwd.length > 0 && pwd.length < 8;
  const pwdMatch = pwd && pwd === pwd2;
  const canSubmit = invite && !pwdTooShort && pwdMatch && !submitting;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await api.acceptInvitation(token, { password: pwd, confirm_password: pwd2 });
      navigate('/desarrollador', { replace: true });
      // Full reload so AppProvider picks up the new JWT cookie and user.
      window.location.href = '/desarrollador';
    } catch (e) {
      setError({ status: e.status, msg: e.body?.detail || 'Error al activar cuenta' });
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, background: '#06080F',
    }} data-testid="accept-invite-page">
      <div style={{
        width: '100%', maxWidth: 440, padding: 32,
        background: 'linear-gradient(145deg, #0D1118, #080A12)',
        border: '1px solid var(--border)', borderRadius: 20,
        boxShadow: '0 24px 60px -20px rgba(0,0,0,0.6)',
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'var(--grad)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Sparkle size={16} color="#fff" />
          </div>
          <div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
              DesarrollosMX
            </div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Portal Desarrollador
            </div>
          </div>
        </div>

        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
            Validando invitación…
          </div>
        )}

        {!loading && error && (
          <div data-testid="invite-error" style={{ padding: 20, borderRadius: 14, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.32)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <AlertTriangle size={16} color="#fca5a5" />
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: '#fca5a5' }}>
                {error.status === 410 ? 'Invitación expirada' : 'Invitación inválida'}
              </div>
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', lineHeight: 1.5 }}>
              {error.msg}
            </div>
            <button
              onClick={() => navigate('/')}
              data-testid="invite-goto-home"
              style={{
                marginTop: 16, padding: '10px 16px', borderRadius: 9999,
                background: 'transparent', border: '1px solid var(--border)',
                color: 'var(--cream-2)', fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              }}>
              Volver al inicio
            </button>
          </div>
        )}

        {!loading && invite && !error && (
          <>
            <div className="eyebrow" style={{ marginBottom: 4 }}>INVITACIÓN ACTIVA</div>
            <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: '0 0 6px', letterSpacing: '-0.025em', lineHeight: 1.15 }}>
              Bienvenido a {invite.dev_org_name}
            </h1>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', lineHeight: 1.55, marginBottom: 22 }}>
              Fuiste invitado como <strong style={{ color: '#f9a8d4' }}>{ROLE_LABELS[invite.role] || invite.role}</strong>.
              Define una contraseña segura para activar tu cuenta <strong>{invite.email}</strong>.
            </p>

            <form onSubmit={submit}>
              <Field label="Contraseña (mín. 8 caracteres)">
                <input
                  data-testid="invite-pwd"
                  type="password" value={pwd} onChange={e => setPwd(e.target.value)}
                  autoComplete="new-password" minLength={8} maxLength={128} required
                  style={inputStyle}
                />
                {pwdTooShort && (
                  <div style={errStyle}>Mínimo 8 caracteres.</div>
                )}
              </Field>

              <Field label="Confirmar contraseña">
                <input
                  data-testid="invite-pwd2"
                  type="password" value={pwd2} onChange={e => setPwd2(e.target.value)}
                  autoComplete="new-password" minLength={8} maxLength={128} required
                  style={inputStyle}
                />
                {pwd2 && !pwdMatch && (
                  <div style={errStyle}>Las contraseñas no coinciden.</div>
                )}
                {pwd2 && pwdMatch && (
                  <div style={{ ...errStyle, color: '#86efac' }}>
                    <CheckCircle size={10} /> Coinciden
                  </div>
                )}
              </Field>

              <button
                data-testid="invite-submit"
                type="submit"
                disabled={!canSubmit}
                style={{
                  width: '100%', padding: '12px', borderRadius: 12, marginTop: 6,
                  background: canSubmit ? 'var(--grad)' : 'rgba(148,163,184,0.2)',
                  border: 'none', color: '#fff',
                  fontFamily: 'DM Sans', fontSize: 14, fontWeight: 600,
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  transition: 'opacity 0.15s',
                  opacity: submitting ? 0.75 : 1,
                }}>
                {submitting ? 'Activando…' : 'Activar cuenta y entrar'}
              </button>
            </form>

            {invite.expires_at && (
              <div style={{ marginTop: 18, fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'var(--cream-3)', textAlign: 'center' }}>
                Esta invitación expira el {new Date(invite.expires_at).toLocaleDateString('es-MX')}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: 'block', fontFamily: 'DM Sans', fontSize: 11,
        color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em',
        marginBottom: 6,
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '11px 14px',
  background: 'rgba(13,17,24,0.6)', border: '1px solid var(--border)',
  borderRadius: 10, color: 'var(--cream)',
  fontFamily: 'DM Sans', fontSize: 14,
  outline: 'none',
};

const errStyle = {
  marginTop: 6, fontFamily: 'DM Sans', fontSize: 11, color: '#fca5a5',
  display: 'inline-flex', alignItems: 'center', gap: 5,
};
