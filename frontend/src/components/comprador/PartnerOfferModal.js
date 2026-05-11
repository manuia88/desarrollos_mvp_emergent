// W3.8 — PartnerOfferModal — inline lead form, no external redirects, honest messaging
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { fillOffer } from '../../api/crossSell';

const inputStyle = {
  width: '100%', background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
  color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13,
  padding: '9px 12px', outline: 'none', boxSizing: 'border-box',
};

const labelStyle = {
  fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)',
  display: 'block', marginBottom: 5,
};

const rowStyle = { marginBottom: 12 };

const TIPO_COBERTURAS = ['Vida', 'Hogar', 'Médico mayor', 'Auto', 'Paquete completo'];

export default function PartnerOfferModal({ offer, onClose, onSuccess }) {
  const [form, setForm] = useState({ email: '', phone: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  const type = offer?.partner_type || 'mortgage_broker';

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.phone) { setError('Email y teléfono son requeridos'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fillOffer(offer.id, form);
      setDone(res);
      if (onSuccess) onSuccess(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      data-testid="partner-offer-modal-overlay"
      role="presentation"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(6,8,15,0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        data-testid="partner-offer-modal"
        role="dialog"
        aria-modal="true"
        style={{
          background: '#0E1220',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 16, padding: '24px 28px',
          width: '100%', maxWidth: 440,
          maxHeight: '90vh', overflowY: 'auto',
          position: 'relative',
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 14, right: 14,
            background: 'rgba(255,255,255,0.06)', border: 'none',
            borderRadius: 9999, width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--cream-3)',
          }}
        >
          <X size={14} />
        </button>

        {done ? (
          <div data-testid="offer-success-msg" style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{
              width: 48, height: 48, borderRadius: 9999,
              background: 'rgba(16,185,129,0.15)',
              border: '1px solid rgba(16,185,129,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 12px',
            }}>
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
                <path stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <p style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: '0 0 8px' }}>
              Solicitud enviada
            </p>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', margin: 0, lineHeight: 1.6 }}>
              {done.message || 'Te contactarán en 24-48 horas.'}
            </p>
            <p style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', margin: '8px 0 0' }}>
              Folio: <code>{done.offer_id}</code>
            </p>
          </div>
        ) : (
          <>
            <p style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 17,
              color: 'var(--cream)', margin: '0 0 4px',
            }}>
              {offer.partner_name}
            </p>
            <p style={{
              fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)',
              margin: '0 0 16px', lineHeight: 1.5,
            }}>
              Completa tu información y {offer.partner_name} te contactará en 24-48 horas.
              Sin compromiso de contratación.
            </p>

            <form onSubmit={handleSubmit} data-testid="partner-fill-form">
              {/* Common fields */}
              <div style={rowStyle}>
                <label htmlFor="offer-email-input" style={labelStyle}>Correo electrónico *</label>
                <input
                  id="offer-email-input"
                  data-testid="offer-email-input"
                  type="email" required
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="tu@correo.com"
                  style={inputStyle}
                />
              </div>
              <div style={rowStyle}>
                <label htmlFor="offer-phone-input" style={labelStyle}>Teléfono *</label>
                <input
                  id="offer-phone-input"
                  data-testid="offer-phone-input"
                  type="tel" required
                  value={form.phone}
                  onChange={e => set('phone', e.target.value)}
                  placeholder="+52 55 1234 5678"
                  style={inputStyle}
                />
              </div>

              {/* Mortgage-specific */}
              {(type === 'mortgage_broker' || type === 'mortgage') && (
                <>
                  <div style={rowStyle}>
                    <label htmlFor="offer-ingreso-input" style={labelStyle}>Ingreso mensual estimado (MXN)</label>
                    <input
                      id="offer-ingreso-input"
                      data-testid="offer-ingreso-input"
                      type="number" min="0"
                      value={form.ingreso_mensual_mxn || ''}
                      onChange={e => set('ingreso_mensual_mxn', Number(e.target.value))}
                      placeholder="Ej: 35000"
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={labelStyle}>Plazo (años)</label>
                      <select
                        value={form.plazo_anios || ''}
                        onChange={e => set('plazo_anios', Number(e.target.value))}
                        style={{ ...inputStyle }}
                      >
                        <option value="">Elegir</option>
                        {[5,10,15,20,25].map(y => <option key={y} value={y}>{y} años</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Enganche disponible (MXN)</label>
                      <input
                        type="number" min="0"
                        value={form.enganche_mxn || ''}
                        onChange={e => set('enganche_mxn', Number(e.target.value))}
                        placeholder="Ej: 500000"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Insurance-specific */}
              {(type === 'insurance_broker' || type === 'insurance') && (
                <div style={rowStyle}>
                  <label style={labelStyle}>Tipo de cobertura de interés</label>
                  <select
                    value={form.tipo_cobertura || ''}
                    onChange={e => set('tipo_cobertura', e.target.value)}
                    style={{ ...inputStyle }}
                  >
                    <option value="">Elegir</option>
                    {TIPO_COBERTURAS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}

              {/* Moving-specific */}
              {type === 'moving' && (
                <div style={rowStyle}>
                  <label style={labelStyle}>Fecha aproximada de mudanza</label>
                  <input
                    type="date"
                    value={form.fecha_mudanza || ''}
                    onChange={e => set('fecha_mudanza', e.target.value)}
                    style={inputStyle}
                  />
                </div>
              )}

              {/* Comments */}
              <div style={rowStyle}>
                <label style={labelStyle}>Comentario adicional (opcional)</label>
                <textarea
                  rows={2}
                  value={form.comentarios || ''}
                  onChange={e => set('comentarios', e.target.value)}
                  placeholder="Información adicional relevante para el partner…"
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              {/* Consent notice */}
              <p style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', margin: '0 0 14px', lineHeight: 1.6 }}>
                Al enviar, autorizas que DesarrollosMX comparta tus datos de contacto con el partner
                seleccionado para gestionar tu solicitud. No se realizan cargos automáticos.
              </p>

              {error && (
                <p style={{ color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 12, margin: '0 0 10px' }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                data-testid="offer-submit-btn"
                disabled={loading}
                style={{
                  width: '100%',
                  background: loading ? 'rgba(99,102,241,0.4)' : 'linear-gradient(90deg,#6366F1,#EC4899)',
                  border: 'none',
                  color: '#fff', fontFamily: 'Outfit', fontWeight: 700, fontSize: 14,
                  padding: '11px 0', borderRadius: 9999, cursor: 'pointer',
                }}
              >
                {loading ? 'Enviando…' : 'Enviar solicitud'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
