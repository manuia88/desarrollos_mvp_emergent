// W4.9 — BrochureGenerator (modal launcher + form)
// Permite: 1) elegir variante de branding, 2) personalizar contacto, 3) generar PDF, 4) subir PDF custom.
import React, { useState } from 'react';
import BrandingVariantSelector from './BrandingVariantSelector';
import CustomBrochureUploader from './CustomBrochureUploader';
import BrochurePreviewModal from './BrochurePreviewModal';

const API = process.env.REACT_APP_BACKEND_URL;

export default function BrochureGenerator({ projectId, projectName, onClose }) {
  const [variant, setVariant] = useState('gradient_bold');
  const [overrides, setOverrides] = useState({ contact_name: '', contact_email: '', contact_phone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleGenerate = async () => {
    setBusy(true);
    setError('');
    try {
      const cleanOverrides = Object.fromEntries(
        Object.entries(overrides).filter(([, v]) => v && String(v).trim())
      );
      const res = await fetch(`${API}/api/brochures/generate`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          variant,
          overrides: Object.keys(cleanOverrides).length ? cleanOverrides : null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.detail || 'generate_failed');
      setResult(data.brochure);
    } catch (e) {
      setError(e.message || 'No se pudo generar el brochure.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        data-testid="brochure-generator-modal"
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(6,8,15,0.78)',
          backdropFilter: 'blur(8px)',
          zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 880, maxHeight: '92vh',
            background: '#0E1220',
            border: '1px solid rgba(240,235,224,0.12)',
            borderRadius: 18,
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(240,235,224,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            background: 'linear-gradient(90deg, rgba(var(--theme-rgb),0.06), rgba(var(--theme-rgb),0.04))',
          }}>
            <div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)' }}>
                Generar brochure
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3, #a0a4b0)', marginTop: 2 }}>
                {projectName || projectId}
              </div>
            </div>
            <button
              type="button"
              data-testid="brochure-generator-close"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid rgba(240,235,224,0.25)',
                borderRadius: 9999,
                color: 'var(--cream)',
                padding: '6px 14px',
                fontFamily: 'Outfit', fontWeight: 700, fontSize: 11, letterSpacing: '0.08em',
                cursor: 'pointer',
              }}
            >
              CERRAR
            </button>
          </div>

          {/* Body */}
          <div style={{ overflow: 'auto', padding: 20, display: 'grid', gap: 20 }}>
            <BrandingVariantSelector value={variant} onChange={setVariant} />

            {/* Contact overrides */}
            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{
                fontFamily: 'Outfit', fontWeight: 700, fontSize: 13,
                letterSpacing: '0.06em', color: 'var(--cream)',
              }}>
                CONTACTO (OPCIONAL · sobre-escribe los datos del tenant)
              </label>
              <div style={{
                display: 'grid', gap: 10,
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              }}>
                {[
                  { key: 'contact_name', placeholder: 'Nombre de contacto', testid: 'brochure-contact-name' },
                  { key: 'contact_email', placeholder: 'Email de contacto', testid: 'brochure-contact-email' },
                  { key: 'contact_phone', placeholder: 'Teléfono / WhatsApp', testid: 'brochure-contact-phone' },
                ].map((f) => (
                  <input
                    key={f.key}
                    data-testid={f.testid}
                    value={overrides[f.key]}
                    onChange={(e) => setOverrides((o) => ({ ...o, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{
                      background: 'rgba(15,18,28,0.85)',
                      border: '1px solid rgba(240,235,224,0.12)',
                      borderRadius: 10,
                      color: 'var(--cream)',
                      padding: '10px 12px',
                      fontFamily: 'DM Sans', fontSize: 13,
                      outline: 'none',
                    }}
                  />
                ))}
              </div>
            </div>

            {error && (
              <div data-testid="brochure-generator-error" style={{
                padding: '10px 14px',
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.4)',
                borderRadius: 10,
                color: '#fca5a5',
                fontFamily: 'DM Sans', fontSize: 13,
              }}>
                {error}
              </div>
            )}

            {/* CTA primario */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                data-testid="brochure-generate-btn"
                onClick={handleGenerate}
                disabled={busy}
                style={{
                  background: busy ? 'rgba(240,235,224,0.15)' : 'linear-gradient(90deg, var(--theme), var(--theme-3))',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 9999,
                  padding: '12px 28px',
                  fontFamily: 'Outfit', fontWeight: 800, fontSize: 13,
                  letterSpacing: '0.1em',
                  cursor: busy ? 'wait' : 'pointer',
                  transition: 'transform 0.18s ease',
                  transform: busy ? 'none' : 'translateY(0)',
                }}
              >
                {busy ? 'GENERANDO…' : 'GENERAR BROCHURE'}
              </button>
            </div>

            {/* Divider */}
            <div style={{
              height: 1, background: 'rgba(240,235,224,0.08)', margin: '4px 0',
            }} />

            {/* Custom upload */}
            <CustomBrochureUploader projectId={projectId} onUploaded={(b) => setResult(b)} />
          </div>
        </div>
      </div>

      {result && (
        <BrochurePreviewModal
          brochure={result}
          onClose={() => { setResult(null); onClose?.(); }}
        />
      )}
    </>
  );
}
