// atlaxSearch — el BUSCADOR compartido de Atlax (un solo motor para TODAS las ventanas: superficie /atlax + burbuja).
// Hace parse NL (es-MX) + ranking por criterios (exactos + "casi cumple") + fallback a otras colonias, arma el intro
// accionable y registra la búsqueda GRANULAR (buyer_signal → superadmin). Reusa el motor del marketplace
// (aiSearchParse /api/properties/search-ai + fetchCasiCumple /api/developments/casi). Función PURA: el caller maneja
// los mensajes y el modo comparativa.
import { aiSearchParse, fetchCasiCumple } from '../api/marketplace';
import { sendBuyerSignal } from './buyerSignal';
import { getDismissedIds } from './atlaxPrefs';  // no-repetir: no volver a mostrar lo que el cliente descartó
import { tc } from './titleCase';

const firstStr = (v) => (Array.isArray(v) ? v[0] : v) || '';

// ¿la consulta es una COMPARATIVA ("Condesa vs Roma", "compara…")? → el caller usa los bloques, no el buscador.
export function isCompareQuery(q) {
  return /\bvs\b|\bcompar/i.test(String(q || ''));
}

function buildIntro({ colonia, nExact, nCasi, nCross, zonaNoDisp }) {
  const enCol = colonia ? ` en ${tc(colonia)}` : '';
  if (zonaNoDisp) return `Todavía no llego a ${tc(zonaNoDisp)}, pero mira lo más cercano y otras colonias que sí encajan:`;
  if (nExact > 0) return `Tengo ${nExact === 1 ? 'una opción' : `${nExact} opciones`} que encajan con lo que buscas${enCol}.${nCasi ? ' Y abajo, otras que se acercan:' : ' Échales un ojo:'}`;
  if (nCasi > 0) return `Estas se acercan mucho${enCol} — te marco lo que cumple cada una y el detalle que le falta:`;
  if (nCross > 0) return `En ${tc(colonia) || 'esa colonia'} con eso está apretado, pero tu presupuesto rinde muy bien aquí cerca:`;
  return `Vamos a afinar para encontrarte algo bueno${enCol}:`;
}

export async function searchAtlax(query) {
  const q = String(query || '').trim();
  let filters = {}, zonaNoDisp = null, zonaNoDispSlug = null, crossZone = [], crossRelax = null;
  try {
    const parsed = await aiSearchParse(q);
    filters = (parsed && parsed.filters) || {};
    zonaNoDisp = (parsed && parsed.zona_no_disponible) || null;
    zonaNoDispSlug = (parsed && parsed.zona_no_disponible_slug) || null;
    crossZone = Array.isArray(parsed && parsed.cross_zone) ? parsed.cross_zone : [];
    crossRelax = (parsed && parsed.cross_relax) || null;
  } catch (_) { /* fail-soft: sin filtros */ }

  let vid = ''; try { vid = localStorage.getItem('dmx_visitor_id') || ''; } catch (_) { /* noop */ }
  const colonias = (filters.colonia || []).map((c) => String(c).toLowerCase());
  const hasColonia = colonias.length > 0;

  // En la colonia pedida (la zona es sagrada) + EN PARALELO una bolsa amplia en OTRAS colonias, para SIEMPRE ofrecer
  // ~5 que ajustan + ~5 que se acercan (founder: nunca dejar al cliente con 2 resultados y que se vaya a otro lado).
  // TODO sale de /api/developments/casi = DEVELOPMENTS reales → cero alucinación, datos anclados al marketplace/dev.
  const broadFilters = { ...filters }; delete broadFilters.colonia;
  const [inResp, broadResp] = await Promise.all([
    fetchCasiCumple({ ...filters, visitor_id: vid, limit: 16 }).catch(() => ({ casi: [] })),
    hasColonia ? fetchCasiCumple({ ...broadFilters, visitor_id: vid, limit: 16 }).catch(() => ({ casi: [] })) : Promise.resolve({ casi: [] }),
  ]);
  // NO-REPETIR: saca lo que el cliente YA descartó (el sistema no insiste con lo rechazado).
  const dismissed = new Set(getDismissedIds());
  const inAll = ((inResp && inResp.casi) || []).filter((d) => !dismissed.has(d.id));
  // Pool generoso; el componente muestra POCAS al inicio (3-5 que ajustan + 3 similares) y revela más en bloques.
  const exact = inAll.filter((d) => (d.match_falta || []).length === 0).slice(0, 8);
  const casi = inAll.filter((d) => (d.match_falta || []).length > 0).slice(0, 12);

  // "Otras colonias que se acercan": de la bolsa amplia, las que NO están en la colonia pedida (con su match real).
  const inIds = new Set(inAll.map((d) => d.id));
  let otras = ((broadResp && broadResp.casi) || []).filter((d) => !inIds.has(d.id) && !dismissed.has(d.id) && !colonias.includes(String(d.colonia_id || d.colonia || '').toLowerCase())).slice(0, 12);
  if (crossZone.length > otras.length) { otras = crossZone; }   // si search-ai dio un cross mejor (otro presupuesto/esquema), úsalo
  else if (otras.length && !crossRelax) { crossRelax = 'amplio'; }
  crossZone = otras;
  const colonia = firstStr(filters.colonia || filters.zona);
  const intro = buildIntro({ colonia, nExact: exact.length, nCasi: casi.length, nCross: crossZone.length, zonaNoDisp });

  // Captura GRANULAR → buyer_signals (superadmin). fetchCasiCumple ya registró la demanda insatisfecha (con colonia).
  try {
    sendBuyerSignal('atlax_query', {
      colonia: String(colonia || '').toLowerCase() || undefined, value: q.slice(0, 120),
      meta: { beds: filters.beds, baths: filters.baths, max_price: filters.max_price, min_price: filters.min_price, min_sqm: filters.min_sqm, max_sqm: filters.max_sqm, tipo: firstStr(filters.tipo) || undefined, intent: filters.buyer_intent || filters.intent, amenidades: Array.isArray(filters.amenity) ? filters.amenity.join(',') : filters.amenity, n_exact: exact.length, n_casi: casi.length, cross_zone: crossZone.length, zona_no_disponible: zonaNoDisp || undefined, shown: [...exact, ...casi, ...crossZone].slice(0, 10).map((d) => d.id) },
    });
  } catch (_) { /* noop */ }

  // ¿la consulta REALMENTE es una búsqueda de propiedad? (la burbuja lo usa para decidir si pinta resultados o solo
  // responde como chat). La superficie lo ignora — ahí todo es búsqueda.
  const isSearch = !!((filters.colonia && filters.colonia.length) || filters.max_price || filters.min_price || filters.beds || filters.baths || filters.min_sqm || filters.max_sqm || (filters.amenity && filters.amenity.length) || (filters.unit_feature && filters.unit_feature.length) || filters.tipo);

  return { exact, casi, crossZone, crossRelax, zonaNoDisp, zonaNoDispSlug, colonia, filters, intro, isSearch, hasResults: !!(exact.length || casi.length || crossZone.length), pending: false };
}
