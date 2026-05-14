/**
 * W4.18.2B Sub-B — SaveZoneModal
 * Form para guardar zona dibujada con name + alert_triggers checkboxes.
 */
import React, { useState } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function SaveZoneModal({ open, polygon, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [priceDelta, setPriceDelta] = useState(true);
  const [newDev, setNewDev] = useState(true);
  const [supplyInc, setSupplyInc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  if (!open) return null;

  const handleSave = async () => {
    if (!name.trim()) { setError('Pon un nombre a la zona'); return; }
    if (!polygon || polygon.type !== 'Polygon') { setError('Polígono inválido'); return; }
    setSaving(true); setError(null);
    try {
      const r = await fetch(`${API}/api/maps-cross/saved-zones`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          polygon_geojson: polygon,
          alert_triggers: {
            price_delta_pct: priceDelta ? 5 : null,
            new_dev: newDev,
            supply_increase_pct: supplyInc ? 10 : null,
          },
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || `Error ${r.status}`);
      }
      const json = await r.json();
      onSaved?.(json.zone);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-testid="save-zone-modal"
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(6,8,15,0.85)', backdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 460, maxWidth: '100%',
          background: 'rgba(13,16,23,0.96)', backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20,
          padding: 24, fontFamily: 'DM Sans', color: '#F0EBE0',
        }}
      >
        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--theme)', marginBottom: 6 }}>
          Inversionista · Zona guardada
        </div>
        <h2 style={{ fontFamily: 'Outfit', fontSize: 22, fontWeight: 800, margin: '0 0 14px', color: '#F0EBE0' }}>
          Guardar zona y configurar alertas
        </h2>

        <label style={{ display: 'block', marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.5)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Nombre de la zona
          </div>
          <input
            data-testid="save-zone-name-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="ej. Polanco-Anzures-Cuauhtémoc"
            maxLength={80}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#F0EBE0', fontFamily: 'DM Sans', fontSize: 13, outline: 'none',
            }}
          />
        </label>

        <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.5)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Disparadores de alerta
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {[
            { v: priceDelta, set: setPriceDelta, label: 'Precio cambia ≥ 5%' },
            { v: newDev,    set: setNewDev,    label: 'Nuevo desarrollo se publica' },
            { v: supplyInc, set: setSupplyInc, label: 'Supply sube ≥ 10%' },
          ].map((row, i) => (
            <label key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
              padding: '8px 12px', borderRadius: 12,
              background: row.v ? 'rgba(var(--theme-rgb),0.10)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${row.v ? 'rgba(var(--theme-rgb),0.3)' : 'rgba(255,255,255,0.08)'}`,
              fontSize: 12, color: row.v ? 'var(--theme)' : 'rgba(240,235,224,0.7)',
            }}>
              <input
                type="checkbox"
                checked={row.v}
                onChange={e => row.set(e.target.checked)}
                style={{ accentColor: 'var(--theme)', cursor: 'pointer' }}
              />
              {row.label}
            </label>
          ))}
        </div>

        {error && (
          <div style={{
            padding: '8px 12px', borderRadius: 10,
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
            color: '#fca5a5', fontSize: 12, marginBottom: 12,
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 16px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
              color: '#F0EBE0', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >Cancelar</button>
          <button
            data-testid="save-zone-confirm"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '9px 18px', borderRadius: 9999, border: 'none',
              background: 'linear-gradient(90deg, var(--theme), var(--theme-3))', color: '#fff',
              fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1,
            }}
          >{saving ? 'Guardando…' : 'Guardar zona'}</button>
        </div>
      </div>
    </div>
  );
}
