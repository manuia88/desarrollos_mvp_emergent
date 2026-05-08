// W3.7 — /privacy/dsr — Página pública LFPDPPP DSR
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Navbar from '../../components/landing/Navbar';
import { submitDsr, verifyDsrToken } from '../../api/superadminCompliance';

const REQUEST_TYPES = [
  { id: 'access',        label: 'Acceso',        desc: 'Conocer qué datos tenemos sobre ti.' },
  { id: 'deletion',      label: 'Eliminación',   desc: 'Solicitar el borrado de tus datos.' },
  { id: 'portability',   label: 'Portabilidad',  desc: 'Recibir tus datos en formato estructurado.' },
  { id: 'rectification', label: 'Rectificación', desc: 'Corregir datos incorrectos o incompletos.' },
];

const sectionStyle = {
  padding: '22px 0',
  borderTop: '1px solid rgba(255,255,255,0.08)',
};

const labelStyle = {
  fontFamily: 'DM Sans', fontSize: 13,
  color: 'var(--cream-3)', display: 'block', marginBottom: 6,
};

const inputStyle = {
  width: '100%', background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
  color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 14,
  padding: '10px 14px', outline: 'none', boxSizing: 'border-box',
};

export default function PrivacyDsrPage() {
  const [params] = useSearchParams();
  const [form, setForm] = useState({
    request_type: 'deletion',
    subject_email: '',
    subject_phone: '',
    justification: '',
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [verifyResult, setVerifyResult] = useState(null);

  // Handle verification token in URL (/privacy/dsr?dsr_id=…&token=…)
  const dsrId = params.get('dsr_id');
  const token = params.get('token');

  useEffect(() => {
    document.title = 'Privacidad · LFPDPPP · DesarrollosMX';
    // Schema.org TechArticle for SEO
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      'name': 'Derechos LFPDPPP — DesarrollosMX',
      'description': 'Solicitud de derechos ARCO conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP), México.',
      'publisher': { '@type': 'Organization', 'name': 'DesarrollosMX' },
    });
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(script); } catch {} };
  }, []);

  // Auto-verify if URL contains dsr_id + token
  useEffect(() => {
    if (dsrId && token) {
      verifyDsrToken(dsrId, token)
        .then(r => setVerifyResult({ ok: true, ...r }))
        .catch(e => setVerifyResult({ ok: false, error: e.message }));
    }
  }, [dsrId, token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.subject_email) { setError('Email requerido'); return; }
    setLoading(true);
    try {
      const r = await submitDsr({
        request_type: form.request_type,
        subject_email: form.subject_email,
        subject_phone: form.subject_phone || undefined,
        justification: form.justification || undefined,
      });
      setResult(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--cream)' }}>
      <Navbar />
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* ── Verification result banner ── */}
        {verifyResult && (
          <div style={{
            background: verifyResult.ok ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
            border: `1px solid ${verifyResult.ok ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
            borderRadius: 10, padding: '16px 20px', marginBottom: 28,
          }}>
            <p style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16,
              color: verifyResult.ok ? '#6ee7b7' : '#fca5a5', margin: 0 }}>
              {verifyResult.ok ? 'Solicitud verificada correctamente' : 'Error de verificación'}
            </p>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', margin: '6px 0 0' }}>
              {verifyResult.ok
                ? verifyResult.message || 'Nuestro equipo procesará tu solicitud en los próximos 20 días hábiles.'
                : verifyResult.error}
            </p>
            {verifyResult.dsr_id && (
              <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', margin: '4px 0 0' }}>
                Folio: <code>{verifyResult.dsr_id}</code>
              </p>
            )}
          </div>
        )}

        {/* ── Hero ── */}
        <div data-testid="dsr-hero" style={{ marginBottom: 32 }}>
          <p style={{
            fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11,
            letterSpacing: '0.12em', color: '#818cf8', textTransform: 'uppercase',
            margin: '0 0 10px',
          }}>
            Privacidad · LFPDPPP
          </p>
          <h1 style={{
            fontFamily: 'Outfit', fontWeight: 900,
            fontSize: 'clamp(28px, 4vw, 42px)',
            color: 'var(--cream)', margin: '0 0 14px',
          }}>
            Tus derechos de datos
          </h1>
          <p style={{
            fontFamily: 'DM Sans', fontSize: 15, color: 'var(--cream-2)',
            lineHeight: 1.6, margin: 0, maxWidth: 540,
          }}>
            Conforme a la Ley Federal de Protección de Datos Personales en Posesión de los
            Particulares (LFPDPPP), tienes derecho a Acceder, Rectificar, Cancelar y Oponerte
            al tratamiento de tus datos personales.
          </p>
        </div>

        {/* ── Rights info ── */}
        <div data-testid="dsr-rights-section" style={sectionStyle}>
          <h2 style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 18,
            color: 'var(--cream)', margin: '0 0 14px',
          }}>
            Tus derechos ARCO
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {REQUEST_TYPES.map(t => (
              <div key={t.id} style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8, padding: '12px 14px',
              }}>
                <p style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', margin: '0 0 4px' }}>
                  {t.label}
                </p>
                <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', margin: 0 }}>
                  {t.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── DSR Form ── */}
        <div data-testid="dsr-form-section" style={sectionStyle}>
          <h2 style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 18,
            color: 'var(--cream)', margin: '0 0 18px',
          }}>
            Enviar solicitud
          </h2>

          {result ? (
            <div data-testid="dsr-success-banner" style={{
              background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.35)',
              borderRadius: 10, padding: '18px 22px',
            }}>
              <p style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: '#a5b4fc', margin: 0 }}>
                Solicitud enviada
              </p>
              <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)', margin: '8px 0 0' }}>
                {result.message}
              </p>
              <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', margin: '6px 0 0' }}>
                Folio: <code style={{ color: 'var(--cream-2)' }}>{result.dsr_id}</code>
              </p>
              {result.debug_verify_url && (
                <p style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', margin: '6px 0 0' }}>
                  [Modo debug — Resend no configurado]
                  <br />
                  <a href={result.debug_verify_url} style={{ color: '#818cf8' }}>
                    Verificar solicitud
                  </a>
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} data-testid="dsr-form">
              {/* Request type */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Tipo de solicitud</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {REQUEST_TYPES.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      data-testid={`dsr-type-${t.id}`}
                      onClick={() => setForm(f => ({ ...f, request_type: t.id }))}
                      style={{
                        padding: '7px 16px', borderRadius: 9999,
                        fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                        cursor: 'pointer', transition: 'all 0.15s',
                        background: form.request_type === t.id
                          ? 'linear-gradient(90deg, #6366F1, #EC4899)'
                          : 'rgba(255,255,255,0.05)',
                        border: form.request_type === t.id
                          ? 'none'
                          : '1px solid rgba(255,255,255,0.12)',
                        color: 'var(--cream)',
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Email */}
              <div style={{ marginBottom: 14 }}>
                <label htmlFor="dsr-email" style={labelStyle}>Correo electrónico *</label>
                <input
                  id="dsr-email"
                  data-testid="dsr-email-input"
                  type="email"
                  required
                  value={form.subject_email}
                  onChange={e => setForm(f => ({ ...f, subject_email: e.target.value }))}
                  placeholder="tu@correo.com"
                  style={inputStyle}
                />
              </div>

              {/* Phone (optional) */}
              <div style={{ marginBottom: 14 }}>
                <label htmlFor="dsr-phone" style={labelStyle}>Teléfono (opcional)</label>
                <input
                  id="dsr-phone"
                  data-testid="dsr-phone-input"
                  type="tel"
                  value={form.subject_phone}
                  onChange={e => setForm(f => ({ ...f, subject_phone: e.target.value }))}
                  placeholder="+52 55 1234 5678"
                  style={inputStyle}
                />
              </div>

              {/* Justification */}
              <div style={{ marginBottom: 18 }}>
                <label htmlFor="dsr-justification" style={labelStyle}>Comentario (opcional)</label>
                <textarea
                  id="dsr-justification"
                  data-testid="dsr-justification-input"
                  value={form.justification}
                  onChange={e => setForm(f => ({ ...f, justification: e.target.value }))}
                  rows={3}
                  placeholder="Descripción adicional de tu solicitud…"
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              {error && (
                <p style={{ color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 13, margin: '0 0 12px' }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                data-testid="dsr-submit-btn"
                disabled={loading}
                style={{
                  background: loading
                    ? 'rgba(99,102,241,0.4)'
                    : 'linear-gradient(90deg, #6366F1, #EC4899)',
                  border: 'none',
                  color: '#fff', fontFamily: 'Outfit', fontWeight: 700, fontSize: 14,
                  padding: '11px 28px', borderRadius: 9999, cursor: 'pointer',
                  transition: 'opacity 0.2s',
                }}
              >
                {loading ? 'Enviando…' : 'Enviar solicitud'}
              </button>
            </form>
          )}
        </div>

        {/* ── Compliance statement ── */}
        <div style={sectionStyle}>
          <h2 style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 18,
            color: 'var(--cream)', margin: '0 0 12px',
          }}>
            Compromiso de privacidad
          </h2>
          <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', lineHeight: 1.7 }}>
            <p>
              DesarrollosMX aplica <strong style={{ color: 'var(--cream-2)' }}>k-anonimidad ≥ 5</strong> en todos
              los endpoints de datos agregados, garantizando que ninguna respuesta permita
              la re-identificación de individuos.
            </p>
            <p>
              Los datos personales de usuarios se procesan bajo <strong style={{ color: 'var(--cream-2)' }}>
              principios de minimización y finalidad</strong> conforme a la LFPDPPP.
              El registro de auditoría se retiene <strong style={{ color: 'var(--cream-2)' }}>5 años</strong>.
            </p>
            <p>
              Para consultas adicionales contacta: {' '}
              <a href="mailto:privacidad@desarrollosmx.com" style={{ color: '#818cf8' }}>
                privacidad@desarrollosmx.com
              </a>
            </p>
          </div>
        </div>

      </main>
    </div>
  );
}
