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
  comunes: 'Áreas comunes y sociales',
  deportivas: 'Deporte y bienestar',
  familiares: 'Familia y niños',
  exteriores: 'Exteriores y naturaleza',
  seguridad: 'Seguridad y acceso',
  tecnologicas: 'Tecnología',
  sustentabilidad: 'Sustentabilidad',
  internas: 'Internas (por unidad)',
};

// Ícono por amenidad (key → emoji). Fallback por sección.
const AMENITY_ICONS = {
  casa_club: '🏰', alberca: '🏊', alberca_techada: '🏊', jacuzzi: '🛁', roof: '🌆', sky_lounge: '🍸',
  salon_eventos: '🎉', salon_usos: '🏟️', bar_lounge: '🍸', cava: '🍷', cine: '🎬', game_room: '🎮',
  ludoteca: '🧸', asadores: '🍖', fire_pit: '🔥', terraza_comun: '🌅', lobby: '🛋️',
  business_center: '🏢', cowork: '💼', sala_juntas: '📊',
  gym: '🏋️', yoga: '🧘', spinning: '🚴', spa: '💆', sauna: '🧖', vapor: '♨️',
  cancha_padel: '🎾', cancha_tenis: '🎾', cancha_basquet: '🏀', cancha_futbol: '⚽', squash: '🎾',
  golf: '⛳', jogging: '🏃', ciclopista: '🚲',
  kids_club: '🧒', teens_room: '🕹️', chapoteadero: '🛟', area_juegos: '🎠', area_pets: '🐾', pet: '🐶',
  jardines: '🌳', areas_verdes: '🌿', lago: '🏞️', andadores: '🚶', huertos: '🌱',
  seguridad: '🛡️', caseta: '👮', cctv: '📹', control_acceso: '🚧', acceso_biometrico: '👆', fraccionamiento_privado: '🔒',
  domotica: '📱', fibra_optica: '🌐', cargador_ev: '🔌', smart_locks: '🔐', elevador: '🛗',
  paneles_solares: '☀️', planta_tratadora: '💧', captacion_pluvial: '🌧️', cisterna: '🪣',
  bicicletas: '🚲', separacion_basura: '♻️', concierge: '🛎️', valet: '🚗', estacionamiento: '🅿️',
  cocina_equipada: '🍳', closet: '🚪', walk_in_closet: '👔', bodega: '📦', balcon: '🪴',
  terraza_privada: '🌅', roof_garden_privado: '🌇',
  cuarto_servicio: '🧺', family_room: '🛋️', estudio: '📚', aire_acondicionado: '❄️',
  calefaccion: '🔥', amueblado: '🛏️', doble_altura: '📐',
};
const SECTION_FALLBACK_ICON = {
  comunes: '🏛️', deportivas: '🏅', familiares: '👨‍👩‍👧', exteriores: '🌳',
  seguridad: '🛡️', tecnologicas: '⚙️', sustentabilidad: '🌿', internas: '🏠',
};
const SERVICIO_ICONS = { gas: '🔥', agua: '🚰', cisterna: '🪣', energia: '⚡', agua_caliente: '♨️', drenaje: '🚿', internet: '🌐' };

const SCOPE_OPTS = [{ v: 'todos', l: 'En todas' }, { v: 'algunos', l: 'En algunas' }];

function AmenityCard({ amenityKey, label, icon, checked, isEditing, isVariable, scope, onToggle, onScope }) {
  const effScope = scope || 'todos';
  return (
    <div
      className="dmx-card"
      data-testid={`amenidad-${amenityKey}`}
      style={{
        padding: '11px 13px', borderRadius: 12, position: 'relative',
        background: checked ? 'rgba(var(--theme-rgb),0.06)' : '#fff',
        border: `1.5px solid ${checked ? 'var(--theme)' : 'var(--border)'}`,
        opacity: !isEditing && !checked ? 0.4 : 1,
        transition: 'background .15s, border-color .15s, opacity .15s',
      }}
    >
      <div onClick={() => isEditing && onToggle(amenityKey)}
        style={{ display: 'flex', alignItems: 'center', gap: 11, cursor: isEditing ? 'pointer' : 'default' }}>
        <span style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0, fontSize: 19,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: checked ? 'rgba(var(--theme-rgb),0.12)' : 'rgba(var(--cream-rgb),0.05)',
          filter: (!isEditing && !checked) ? 'grayscale(0.6)' : 'none',
        }}>{icon}</span>
        <span style={{ fontSize: 12.5, fontWeight: checked ? 700 : 600, lineHeight: 1.25,
          color: checked ? 'var(--cream)' : 'var(--cream-2)' }}>{label}</span>
      </div>
      {checked && (
        <span style={{
          position: 'absolute', top: -7, right: -7, width: 20, height: 20, borderRadius: '50%',
          background: 'var(--grad, linear-gradient(120deg,#6D4AFF,#C63FAE))',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 6px rgba(var(--theme-rgb),0.4)',
        }}><Check size={11} color="#fff" strokeWidth={3.5} /></span>
      )}
      {isVariable && checked && isEditing && (
        <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
          {SCOPE_OPTS.map(s => {
            const on = effScope === s.v;
            return (
              <button key={s.v} type="button" data-testid={`scope-${amenityKey}-${s.v}`}
                onClick={(e) => { e.stopPropagation(); onScope(amenityKey, s.v); }}
                style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                  border: `1px solid ${on ? 'var(--theme)' : 'var(--border)'}`,
                  background: on ? 'rgba(var(--theme-rgb),0.1)' : '#fff',
                  color: on ? 'var(--theme)' : 'var(--cream-3)' }}>
                {s.l}
              </button>
            );
          })}
        </div>
      )}
      {isVariable && checked && !isEditing && effScope === 'algunos' && (
        <div style={{ fontSize: 10.5, color: 'var(--cream-3)', marginTop: 6, fontWeight: 600 }}>· solo en algunas unidades</div>
      )}
    </div>
  );
}

