/**
 * ReclamarDev — página PÚBLICA para que el desarrollador oficial reclame una cuenta creada
 * vacía (shell) por el superadmin. Lee el token de la URL, muestra el nombre de la org, y con
 * email+contraseña crea su usuario developer_admin bajo ESE tenant (hereda sus proyectos ya
 * cargados). Después entra a su portal y puede invitar a sus usuarios.
 */
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const API = process.env.REACT_APP_BACKEND_URL;

const wrap = { minHeight: '100vh', background: '#12100E', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'DM Sans, sans-serif' };
const card = { width: '100%', maxWidth: 420, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: '30px 28px', color: '#F0EBE0' };
const inp = { width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '11px 13px', fontSize: 14, color: '#F0EBE0', marginBottom: 12 };
const label = { fontFamily: 'DM Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(240,235,224,0.5)', marginBottom: 5, display: 'block' };
const btn = (on) => ({ width: '100%', background: on ? '#F0EBE0' : 'rgba(255,255,255,0.1)', color: on ? '#12100E' : 'rgba(240,235,224,0.5)', border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 800, fontFamily: 'DM Sans', cursor: on ? 'pointer' : 'not-allowed', marginTop: 6 });

export default function ReclamarDev() {
  const { token } = useParams();
  const [org, setOrg] = useState(null);
  const [state, setState] = useState('loading');   // loading | ready | invalid | done
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/dev-claim/${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => { setOrg(j); setState('ready'); })
      .catch(() => setState('invalid'));
  }, [token]);

  const submit = async () => {
    if (!form.email || !form.email.includes('@') || form.password.length < 8) {
      setErr('Escribe un email válido y una contraseña de al menos 8 caracteres.');
      return;
    }
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`${API}/api/dev-claim/${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(typeof j.detail === 'string' ? j.detail : 'No se pudo reclamar la cuenta');
      }
      setState('done');
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={wrap}>
      <div style={card} data-testid="reclamar-card">
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.12em', color: 'rgba(240,235,224,0.45)', marginBottom: 6 }}>DESARROLLOS<b style={{ color: '#F0EBE0' }}>MX</b></div>

        {state === 'loading' && <div style={{ color: 'rgba(240,235,224,0.6)', fontSize: 14, padding: '20px 0' }}>Cargando invitación…</div>}

        {state === 'invalid' && (
          <div data-testid="reclamar-invalid">
            <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, margin: '4px 0 10px' }}>Invitación no válida</h1>
            <p style={{ fontSize: 14, color: 'rgba(240,235,224,0.65)', lineHeight: 1.6 }}>Este link ya se usó o expiró. Pídele al equipo de DesarrollosMX uno nuevo.</p>
          </div>
        )}

        {state === 'ready' && (
          <div data-testid="reclamar-form">
            <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 23, margin: '4px 0 6px', letterSpacing: '-0.02em' }}>Reclama tu cuenta</h1>
            <p style={{ fontSize: 14, color: 'rgba(240,235,224,0.65)', lineHeight: 1.6, marginBottom: 20 }}>
              Estás por tomar control de <b style={{ color: '#F0EBE0' }}>{org?.name}</b> — con sus proyectos ya cargados. Elige tu acceso:
            </p>
            <label style={label}>Tu nombre</label>
            <input style={inp} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre y apellido" data-testid="reclamar-name" />
            <label style={label}>Email</label>
            <input style={inp} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="tu@empresa.mx" data-testid="reclamar-email" />
            <label style={label}>Contraseña (8+)</label>
            <input style={inp} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" data-testid="reclamar-pass" />
            {err && <div style={{ color: '#F87171', fontSize: 12.5, marginBottom: 8 }} data-testid="reclamar-err">{err}</div>}
            <button onClick={submit} disabled={busy} style={btn(!busy)} data-testid="reclamar-submit">{busy ? 'Creando…' : 'Reclamar y crear mi acceso'}</button>
          </div>
        )}

        {state === 'done' && (
          <div data-testid="reclamar-done">
            <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, margin: '4px 0 10px' }}>✓ Cuenta lista</h1>
            <p style={{ fontSize: 14, color: 'rgba(240,235,224,0.7)', lineHeight: 1.6, marginBottom: 18 }}>
              Ya eres el administrador de <b style={{ color: '#F0EBE0' }}>{org?.name}</b>. Entra con tu email y contraseña — verás tus proyectos y podrás invitar a tu equipo.
            </p>
            <a href="/login" style={{ textDecoration: 'none' }}><button style={btn(true)} data-testid="reclamar-login">Entrar a mi portal</button></a>
          </div>
        )}
      </div>
    </div>
  );
}
