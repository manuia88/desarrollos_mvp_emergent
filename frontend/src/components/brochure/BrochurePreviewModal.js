// W4.9 — BrochurePreviewModal
// Modal post-generación: PDF + 4 variantes sociales + regenerar (F0.2·Sub-C).
import React, { useState } from 'react';
import { Z } from '../../styles/zIndex';

const API = process.env.REACT_APP_BACKEND_URL;

const SOCIAL_LABELS = {
  fb_feed: { label: 'Facebook Feed', size: '1200×630' },
  ig_feed: { label: 'Instagram Feed', size: '1080×1080' },
  ig_stories: { label: 'Instagram Stories', size: '1080×1920' },
  wa_status: { label: 'WhatsApp Status', size: '1080×1920' },
};

const VARIANTS = [
  { id: 'dmx_neutral', label: 'DMX Neutral' },
  { id: 'corporate_navy', label: 'Corporate Navy' },
  { id: 'cream_minimal', label: 'Cream Minimal' },
  { id: 'gradient_bold', label: 'Gradient Bold' },
  { id: 'editorial_serif', label: 'Editorial Serif' },
];

export default function BrochurePreviewModal({ brochure: initial, onClose, onRegenerated }) {
  const [brochure, setBrochure] = useState(initial);
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenError, setRegenError] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(
    (initial && initial.branding_variant) || 'dmx_neutral'
  );

  if (!brochure) return null;
  const pdfHref = `${API}${brochure.pdf_url}?t=${encodeURIComponent(brochure.last_regenerated_at || brochure.generated_at || '')}`;
  const socialKeys = Object.keys(brochure.social_variants || {});
  const isCustom = !!brochure.is_custom_upload;

  const handleRegenerate = async () => {
    if (isCustom || regenLoading) return;
    setRegenLoading(true);
    setRegenError(null);
    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      const res = await fetch(`${API}/api/brochures/regenerate/${brochure.brochure_id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ variant: selectedVariant }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.detail || 'No se pudo regenerar.');
      }
      setBrochure(data.brochure);
      if (onRegenerated) onRegenerated(data.brochure);
    } catch (e) {
      setRegenError(e.message || 'Error al regenerar.');
    } finally {
      setRegenLoading(false);
    }
  };

  return (
    <div
      data-testid="brochure-preview-modal"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(var(--bg-rgb),0.78)',
        backdropFilter: 'blur(8px)',
        zIndex: Z.A11Y,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 980, maxHeight: '92vh',
          background: '#0E1220',
          border: '1px solid rgba(var(--cream-rgb),0.12)',
          borderRadius: 18,
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(var(--cream-rgb),0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)' }}>
              Brochure generado
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3, #a0a4b0)', marginTop: 2 }}>
              {brochure.project_name || brochure.project_id}
              {brochure.branding_variant && ` · variante ${brochure.branding_variant}`}
              {brochure.regenerate_count ? ` · regenerado ${brochure.regenerate_count}×` : ''}
            </div>
          </div>
          <button
            type="button"
            data-testid="brochure-modal-close"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid rgba(var(--cream-rgb),0.25)',
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
            marginBottom: 16,
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

          {/* Regenerate panel (F0.2·Sub-C) */}
          {!isCustom && (
            <div style={{
              background: 'rgba(var(--bg-rgb),0.55)',
              border: '1px solid rgba(var(--cream-rgb),0.10)',
              borderRadius: 14,
              padding: 14,
              marginBottom: 20,
            }}>
              <div style={{
                fontFamily: 'Outfit', fontWeight: 700, fontSize: 12,
                letterSpacing: '0.08em', color: 'var(--cream)', marginBottom: 8,
              }}>
                REGENERAR CON OTRA VARIANTE
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                  data-testid="brochure-regen-variant"
                  value={selectedVariant}
                  onChange={(e) => setSelectedVariant(e.target.value)}
                  disabled={regenLoading}
                  style={{
                    background: '#0E1220',
                    color: 'var(--cream)',
                    border: '1px solid rgba(var(--cream-rgb),0.20)',
                    borderRadius: 9999,
                    padding: '8px 14px',
                    fontFamily: 'DM Sans', fontSize: 12,
                  }}
                >
                  {VARIANTS.map((v) => (
                    <option key={v.id} value={v.id}>{v.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  data-testid="brochure-regenerate-btn"
                  onClick={handleRegenerate}
                  disabled={regenLoading}
                  style={{
                    background: regenLoading
                      ? 'rgba(99,102,241,0.40)'
                      : 'linear-gradient(90deg, #6366F1, #EC4899)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 9999,
                    padding: '8px 18px',
                    fontFamily: 'Outfit', fontWeight: 800, fontSize: 11,
                    letterSpacing: '0.1em',
                    cursor: regenLoading ? 'wait' : 'pointer',
                  }}
                >
                  {regenLoading ? 'REGENERANDO…' : 'REGENERAR'}
                </button>
                {regenError && (
                  <div data-testid="brochure-regen-error" style={{
                    fontFamily: 'DM Sans', fontSize: 11, color: 'var(--red)',
                  }}>
                    {regenError}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Social variants grid */}
          {!isCustom && socialKeys.length > 0 && (
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
                  const url = `${API}${brochure.social_variants[k]}?t=${encodeURIComponent(brochure.last_regenerated_at || brochure.generated_at || '')}`;
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
                        background: 'rgba(var(--bg-rgb),0.85)',
                        border: '1px solid rgba(var(--cream-rgb),0.10)',
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

          {isCustom && (
            <div style={{
              background: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(34,197,94,0.35)',
              borderRadius: 12,
              padding: 12,
              fontFamily: 'DM Sans', fontSize: 12, color: 'var(--green)',
            }}>
              Subida personalizada. Las variantes sociales y la opción de regenerar no aplican a PDFs cargados manualmente.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
