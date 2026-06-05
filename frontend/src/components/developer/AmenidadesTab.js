/**
 * AmenidadesTab — selector de amenidades del proyecto.
 * Rediseño: tarjetas con ícono por amenidad (no checkboxes planos). Seleccionada = borde de
 * marca + tinte + palomita; hover que eleva (.dmx-card); contador por sección. Tema claro.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { getProjectAmenities, patchProjectAmenities, listProjectsWithStats } from '../../api/developer';
import { Check } from '../../components/icons';
import { Z } from '../../styles/zIndex';

const SECTION_LABELS = {
  comunes: 'Áreas comunes',
  internas: 'Internas (por unidad)',
  tecnologicas: 'Tecnológicas',
  sustentabilidad: 'Sustentabilidad y bienestar',
};

// Ícono por amenidad (key → emoji). Fallback por sección.
const AMENITY_ICONS = {
  // comunes
  alberca: '🏊', gym: '🏋️', roof: '🌆', spa: '💆', salon_eventos: '🎉', sky_lounge: '🍸',
  cava: '🍷', area_pets: '🐾', jardines: '🌳', cowork: '💼', business_center: '🏢',
  // internas
  closet: '🚪', cocina_equipada: '🍳', bodega: '📦', balcon: '🪴', cuarto_servicio: '🧺',
  // tecnológicas
  domotica: '📱', cargador_ev: '🔌', fibra_optica: '🌐', seguridad: '🛡️', acceso_biometrico: '👆',
  // sustentabilidad
  paneles_solares: '☀️', cisterna: '💧', huertos: '🌱', bicicletas: '🚲', pet: '🐶',
  estacionamiento: '🅿️', concierge: '🛎️',
};
const SECTION_FALLBACK_ICON = { comunes: '🏛️', internas: '🏠', tecnologicas: '⚙️', sustentabilidad: '🌿' };

function AmenityCard({ amenityKey, label, icon, checked, isEditing, onToggle }) {
  return (
    <button
      type="button"
      data-testid={`amenidad-${amenityKey}`}
      onClick={() => isEditing && onToggle(amenityKey)}
      disabled={!isEditing}
      className="dmx-card"
      style={{
        display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left',
        padding: '11px 13px', borderRadius: 12, position: 'relative',
        cursor: isEditing ? 'pointer' : 'default',
        background: checked ? 'rgba(var(--theme-rgb),0.06)' : '#fff',
        border: `1.5px solid ${checked ? 'var(--theme)' : 'var(--border)'}`,
        opacity: !isEditing && !checked ? 0.4 : 1,
        transition: 'background .15s, border-color .15s, opacity .15s',
        width: '100%', font: 'inherit',
      }}
    >
      <span style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0, fontSize: 19,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: checked ? 'rgba(var(--theme-rgb),0.12)' : 'rgba(var(--cream-rgb),0.05)',
        filter: (!isEditing && !checked) ? 'grayscale(0.6)' : 'none',
      }}>{icon}</span>
      <span style={{ fontSize: 12.5, fontWeight: checked ? 700 : 600, lineHeight: 1.25,
        color: checked ? 'var(--cream)' : 'var(--cream-2)' }}>{label}</span>
      {checked && (
        <span style={{
          position: 'absolute', top: -7, right: -7, width: 20, height: 20, borderRadius: '50%',
          background: 'var(--grad, linear-gradient(120deg,#6D4AFF,#C63FAE))',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 6px rgba(var(--theme-rgb),0.4)',
        }}><Check size={11} color="#fff" strokeWidth={3.5} /></span>
      )}
    </button>
  );
}

function Section({ sectionKey, sectionLabel, allOptions, selected, isEditing, onToggle }) {
  const keys = Object.keys(allOptions);
  const count = keys.filter(k => selected.includes(k)).length;
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 11 }}>
        <span style={{ width: 4, height: 16, borderRadius: 3, background: 'var(--grad, linear-gradient(120deg,#6D4AFF,#C63FAE))' }} />
        <h4 style={{ margin: 0, fontSize: 12.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
          {sectionLabel}
        </h4>
        <span style={{ fontSize: 11, fontWeight: 700, color: count > 0 ? 'var(--theme)' : 'var(--cream-3)',
          background: count > 0 ? 'rgba(var(--theme-rgb),0.09)' : 'rgba(var(--cream-rgb),0.05)',
          padding: '2px 9px', borderRadius: 999 }}>{count} de {keys.length}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 10 }}>
        {keys.map(k => (
          <AmenityCard key={k} amenityKey={k} label={allOptions[k]}
            icon={AMENITY_ICONS[k] || SECTION_FALLBACK_ICON[sectionKey] || '✨'}
            checked={selected.includes(k)} isEditing={isEditing} onToggle={onToggle} />
        ))}
      </div>
    </div>
  );
}

export default function AmenidadesTab({ devId, user }) {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [otherProjects, setOtherProjects] = useState([]);
  const [showDefaults, setShowDefaults] = useState(false);
  const isAdmin = user?.role === 'developer_admin' || user?.role === 'superadmin';

  const load = useCallback(async () => {
    try {
      const d = await getProjectAmenities(devId);
      setData(d);
      setSelected(d.amenities || []);
    } catch (e) { console.error('AmenidadesTab:', e); }
  }, [devId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (isEditing) {
      listProjectsWithStats().then(all => {
        setOtherProjects((all || []).filter(p => p.id !== devId));
      }).catch(() => {});
    }
  }, [isEditing, devId]);

  const handleToggle = (key) => {
    setSelected(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await patchProjectAmenities(devId, { amenities: selected });
      setIsEditing(false);
      await load();
    } catch (e) { console.error('Save amenidades:', e); }
    finally { setSaving(false); }
  };

  const applyFrom = async (projectId) => {
    try {
      const d = await getProjectAmenities(projectId);
      setSelected(d.amenities || []);
      setShowDefaults(false);
    } catch (e) { console.error('Apply defaults:', e); }
  };

  if (!data) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)', fontSize: 13 }}>Cargando amenidades…</div>;
  }

  const allCategories = data.all_categories || {};
  const selectedCount = selected.length;
  const btnGhost = { background: '#fff', color: 'var(--cream-2)', border: '1px solid var(--border)', borderRadius: 9, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16.5, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
            Amenidades y características
          </h3>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--cream-3)' }}>
            {isEditing ? 'Toca para activar o quitar · ' : ''}<b style={{ color: 'var(--theme)' }}>{selectedCount}</b> activa{selectedCount !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isEditing && isAdmin && otherProjects.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button data-testid="smart-defaults-btn" onClick={() => setShowDefaults(!showDefaults)} style={btnGhost}>
                Copiar de otro proyecto ↓
              </button>
              {showDefaults && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, zIndex: Z.DROPDOWN, marginTop: 4,
                  background: '#fff', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden',
                  minWidth: 220, boxShadow: '0 16px 40px rgba(0,0,0,0.14)',
                }}>
                  {otherProjects.map(p => (
                    <button key={p.id} data-testid={`default-from-${p.id}`} onClick={() => applyFrom(p.id)}
                      style={{ width: '100%', background: 'none', border: 'none', padding: '9px 14px', textAlign: 'left', cursor: 'pointer', color: 'var(--cream)', fontSize: 12.5 }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--theme-rgb),0.07)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {isAdmin && !isEditing && (
            <button data-testid="edit-amenidades-btn" onClick={() => setIsEditing(true)}
              style={{ background: 'var(--grad, linear-gradient(120deg,#6D4AFF,#C63FAE))', color: '#fff', border: 'none', borderRadius: 9, padding: '7px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              Editar
            </button>
          )}
          {isEditing && (
            <>
              <button onClick={() => { setIsEditing(false); setSelected(data.amenities || []); }} style={btnGhost}>Cancelar</button>
              <button data-testid="save-amenidades-btn" onClick={handleSave} disabled={saving}
                style={{ background: 'var(--grad, linear-gradient(120deg,#6D4AFF,#C63FAE))', color: '#fff', border: 'none', borderRadius: 9, padding: '7px 16px', fontSize: 12.5, fontWeight: 700, cursor: saving ? 'default' : 'pointer' }}>
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Secciones */}
      {Object.entries(allCategories).map(([sectionKey, options]) => (
        <Section key={sectionKey} sectionKey={sectionKey}
          sectionLabel={SECTION_LABELS[sectionKey] || sectionKey}
          allOptions={options} selected={selected} isEditing={isEditing} onToggle={handleToggle} />
      ))}
    </div>
  );
}
