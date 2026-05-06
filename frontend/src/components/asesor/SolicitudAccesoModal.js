// Phase 13 · Batch 36 — SolicitudAccesoModal
// Modal de solicitud de acceso a inventario exclusivo de un developer
import React, { useState } from 'react';
import { X, Store, ChevronDown } from 'lucide-react';
import { requestWhitelistAccess } from '../../api/advisor_whitelist';

const COLONIAS = [
  'Polanco', 'Santa Fe', 'Lomas de Chapultepec', 'Del Valle', 'Nápoles',
  'Condesa', 'Roma Norte', 'Roma Sur', 'Hipódromo', 'Anzures',
  'Interlomas', 'Huixquilucan', 'Tecamachalco', 'Bosques de las Lomas',
  'Satélite', 'Coyoacán', 'San Ángel', 'Pedregal', 'Tepepan',
  'Xochimilco', 'Tlalpan', 'Iztapalapa', 'Ecatepec', 'Neza',
  'Insurgentes Sur', 'Benito Juárez', 'Doctores', 'Centro Histórico',
];

const inputStyle = {
  width: '100%', padding: '10px 13px', borderRadius: 9,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.10)',
  color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13,
  outline: 'none', boxSizing: 'border-box',
};

export default function SolicitudAccesoModal({ dev_org_id, dev_name, onClose, onSuccess }) {
  const [form, setForm] = useState({
    motivo: '',
    experiencia_colonia: '',
    clientes_interesados_count: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.motivo.trim() || form.motivo.trim().length < 10) {
      setErr('El motivo debe tener al menos 10 caracteres');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const result = await requestWhitelistAccess({
        dev_org_id,
        motivo: form.motivo.trim(),
        experiencia_colonia: form.experiencia_colonia || '',
        clientes_interesados_count: parseInt(form.clientes_interesados_count) || 0,
      });
      onSuccess(result);
    } catch (e) {
      const msg = e.response?.data?.detail || e.message || 'Error al enviar solicitud';
      setErr(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="solicitud-acceso-modal"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(6,8,15,0.80)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1100, padding: 16,
      }}
    >
      <div style={{
        background: 'rgba(13,17,28,0.95)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 18,
        width: '100%', maxWidth: 500,
        padding: '28px 28px 24px',
        backdropFilter: 'blur(24px)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(99,102,241,0.15)',
              border: '1px solid rgba(99,102,241,0.30)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Store size={16} color="#818CF8" />
            </div>
            <div>
              <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: 0, letterSpacing: '-0.02em' }}>
                Solicitar acceso al inventario
              </h2>
              <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.50)', margin: '2px 0 0' }}>
                {dev_name || dev_org_id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose} aria-label="Cerrar modal"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(240,235,224,0.45)', padding: 4 }}
          >
            <X size={16} />
          </button>
        </div>

        {err && (
          <div data-testid="solicitud-error" style={{
            padding: '9px 13px', borderRadius: 8,
            background: 'rgba(239,68,68,0.10)',
            border: '1px solid rgba(239,68,68,0.28)',
            color: '#F87171', fontFamily: 'DM Sans', fontSize: 12.5, marginBottom: 14,
          }}>{err}</div>
        )}

        {/* Motivo */}
        <div style={{ marginBottom: 14 }}>
          <label style={{
            fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700,
            color: 'rgba(240,235,224,0.50)', textTransform: 'uppercase',
            letterSpacing: '0.08em', display: 'block', marginBottom: 5,
          }}>
            Motivo *
          </label>
          <textarea
            data-testid="solicitud-motivo"
            style={{ ...inputStyle, minHeight: 80, borderRadius: 10, resize: 'vertical' }}
            placeholder="Por qué quieres acceso a este inventario. Menciona tu perfil de clientes y mercado objetivo..."
            value={form.motivo}
            onChange={e => set('motivo', e.target.value)}
            maxLength={500}
          />
          <div style={{ textAlign: 'right', fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.30)', marginTop: 3 }}>
            {form.motivo.length}/500
          </div>
        </div>

        {/* Experiencia en colonia */}
        <div style={{ marginBottom: 14 }}>
          <label style={{
            fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700,
            color: 'rgba(240,235,224,0.50)', textTransform: 'uppercase',
            letterSpacing: '0.08em', display: 'block', marginBottom: 5,
          }}>
            Colonia de experiencia principal
          </label>
          <div style={{ position: 'relative' }}>
            <select
              data-testid="solicitud-colonia"
              style={{
                ...inputStyle, paddingRight: 36,
                appearance: 'none', cursor: 'pointer',
              }}
              value={form.experiencia_colonia}
              onChange={e => set('experiencia_colonia', e.target.value)}
            >
              <option value="">Sin especificar</option>
              {COLONIAS.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <ChevronDown
              size={14} color="rgba(240,235,224,0.40)"
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            />
          </div>
        </div>

        {/* Clientes interesados */}
        <div style={{ marginBottom: 22 }}>
          <label style={{
            fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700,
            color: 'rgba(240,235,224,0.50)', textTransform: 'uppercase',
            letterSpacing: '0.08em', display: 'block', marginBottom: 5,
          }}>
            Clientes interesados actualmente (estimado)
          </label>
          <input
            data-testid="solicitud-clientes-count"
            type="number" min="0" max="9999"
            style={inputStyle}
            placeholder="0"
            value={form.clientes_interesados_count}
            onChange={e => set('clientes_interesados_count', e.target.value)}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px', borderRadius: 9999,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(240,235,224,0.55)',
              fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            data-testid="solicitud-submit-btn"
            onClick={submit}
            disabled={saving}
            style={{
              padding: '10px 22px', borderRadius: 9999,
              background: 'linear-gradient(90deg,#6366F1,#EC4899)',
              border: 'none', color: '#fff',
              fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.7 : 1,
              transition: 'opacity 200ms',
            }}
          >
            {saving ? 'Enviando…' : 'Enviar solicitud'}
          </button>
        </div>
      </div>
    </div>
  );
}