function Section({ sectionKey, sectionLabel, allOptions, selected, isEditing, onToggle, variableSet, scope, onScope }) {
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
            checked={selected.includes(k)} isEditing={isEditing} onToggle={onToggle}
            isVariable={!!variableSet && variableSet.has(k)} scope={scope && scope[k]} onScope={onScope} />
        ))}
      </div>
    </div>
  );
}

// Servicios del desarrollo: cada servicio se elige CON su tipo (gas natural/LP, agua pozo/red…).
function ServiciosSection({ catalog, servicios, isEditing, onPick }) {
  const keys = Object.keys(catalog || {});
  if (!keys.length) return null;
  const chosen = keys.filter(k => servicios[k]).length;
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 11 }}>
        <span style={{ width: 4, height: 16, borderRadius: 3, background: 'var(--grad, linear-gradient(120deg,#6D4AFF,#C63FAE))' }} />
        <h4 style={{ margin: 0, fontSize: 12.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
          Servicios del desarrollo
        </h4>
        <span style={{ fontSize: 11, fontWeight: 700, color: chosen > 0 ? 'var(--theme)' : 'var(--cream-3)',
          background: chosen > 0 ? 'rgba(var(--theme-rgb),0.09)' : 'rgba(var(--cream-rgb),0.05)', padding: '2px 9px', borderRadius: 999 }}>
          {chosen} de {keys.length}
        </span>
        {isEditing && <span style={{ fontSize: 11, color: 'var(--cream-3)', fontStyle: 'italic' }}>elige con qué tipo cuenta el desarrollo</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 10 }}>
        {keys.map(k => {
          const svc = catalog[k];
          const sel = servicios[k];
          return (
            <div key={k} className="dmx-card" data-testid={`servicio-${k}`}
              style={{ background: '#fff', border: `1.5px solid ${sel ? 'var(--theme)' : 'var(--border)'}`, borderRadius: 12, padding: '12px 13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: isEditing ? 9 : 0 }}>
                <span style={{ fontSize: 17 }}>{SERVICIO_ICONS[k] || '🔧'}</span>
                <b style={{ fontSize: 12.5, color: 'var(--cream)' }}>{svc.label}</b>
                {!isEditing && (
                  <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: sel ? 'var(--theme)' : 'var(--cream-3)' }}>
                    {sel
                      ? (svc.capacity ? `${Number(sel).toLocaleString('es-MX')} ${svc.unit || ''}`.trim() : (svc.options?.find(o => o.value === sel)?.label || sel))
                      : 'No especificado'}
                  </span>
                )}
              </div>
              {isEditing && svc.capacity && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <input type="number" min="0" inputMode="numeric" data-testid={`servicio-${k}-input`}
                    value={sel || ''} placeholder="Capacidad"
                    onChange={(e) => onPick(k, e.target.value ? e.target.value : null)}
                    style={{ width: 110, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, color: 'var(--cream)', background: '#fff' }} />
                  <span style={{ fontSize: 11.5, color: 'var(--cream-3)', fontWeight: 600 }}>{svc.unit}</span>
                  {['5000', '10000', '20000', '40000'].map(p => (
                    <button key={p} type="button" onClick={() => onPick(k, p)}
                      style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 8px', borderRadius: 999, cursor: 'pointer',
                        border: `1px solid ${sel === p ? 'var(--theme)' : 'var(--border)'}`,
                        background: sel === p ? 'rgba(var(--theme-rgb),0.1)' : '#fff', color: sel === p ? 'var(--theme)' : 'var(--cream-3)' }}>
                      {Number(p).toLocaleString('es-MX')}
                    </button>
                  ))}
                </div>
              )}
              {isEditing && !svc.capacity && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {svc.options.map(o => {
                    const on = sel === o.value;
                    return (
                      <button key={o.value} type="button" data-testid={`servicio-${k}-${o.value}`}
                        onClick={() => onPick(k, on ? null : o.value)}
                        style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 11px', borderRadius: 999, cursor: 'pointer',
                          border: `1px solid ${on ? 'var(--theme)' : 'var(--border)'}`,
                          background: on ? 'var(--grad, linear-gradient(120deg,#6D4AFF,#C63FAE))' : '#fff',
                          color: on ? '#fff' : 'var(--cream-2)' }}>
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
    // al quitar una amenidad variable, limpia su "algunos/todos"
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
        <Section key={sectionKey} sectionKey={sectionKey}
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
