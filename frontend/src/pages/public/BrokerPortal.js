/**
 * W4.18.3 Sub-B — Broker Portal (/broker-portal)
 * Tabs Login | Crear cuenta con código.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/landing/Navbar';
import InviteCodeInput from '../../components/private_beta/InviteCodeInput';
import { useAuth } from '../../App';

const API = process.env.REACT_APP_BACKEND_URL;

const TAB_BTN = (active) => ({
  flex: 1, padding: '11px 18px', borderRadius: 9999, border: 'none',
  background: active ? 'linear-gradient(90deg,#6366F1,#EC4899)' : 'rgba(255,255,255,0.04)',
  color: active ? '#fff' : 'rgba(240,235,224,0.7)',
  fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700, cursor: 'pointer',
});

const INPUT = {
  width: '100%', padding: '12px 16px', borderRadius: 9999,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  color: '#F0EBE0', fontFamily: 'DM Sans', fontSize: 14,
};

const LBL = {
  fontSize: 11, color: 'rgba(240,235,224,0.5)', marginBottom: 6,
  textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Sans',
};

export default function BrokerPortal() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [tab, setTab] = useState('login');

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPwd, setLoginPwd] = useState('');
  const [loginErr, setLoginErr] = useState(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // Signup state
  const [code, setCode] = useState('');
  const [codeValid, setCodeValid] = useState(false);
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPwd, setSignupPwd] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupErr, setSignupErr] = useState(null);
  const [signupLoading, setSignupLoading] = useState(false);

  const submitLogin = async (e) => {
    e.preventDefault();
    setLoginErr(null); setLoginLoading(true);
    try {
      const r = await fetch(`${API}/api/auth/login`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPwd }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || `Error ${r.status}`);
      }
      const data = await r.json().catch(() => ({}));
      if (data.user) setUser(data.user);  // sync AuthProvider state
      navigate('/asesor');
    } catch (e) { setLoginErr(String(e.message || e)); }
    finally { setLoginLoading(false); }
  };

  const submitSignup = async (e) => {
    e.preventDefault();
    if (!codeValid) { setSignupErr('Código inválido'); return; }
    setSignupErr(null); setSignupLoading(true);
    try {
      const r = await fetch(`${API}/api/auth/signup-broker`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: signupEmail, password: signupPwd, name: signupName, invite_code: code,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        const msg = (d.detail && (d.detail.reason || d.detail.code)) || d.detail || `Error ${r.status}`;
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
      }
      const data = await r.json().catch(() => ({}));
      if (data.user) setUser(data.user);  // sync AuthProvider state
      navigate('/asesor');
    } catch (e) { setSignupErr(String(e.message || e)); }
    finally { setSignupLoading(false); }
  };

  return (
    <div style={{ background: '#06080F', minHeight: '100vh', color: '#F0EBE0' }}>
      <Navbar />
      <main style={{ paddingTop: 100, paddingBottom: 80, padding: '100px 24px 80px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a5b4fc', marginBottom: 12, textAlign: 'center' }}>
            ACCESO PRIVADO · BETA
          </div>
          <h1 style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 36, lineHeight: 1.1,
            margin: '0 0 22px', textAlign: 'center', letterSpacing: '-0.02em',
          }}>
            Portal de brokers
          </h1>

          <div data-testid="broker-portal-tabs" style={{
            display: 'flex', gap: 8, padding: 6, borderRadius: 9999,
            background: 'rgba(13,16,23,0.92)', border: '1px solid rgba(255,255,255,0.08)',
            marginBottom: 22,
          }}>
            <button
              data-testid="broker-portal-tab-login"
              type="button"
              onClick={() => setTab('login')}
              style={TAB_BTN(tab === 'login')}
            >Iniciar sesión</button>
            <button
              data-testid="broker-portal-tab-signup"
              type="button"
              onClick={() => setTab('signup')}
              style={TAB_BTN(tab === 'signup')}
            >Crear cuenta con código</button>
          </div>

          {/* Login tab */}
          {tab === 'login' && (
            <form
              onSubmit={submitLogin}
              style={{
                padding: 26, borderRadius: 20,
                background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
                border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex', flexDirection: 'column', gap: 14,
              }}
            >
              <label>
                <div style={LBL}>Correo</div>
                <input data-testid="broker-login-email" type="email" required value={loginEmail} onChange={e => setLoginEmail(e.target.value)} style={INPUT} />
              </label>
              <label>
                <div style={LBL}>Contraseña</div>
                <input data-testid="broker-login-password" type="password" required value={loginPwd} onChange={e => setLoginPwd(e.target.value)} style={INPUT} />
              </label>
              {loginErr && (
                <div role="alert" style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 12 }}>
                  {loginErr}
                </div>
              )}
              <button
                data-testid="broker-login-submit"
                type="submit"
                disabled={loginLoading}
                style={{
                  padding: '12px 22px', borderRadius: 9999, border: 'none',
                  background: 'linear-gradient(90deg,#6366F1,#EC4899)', color: '#fff',
                  fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700,
                  cursor: loginLoading ? 'wait' : 'pointer', opacity: loginLoading ? 0.6 : 1,
                }}
              >{loginLoading ? 'Entrando…' : 'Iniciar sesión'}</button>
            </form>
          )}

          {/* Signup tab */}
          {tab === 'signup' && (
            <form
              onSubmit={submitSignup}
              style={{
                padding: 26, borderRadius: 20,
                background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
                border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex', flexDirection: 'column', gap: 14,
              }}
            >
              <InviteCodeInput
                value={code}
                onChange={setCode}
                onValidChange={setCodeValid}
              />
              <label>
                <div style={LBL}>Correo</div>
                <input data-testid="broker-signup-email" type="email" required value={signupEmail} onChange={e => setSignupEmail(e.target.value)} style={INPUT} />
              </label>
              <label>
                <div style={LBL}>Nombre completo</div>
                <input data-testid="broker-signup-name" type="text" required value={signupName} onChange={e => setSignupName(e.target.value)} style={INPUT} />
              </label>
              <label>
                <div style={LBL}>Contraseña (mín. 8)</div>
                <input data-testid="broker-signup-password" type="password" required minLength={8} value={signupPwd} onChange={e => setSignupPwd(e.target.value)} style={INPUT} />
              </label>
              {signupErr && (
                <div role="alert" style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 12 }}>
                  {signupErr}
                </div>
              )}
              <button
                data-testid="broker-signup-submit"
                type="submit"
                disabled={signupLoading || !codeValid}
                style={{
                  padding: '12px 22px', borderRadius: 9999, border: 'none',
                  background: 'linear-gradient(90deg,#6366F1,#EC4899)', color: '#fff',
                  fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700,
                  cursor: signupLoading || !codeValid ? 'not-allowed' : 'pointer',
                  opacity: signupLoading || !codeValid ? 0.5 : 1,
                }}
              >{signupLoading ? 'Creando cuenta…' : 'Crear cuenta broker'}</button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
