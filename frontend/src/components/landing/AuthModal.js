// AuthModal — email/password login + register + Google OAuth + role picker on first signup
import React, { useState } from 'react';
import { MapPin } from '../icons';

const API = process.env.REACT_APP_BACKEND_URL;

const ROLES = [
  { k: 'buyer',           label: 'Soy comprador',  sub: 'Exploro desarrollos y busco mi próxima casa o inversión.' },
  { k: 'advisor',         label: 'Soy asesor',     sub: 'Uso el CRM Pulppo+ para gestionar contactos, búsquedas y operaciones.' },
  { k: 'developer_admin', label: 'Soy developer',  sub: 'Administro desarrollos, inventario y uso los insights de demanda + pricing.' },
];

export default function AuthModal({ open, onClose, onSuccess, mode: initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode); // login | register | role | google
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [selectedRole, setSelectedRole] = useState('buyer');
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const inputStyle = { width: '100%', padding: '11px 16px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 9999, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13.5, outline: 'none', transition: 'border-color 0.15s' };
  const lblStyle = { fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 };

  const handleGoogle = () => {
    const redirectUrl = window.location.origin + '/';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const handleLogin = async () => {
    setErr(null);
    if (!email || !password) return setErr('Completa email y contraseña.');
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.detail || 'Credenciales inválidas');
      }
      const data = await r.json();
      onSuccess?.(data.user);
      onClose();
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  const handleRegister = async () => {
    setErr(null);
    if (!email || !password || !name) return setErr('Completa todos los campos.');
    if (password.length < 8) return setErr('Mínimo 8 caracteres.');
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ email: email.trim().toLowerCase(), password, name: name.trim(), role: selectedRole }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.detail || 'No se pudo registrar');
      }
      const data = await r.json();
      onSuccess?.(data.user);
      onClose();
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div data-testid="auth-modal" onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(6,8,15,0.82)', backdropFilter: 'blur(14px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: mode === 'register' ? 520 : 440, maxWidth: '100%',
        background: 'linear-gradient(180deg, #0E1220, #0A0D16)',
        border: '1px solid var(--border)', borderRadius: 22,
        padding: 32, boxShadow: '0 28px 80px rgba(0,0,0,0.7)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--grad)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MapPin size={15} color="#fff" />
          </div>
          <div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', letterSpacing: '-0.02em' }}>DesarrollosMX</div>
            <div className="eyebrow" style={{ marginTop: 2 }}>
              {mode === 'login' ? 'INICIAR SESIÓN' : mode === 'register' ? 'CREAR CUENTA' : 'ACCEDE CON GOOGLE'}
            </div>
          </div>
        </div>

        {mode === 'login' && (
          <>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: 'var(--cream)', letterSpacing: '-0.02em', margin: '0 0 18px', lineHeight: 1.15 }}>
              Entra a tu cuenta
            </h2>

            <button onClick={handleGoogle} data-testid="auth-google" className="btn btn-glass" style={{ width: '100%', justifyContent: 'center', marginBottom: 14 }}>
              <svg width={14} height={14} viewBox="0 0 24 24"><path fill="#fff" d="M21.35 11.1h-9.2v2.8h5.3c-.24 1.3-1.6 3.8-5.3 3.8-3.2 0-5.8-2.65-5.8-5.9s2.6-5.9 5.8-5.9c1.8 0 3.05.77 3.75 1.4l2.56-2.46C17.05 3.5 14.75 2.5 12.15 2.5c-5.25 0-9.5 4.25-9.5 9.3s4.25 9.3 9.5 9.3c5.5 0 9.1-3.85 9.1-9.3 0-.6-.05-1.1-.15-1.7z"/></svg>
              Continuar con Google
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0', color: 'var(--cream-3)' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontFamily: 'DM Sans', fontSize: 11 }}>o usa tu email</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label><div style={lblStyle}>Email</div>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} data-testid="auth-email" autoFocus />
              </label>
              <label><div style={lblStyle}>Contraseña</div>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} style={inputStyle} data-testid="auth-password" />
              </label>
              {err && <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: '#fca5a5' }}>{err}</div>}
              <button onClick={handleLogin} disabled={loading} data-testid="auth-submit" className="btn btn-primary" style={{ justifyContent: 'center', opacity: loading ? 0.6 : 1 }}>
                {loading ? 'Entrando…' : 'Entrar'}
              </button>
            </div>
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <button onClick={() => { setMode('register'); setErr(null); }} data-testid="auth-switch-register" style={{ background: 'none', border: 'none', color: 'var(--indigo-3)', fontFamily: 'DM Sans', fontSize: 12.5, cursor: 'pointer' }}>
                ¿Primera vez? Crea tu cuenta →
              </button>
            </div>
          </>
        )}

        {mode === 'register' && (
          <>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: 'var(--cream)', letterSpacing: '-0.02em', margin: '0 0 18px', lineHeight: 1.15 }}>
              Crea tu cuenta
            </h2>

            <div style={lblStyle}>¿Qué tipo de usuario eres?</div>
            <div data-testid="role-picker" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {ROLES.map(r => (
                <button key={r.k} onClick={() => setSelectedRole(r.k)} data-testid={`role-${r.k}`} style={{
                  textAlign: 'left', padding: '11px 14px', borderRadius: 14, cursor: 'pointer',
                  background: selectedRole === r.k ? 'rgba(99,102,241,0.10)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${selectedRole === r.k ? 'rgba(99,102,241,0.36)' : 'var(--border)'}`,
                  color: 'var(--cream)', transition: 'all 0.15s',
                }}>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14 }}>{r.label}</div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 2, lineHeight: 1.4 }}>{r.sub}</div>
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label><div style={lblStyle}>Nombre completo</div>
                <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} data-testid="reg-name" />
              </label>
              <label><div style={lblStyle}>Email</div>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} data-testid="reg-email" />
              </label>
              <label><div style={lblStyle}>Contraseña (mín. 8)</div>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRegister()} style={inputStyle} data-testid="reg-password" />
              </label>
              {err && <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: '#fca5a5' }}>{err}</div>}
              <button onClick={handleRegister} disabled={loading} data-testid="reg-submit" className="btn btn-primary" style={{ justifyContent: 'center', opacity: loading ? 0.6 : 1 }}>
                {loading ? 'Creando…' : 'Crear cuenta'}
              </button>
            </div>
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <button onClick={() => { setMode('login'); setErr(null); }} data-testid="auth-switch-login" style={{ background: 'none', border: 'none', color: 'var(--indigo-3)', fontFamily: 'DM Sans', fontSize: 12.5, cursor: 'pointer' }}>
                ¿Ya tienes cuenta? Inicia sesión →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
