// Phase 14 · Batch 37 — InHouseSignup
// Magic link invitation acceptance page
import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { lookupInvitation, acceptInvitation } from '../../api/internal_users';
import { useAuth } from '../../App';

const ROLE_LABELS = {
  developer_admin: 'Administrador', developer_director: 'Director Comercial',
  developer_advisor: 'Asesor', developer_obras: 'Obras', developer_marketing: 'Marketing',
  inmobiliaria_admin: 'Administrador', inmobiliaria_director: 'Director',
  inmobiliaria_advisor: 'Asesor', inmobiliaria_marketing: 'Marketing',
};

export default function InHouseSignup() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const token = params.get('token') || '';

  const [info, setInfo] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', password: '', confirm: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) { setLoadErr('No se proporcionó un token de invitación.'); setLoading(false); return; }
    lookupInvitation(token)
      .then(d => {
        setInfo(d);
        setForm(f => ({ ...f, name: d.name_hint || '' }));
        setLoading(false);
      })
      .catch(e => { setLoadErr(e.message || 'Token inválido o expirado.'); setLoading(false); });
  }, [token]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) { setFormErr('El nombre es requerido'); return; }
    if (form.password && form.password !== form.confirm) { setFormErr('Las contraseñas no coinciden'); return; }
    setFormErr(''); setSubmitting(true);
    try {
      const res = await acceptInvitation(token, form.name.trim(), form.password || undefined);
      setSuccess(true);
      if (res.user && setUser) setUser(res.user);
      setTimeout(() => navigate(res.redirect || '/desarrollador'), 1800);
    } catch (e) { setFormErr(e.message || 'Error al activar la cuenta'); }
    finally { setSubmitting(false); }
  };

  const inputStyle = {
    width: '100%', padding: '11px 14px', borderRadius: 10,
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
    color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13.5, outline: 'none',
    boxSizing: 'border-box',
  };
  const labelStyle = {
    fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, color: 'rgba(240,235,224,0.50)',
    textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5,
  };

  return (
    <div data-testid="in-house-signup" style={{
      minHeight: '100vh', background: 'var(--bg, #06080F)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-block', padding: '7px 18px',
            background: 'linear-gradient(90deg,#6366F1,#EC4899)',
            borderRadius: 9999, color: '#fff', fontWeight: 700, fontSize: 13, marginBottom: 20,
          }}>
            DesarrollosMX
          </div>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 18, padding: '32px 28px',
        }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: 'rgba(240,235,224,0.40)', fontFamily: 'DM Sans', fontSize: 13 }}>
              Validando invitacion…
            </div>
          )}

          {!loading && loadErr && (
            <div style={{ textAlign: 'center' }}>
              <AlertCircle size={38} color="#F87171" style={{ marginBottom: 14 }} />
              <h2 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', margin: '0 0 8px' }}>
                Invitacion invalida
              </h2>
              <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.55)', margin: 0 }}>
                {loadErr}
              </p>
            </div>
          )}

          {success && (
            <div data-testid="signup-success" style={{ textAlign: 'center' }}>
              <CheckCircle2 size={38} color="#4ADE80" style={{ marginBottom: 14 }} />
              <h2 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', margin: '0 0 8px' }}>
                Cuenta activada
              </h2>
              <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.55)', margin: 0 }}>
                Redirigiendo al portal…
              </p>
            </div>
          )}

          {!loading && !loadErr && !success && info && (
            <>
              <div style={{ marginBottom: 22 }}>
                <h1 style={{
                  fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
                  color: 'var(--cream)', margin: '0 0 6px', letterSpacing: '-0.025em',
                }}>
                  Activar tu cuenta
                </h1>
                <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.55)', margin: 0 }}>
                  Unirse a <strong>{info.org_name}</strong> como{' '}
                  <span style={{ color: '#818CF8', fontWeight: 700 }}>
                    {ROLE_LABELS[info.role] || info.role}
                  </span>
                </p>
              </div>

              {/* Email (readonly) */}
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Correo electronico</label>
                <input style={{ ...inputStyle, opacity: 0.6 }} value={info.email} readOnly />
              </div>

              {/* Name */}
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Tu nombre *</label>
                <input
                  data-testid="signup-name-input"
                  style={inputStyle}
                  placeholder="Nombre completo"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  maxLength={100}
                />
              </div>

              {/* Password (optional) */}
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Contraseña (opcional)</label>
                <div style={{ position: 'relative' }}>
                  <input
                    data-testid="signup-password-input"
                    type={showPwd ? 'text' : 'password'}
                    style={{ ...inputStyle, paddingRight: 40 }}
                    placeholder="Para futuros inicios de sesion"
                    value={form.password}
                    onChange={e => set('password', e.target.value)}
                    maxLength={100}
                  />
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(240,235,224,0.40)', padding: 0 }}>
                    {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {form.password && (
                <div style={{ marginBottom: 18 }}>
                  <label style={labelStyle}>Confirmar contraseña</label>
                  <input
                    data-testid="signup-confirm-input"
                    type={showPwd ? 'text' : 'password'}
                    style={inputStyle}
                    placeholder="Repite la contraseña"
                    value={form.confirm}
                    onChange={e => set('confirm', e.target.value)}
                    maxLength={100}
                  />
                </div>
              )}

              {formErr && (
                <div data-testid="signup-error" style={{
                  padding: '9px 13px', borderRadius: 8, marginBottom: 14,
                  background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.28)',
                  color: '#F87171', fontFamily: 'DM Sans', fontSize: 12.5,
                }}>
                  {formErr}
                </div>
              )}

              <button
                data-testid="signup-submit-btn"
                onClick={submit} disabled={submitting}
                style={{
                  width: '100%', padding: '12px 0', borderRadius: 9999,
                  background: 'linear-gradient(90deg,#6366F1,#EC4899)',
                  border: 'none', color: '#fff',
                  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14,
                  cursor: submitting ? 'wait' : 'pointer',
                  opacity: submitting ? 0.7 : 1,
                  transition: 'opacity 200ms',
                }}
              >
                {submitting ? 'Activando…' : 'Activar mi cuenta'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
