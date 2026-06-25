/**
 * Amenidades del DESARROLLO (del edificio) — slug → [emoji, label]. ORIGEN ÚNICO (lo usa la ficha y ZonePageV2; antes estaba
 * inline en ZonePageV2). NO confundir con amenidades de zona (Google). Slug desconocido → ✓ + Title Case (sin inventar nombre).
 */
export const AMEN_DEV = {
  alberca: ['🏊', 'Alberca'], gym: ['🏋️', 'Gimnasio'], gimnasio: ['🏋️', 'Gimnasio'], roof: ['🌿', 'Roof garden'],
  cowork: ['💻', 'Coworking'], coworking: ['💻', 'Coworking'], spa: ['💆', 'Spa'], concierge: ['🛎️', 'Concierge'],
  sky_lounge: ['🌆', 'Sky lounge'], cava: ['🍷', 'Cava'], business_center: ['💼', 'Business center'],
  sala_juntas: ['💼', 'Sala de juntas'], salon_eventos: ['🎉', 'Salón de eventos'], seguridad: ['🛡️', 'Seguridad 24/7'],
  pet: ['🐾', 'Pet friendly'], pet_friendly: ['🐾', 'Pet friendly'], area_pets: ['🐾', 'Área para mascotas'],
  jardines: ['🌳', 'Jardines'], bicicletas: ['🚲', 'Biciestac.'], estacionamiento: ['🚗', 'Estacionamiento'],
  ludoteca: ['🧸', 'Ludoteca'], cine: ['🎬', 'Sala de cine'], asadores: ['🔥', 'Asadores'], terraza: ['🌅', 'Terraza'],
  lobby: ['🛋️', 'Lobby'], elevador: ['🛗', 'Elevador'], lavanderia: ['🧺', 'Lavandería'], salon_usos: ['🎉', 'Salón de usos múltiples'],
  alberca_techada: ['🏊', 'Alberca techada'], chapoteadero: ['💦', 'Chapoteadero'], jacuzzi: ['🛁', 'Jacuzzi'], sauna: ['🧖', 'Sauna'],
};

const titleCase = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// {icon,label} de un slug — con respaldo seguro (no inventa, solo formatea el slug).
export function amenInfo(slug) {
  const m = AMEN_DEV[slug];
  return m ? { icon: m[0], label: m[1] } : { icon: '✓', label: titleCase(slug) };
}
