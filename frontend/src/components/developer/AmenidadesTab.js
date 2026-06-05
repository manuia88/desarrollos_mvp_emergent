/**
 * AmenidadesTab — selector de amenidades del proyecto (ficha).
 * Tarjetas con ícono (módulo compartido amenitiesUI) + Servicios del desarrollo con tipo.
 * Seleccionada = borde de marca + palomita; "En todas / En algunas" en las que varían por unidad.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { getProjectAmenities, patchProjectAmenities, listProjectsWithStats } from '../../api/developer';
import { Z } from '../../styles/zIndex';
import { SECTION_LABELS, AmenitySection, ServiciosSection } from './amenitiesUI';

export default function AmenidadesTab({ devId, user }) {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState([]);
  const [servicios, setServicios] = useState({});
  const [amenityScope, setAmenityScope] = useState({});
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
      setServicios(d.servicios || {});
      setAmenityScope(d.amenity_scope || {});
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
    setAmenityScope(prev => {
      if (!prev[key]) return prev;
      const next = { ...prev }; delete next[key]; return next;
    });
  };

  const handleScope = (key, value) => {
    setAmenityScope(prev => ({ ...prev, [key]: value }));
  };

  const handlePickServicio = (key, value) => {
    setServicios(prev => {
      const next = { ...prev };
      if (value == null) delete next[key]; else next[key] = value;
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await patchProjectAmenities(devId, { amenities: selected, servicios, amenity_scope: amenityScope });
      setIsEditing(false);
      await load();
    } catch (e) { console.error('Save amenidades:', e); }
    finally { setSaving(false); }
  };

  const applyFrom = async (projectId) => {
    try {
      const d = await getProjectAmenities(projectId);
      setSelected(d.amenities || []);
      setServicios(d.servicios || {});
      setAmenityScope(d.amenity_scope || {});
      setShowDefaults(false);
    } catch (e) { console.error('Apply defaults:', e); }
  };

  if (!data) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)', fontSize: 13 }}>Cargando amenidades…</div>;
  }

  const allCategories = data.all_categories || {};
  const variableSet = new Set(data.variable_amenities || []);
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
              <button onClick={() => { setIsEditing(false); setSelected(data.amenities || []); setServicios(data.servicios || {}); setAmenityScope(data.amenity_scope || {}); }} style={btnGhost}>Cancelar</button>
              <button data-testid="save-amenidades-btn" onClick={handleSave} disabled={saving}
                style={{ background: 'var(--grad, linear-gradient(120deg,#6D4AFF,#C63FAE))', color: '#fff', border: 'none', borderRadius: 9, padding: '7px 16px', fontSize: 12.5, fontWeight: 700, cursor: saving ? 'default' : 'pointer' }}>
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Secciones de amenidades */}
      {Object.entries(allCategories).map(([sectionKey, options]) => (
        <AmenitySection key={sectionKey} sectionKey={sectionKey}
          sectionLabel={SECTION_LABELS[sectionKey] || sectionKey}
          allOptions={options} selected={selected} isEditing={isEditing} onToggle={handleToggle}
          variableSet={variableSet} scope={amenityScope} onScope={handleScope} />
      ))}

      {/* Servicios del desarrollo (con tipo) */}
      <ServiciosSection catalog={data.all_servicios} servicios={servicios}
        isEditing={isEditing} onPick={handlePickServicio} />
    </div>
  );
}
