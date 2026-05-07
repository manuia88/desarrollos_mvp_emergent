// Phase 18 · Batch 35 — Signup público de Inmobiliaria.
// Flujo de 3 pasos: Empresa → AMPI → Admin/Confirmar
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Shield, CheckCircle, AlertCircle } from 'lucide-react';
import { verifyAmpiId, inmobiliariaSignup } from '../../api/inmobiliaria';
import { useAuth } from '../../App';

const inputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: 9999,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(240,235,224,0.12)',
  color: '#F0EBE0', fontFamily: 'DM Sans', fontSize: 14, outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle = {
  fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.55)',
  textTransform: 'uppercase', letterSpacing: '0.08em',
  display: 'block', marginBottom: 6,
};

function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && (
        <div style={{
          fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.45)',
          marginTop: 5,
        }}>{hint}</div>
      )}
    </div>
  );
}

function StepDot({ active, done, n }) {
  const bg = done ? 'linear-gradient(90deg,#6366F1,#EC4899)' : (active ? 'rgba(99,102,241,0.18)' : 'transparent');
  const color = done ? '#fff' : (active ? '#818CF8' : 'rgba(240,235,224,0.4)');
  const border = done ? 'transparent' : `1px solid ${active ? 'rgba(99,102,241,0.5)' : 'rgba(240,235,224,0.18)'}`;
  return (
    <div style={{
      width: 30, height: 30, borderRadius: '50%', border,
      background: bg, color, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, flexShrink: 0,
    }}>
      {done ? <CheckCircle size={14} /> : n}
    </div>
  );
}

