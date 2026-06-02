/**
 * ColoniaReportModal — Phase 4 Batch 26 (C3)
 * Modal que captura email del usuario y descarga el reporte PDF de la colonia.
 *
 * Props:
 *   open       — boolean
 *   onClose    — callback
 *   coloniaId  — id de la colonia (slug)
 *   coloniaNombre — nombre legible para el header
 */
import React, { useState } from 'react';
import { requestColoniaReport } from '../../api/marketplace';
import { X, FileText, Download } from '../icons';
import { Z } from '../../styles/zIndex';

function downloadPdfFromBase64(b64, filename) {
  const byteChars = atob(b64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename || 'reporte.pdf';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ColoniaReportModal({ open, onClose, coloniaId, coloniaNombre }) {
  const [email, setEmail] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null); // {filename}
  const [error, setError] = useState(null);

  const close = () => {
    setEmail(''); setAccepted(false); setLoading(false);
    setSuccess(null); setError(null);
    onClose && onClose();
  };

  const submit = async () => {
    if (!email.trim() || !email.includes('@') || !accepted || !coloniaId) return;
    setLoading(true); setError(null);
    try {
      const data = await requestColoniaReport(coloniaId, email.trim(), true);
      if (data.pdf_base64) {
        downloadPdfFromBase64(data.pdf_base64, data.pdf_filename || `reporte_${coloniaNombre}.pdf`);
      }
      setSuccess({ filename: data.pdf_filename, email_sent: !!data.email_sent });
    } catch (err) {
      setError(err?.message || 'Error generando el reporte. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      data-testid="colonia-report-modal-backdrop"
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: Z.DROPDOWN,
        background: 'rgba(var(--bg-rgb),0.82)', backdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        data-testid="colonia-report-modal"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'rgba(var(--bg-rgb),0.98)',
          border: '1px solid rgba(var(--cream-rgb),0.12)',
          borderRadius: 20, padding: '24px',
          width: '100%', maxWidth: 460,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '4px 10px', borderRadius: 9999,
              background: 'rgba(var(--theme-rgb),0.12)',
              border: '1px solid rgba(var(--theme-rgb),0.25)',
              fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700,
              color: 'rgba(var(--theme-rgb),0.9)',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              marginBottom: 8,
            }}>
              <FileText size={11} /> Reporte gratis
            </div>
            <div style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
              color: 'var(--cream, #F0EBE0)', letterSpacing: '-0.02em',
              lineHeight: 1.2,
            }}>
              {coloniaNombre || 'Reporte de colonia'}
            </div>
            <div style={{
              fontFamily: 'DM Sans', fontSize: 12,
              color: 'rgba(var(--cream-rgb),0.5)', marginTop: 4,
            }}>
              PDF de 10 páginas con precios, scores IE, riesgos, climate twin y desarrollos.
            </div>
          </div>
          <button
            data-testid="colonia-report-close"
            onClick={close}
            style={{
              width: 30, height: 30, borderRadius: 9999,
              background: 'rgba(var(--cream-rgb),0.06)',
              border: '1px solid rgba(var(--cream-rgb),0.15)',
              color: 'rgba(var(--cream-rgb),0.6)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <X size={12} />
          </button>
        </div>

        {success ? (
          <div style={{
            padding: '24px 18px', textAlign: 'center',
            background: 'rgba(34,197,94,0.06)',
            border: '1px solid rgba(34,197,94,0.25)',
            borderRadius: 14,
          }}>
            <div style={{
              width: 48, height: 48, margin: '0 auto 12px',
              borderRadius: 9999,
              background: 'rgba(34,197,94,0.14)',
              border: '1px solid rgba(34,197,94,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Download size={20} style={{ color: 'var(--green)' }} />
            </div>
            <div style={{
              fontFamily: 'Outfit', fontWeight: 700, fontSize: 16,
              color: 'var(--green)', marginBottom: 6,
            }}>
              ¡Reporte generado!
            </div>
            <div style={{
              fontFamily: 'DM Sans', fontSize: 13,
              color: 'rgba(134,239,172,0.75)', lineHeight: 1.5,
            }}>
              La descarga inició automáticamente.<br />
              {success.email_sent
                ? <>También enviamos una copia a <strong>{email}</strong>.</>
                : <>Te llegará una copia por email en breve.</>}
            </div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={{
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
                color: 'rgba(var(--cream-rgb),0.7)',
                display: 'block', marginBottom: 7,
              }}>
                ¿A qué email enviamos tu reporte?
              </label>
              <input
                data-testid="colonia-report-email"
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(null); }}
                placeholder="tu@email.com"
                style={{
                  width: '100%', padding: '11px 14px',
                  background: 'rgba(var(--cream-rgb),0.05)',
                  border: `1px solid ${error ? 'rgba(239,68,68,0.4)' : 'rgba(var(--cream-rgb),0.15)'}`,
                  borderRadius: 10, outline: 'none',
                  fontFamily: 'DM Sans', fontSize: 13,
                  color: 'var(--cream, #F0EBE0)',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 18 }}>
              <input
                type="checkbox"
                id="cr-accept"
                data-testid="colonia-report-accept"
                checked={accepted}
                onChange={e => setAccepted(e.target.checked)}
                style={{ marginTop: 2, accentColor: 'var(--theme)', cursor: 'pointer' }}
              />
              <label htmlFor="cr-accept" style={{
                fontFamily: 'DM Sans', fontSize: 12,
                color: 'rgba(var(--cream-rgb),0.55)', cursor: 'pointer', lineHeight: 1.5,
              }}>
                Acepto recibir información relevante sobre {coloniaNombre || 'esta colonia'} y desarrollos relacionados de DesarrollosMX.
              </label>
            </div>

            {error && (
              <div style={{
                padding: '9px 12px', borderRadius: 8, marginBottom: 14,
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.25)',
                fontFamily: 'DM Sans', fontSize: 12, color: 'var(--red)',
              }}>
                {error}
              </div>
            )}

            <button
              data-testid="colonia-report-submit"
              onClick={submit}
              disabled={!email.trim() || !email.includes('@') || !accepted || loading}
              style={{
                width: '100%', padding: '13px 20px',
                borderRadius: 9999, border: 'none',
                background: (!email.trim() || !email.includes('@') || !accepted || loading)
                  ? 'rgba(var(--theme-rgb),0.3)'
                  : 'linear-gradient(90deg, var(--theme), var(--theme-3))',
                color: '#fff',
                fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14,
                cursor: (!email.trim() || !email.includes('@') || !accepted || loading)
                  ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'background 0.2s',
              }}
            >
              {loading ? (
                <>
                  <span style={{
                    width: 15, height: 15, borderRadius: '50%',
                    border: '2px solid rgba(var(--cream-rgb),0.3)', borderTopColor: '#fff',
                    display: 'inline-block', animation: 'spin 0.7s linear infinite',
                  }} />
                  Generando reporte…
                </>
              ) : (
                <><Download size={14} /> Descargar reporte gratis</>
              )}
            </button>

            <div style={{
              marginTop: 12, textAlign: 'center',
              fontFamily: 'DM Sans', fontSize: 11,
              color: 'rgba(var(--cream-rgb),0.4)',
            }}>
              Sin spam. Cancelas cuando quieras.
            </div>
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
