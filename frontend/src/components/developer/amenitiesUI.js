/**
 * amenitiesUI — UI compartida del selector de amenidades (ficha + wizard de alta).
 * Tarjeta con ícono, estado seleccionado (borde de marca + palomita), hover, y "En todas /
 * En algunas" para las amenidades que varían por unidad. Toda la tarjeta es clickeable.
 */
import React from 'react';
import { Check } from '../../components/icons';

export const SECTION_LABELS = {
  comunes: 'Las imprescindibles',
  deportivas: 'Deporte y bienestar',
  familiares: 'Familia y niños',
  exteriores: 'Exteriores y naturaleza',
  seguridad: 'Seguridad y acceso',
  tecnologicas: 'Tecnología',
  sustentabilidad: 'Sustentabilidad',
  internas: 'Internas (por unidad)',
};

export const AMENITY_ICONS = {
  casa_club: '🏰', alberca: '🏊', alberca_techada: '🏊', jacuzzi: '🛁', roof: '🌆', sky_lounge: '🍸',
  salon_eventos: '🎉', salon_usos: '🏟️', bar_lounge: '🍸', cava: '🍷', cine: '🎬', game_room: '🎮',
  ludoteca: '🧸', asadores: '🍖', fire_pit: '🔥', terraza_comun: '🌅', lobby: '🛋️',
  business_center: '🏢', cowork: '💼', sala_juntas: '📊', estacionamiento: '🅿️', elevador: '🛗',
  gym: '🏋️', yoga: '🧘', spinning: '🚴', spa: '💆', sauna: '🧖', vapor: '♨️',
  cancha_padel: '🎾', cancha_tenis: '🎾', cancha_basquet: '🏀', cancha_futbol: '⚽', squash: '🎾',
  golf: '⛳', jogging: '🏃', ciclopista: '🚲',
  kids_club: '🧒', teens_room: '🕹️', chapoteadero: '🛟', area_juegos: '🎠', area_pets: '🐾', pet: '🐶',
  jardines: '🌳', areas_verdes: '🌿', lago: '🏞️', andadores: '🚶', huertos: '🌱',
  seguridad: '🛡️', caseta: '👮', cctv: '📹', control_acceso: '🚧', acceso_biometrico: '👆', fraccionamiento_privado: '🔒',
  domotica: '📱', fibra_optica: '🌐', cargador_ev: '🔌', smart_locks: '🔐',
  paneles_solares: '☀️', planta_tratadora: '💧', captacion_pluvial: '🌧️', cisterna: '🪣',
  bicicletas: '🚲', separacion_basura: '♻️', concierge: '🛎️', valet: '🚗',
  cocina_equipada: '🍳', closet: '🚪', walk_in_closet: '👔', bodega: '📦', balcon: '🪴',
  terraza_privada: '🌅', roof_garden_privado: '🌇',
  cuarto_servicio: '🧺', family_room: '🛋️', estudio: '📚', aire_acondicionado: '❄️',
  calefaccion: '🔥', amueblado: '🛏️', doble_altura: '📐',
};

export const SECTION_FALLBACK_ICON = {
  comunes: '⭐', deportivas: '🏅', familiares: '👨‍👩‍👧', exteriores: '🌳',
  seguridad: '🛡️', tecnologicas: '⚙️', sustentabilidad: '🌿', internas: '🏠',
};

const SCOPE_OPTS = [{ v: 'todos', l: 'En todas' }, { v: 'algunos', l: 'En algunas' }];

export function AmenityCard({ amenityKey, label, icon, checked, isEditing, isVariable, scope, onToggle, onScope }) {
  const effScope = scope || 'todos';
  return (
    <div
      className="dmx-card"
      data-testid={`amenidad-${amenityKey}`}
      onClick={() => isEditing && onToggle(amenityKey)}
      style={{
        padding: '11px 13px', borderRadius: 12, position: 'relative',
        cursor: isEditing ? 'pointer' : 'default',
        background: checked ? 'rgba(var(--theme-rgb),0.06)' : '#fff',
        border: `1.5px solid ${checked ? 'var(--theme)' : 'var(--border)'}`,
        opacity: !isEditing && !checked ? 0.4 : 1,
        transition: 'background .15s, border-color .15s, opacity .15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
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
      {isVariable && checked && isEditing && onScope && (
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

export function AmenitySection({ sectionKey, sectionLabel, allOptions, selected, isEditing, onToggle, variableSet, scope, onScope }) {
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
          background: count > 0 ? 'rgba(var(--theme-rgb),0.09)' : 'rgba(var(--cream-rgb),0.05)', padding: '2px 9px', borderRadius: 999 }}>
          {count} de {keys.length}
        </span>
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