export default function InmobiliariaSignup() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const [form, setForm] = useState({
    company_name: '', rfc: '', founded_year: '', contact_phone: '',
    ampi_id: '',
    admin_email: '', admin_password: '', admin_name: '',
  });
  const [ampiCheck, setAmpiCheck] = useState(null); // {valid, reason?, manual_review_required?}
  const [ampiChecking, setAmpiChecking] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const validateStep1 = () => {
    if (!form.company_name.trim() || form.company_name.trim().length < 2) return 'Nombre de la empresa requerido';
    return null;
  };

  const handleAmpiCheck = async () => {
    if (!form.ampi_id.trim()) {
      setAmpiCheck({ valid: false, reason: 'Ingresa el AMPI ID o continúa sin verificar' });
      return;
    }
    setAmpiChecking(true);
    try {
      const r = await verifyAmpiId(form.ampi_id.trim());
      setAmpiCheck(r);
    } catch (e) {
      setAmpiCheck({ valid: false, reason: e.message || 'Error al verificar' });
    } finally {
      setAmpiChecking(false);
    }
  };

  const goNext = () => {
    setErr('');
    if (step === 1) {
      const v = validateStep1();
      if (v) { setErr(v); return; }
      setStep(2);
      return;
    }
    if (step === 2) {
      // AMPI step: opcional saltarse, pero si proporcionaron y no es válido, bloquear
      if (form.ampi_id && (!ampiCheck || !ampiCheck.valid)) {
        setErr('Verifica el AMPI ID antes de continuar o déjalo vacío');
        return;
      }
      setStep(3);
      return;
    }
  };

  const handleSubmit = async () => {
    setErr('');
    if (!form.admin_email.trim() || !form.admin_email.includes('@')) {
      setErr('Email del administrador inválido'); return;
    }
    if (!form.admin_password || form.admin_password.length < 8) {
      setErr('La contraseña debe tener al menos 8 caracteres'); return;
    }
    if (!form.admin_name.trim() || form.admin_name.trim().length < 2) {
      setErr('Nombre del administrador requerido'); return;
    }
    setSubmitting(true);
    try {
      const payload = {
        company_name: form.company_name.trim(),
        admin_email: form.admin_email.trim().toLowerCase(),
        admin_password: form.admin_password,
        admin_name: form.admin_name.trim(),
        ampi_id: form.ampi_id.trim() || null,
        rfc: form.rfc.trim().toUpperCase() || null,
        founded_year: form.founded_year ? parseInt(form.founded_year, 10) : null,
        contact_phone: form.contact_phone.trim() || null,
      };
      await inmobiliariaSignup(payload);
      // Refresh auth context — cookie is set, fetch /me to update state.
      try { await auth.checkAuth?.(); } catch {}
      navigate('/inmobiliaria', { replace: true });
    } catch (e) {
      setErr(e.message || 'Error al registrar la inmobiliaria');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#06080F', padding: '40px 20px',
      display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
    }} data-testid="inmobiliaria-signup-page">
      <div style={{ width: '100%', maxWidth: 540 }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div style={{
            display: 'inline-block', padding: '7px 18px',
            background: 'linear-gradient(90deg,#6366F1,#EC4899)',
            borderRadius: 9999, color: '#fff', fontWeight: 700,
            fontFamily: 'DM Sans', fontSize: 12,
          }}>
            DesarrollosMX
          </div>
        </div>

        <h1 style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 30,
          color: '#F0EBE0', margin: '0 0 8px',
          letterSpacing: '-0.02em', textAlign: 'center',
        }}>
          Da de alta tu Inmobiliaria
        </h1>
        <p style={{
          fontFamily: 'DM Sans', fontSize: 13.5,
          color: 'rgba(240,235,224,0.6)', textAlign: 'center',
          margin: '0 0 26px', lineHeight: 1.55,
        }}>
          Gestiona equipos, alianzas con desarrolladores y métricas agregadas.
        </p>

        {/* Stepper */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 10, marginBottom: 28,
        }}>
          {[1, 2, 3].map((n, idx) => (
            <React.Fragment key={n}>
              <StepDot active={step === n} done={step > n} n={n} />
              {idx < 2 && (
                <div style={{
                  flex: 1, maxWidth: 60, height: 2,
                  background: step > n ? 'linear-gradient(90deg,#6366F1,#EC4899)' : 'rgba(240,235,224,0.12)',
                  borderRadius: 9999,
                }} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Card */}
        <div style={{
          padding: 28, borderRadius: 16,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(240,235,224,0.08)',
          backdropFilter: 'blur(12px)',
        }}>
          {/* Step 1 — Empresa */}
          {step === 1 && (
            <div data-testid="signup-step-empresa">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <Building2 size={18} color="#818CF8" />
                <h2 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: '#F0EBE0', margin: 0 }}>
                  Datos de la empresa
                </h2>
              </div>
              <Field label="Nombre comercial *">
                <input data-testid="signup-company-name" style={inputStyle}
                  value={form.company_name} onChange={e => set('company_name', e.target.value)}
                  placeholder="Inmobiliaria Polanco S.A." />
              </Field>
              <Field label="RFC (opcional)">
                <input data-testid="signup-rfc" style={inputStyle}
                  value={form.rfc} onChange={e => set('rfc', e.target.value)}
                  placeholder="ABCD123456ABC" maxLength={14} />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Año de fundación">
                  <input data-testid="signup-founded-year" style={inputStyle}
                    type="number" value={form.founded_year}
                    onChange={e => set('founded_year', e.target.value)}
                    placeholder="2018" />
                </Field>
                <Field label="Teléfono de contacto">
                  <input data-testid="signup-contact-phone" style={inputStyle}
                    value={form.contact_phone}
                    onChange={e => set('contact_phone', e.target.value)}
                    placeholder="+52 55 1234 5678" />
                </Field>
              </div>
            </div>
          )}

          {/* Step 2 — AMPI */}
          {step === 2 && (
            <div data-testid="signup-step-ampi">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <Shield size={18} color="#818CF8" />
                <h2 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: '#F0EBE0', margin: 0 }}>
                  Verificación AMPI
                </h2>
              </div>
              <p style={{
                fontFamily: 'DM Sans', fontSize: 13,
                color: 'rgba(240,235,224,0.6)', lineHeight: 1.55, margin: '0 0 16px',
              }}>
                Si tu inmobiliaria está registrada en la <strong>AMPI</strong>, ingresa tu ID
                para activar el badge de verificación. Puedes saltarte este paso y verificar después.
              </p>
              <Field label="AMPI ID (8-12 caracteres alfanuméricos)" hint="Ej: AMPI98765">
                <div style={{ display: 'flex', gap: 8 }}>
                  <input data-testid="signup-ampi-id"
                    style={{ ...inputStyle, flex: 1, textTransform: 'uppercase' }}
                    value={form.ampi_id}
                    onChange={e => { set('ampi_id', e.target.value); setAmpiCheck(null); }}
                    placeholder="AMPI12345" maxLength={12} />
                  <button data-testid="signup-ampi-verify-btn"
                    onClick={handleAmpiCheck} disabled={ampiChecking || !form.ampi_id.trim()}
                    style={{
                      padding: '11px 16px', borderRadius: 9999,
                      background: 'rgba(99,102,241,0.15)',
                      border: '1px solid rgba(99,102,241,0.4)',
                      color: '#818CF8', fontFamily: 'DM Sans',
                      fontWeight: 600, fontSize: 12.5,
                      cursor: ampiChecking ? 'wait' : 'pointer', whiteSpace: 'nowrap',
                    }}>
                    {ampiChecking ? 'Verificando…' : 'Verificar'}
                  </button>
                </div>
              </Field>

              {ampiCheck && (
                <div data-testid="signup-ampi-result" style={{
                  marginTop: 4, padding: '11px 14px', borderRadius: 11,
                  background: ampiCheck.valid ? 'rgba(74,222,128,0.08)' : 'rgba(239,68,68,0.08)',
                  border: `1px solid ${ampiCheck.valid ? 'rgba(74,222,128,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                }}>
                  {ampiCheck.valid
                    ? <CheckCircle size={15} color="#4ADE80" style={{ marginTop: 2, flexShrink: 0 }} />
                    : <AlertCircle size={15} color="#F87171" style={{ marginTop: 2, flexShrink: 0 }} />}
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, lineHeight: 1.5 }}>
                    {ampiCheck.valid ? (
                      <>
                        <strong style={{ color: '#4ADE80' }}>Formato válido</strong>
                        <span style={{ color: 'rgba(240,235,224,0.7)' }}>
                          {' · '}AMPI ID: {ampiCheck.ampi_id}.
                          {ampiCheck.manual_review_required && ' Sujeto a revisión manual.'}
                        </span>
                      </>
                    ) : (
                      <span style={{ color: '#F87171' }}>{ampiCheck.reason}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3 — Admin */}
          {step === 3 && (
            <div data-testid="signup-step-admin">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <CheckCircle size={18} color="#818CF8" />
                <h2 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: '#F0EBE0', margin: 0 }}>
                  Tu cuenta de administrador
                </h2>
              </div>
              <Field label="Nombre completo *">
                <input data-testid="signup-admin-name" style={inputStyle}
                  value={form.admin_name} onChange={e => set('admin_name', e.target.value)}
                  placeholder="Ana López" />
              </Field>
              <Field label="Email *">
                <input data-testid="signup-admin-email" style={inputStyle} type="email"
                  value={form.admin_email}
                  onChange={e => set('admin_email', e.target.value)}
                  placeholder="ana@inmobiliariapolanco.mx" />
              </Field>
              <Field label="Contraseña (mín 8 caracteres) *">
                <input data-testid="signup-admin-password" style={inputStyle} type="password"
                  value={form.admin_password}
                  onChange={e => set('admin_password', e.target.value)}
                  placeholder="••••••••" />
              </Field>
            </div>
          )}

          {err && (
            <div data-testid="signup-error" style={{
              marginTop: 10, padding: '10px 14px', borderRadius: 9,
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#F87171', fontFamily: 'DM Sans', fontSize: 12.5,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <AlertCircle size={13} /> {err}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22, gap: 10 }}>
            <button data-testid="signup-prev-btn"
              onClick={() => { setErr(''); if (step > 1) setStep(s => s - 1); else navigate('/'); }}
              style={{
                padding: '11px 22px', borderRadius: 9999,
                background: 'transparent', border: '1px solid rgba(240,235,224,0.18)',
                color: 'rgba(240,235,224,0.7)', fontFamily: 'DM Sans',
                fontWeight: 600, fontSize: 13, cursor: 'pointer',
              }}>
              {step > 1 ? 'Atrás' : 'Cancelar'}
            </button>
            {step < 3 ? (
              <button data-testid="signup-next-btn" onClick={goNext}
                style={{
                  padding: '11px 26px', borderRadius: 9999,
                  background: 'linear-gradient(90deg,#6366F1,#EC4899)',
                  border: 'none', color: '#fff',
                  fontFamily: 'DM Sans', fontWeight: 700,
                  fontSize: 13, cursor: 'pointer',
                }}>
                Siguiente
              </button>
            ) : (
              <button data-testid="signup-submit-btn" onClick={handleSubmit} disabled={submitting}
                style={{
                  padding: '11px 26px', borderRadius: 9999,
                  background: 'linear-gradient(90deg,#6366F1,#EC4899)',
                  border: 'none', color: '#fff',
                  fontFamily: 'DM Sans', fontWeight: 700,
                  fontSize: 13, cursor: submitting ? 'wait' : 'pointer',
                  opacity: submitting ? 0.7 : 1,
                }}>
                {submitting ? 'Creando inmobiliaria…' : 'Crear inmobiliaria'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
