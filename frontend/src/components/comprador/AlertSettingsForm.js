/**
 * AlertSettingsForm — Phase 4 Batch 29
 * Formulario para crear / editar una Buyer Alert.
 * Props: initialValues, onSubmit(data), onCancel, loading
 */
import React, { useState } from 'react';

const TIPOS = [
  { value: 'new_match',       label: 'Nuevo match con búsqueda guardada' },
  { value: 'price_drop',      label: 'Bajada de precio' },
  { value: 'slot_available',  label: 'Unidades disponibles' },
  { value: 'project_status',  label: 'Cambio de estado del proyecto' },
];

const CANALES = [
  { value: 'email',     label: 'Email' },
  { value: 'push',      label: 'Push (portal)' },
  { value: 'whatsapp',  label: 'WhatsApp' },
];

const FRECUENCIAS = [
  { value: 'instant', label: 'Inmediata (cada 5 min)' },
  { value: 'daily',   label: 'Diaria (8 am)' },
  { value: 'weekly',  label: 'Semanal (lunes 8 am)' },
];

export default function AlertSettingsForm({ initialValues = {}, onSubmit, onCancel, loading = false }) {
  const [type, setType] = useState(initialValues.type || 'new_match');
  const [channel, setChannel] = useState(initialValues.channel || 'email');
  const [frequency, setFrequency] = useState(initialValues.frequency || 'daily');
  const [conditions, setConditions] = useState(initialValues.conditions || {});
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await onSubmit({ type, channel, conditions, frequency });
    } catch (err) {
      setError(err.message || 'Error al guardar');
    }
  };

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(240,235,224,0.15)',
    color: 'var(--cream, #F0EBE0)',
    fontFamily: 'DM Sans', fontSize: 13, outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700,
    color: 'rgba(240,235,224,0.5)',
    textTransform: 'uppercase', letterSpacing: '0.07em',
    display: 'block', marginBottom: 6,
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Tipo */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Tipo de alerta</label>
        <select
          value={type}
          onChange={e => setType(e.target.value)}
          style={inputStyle}
          data-testid="alert-type-select"
        >
          {TIPOS.map(t => (
            <option key={t.value} value={t.value} style={{ background: '#06080F' }}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* Condiciones dinámicas por tipo */}
      {(type === 'price_drop' || type === 'slot_available' || type === 'project_status') && (
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>ID del proyecto (opcional)</label>
          <input
            type="text"
            placeholder="Ej: torre-reforma-25"
            value={conditions.project_id || ''}
            onChange={e => setConditions(c => ({ ...c, project_id: e.target.value }))}
            style={inputStyle}
            data-testid="alert-project-id"
          />
        </div>
      )}

      {type === 'price_drop' && (
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Umbral de bajada (%)</label>
          <input
            type="number"
            min="1" max="50" step="0.5"
            placeholder="5"
            value={conditions.threshold_pct || ''}
            onChange={e => setConditions(c => ({ ...c, threshold_pct: parseFloat(e.target.value) }))}
            style={inputStyle}
            data-testid="alert-threshold-pct"
          />
        </div>
      )}

      {type === 'new_match' && (
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>ID de búsqueda guardada (opcional)</label>
          <input
            type="text"
            placeholder="Deja vacío para alertas globales"
            value={conditions.saved_search_id || ''}
            onChange={e => setConditions(c => ({ ...c, saved_search_id: e.target.value }))}
            style={inputStyle}
            data-testid="alert-search-id"
          />
        </div>
      )}

      {/* Canal */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Canal de notificación</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CANALES.map(c => (
            <button
              key={c.value}
              type="button"
              data-testid={`alert-channel-${c.value}`}
              onClick={() => setChannel(c.value)}
              style={{
                padding: '8px 14px', borderRadius: 9999, cursor: 'pointer',
                border: channel === c.value
                  ? '1px solid rgba(var(--theme-rgb),0.55)'
                  : '1px solid rgba(240,235,224,0.15)',
                background: channel === c.value
                  ? 'rgba(var(--theme-rgb),0.15)'
                  : 'rgba(255,255,255,0.04)',
                fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
                color: channel === c.value ? 'rgba(var(--theme-rgb),0.95)' : 'rgba(240,235,224,0.55)',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
        {channel === 'whatsapp' && (
          <div style={{
            marginTop: 8, padding: '8px 12px', borderRadius: 8,
            background: 'rgba(245,158,11,0.10)',
            border: '1px solid rgba(245,158,11,0.25)',
            fontFamily: 'DM Sans', fontSize: 12,
            color: 'rgba(253,230,138,0.9)',
          }}>
            Disponible cuando WhatsApp Business esté activo. Por ahora se registra como pendiente.
          </div>
        )}
      </div>

      {/* Frecuencia */}
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Frecuencia</label>
        <select
          value={frequency}
          onChange={e => setFrequency(e.target.value)}
          style={inputStyle}
          data-testid="alert-frequency-select"
        >
          {FRECUENCIAS.map(f => (
            <option key={f.value} value={f.value} style={{ background: '#06080F' }}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 14,
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.25)',
          fontFamily: 'DM Sans', fontSize: 12, color: '#FCA5A5',
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="submit"
          disabled={loading}
          data-testid="alert-submit-btn"
          style={{
            flex: 1, padding: '11px 0', borderRadius: 9999, border: 'none',
            background: loading ? 'rgba(var(--theme-rgb),0.3)' : 'linear-gradient(90deg, var(--theme), var(--theme-3))',
            color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Guardando…' : (initialValues.alert_id ? 'Actualizar alerta' : 'Crear alerta')}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '11px 18px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(240,235,224,0.15)',
              color: 'rgba(240,235,224,0.55)',
              fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
