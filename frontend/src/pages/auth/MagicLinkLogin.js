/**
 * MagicLinkLogin — Phase 4 Batch 28
 * Página de acceso al portal comprador via magic link.
 *  - Sin token: muestra formulario email + botón "Enviar magic link"
 *  - Con ?token=xxx: auto-verifica + redirige a /comprador
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../App';
import { requestMagicLink, verifyMagicLink } from '../../api/comprador';
import { Sparkle } from '../../components/icons';

export default function MagicLinkLogin() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setUser } = useAuth();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const [debugLink, setDebugLink] = useState(null);

  const [verifyState, setVerifyState] = useState(null); // null | 'pending' | 'success' | 'error'
  const [verifyError, setVerifyError] = useState(null);

  // Auto-verify si llega con ?token=
  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) return;
    setVerifyState('pending');
    verifyMagicLink(token)
      .then(data => {
        if (data?.user) {
          setUser(data.user);
          setVerifyState('success');
          setTimeout(() => navigate('/comprador', { replace: true }), 600);
        } else {
          setVerifyState('error');
          setVerifyError('Respuesta inválida');
        }
      })
      .catch(e => {
        setVerifyState('error');
        setVerifyError(e?.message || 'Token inválido o expirado');
      });
  }, [searchParams, navigate, setUser]);

  const submit = async () => {
    if (!email.trim() || !email.includes('@')) {
      setError('Email inválido');
      return;
    }
    setLoading(true); setError(null);
    try {
      const res = await requestMagicLink(email.trim().toLowerCase(), name.trim());
      setSent(true);
      // En preview env si email no se envía, mostramos el debug_link para
      // que el usuario pueda darle click directamente desde la UI.
      if (!res?.email_sent) {
        // Preferred: usar debug_token y construir URL con el origin del frontend
        if (res?.debug_token) {
          setDebugLink(`${window.location.origin}/login-comprador?token=${res.debug_token}`);
        } else if (res?.debug_link) {
          try {
            const u = new URL(res.debug_link, window.location.origin);
            setDebugLink(`${window.location.origin}${u.pathname}${u.search}`);
          } catch {
            setDebugLink(res.debug_link);
          }
        }
      }
    } catch (e) {
      setError(e?.message || 'Error al enviar el link');
    } finally {
      setLoading(false);
    }
  };

  // Render verify in progress / result
  if (verifyState) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <BrandPill />
          {verifyState === 'pending' && (
            <>
              <H1>Validando tu acceso…</H1>
              <P>Un momento mientras verificamos el link.</P>
            </>
          )}
          {verifyState === 'success' && (
            <>
              <H1>¡Bienvenido!</H1>
              <P>Te llevamos a tu dashboard.</P>
            </>
          )}
          {verifyState === 'error' && (
            <>
              <H1>El link no es válido</H1>
              <P>{verifyError || 'Es posible que haya expirado. Solicita uno nuevo.'}</P>
              <button
                data-testid="magic-link-retry"
                onClick={() => { setVerifyState(null); navigate('/login-comprador', { replace: true }); }}
                style={primaryBtnStyle(true)}
              >
                Solicitar nuevo link
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <BrandPill />
        {sent ? (
          <>
            <H1>Revisa tu correo</H1>
            <P>
              Te enviamos un link a <strong>{email}</strong>. Haz clic en el botón
              del email para entrar (expira en 15 minutos).
            </P>
            <div data-testid="magic-link-sent" style={{
              marginTop: 16,
              padding: '10px 14px', borderRadius: 10,
              background: 'rgba(34,197,94,0.06)',
              border: '1px solid rgba(34,197,94,0.25)',
              fontFamily: 'DM Sans', fontSize: 12,
              color: '#86EFAC',
            }}>
              Link enviado · revisa también tu carpeta de spam.
            </div>
            {debugLink && (
              <div data-testid="magic-link-debug" style={{
                marginTop: 12,
                padding: '12px 14px', borderRadius: 10,
                background: 'rgba(245,158,11,0.06)',
                border: '1px dashed rgba(245,158,11,0.30)',
                fontFamily: 'DM Sans', fontSize: 12,
              }}>
                <div style={{
                  fontWeight: 700, color: '#F59E0B', marginBottom: 6,
                  textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.07em',
                }}>
                  Modo preview · sin email configurado
                </div>
                <a
                  data-testid="magic-link-debug-anchor"
                  href={debugLink}
                  style={{
                    color: '#F0EBE0', textDecoration: 'underline',
                    wordBreak: 'break-all', fontSize: 11,
                  }}
                >
                  {debugLink}
                </a>
              </div>
            )}
            <button
              onClick={() => { setSent(false); setError(null); }}
              style={{ ...secondaryBtnStyle, marginTop: 14 }}
            >
              Usar otro email
            </button>
          </>
        ) : (
          <>
            <H1>Entra a tu portal</H1>
            <P>Te enviamos un link mágico a tu correo. Sin contraseñas.</P>
            <input
              data-testid="magic-link-email"
              type="email"
              autoFocus
              value={email}
              onChange={e => { setEmail(e.target.value); setError(null); }}
              placeholder="tu@email.com"
              style={inputStyle(error)}
            />
            <input
              data-testid="magic-link-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Tu nombre (opcional)"
              style={{ ...inputStyle(false), marginTop: 10 }}
            />
            {error && (
              <div style={errorBoxStyle}>{error}</div>
            )}
            <button
              data-testid="magic-link-submit"
              onClick={submit}
              disabled={loading || !email.includes('@')}
              style={primaryBtnStyle(loading || !email.includes('@'))}
            >
              {loading ? 'Enviando…' : 'Enviar magic link'}
            </button>
            <div style={{
              marginTop: 18, textAlign: 'center',
              fontFamily: 'DM Sans', fontSize: 11,
              color: 'rgba(240,235,224,0.4)',
            }}>
              Sin contraseña · Tu sesión es segura.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function BrandPill() {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      padding: '4px 12px', borderRadius: 9999,
      background: 'rgba(99,102,241,0.12)',
      border: '1px solid rgba(99,102,241,0.30)',
      fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700,
      color: 'rgba(99,102,241,0.95)',
      textTransform: 'uppercase', letterSpacing: '0.08em',
      marginBottom: 16,
    }}>
      <Sparkle size={11} /> Portal comprador
    </div>
  );
}
const H1 = ({ children }) => <h1 style={{
  fontFamily: 'Outfit', fontWeight: 800, fontSize: 28,
  color: 'var(--cream, #F0EBE0)', letterSpacing: '-0.025em',
  margin: '0 0 8px', lineHeight: 1.1,
}}>{children}</h1>;
const P = ({ children }) => <p style={{
  fontFamily: 'DM Sans', fontSize: 13, lineHeight: 1.55,
  color: 'rgba(240,235,224,0.6)', margin: '0 0 18px',
}}>{children}</p>;

const pageStyle = {
  minHeight: '100vh',
  background: 'var(--bg, #06080F)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '24px 18px',
};
const cardStyle = {
  width: '100%', maxWidth: 420,
  padding: '32px 28px',
  background: 'rgba(13,16,23,0.92)',
  border: '1px solid rgba(240,235,224,0.10)',
  borderRadius: 18, backdropFilter: 'blur(24px)',
};
const inputStyle = (hasError) => ({
  width: '100%', padding: '12px 14px',
  background: 'rgba(255,255,255,0.05)',
  border: `1px solid ${hasError ? 'rgba(239,68,68,0.45)' : 'rgba(240,235,224,0.15)'}`,
  borderRadius: 10, outline: 'none',
  fontFamily: 'DM Sans', fontSize: 14,
  color: 'var(--cream, #F0EBE0)',
  boxSizing: 'border-box',
});
const primaryBtnStyle = (disabled) => ({
  width: '100%', marginTop: 16,
  padding: '13px 20px', borderRadius: 9999,
  border: 'none',
  background: disabled ? 'rgba(99,102,241,0.3)' : 'linear-gradient(90deg,#6366F1,#EC4899)',
  color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14,
  cursor: disabled ? 'not-allowed' : 'pointer',
});
const secondaryBtnStyle = {
  width: '100%', padding: '11px 18px', borderRadius: 9999,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(240,235,224,0.15)',
  color: 'rgba(240,235,224,0.7)',
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
  cursor: 'pointer',
};
const errorBoxStyle = {
  marginTop: 10,
  padding: '9px 12px', borderRadius: 8,
  background: 'rgba(239,68,68,0.08)',
  border: '1px solid rgba(239,68,68,0.25)',
  fontFamily: 'DM Sans', fontSize: 12, color: '#FCA5A5',
};
