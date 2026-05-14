/**
 * SaveSearchModal — Phase 4 Batch 25
 * Captura email del usuario para recibir alertas de nuevas propiedades.
 * Se activa cuando hay filtros activos en el marketplace.
 *
 * Props:
 *   open       — boolean
 *   onClose    — callback
 *   filters    — filtros actuales del marketplace
 *   aiFilters  — filtros IA adicionales
 */
import React, { useState } from 'react';
import { saveSearch } from '../../api/marketplace';
import { X, Bell } from '../icons';

function FiltersPreview({ filters }) {
  const parts = [];
  if (filters?.colonia) parts.push(`Colonia: ${filters.colonia}`);
  if (filters?.zona) parts.push(`Zona: ${filters.zona}`);
  if (filters?.tipo) parts.push(`Tipo: ${filters.tipo}`);
  if (filters?.price_max) parts.push(`Hasta $${(filters.price_max / 1_000_000).toFixed(1)}M`);
  if (filters?.recamaras_min) parts.push(`${filters.recamaras_min}+ rec.`);

  if (!parts.length) return null;

  return (
    <div style={{
      padding: '10px 12px',
      background: 'rgba(var(--theme-rgb),0.08)',
      border: '1px solid rgba(var(--theme-rgb),0.18)',
      borderRadius: 10, marginBottom: 20,
    }}>
      <div style={{
        fontFamily: 'DM Sans', fontSize: 10,
        color: 'rgba(var(--theme-rgb),0.7)',
        textTransform: 'uppercase', letterSpacing: '0.07em',
        fontWeight: 600, marginBottom: 6,
      }}>
        Filtros activos
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {parts.map((p, i) => (
          <span key={i} style={{
            padding: '3px 9px', borderRadius: 9999,
            background: 'rgba(var(--theme-rgb),0.12)',
            border: '1px solid rgba(var(--theme-rgb),0.22)',
            fontFamily: 'DM Sans', fontSize: 11,
            color: 'rgba(240,235,224,0.75)',
          }}>
            {p}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function SaveSearchModal({ open, onClose, filters, aiFilters }) {
  const [email, setEmail] = useState('');
  const [frequency, setFrequency] = useState('weekly');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  const mergedFilters = { ...(filters || {}), ...(aiFilters || {}) };
  const hasFilters = Object.keys(mergedFilters).length > 0;

  const handleSubmit = async () => {
    if (!email.trim() || !email.includes('@') || !accepted) return;
    setLoading(true);
    setError(null);
    try {
      await saveSearch(email.trim(), mergedFilters, frequency);
      setSuccess(true);
    } catch (err) {
      setError(err?.message || 'Error al guardar la búsqueda. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setEmail('');
    setFrequency('weekly');
    setAccepted(false);
    setSuccess(false);
    setError(null);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      data-testid="save-search-modal-backdrop"
      onClick={handleClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(6,8,15,0.82)',
        backdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        data-testid="save-search-modal"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'rgba(13,16,23,0.98)',
          border: '1px solid rgba(240,235,224,0.12)',
          borderRadius: 20, padding: '24px',
          width: '100%', maxWidth: 440,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 20,
              color: 'var(--cream, #F0EBE0)', letterSpacing: '-0.02em',
            }}>
              Guardar búsqueda
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.45)', marginTop: 2 }}>
              Recibe alertas cuando haya nuevas propiedades
            </div>
          </div>
          <button
            data-testid="save-search-close"
            onClick={handleClose}
            style={{
              width: 30, height: 30, borderRadius: 9999,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(240,235,224,0.15)',
              color: 'rgba(240,235,224,0.6)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={12} />
          </button>
        </div>

        {/* No filters state */}
        {!hasFilters ? (
          <div style={{
            padding: '28px 20px', textAlign: 'center',
            background: 'rgba(255,255,255,0.02)',
            border: '1px dashed rgba(240,235,224,0.12)',
            borderRadius: 14,
            fontFamily: 'DM Sans', color: 'rgba(240,235,224,0.5)',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 9999, margin: '0 auto 12px',
              background: 'rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bell size={18} style={{ color: 'rgba(240,235,224,0.3)' }} />
            </div>
            <div style={{ fontWeight: 700, marginBottom: 5 }}>Aplica filtros primero</div>
            <div style={{ fontSize: 12 }}>Sin filtros no hay nada que guardar</div>
          </div>
        ) : success ? (
          /* Success state */
          <div style={{
            padding: '28px 20px', textAlign: 'center',
            background: 'rgba(34,197,94,0.06)',
            border: '1px solid rgba(34,197,94,0.25)',
            borderRadius: 14,
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
            <div style={{
              fontFamily: 'Outfit', fontWeight: 700, fontSize: 16,
              color: '#86EFAC', marginBottom: 8,
            }}>
              ¡Alerta guardada!
            </div>
            <div style={{
              fontFamily: 'DM Sans', fontSize: 13,
              color: 'rgba(134,239,172,0.75)',
            }}>
              Te enviamos un email de confirmación a <strong>{email}</strong>.<br />
              Haz click en el link para activar tus alertas.
            </div>
          </div>
        ) : (
          /* Form */
          <>
            <FiltersPreview filters={mergedFilters} />

            {/* Email */}
            <div style={{ marginBottom: 14 }}>
              <label style={{
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
                color: 'rgba(240,235,224,0.7)',
                display: 'block', marginBottom: 7,
              }}>
                Correo electrónico
              </label>
              <input
                data-testid="save-search-email"
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(null); }}
                placeholder="tu@email.com"
                style={{
                  width: '100%', padding: '11px 14px',
                  background: 'rgba(255,255,255,0.05)',
                  border: `1px solid ${error ? 'rgba(239,68,68,0.4)' : 'rgba(240,235,224,0.15)'}`,
                  borderRadius: 10, outline: 'none',
                  fontFamily: 'DM Sans', fontSize: 13,
                  color: 'var(--cream, #F0EBE0)',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Frequency */}
            <div style={{ marginBottom: 16 }}>
              <label style={{
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
                color: 'rgba(240,235,224,0.7)',
                display: 'block', marginBottom: 7,
              }}>
                Frecuencia de alertas
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { k: 'daily', label: 'Diaria' },
                  { k: 'weekly', label: 'Semanal' },
                ].map(({ k, label }) => (
                  <button
                    key={k}
                    data-testid={`save-freq-${k}`}
                    onClick={() => setFrequency(k)}
                    style={{
                      flex: 1, padding: '9px 0', borderRadius: 9999, cursor: 'pointer',
                      border: frequency === k
                        ? '1px solid rgba(var(--theme-rgb),0.5)'
                        : '1px solid rgba(240,235,224,0.15)',
                      background: frequency === k
                        ? 'rgba(var(--theme-rgb),0.15)'
                        : 'rgba(255,255,255,0.04)',
                      fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
                      color: frequency === k ? 'rgba(var(--theme-rgb),0.9)' : 'rgba(240,235,224,0.5)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Checkbox */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 20 }}>
              <input
                type="checkbox"
                id="ss-accept"
                data-testid="save-search-accept"
                checked={accepted}
                onChange={e => setAccepted(e.target.checked)}
                style={{ marginTop: 2, accentColor: 'var(--theme)', cursor: 'pointer' }}
              />
              <label htmlFor="ss-accept" style={{
                fontFamily: 'DM Sans', fontSize: 12,
                color: 'rgba(240,235,224,0.55)', cursor: 'pointer', lineHeight: 1.5,
              }}>
                Acepto recibir alertas de nuevas propiedades de DesarrollosMX. Puedo cancelar en cualquier momento.
              </label>
            </div>

            {error && (
              <div style={{
                padding: '9px 12px', borderRadius: 8, marginBottom: 14,
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.25)',
                fontFamily: 'DM Sans', fontSize: 12, color: '#FCA5A5',
              }}>
                {error}
              </div>
            )}

            <button
              data-testid="save-search-submit"
              onClick={handleSubmit}
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
                    border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
                    display: 'inline-block', animation: 'spin 0.7s linear infinite',
                  }} />
                  Guardando…
                </>
              ) : (
                <><Bell size={14} /> Guardar y activar alertas</>
              )}
            </button>
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
