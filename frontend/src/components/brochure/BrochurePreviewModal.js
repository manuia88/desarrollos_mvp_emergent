// W4.9 — BrochurePreviewModal
// Modal post-generación: PDF + 4 variantes sociales.
import React from 'react';

const API = process.env.REACT_APP_BACKEND_URL;

const SOCIAL_LABELS = {
  fb_feed: { label: 'Facebook Feed', size: '1200×630' },
  ig_feed: { label: 'Instagram Feed', size: '1080×1080' },
  ig_stories: { label: 'Instagram Stories', size: '1080×1920' },
  wa_status: { label: 'WhatsApp Status', size: '1080×1920' },
};

export default function BrochurePreviewModal({ brochure, onClose }) {
  if (!brochure) return null;
  const pdfHref = `${API}${brochure.pdf_url}`;
  const socialKeys = Object.keys(brochure.social_variants || {});

  return (
    <div
      data-testid="brochure-preview-modal"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(6,8,15,0.78)',
        backdropFilter: 'blur(8px)',
        zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 980, maxHeight: '92vh',
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
        }}>
          <div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)' }}>
              Brochure generado
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3, #a0a4b0)', marginTop: 2 }}>
              {brochure.project_name || brochure.project_id}
              {brochure.branding_variant && ` · variante ${brochure.branding_variant}`}
            </div>
          </div>
          <button
            type="button"
            data-testid="brochure-modal-close"
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
        <div style={{ overflow: 'auto', padding: 20 }}>
          {/* PDF block */}
          <div style={{
            background: 'rgba(99,102,241,0.06)',
            border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: 14,
            padding: 16,
            marginBottom: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>
                PDF profesional · A4 · 6 páginas
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3, #a0a4b0)' }}>
                {brochure.pdf_size_bytes ? `${(brochure.pdf_size_bytes / 1024).toFixed(0)} KB` : 'PDF listo'} ·
                Expira el {String(brochure.expires_at || '').slice(0, 10)}
              </div>
            </div>
            <a
              href={pdfHref}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="brochure-download-pdf"
              style={{
                background: 'linear-gradient(90deg, #6366F1, #EC4899)',
                color: '#fff',
                border: 'none',
                borderRadius: 9999,
                padding: '10px 20px',
                fontFamily: 'Outfit', fontWeight: 800, fontSize: 12,
                letterSpacing: '0.1em',
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              DESCARGAR PDF
            </a>
          </div>

          {/* Social variants grid */}
          {!brochure.is_custom_upload && socialKeys.length > 0 && (
            <>
              <div style={{
                fontFamily: 'Outfit', fontWeight: 700, fontSize: 13,
                letterSpacing: '0.08em', color: 'var(--cream)', marginBottom: 10,
              }}>
                VARIANTES SOCIALES
              </div>
              <div style={{
                display: 'grid', gap: 12,
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              }}>
                {socialKeys.map((k) => {
                  const meta = SOCIAL_LABELS[k] || { label: k, size: '' };
                  const url = `${API}${brochure.social_variants[k]}`;
                  const isVertical = k === 'ig_stories' || k === 'wa_status';
                  return (
                    <a
                      key={k}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid={`brochure-social-${k}`}
                      style={{
                        display: 'block',
                        background: 'rgba(15,18,28,0.85)',
                        border: '1px solid rgba(240,235,224,0.10)',
                        borderRadius: 12,
                        overflow: 'hidden',
                        textDecoration: 'none',
                      }}
                    >
                      <div style={{
                        aspectRatio: isVertical ? '9 / 16' : (k === 'ig_feed' ? '1 / 1' : '1.91 / 1'),
                        background: '#06080F',
                        backgroundImage: `url(${url})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }} />
                      <div style={{ padding: 10 }}>
                        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 12, color: 'var(--cream)' }}>
                          {meta.label}
                        </div>
                        <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3, #a0a4b0)', marginTop: 2 }}>
                          {meta.size} · click para abrir
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            </>
          )}

          {brochure.is_custom_upload && (
            <div style={{
              background: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(34,197,94,0.35)',
              borderRadius: 12,
              padding: 12,
              fontFamily: 'DM Sans', fontSize: 12, color: '#86efac',
            }}>
              Subida personalizada. Las variantes sociales no se generan para PDFs cargados manualmente.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
