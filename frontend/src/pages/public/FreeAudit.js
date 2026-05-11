// W4.16 — FreeAudit landing (public /free-audit)
import React, { useEffect, useState } from 'react';
import AuditFormStep from '../../components/marketing/AuditFormStep';
import AuditResultCard from '../../components/marketing/AuditResultCard';

const API = process.env.REACT_APP_BACKEND_URL;
const TOTAL_STEPS = 4;

function getUTMs() {
  try {
    const sp = new URLSearchParams(window.location.search);
    return {
      utm_source: sp.get('utm_source') || '',
      utm_medium: sp.get('utm_medium') || '',
      utm_campaign: sp.get('utm_campaign') || '',
    };
  } catch (_) { return {}; }
}

export default function FreeAudit() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    project_name: '', colonia_slug: '', m2: '',
    recamaras: '', banos: '', antiguedad_anos: 0,
    precio_estimado: '', descripcion: '',
    email: '', phone: '', consent: false,
    ...getUTMs(),
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [globalError, setGlobalError] = useState('');

  useEffect(() => {
    // Track page view via PostHog (silent)
    try { window.posthog?.capture?.('free_audit_viewed'); } catch (_) {}
  }, []);

  const validate = (s) => {
    const e = {};
    if (s === 1) {
      if (!form.project_name?.trim()) e.project_name = 'Requerido';
      if (!form.colonia_slug?.trim()) e.colonia_slug = 'Requerido';
      if (!form.m2 || Number(form.m2) <= 0) e.m2 = 'Requerido';
      if (form.recamaras === '' || form.recamaras === null) e.recamaras = 'Requerido';
      if (form.banos === '' || form.banos === null) e.banos = 'Requerido';
    } else if (s === 4) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email || '')) e.email = 'Email inválido';
      if (!form.consent) e.consent = 'Debes aceptar el aviso';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const uploadFloorPlan = async () => {
    if (!form._floor_plan_file) return null;
    const fd = new FormData();
    fd.append('file', form._floor_plan_file);
    try {
      const r = await fetch(`${API}/api/free-audit/upload-floor-plan`, { method: 'POST', body: fd });
      const d = await r.json();
      if (d?.ok) return d.floor_plan_url;
    } catch (_) {}
    return null;
  };

  const handleSubmit = async () => {
    if (!validate(4)) return;
    setSubmitting(true);
    setGlobalError('');
    try {
      let floor_plan_url = form.floor_plan_url || null;
      if (form._floor_plan_file) {
        floor_plan_url = await uploadFloorPlan();
        setForm((f) => ({ ...f, _floor_plan_uploaded: !!floor_plan_url }));
      }
      const payload = {
        project_name: form.project_name,
        colonia_slug: form.colonia_slug,
        m2: Number(form.m2),
        recamaras: Number(form.recamaras),
        banos: Number(form.banos),
        antiguedad_anos: Number(form.antiguedad_anos || 0),
        precio_estimado: Number(form.precio_estimado || 0),
        descripcion: form.descripcion || '',
        floor_plan_url,
        email: form.email,
        phone: form.phone || null,
        utm_source: form.utm_source,
        utm_medium: form.utm_medium,
        utm_campaign: form.utm_campaign,
        locale: 'es-MX',
        consent: !!form.consent,
      };
      const r = await fetch(`${API}/api/free-audit/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok || !d?.ok) {
        throw new Error(d?.detail || `Error ${r.status}`);
      }
      setResult({
        audit_id: d.audit_id,
        project_name: form.project_name,
        colonia: form.colonia_slug,
        email: form.email,
      });
      try { window.posthog?.capture?.('free_audit_submitted', { audit_id: d.audit_id }); } catch (_) {}
    } catch (e) {
      setGlobalError(e.message || 'No se pudo generar el audit.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    if (validate(step)) {
      if (step < TOTAL_STEPS) setStep(step + 1);
      else handleSubmit();
    }
  };

  return (
    <div data-testid="free-audit-page" style={{
      minHeight: '100vh',
      background: '#06080F',
      color: '#F0EBE0',
      paddingTop: 80, paddingBottom: 80,
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 6,
        background: 'linear-gradient(90deg, #6366F1, #EC4899)',
      }} />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px' }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <span style={{
            display: 'inline-block',
            padding: '5px 14px', borderRadius: 9999,
            background: 'rgba(99,102,241,0.12)',
            color: '#a5b4fc',
            fontFamily: 'Outfit', fontWeight: 700, fontSize: 10, letterSpacing: '0.12em',
            marginBottom: 18,
          }}>
            DMX · AUDIT GRATUITO
          </span>
          <h1 style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(34px, 6vw, 56px)',
            margin: 0, lineHeight: 1.1, letterSpacing: '-0.02em',
          }}>
            Audita tu propiedad <span style={{
              background: 'linear-gradient(90deg, #6366F1, #EC4899)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>CDMX</span> gratis
          </h1>
          <p style={{
            fontFamily: 'DM Sans', fontSize: 16, color: 'var(--cream-3, #a0a4b0)',
            marginTop: 18, lineHeight: 1.55,
          }}>
            DMX te dice cuánto vale, dónde está parada en el mercado y qué hacer para optimizar venta.
            Modelo hedónico + Zone Score + escenarios ROI. Tu reporte PDF en 60 segundos.
          </p>
        </div>

        {!result ? (
          <div style={{
            background: 'rgba(13,16,23,0.92)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 18,
            padding: 28,
            backdropFilter: 'blur(24px)',
          }}>
            {/* Stepper */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 22,
            }}>
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
                const idx = i + 1;
                const active = idx <= step;
                return (
                  <div
                    key={idx}
                    style={{
                      flex: 1, height: 4, borderRadius: 9999,
                      background: active
                        ? 'linear-gradient(90deg, #6366F1, #EC4899)'
                        : 'rgba(240,235,224,0.10)',
                      transition: 'background 240ms ease',
                    }}
                  />
                );
              })}
            </div>
            <div style={{
              fontFamily: 'Outfit', fontWeight: 700, fontSize: 14,
              color: 'var(--cream)', marginBottom: 18,
            }}>
              Paso {step} de {TOTAL_STEPS}
            </div>

            <AuditFormStep step={step} form={form} onChange={setForm} errors={errors} />

            {globalError && (
              <div style={{
                marginTop: 18, padding: '10px 14px',
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.4)',
                borderRadius: 10,
                color: '#fca5a5',
                fontFamily: 'DM Sans', fontSize: 13,
              }}>
                {globalError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 26, gap: 12 }}>
              <button
                type="button"
                onClick={() => setStep(Math.max(1, step - 1))}
                disabled={step === 1 || submitting}
                style={{
                  background: 'transparent', color: 'var(--cream)',
                  border: '1px solid rgba(240,235,224,0.25)', borderRadius: 9999,
                  padding: '10px 22px',
                  fontFamily: 'Outfit', fontWeight: 700, fontSize: 11, letterSpacing: '0.08em',
                  cursor: step === 1 ? 'not-allowed' : 'pointer',
                  opacity: step === 1 ? 0.45 : 1,
                }}
              >
                ATRÁS
              </button>
              <button
                type="button"
                data-testid="audit-submit"
                onClick={handleNext}
                disabled={submitting}
                style={{
                  background: 'linear-gradient(90deg, #6366F1, #EC4899)',
                  color: '#fff', border: 'none', borderRadius: 9999,
                  padding: '12px 30px',
                  fontFamily: 'Outfit', fontWeight: 800, fontSize: 12, letterSpacing: '0.1em',
                  cursor: submitting ? 'wait' : 'pointer',
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? 'GENERANDO…' : step === TOTAL_STEPS ? 'GENERAR AUDIT' : 'CONTINUAR'}
              </button>
            </div>
          </div>
        ) : (
          <AuditResultCard
            auditId={result.audit_id}
            projectName={result.project_name}
            colonia={result.colonia}
            email={result.email}
          />
        )}

        <div style={{
          marginTop: 32, textAlign: 'center',
          fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3, #a0a4b0)',
        }}>
          LFPDPPP · Tus datos están protegidos · DMX no comparte tu información con terceros.
        </div>
      </div>
    </div>
  );
}
