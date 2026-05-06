/**
 * Phase 4 Batch 0.5 — ReportProblemButton
 * Floating button visible in all authenticated portals.
 * Click → modal with description + auto-snapshot of current URL + audit trail.
 */
import React, { useState } from 'react';
import { createProblemReport } from '../../api/diagnostic';
import { AlertTriangle, X } from '../icons';
import { Check } from 'lucide-react';

export default function ReportProblemButton({ user }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  if (!user) return null;

  const submit = async () => {
    if (!description.trim()) return;
    setSubmitting(true);
    try {
      const payload = {
        description: description.trim(),
        current_url: typeof window !== 'undefined' ? window.location.href : null,
        recent_actions: [],
      };
      const r = await createProblemReport(payload);
      setSubmitted(r);
    } catch (e) {
      setSubmitted({ ok: false, error: e.message });
    } finally { setSubmitting(false); }
  };

  const reset = () => {
    setDescription('');
    setSubmitted(null);
    setOpen(false);
  };

  return (
    <>
      <button
        data-testid="report-problem-btn"
        onClick={() => setOpen(true)}
        title="Reportar problema"
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 900,
          background: 'rgba(239,68,68,0.08)',
          color: 'rgba(239,68,68,0.9)',
          border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: '50%', width: 42, height: 42,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
          transition: 'transform 0.15s, background 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.background = 'rgba(239,68,68,0.14)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
      >
        <AlertTriangle size={16} />
      </button>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.85)', zIndex: 1600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }} onClick={reset}>
          <div
            data-testid="report-problem-modal"
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--navy)', border: '1px solid rgba(240,235,224,0.18)',
              borderRadius: 14, padding: 24, width: 440, maxWidth: '100%',
            }}>
            {!submitted ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
                    Reportar problema
                  </h3>
                  <button onClick={reset} style={{ background: 'none', border: 'none', color: 'var(--cream-3)', cursor: 'pointer', padding: 4 }}>
                    <X size={16} />
                  </button>
                </div>
                <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--cream-3)', lineHeight: 1.5 }}>
                  Describe qué estabas intentando hacer y qué salió mal. Capturaremos automáticamente tu URL
                  actual, historial de acciones reciente, y ejecutaremos un diagnóstico de tu cuenta.
                </p>
                <textarea
                  data-testid="problem-description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Ej: Intenté subir un render en Contenido pero después de 30s salió error 500…"
                  rows={5}
                  style={{
                    width: '100%', background: 'rgba(240,235,224,0.06)',
                    border: '1px solid rgba(240,235,224,0.14)', borderRadius: 8,
                    padding: 10, fontSize: 13, color: 'var(--cream)',
                    resize: 'vertical', fontFamily: 'DM Sans,sans-serif', boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                  <button onClick={reset} disabled={submitting}
                    style={{ background: 'none', border: '1px solid rgba(240,235,224,0.12)', color: 'var(--cream-3)', borderRadius: 8, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}>
                    Cancelar
                  </button>
                  <button
                    data-testid="submit-problem-btn"
                    onClick={submit} disabled={submitting || !description.trim()}
                    style={{
                      background: description.trim() ? 'var(--cream)' : 'rgba(240,235,224,0.1)',
                      color: description.trim() ? 'var(--navy)' : 'var(--cream-3)',
                      border: 'none', borderRadius: 8, padding: '7px 16px',
                      fontSize: 12, fontWeight: 700,
                      cursor: submitting || !description.trim() ? 'default' : 'pointer',
                    }}>
                    {submitting ? 'Enviando…' : 'Enviar reporte'}
                  </button>
                </div>
              </>
            ) : submitted.ok !== false ? (
              <div style={{ textAlign: 'center', padding: '16px 8px' }}>
                <div style={{ width: 48, height: 48, margin: '0 auto 12px', borderRadius: '50%', background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={22} color="#22c55e" />
                </div>
                <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
                  Reporte enviado
                </h3>
                <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--cream-3)' }}>
                  ID: <code style={{ color: 'var(--cream-2)' }}>{submitted.report_id}</code>
                  <br />Nuestro equipo lo revisará y te contactará vía email si necesitamos más info.
                </p>
                <button onClick={reset}
                  style={{ background: 'var(--cream)', color: 'var(--navy)', border: 'none', borderRadius: 8, padding: '7px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  Cerrar
                </button>
              </div>
            ) : (
              <div>
                <h3 style={{ margin: '0 0 6px', fontSize: 14, color: '#ef4444' }}>Error al enviar</h3>
                <p style={{ fontSize: 12, color: 'var(--cream-3)' }}>{submitted.error}</p>
                <button onClick={reset}
                  style={{ background: 'rgba(240,235,224,0.1)', color: 'var(--cream)', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer', marginTop: 10 }}>
                  Cerrar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
