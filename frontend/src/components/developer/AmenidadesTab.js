/**
 * Phase 4 Batch 11 — Sub-chunk A
 * AmenidadesTab — checkboxes editables por sección + smart defaults
 */
import React, { useState, useEffect, useCallback } from 'react';
import { getProjectAmenities, patchProjectAmenities, listProjectsWithStats } from '../../api/developer';
import { Check } from '../../components/icons';

const SECTION_LABELS = {
  comunes: 'Áreas comunes',
  internas: 'Internas (por unidad)',
  tecnologicas: 'Tecnológicas',
  sustentabilidad: 'Sustentabilidad y bienestar',
};

const SECTION_ICONS = {
  comunes: '⬜',
  internas: '⬜',
  tecnologicas: '⬜',
  sustentabilidad: '⬜',
};

function SectionCard({ sectionKey, sectionLabel, allOptions, selected, isEditing, onToggle }) {
  const keys = Object.keys(allOptions);
  return (
    <div style={{
      background: 'rgba(240,235,224,0.04)',
      border: '1px solid rgba(240,235,224,0.1)',
      borderRadius: 10, padding: '16px 18px', marginBottom: 12,
    }}>
      <h4 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif', letterSpacing: '0.02em' }}>
        {sectionLabel}
      </h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 8 }}>
        {keys.map(k => {
          const checked = selected.includes(k);
          return (
            <label
              key={k}
              data-testid={`amenidad-${k}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                cursor: isEditing ? 'pointer' : 'default',
                padding: '6px 8px', borderRadius: 7,
                background: checked ? 'rgba(240,235,224,0.08)' : 'transparent',
                border: `1px solid ${checked ? 'rgba(240,235,224,0.2)' : 'transparent'}`,
                transition: 'all 0.12s',
                opacity: !isEditing && !checked ? 0.45 : 1,
              }}
            >
              <div style={{
                width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                background: checked ? 'var(--cream)' : 'rgba(240,235,224,0.12)',
                border: `1.5px solid ${checked ? 'var(--cream)' : 'rgba(240,235,224,0.3)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.12s',
              }}>
                {checked && <Check size={10} color="var(--navy)" strokeWidth={3} />}
              </div>
              <input type="checkbox" checked={checked} onChange={() => isEditing && onToggle(k)} style={{ display: 'none' }} />
              <span style={{ fontSize: 12, color: checked ? 'var(--cream)' : 'var(--cream-3)' }}>
                {allOptions[k]}
              </span>
            </label>
          );
        })}
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

  // Load other projects for smart defaults
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

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
            Amenidades del proyecto
          </h3>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--cream-3)' }}>
            {selectedCount} amenidad{selectedCount !== 1 ? 'es' : ''} activa{selectedCount !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isEditing && isAdmin && otherProjects.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                data-testid="smart-defaults-btn"
                onClick={() => setShowDefaults(!showDefaults)}
                style={{
                  background: 'rgba(240,235,224,0.08)', color: 'var(--cream-2)',
                  border: '1px solid rgba(240,235,224,0.14)', borderRadius: 8,
                  padding: '6px 12px', fontSize: 12, cursor: 'pointer',
                }}
              >
                Aplicar desde otro proyecto ↓
              </button>
              {showDefaults && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, zIndex: 100, marginTop: 4,
                  background: 'rgba(6,8,15,0.97)', border: '1px solid rgba(240,235,224,0.16)',
                  borderRadius: 10, overflow: 'hidden', minWidth: 220,
                  boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
                }}>
                  {otherProjects.map(p => (
                    <button
                      key={p.id}
                      data-testid={`default-from-${p.id}`}
                      onClick={() => applyFrom(p.id)}
                      style={{
                        width: '100%', background: 'none', border: 'none',
                        padding: '8px 14px', textAlign: 'left', cursor: 'pointer',
                        color: 'var(--cream)', fontSize: 12,
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(240,235,224,0.06)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {isAdmin && !isEditing && (
            <button
              data-testid="edit-amenidades-btn"
              onClick={() => setIsEditing(true)}
              style={{
                background: 'rgba(240,235,224,0.10)', color: 'var(--cream)',
                border: '1px solid rgba(240,235,224,0.16)', borderRadius: 8,
                padding: '6px 14px', fontSize: 12, cursor: 'pointer',
              }}
            >
              Editar
            </button>
          )}
          {isEditing && (
            <>
              <button onClick={() => { setIsEditing(false); setSelected(data.amenities || []); }}
                style={{ background: 'none', color: 'var(--cream-3)', border: '1px solid rgba(240,235,224,0.12)', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                data-testid="save-amenidades-btn"
                onClick={handleSave} disabled={saving}
                style={{
                  background: 'var(--cream)', color: 'var(--navy)',
                  border: 'none', borderRadius: 8, padding: '6px 16px',
                  fontSize: 12, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
                }}
              >
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Sections */}
      {Object.entries(allCategories).map(([sectionKey, options]) => (
        <SectionCard
          key={sectionKey}
          sectionKey={sectionKey}
          sectionLabel={SECTION_LABELS[sectionKey] || sectionKey}
          allOptions={options}
          selected={selected}
          isEditing={isEditing}
          onToggle={handleToggle}
        />
      ))}
    </div>
  );
}
