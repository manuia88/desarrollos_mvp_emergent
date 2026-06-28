// atlaxSearch — el BUSCADOR compartido de Atlax (un solo motor para TODAS las ventanas: superficie /atlax + burbuja).
// Hace parse NL (es-MX) + ranking por criterios (exactos + "casi cumple") + fallback a otras colonias, arma el intro
// accionable y registra la búsqueda GRANULAR (buyer_signal → superadmin). Reusa el motor del marketplace
// (aiSearchParse /api/properties/search-ai + fetchCasiCumple /api/developments/casi). Función PURA: el caller maneja
// los mensajes y el modo comparativa.
import { aiSearchParse, fetchCasiCumple } from '../api/marketplace';
import { sendBuyerSignal } from './buyerSignal';
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
  const casiResp = await fetchCasiCumple({ ...filters, visitor_id: vid, limit: 12 }).catch(() => ({ casi: [] }));
  const all = (casiResp && casiResp.casi) || [];
  const exact = all.filter((d) => (d.match_falta || []).length === 0).slice(0, 6);
  const casi = all.filter((d) => (d.match_falta || []).length > 0).slice(0, 9);
  const colonia = firstStr(filters.colonia || filters.zona);
  const intro = buildIntro({ colonia, nExact: exact.length, nCasi: casi.length, nCross: crossZone.length, zonaNoDisp });

  // Captura GRANULAR → buyer_signals (superadmin). fetchCasiCumple ya registró la demanda insatisfecha (con colonia).
  try {
    sendBuyerSignal('atlax_query', {
      colonia: String(colonia || '').toLowerCase() || undefined, value: q.slice(0, 120),
      meta: { beds: filters.beds, max_price: filters.max_price, min_price: filters.min_price, tipo: firstStr(filters.tipo) || undefined, intent: filters.buyer_intent || filters.intent, amenidades: Array.isArray(filters.amenity) ? filters.amenity.join(',') : filters.amenity, n_exact: exact.length, n_casi: casi.length, cross_zone: crossZone.length, zona_no_disponible: zonaNoDisp || undefined },
    });
  } catch (_) { /* noop */ }

  // ¿la consulta REALMENTE es una búsqueda de propiedad? (la burbuja lo usa para decidir si pinta resultados o solo
  // responde como chat). La superficie lo ignora — ahí todo es búsqueda.
  const isSearch = !!((filters.colonia && filters.colonia.length) || filters.max_price || filters.min_price || filters.beds || filters.baths || filters.min_sqm || filters.max_sqm || (filters.amenity && filters.amenity.length) || (filters.unit_feature && filters.unit_feature.length) || filters.tipo);

  return { exact, casi, crossZone, crossRelax, zonaNoDisp, zonaNoDispSlug, colonia, filters, intro, isSearch, hasResults: !!(exact.length || casi.length || crossZone.length), pending: false };
}
