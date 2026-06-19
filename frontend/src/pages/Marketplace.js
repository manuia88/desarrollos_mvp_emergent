// Marketplace page — developments grid + Heatmap Map Intelligence (Batch 24)
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { LightScope, PublicNav, Footer } from '../components/ui';
import TopFilters from '../components/marketplace/TopFilters';
import RiskScoreSubscribeWidget from '../components/marketplace/RiskScoreSubscribeWidget';
import DevelopmentCard from '../components/marketplace/DevelopmentCard';
import MarketplaceHeatmapLayer from '../components/marketplace/MarketplaceHeatmapLayer';
import ColoniaSidebar from '../components/marketplace/ColoniaSidebar';
import ImageSearchModal from '../components/marketplace/ImageSearchModal';
import UrlSearchModal from '../components/marketplace/UrlSearchModal';
import SaveSearchModal from '../components/marketplace/SaveSearchModal';
import AtlaxBubble from '../components/landing/AtlaxBubble';
// BuyerCoach retirado: Atlax es la asistente única (unificación · evita "mil bubbles").
import OportunidadPanel, { applyOportunidadFilters } from '../components/marketplace/OportunidadPanel';
import { Camera, ExternalLink, Bell } from '../components/icons';
import { Link } from 'react-router-dom';
import { fetchColonias, fetchDevelopments, aiSearchParse, fetchCasiCumple } from '../api/marketplace';
import { saveMatchCriteria } from '../lib/unitMatch';
import { tc } from '../lib/titleCase';
import ColoniaQuizModal from '../components/marketplace/ColoniaQuizModal';
import { visitorId } from '../lib/buyerSignal';
import { useNavigate } from 'react-router-dom';
// W4.2D1 — URL state sync helpers
import { urlToFilters, filtersToUrl } from '../utils/marketplaceUrlState';
import MarketplaceMetaTags from '../components/seo/MarketplaceMetaTags';
import { Z } from '../styles/zIndex';

const TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

export default function Marketplace({ user, onLogin, onLogout }) {
  const { t } = useTranslation();
  const [colonias, setColonias] = useState([]);
  const [filters, setFilters] = useState({});
  const [aiFilters, setAiFilters] = useState(null);
  const [aiNotice, setAiNotice] = useState(null);   // zona pedida que NO cubrimos (honestidad)
  const [casiResults, setCasiResults] = useState([]);   // "los que más se asemejan" cuando 0 exactos
  const [relajCounts, setRelajCounts] = useState({});   // C · "si quitas X → N opciones" (conteo predictivo)
  const [aiLoading, setAiLoading] = useState(false);
  const [sort, setSort] = useState('recent');
  const [developments, setDevelopments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Batch 24 — View mode
  const [viewMode, setViewMode] = useState('lista'); // 'lista' | 'mapa'
  const [selectedColonia, setSelectedColonia] = useState(null);
  const [imgSearchOpen, setImgSearchOpen] = useState(false);
  const [coloniaFilter, setColoniaFilter] = useState(null);

  // Batch 25 — New modals
  const [urlSearchOpen, setUrlSearchOpen] = useState(false);
  const [saveSearchOpen, setSaveSearchOpen] = useState(false);

  // Batch 26 — Lead-capture tools
  const [quizOpen, setQuizOpen] = useState(false);
  // E2 · gusto: "parecidos a los que te gustaron" (de los likes del visitor · Netflix-style)
  const [parecidos, setParecidos] = useState([]);
  // E4 · casamentera: lo que el sistema encontró para ti (de tu búsqueda guardada con alerta)
  const [alertas, setAlertas] = useState([]);
  const navigate = useNavigate();

  // W5.2 Sub-C — Subscore filters (zone dimensions)
  const [subscoreMin, setSubscoreMin] = useState({});
  // W5.3 Parte 2B Sub-E — Forecast 12m growth minimum filter
  const [forecastDeltaMin, setForecastDeltaMin] = useState(0);
  // Oportunidades (rediseño 2026-06-18) — 3 filtros humanos que reemplazan los scores subjetivos.
  // Client-side sobre la lista ya cargada (sin tocar el fetch del servidor).
  const [budgetMax, setBudgetMax] = useState(0);
  const [stages, setStages] = useState([]);
  const [onlyTrusted, setOnlyTrusted] = useState(false);

  // Mapbox refs
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const [mapInstance, setMapInstance] = useState(null);

  // Tema claro a nivel body (refactor PublicPageShell) → mata el fondo oscuro residual detrás del scope.
  useEffect(() => {
    document.body.classList.add('public-light');
    return () => document.body.classList.remove('public-light');
  }, []);

  // E2 · gusto + E4 · casamentera: trae los parecidos (de tus likes) y las alertas (de tu búsqueda guardada).
  useEffect(() => {
    const API = process.env.REACT_APP_BACKEND_URL;
    const vid = visitorId();
    let dismissed = false;
    try { dismissed = sessionStorage.getItem('dmx_dismiss_parecidos') === '1'; } catch { /* noop */ }
    if (!dismissed) {
      fetch(`${API}/api/buyer/parecidos?visitor_id=${vid}&limit=6`)
        .then((r) => r.json()).then((d) => setParecidos(d?.parecidos || [])).catch(() => {});
    }
    fetch(`${API}/api/buyer/alertas?visitor_id=${vid}`)
      .then((r) => r.json()).then((d) => setAlertas(d?.alertas || [])).catch(() => {});
  }, []);

  // W4.2D1 — Hydrate state from URL params on mount
  useEffect(() => {
    const { filters: urlFilters, coloniaFilter: urlColonia } = urlToFilters(window.location.search);
    if (urlColonia) setColoniaFilter(urlColonia);
    if (Object.keys(urlFilters).length > 0) {
      // Exclude colonia array (handled by coloniaFilter above)
      const { colonia: _ignored, ...restFilters } = urlFilters;
      if (Object.keys(restFilters).length > 0) setFilters(prev => ({ ...prev, ...restFilters }));
    }
    // W5.2 Sub-C — Hydrate subscore_min from URL
    const sp = new URLSearchParams(window.location.search);
    const raw = sp.get('subscore_min');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') setSubscoreMin(parsed);
      } catch {/* noop */}
    }
    const filterBy = sp.get('filter-by');
    if (filterBy && ['seguridad','lifestyle','transporte','amenidades','precio','vibe'].includes(filterBy)) {
      setSubscoreMin(prev => ({ ...prev, [filterBy]: 85 }));
    }
    // W5.3 Parte 2B Sub-E — Hydrate forecast_delta_min
    const fdm = parseInt(sp.get('forecast_delta_min') || '0', 10);
    if (!Number.isNaN(fdm) && fdm > 0) setForecastDeltaMin(fdm);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // W4.2D1 — Sync URL when filters or coloniaFilter change (replaceState, no reload)
  useEffect(() => {
    const qs = filtersToUrl(filters, coloniaFilter);
    const newUrl = `/marketplace${qs ? '?' + qs : ''}`;
    if (window.location.pathname + window.location.search !== newUrl) {
      window.history.replaceState(null, '', newUrl);
    }
  }, [filters, coloniaFilter]);

  useEffect(() => { fetchColonias().then(setColonias); }, []);

  useEffect(() => {
    let active = true;  // guard "última respuesta gana": evita que un fetch sin filtro (de mount)
    setLoading(true);   // resuelva DESPUÉS del filtrado y sobrescriba el resultado (race fix).
    const hasActiveSubscores = Object.keys(subscoreMin).length > 0;
    const merged = {
      ...filters,
      ...(aiFilters || {}),
      ...(coloniaFilter ? { colonia: coloniaFilter } : {}),
      ...(hasActiveSubscores ? { subscore_min: JSON.stringify(subscoreMin) } : {}),
      ...(forecastDeltaMin > 0 ? { forecast_delta_min: forecastDeltaMin } : {}),
      sort,
    };
    fetchDevelopments(merged).then(list => {
      if (!active) return;
      setDevelopments(list);
      setLoading(false);
    }).catch(() => { if (active) { setDevelopments([]); setLoading(false); } });
    return () => { active = false; };
  }, [filters, aiFilters, sort, coloniaFilter, subscoreMin, forecastDeltaMin]);

  // W5.2/W5.3 — Sync subscore_min + forecast_delta_min to URL
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (Object.keys(subscoreMin).length > 0) {
      sp.set('subscore_min', JSON.stringify(subscoreMin));
    } else {
      sp.delete('subscore_min');
    }
    if (forecastDeltaMin > 0) {
      sp.set('forecast_delta_min', String(forecastDeltaMin));
    } else {
      sp.delete('forecast_delta_min');
    }
    const qs = sp.toString();
    const newUrl = `/marketplace${qs ? '?' + qs : ''}`;
    if (window.location.pathname + window.location.search !== newUrl) {
      window.history.replaceState(null, '', newUrl);
    }
  }, [subscoreMin, forecastDeltaMin]);

  const onAIQuery = async (query) => {
    setAiLoading(true);
    try {
      const resp = await aiSearchParse(query);
      setAiFilters(resp?.filters || {});
      // Honestidad de zona: si pidió un lugar que no cubrimos, avísale (no fingimos resultados de otra zona).
      setAiNotice(resp?.zona_no_disponible || null);
    } finally {
      setAiLoading(false);
    }
  };

  // Inicializar mapa cuando se cambia a vista mapa
  useEffect(() => {
    if (viewMode !== 'mapa' || !mapContainer.current || mapRef.current) return;
    if (!TOKEN) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-99.1969, 19.4270],
      zoom: 10.5,
    });
    mapRef.current = map;
    map.on('load', () => setMapInstance(map));
    return () => {
      // solo limpiar si cambiamos a lista
    };
  }, [viewMode]);

  // Destruir mapa al volver a lista
  useEffect(() => {
    if (viewMode === 'lista' && mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      setMapInstance(null);
    }
  }, [viewMode]);

  const handleColoniaClick = useCallback((coloniaId) => {
    setSelectedColonia(coloniaId);
  }, []);

  const handleFilterByColonia = useCallback((coloniaId, coloniaNombre) => {
    setColoniaFilter(coloniaId);
    setSelectedColonia(null);
    setViewMode('lista');
  }, []);

  const handleClearColoniaFilter = () => setColoniaFilter(null);

  // Oportunidades: filtra la lista cargada (presupuesto/etapa/confianza). El Radar genérico se retiró.
  const visibleDevs = useMemo(
    () => applyOportunidadFilters(developments, { budgetMax, stages, onlyTrusted }),
    [developments, budgetMax, stages, onlyTrusted]
  );

  // Campos OBLIGATORIOS para buscar (regla founder): ZONA + PRESUPUESTO + RECÁMARAS + METRAJE (m²). Cualquiera puede
  // ser multi/rango. Sin los 4 → no hay búsqueda; la alerta dice EXACTAMENTE cuáles faltan (filtros más asertivos).
  const hasZona = !!(coloniaFilter || (filters.colonia || []).length || (aiFilters && aiFilters.colonia));
  const hasPrecio = !!(filters.min_price || filters.max_price || budgetMax || (aiFilters && (aiFilters.min_price || aiFilters.max_price)));
  const hasRecamaras = !!(filters.beds || (aiFilters && aiFilters.beds));
  const hasMetraje = !!(filters.min_sqm || filters.max_sqm || (aiFilters && (aiFilters.min_sqm || aiFilters.max_sqm)));
  const requiredFields = [
    { label: 'zona', ok: hasZona, fkey: 'filter-location', pregunta: '¿En qué zona?' },
    { label: 'presupuesto', ok: hasPrecio, fkey: 'filter-price', pregunta: '¿Cuánto quieres invertir?' },
    { label: 'recámaras', ok: hasRecamaras, fkey: 'filter-beds', pregunta: '¿Cuántas recámaras?' },
    { label: 'metros (m²)', ok: hasMetraje, fkey: 'filter-more', pregunta: '¿Cuántos m²?' },
  ];
  const canSearch = requiredFields.every((f) => f.ok);
  // Buscador unificado: la guía "lo que falta" abre el dropdown correcto (UN solo set de controles, sin formulario aparte).
  const [openKey, setOpenKey] = useState(null);
  const [openNonce, setOpenNonce] = useState(0);
  const abrirFiltro = (k) => { setOpenKey(k); setOpenNonce((n) => n + 1); };
  // Al ENTRAR se ven los proyectos (no pantalla vacía). La búsqueda guiada es ayuda, no muro. "Nueva búsqueda" la reabre.
  const [browseAll, setBrowseAll] = useState(true);
  const showResults = canSearch || browseAll;

  // C · Elasticidad: el comprador relaja UN criterio (lo que está dispuesto a ceder) → se quita + se CAPTURA.
  const EXTRA_LABEL = { balcon: 'balcón', terraza: 'terraza', roof_garden: 'roof garden', bodega: 'bodega', estacionamiento_independiente: 'cajón independiente', pet_friendly: 'pet friendly', gym: 'gimnasio', alberca: 'alberca', spa: 'spa', cancha_padel: 'cancha de pádel', cancha_tenis: 'cancha de tenis', asadores: 'asadores', concierge: 'concierge', seguridad: 'seguridad', cowork: 'coworking', roof: 'roof garden (común)', sky_lounge: 'sky lounge', cine: 'cine', paneles_solares: 'paneles solares', elevador: 'elevador' };
  const relajarCriterio = (slug) => {
    const rm = (obj) => { if (!obj) return obj; const n = { ...obj }; ['amenity', 'unit_feature'].forEach((k) => { if (Array.isArray(n[k])) n[k] = n[k].filter((x) => x !== slug); }); return n; };
    const tipo = ((filters.amenity || []).includes(slug) || (aiFilters && (aiFilters.amenity || []).includes(slug))) ? 'amenity' : 'unit_feature';
    setFilters((f) => rm(f));
    setAiFilters((a) => rm(a));
    try {
      fetch(`${process.env.REACT_APP_BACKEND_URL}/api/buyer/elasticidad`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitor_id: visitorId(), cedio: `${tipo}:${slug}`, texto: (aiFilters && aiFilters._q) || '' }),
      });
    } catch { /* noop */ }
  };

  // Guarda la búsqueda activa → la ficha del desarrollo resalta las unidades que cumplen (ficha consciente).
  useEffect(() => {
    const c = {
      beds: filters.beds || (aiFilters && aiFilters.beds),
      baths: filters.baths || (aiFilters && aiFilters.baths),
      parking: filters.parking || (aiFilters && aiFilters.parking),
      min_price: filters.min_price || (aiFilters && aiFilters.min_price),
      max_price: filters.max_price || budgetMax || (aiFilters && aiFilters.max_price),
      min_sqm: filters.min_sqm || (aiFilters && aiFilters.min_sqm),
      max_sqm: filters.max_sqm || (aiFilters && aiFilters.max_sqm),
      unit_feature: [...(filters.unit_feature || []), ...((aiFilters && aiFilters.unit_feature) || [])],
      orientacion: [...(filters.orientacion || []), ...((aiFilters && aiFilters.orientacion) || [])],
    };
    saveMatchCriteria(canSearch ? c : null);
  }, [canSearch, filters, aiFilters, budgetMax]);

  // "Los que más se asemejan": si 0 resultados exactos, trae los más cercanos + qué les falta. SOLO con ZONA
  // (no recomendamos en zonas que el cliente no pidió — la zona es sagrada).
  useEffect(() => {
    const merged = { ...filters, ...(aiFilters || {}), ...(coloniaFilter ? { colonia: coloniaFilter } : {}) };
    if (!loading && canSearch && visibleDevs.length === 0) {
      // visitor_id → el backend capta esta búsqueda completa SIN match exacto como "demanda insatisfecha" (hueco de
      // producto en zona que SÍ cubrimos) para el dev/superadmin. Cierra ciclo comprador → desarrollador.
      fetchCasiCumple({ ...merged, visitor_id: visitorId() }).then((r) => setCasiResults(r?.casi || [])).catch(() => setCasiResults([]));
      // C · conteo predictivo: por cada extra (amenidad/feature), cuántas opciones EXACTAS si lo quitas.
      const extrasNow = [...new Set([...(merged.amenity || []), ...(merged.unit_feature || [])])];
      if (extrasNow.length) {
        Promise.all(extrasNow.map((ex) => {
          const m2 = { ...merged };
          m2.amenity = (merged.amenity || []).filter((x) => x !== ex);
          m2.unit_feature = (merged.unit_feature || []).filter((x) => x !== ex);
          return fetchDevelopments(m2).then((d) => { const items = Array.isArray(d) ? d : (d?.developments || d?.items || []); return [ex, items.length]; }).catch(() => [ex, null]);
        })).then((pairs) => { const o = {}; pairs.forEach(([k, v]) => { if (v != null) o[k] = v; }); setRelajCounts(o); });
      } else { setRelajCounts({}); }
    } else {
      setCasiResults([]); setRelajCounts({});
    }
  }, [visibleDevs.length, loading, canSearch, filters, aiFilters, coloniaFilter]);

  const resultsText = useMemo(
    () => t('marketplace_v2.results_count', { count: visibleDevs.length }),
    [t, visibleDevs.length]
  );

  return (
    <LightScope>
      {/* W4.2D1 — Dynamic meta tags */}
      <MarketplaceMetaTags filters={filters} coloniaFilter={coloniaFilter} resultCount={developments.length} />
      <PublicNav />
      {/* Atmósfera viva — malla de luz suave (índigo/violeta/rosa) sobre base clara. Da profundidad, mata el "plano blanco". */}
      <div aria-hidden style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(900px 520px at 12% -8%, rgba(109,74,255,0.10), transparent 60%), radial-gradient(820px 520px at 100% 0%, rgba(192,38,211,0.07), transparent 55%), radial-gradient(700px 600px at 50% 115%, rgba(59,130,246,0.06), transparent 60%), linear-gradient(180deg, #FBFBFE 0%, #F6F5FC 100%)',
      }} />
      <main style={{ paddingTop: 8, position: 'relative', zIndex: 1 }}>
        <section style={{ maxWidth: 1440, margin: '0 auto', padding: '32px 32px 12px' }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>{tc(t('marketplace_v2.hero_eyebrow'))}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{
                fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(28px, 4vw, 44px)',
                letterSpacing: '-0.028em', color: 'var(--cream)', lineHeight: 1.05,
                marginBottom: 12, maxWidth: 880, textWrap: 'balance',
              }}>
                {tc(t('marketplace_v2.hero_h1'))}
              </h1>
              <p style={{
                fontFamily: 'DM Sans', fontSize: 15, color: 'var(--cream-2)',
                lineHeight: 1.55, marginBottom: 0, maxWidth: 760,
              }}>
                {t('marketplace_v2.hero_sub')}
              </p>
            </div>
            {/* View toggle + Image Search button */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {/* Image Search trigger */}
              <button
                data-testid="image-search-trigger"
                onClick={() => setImgSearchOpen(true)}
                style={{
                  padding: '9px 16px',
                  borderRadius: 9999,
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border)',
                  color: 'var(--cream)',
                  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 7,
                  backdropFilter: 'blur(8px)',
                }}
              >
                <Camera size={14} /> Buscar por foto
              </button>
              {/* URL Search trigger */}
              <button
                data-testid="url-search-trigger"
                onClick={() => setUrlSearchOpen(true)}
                style={{
                  padding: '9px 16px',
                  borderRadius: 9999,
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border)',
                  color: 'var(--cream)',
                  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 7,
                  backdropFilter: 'blur(8px)',
                }}
              >
                <ExternalLink size={14} /> Buscar por URL
              </button>
              {/* "Encuentra tu lugar" suelto RETIRADO: la barra de búsqueda + las preguntas "lo que falta" son la
                  entrada única (el Perfilador se fundió ahí). Sin botón duplicado que lleve a otro lado. */}
              {/* W4.18.2A — Ver en mapa (Mapa Cerebro Espacial DMX) */}
              <Link
                to="/mapa"
                data-testid="ver-en-mapa-trigger"
                style={{
                  padding: '9px 16px',
                  borderRadius: 9999,
                  background: 'rgba(99,102,241,0.12)',
                  border: '1px solid rgba(99,102,241,0.35)',
                  color: 'rgba(99,102,241,0.95)',
                  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                  cursor: 'pointer', textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  backdropFilter: 'blur(8px)',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                  <circle cx="12" cy="9" r="2.5" />
                </svg>
                Ver en mapa
              </Link>
              {/* Comparador del hero RETIRADO: había 2 entradas a páginas distintas (/comparar vs /portal/comparador).
                  Se deja UNA sola vía: agregas desarrollos con el botón comparar de la tarjeta → el FAB (abajo-izq)
                  abre el comparador con tu selección. Patrón único, sin confusión. */}
              {/* Toggle Lista/Mapa retirado: el mapa vive en "Ver en mapa" (/mapa). Tener ambos confundía y el mapa
                  in-página salía en blanco sin token. El marketplace es la lista; el mapa es la página dedicada. */}
            </div>
          </div>
        </section>

        {/* Sticky filter bar — solo en vista lista */}
        {viewMode === 'lista' && (
          <section
            data-testid="marketplace-search"
            style={{
              position: 'sticky', top: 56, zIndex: Z.DROPDOWN,
              background: 'rgba(255,255,255,0.82)',
              backdropFilter: 'blur(18px)',
              borderTop: '1px solid var(--border)',
              borderBottom: '1px solid var(--border)',
            }}>
            <div style={{ maxWidth: 1440, margin: '0 auto', padding: '14px 32px' }}>
              {coloniaFilter && (
                <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{
                    fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)',
                  }}>
                    Filtro: colonia activa
                  </span>
                  <button
                    onClick={handleClearColoniaFilter}
                    style={{
                      padding: '3px 10px', borderRadius: 9999,
                      background: 'rgba(99,102,241,0.15)',
                      border: '1px solid rgba(99,102,241,0.35)',
                      color: 'rgba(99,102,241,0.9)',
                      fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    Limpiar filtro colonia
                  </button>
                </div>
              )}
              {coloniaFilter && (
                <RiskScoreSubscribeWidget
                  zoneId={String(coloniaFilter).replace(/-/g, '_')}
                  zoneLabel={coloniaFilter}
                />
              )}
              <TopFilters
                colonias={colonias}
                filters={filters}
                setFilters={setFilters}
                sort={sort}
                setSort={setSort}
                onAIQuery={onAIQuery}
                aiLoading={aiLoading}
                aiFilters={aiFilters}
                onAIClear={() => { setAiFilters(null); setAiNotice(null); }}
                openKey={openKey}
                openNonce={openNonce}
              />
              {/* Honestidad de zona: pediste un lugar que no cubrimos → te lo decimos (no fingimos otra zona). */}
              {aiNotice && (
                <div data-testid="ai-zona-notice" style={{
                  marginTop: 10, padding: '11px 15px', borderRadius: 12,
                  background: 'rgba(224,163,62,0.10)', border: '1px solid rgba(224,163,62,0.32)',
                  fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ fontSize: 15 }}>📍</span>
                  <span>Aún no tenemos desarrollos en <b style={{ color: 'var(--cream)', textTransform: 'capitalize' }}>{aiNotice}</b> (cubrimos CDMX). Te mostramos lo más cercano al resto de tu búsqueda.</span>
                </div>
              )}
              {/* Save Search button — visible cuando hay filtros */}
              {(Object.keys(filters).length > 0 || aiFilters) && (
                <button
                  data-testid="save-search-trigger"
                  onClick={() => setSaveSearchOpen(true)}
                  style={{
                    marginTop: 8,
                    padding: '7px 14px', borderRadius: 9999,
                    background: 'rgba(99,102,241,0.12)',
                    border: '1px solid rgba(99,102,241,0.28)',
                    color: 'rgba(99,102,241,0.9)',
                    fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <Bell size={12} /> Guardar búsqueda
                </button>
              )}
            </div>
          </section>
        )}

        {/* ── Vista Lista ── */}
        {viewMode === 'lista' && (
          <section style={{ maxWidth: 1440, margin: '0 auto', padding: '20px 32px 64px' }}>
            {/* E4 · casamentera: lo que el sistema encontró para ti (de tu búsqueda guardada con alerta) */}
            {alertas.length > 0 && (
              <div data-testid="casamentera-alertas" style={{ marginBottom: 26, padding: '16px 18px', borderRadius: 16, background: 'linear-gradient(120deg, rgba(var(--theme-rgb),0.10), rgba(236,72,153,0.08))', border: '1px solid rgba(var(--theme-rgb),0.3)' }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: 'var(--cream)', marginBottom: 4 }}>🔔 Encontramos {alertas.length} que encaja{alertas.length > 1 ? 'n' : ''} con tu búsqueda</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', marginBottom: 12 }}>Apareció inventario que cumple lo que guardaste — míralo antes que nadie.</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {alertas.slice(0, 4).map((a) => (
                    <Link key={a.dev_id} to={`/desarrollo/${a.dev_id}`} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 12, background: '#fff', border: '1px solid var(--border)', textDecoration: 'none' }}>
                      <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13.5, color: 'var(--cream)' }}>{a.dev_name}</span>
                      <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>{a.colonia} · {a.price_from_display}</span>
                      {(a.unidades || []).length > 0 && <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 700, color: '#1FA06A' }}>· {a.unidades.length} unidad{a.unidades.length > 1 ? 'es' : ''} (#{a.unidades[0]})</span>}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {/* Buscador unificado: la barra + los filtros de arriba son la ÚNICA vía de búsqueda (el Perfilador se
                fundió aquí: escribes libre o respondes "lo que falta" tocando, y eso abre el control correcto). */}
            {/* E2 · gusto: "Porque te gustó X" — parecidos por amenidades/precio a lo que el visitor likeó. */}
            {parecidos.length > 0 && (() => {
              const byId = {}; developments.forEach((d) => { byId[d.id] = d; });
              const picks = parecidos.map((r) => ({ dev: byId[r.id], r })).filter((x) => x.dev).slice(0, 3);
              if (picks.length === 0) return null;
              return (
                <div data-testid="parecidos" style={{ marginBottom: 30 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div>
                      <div className="eyebrow" style={{ color: 'var(--theme)', marginBottom: 4 }}>{tc('✨ Por tu gusto')}</div>
                      <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(20px,2.6vw,24px)', color: 'var(--cream)', letterSpacing: '-0.025em', margin: '0 0 14px' }}>
                        {tc('Parecidos a los que te gustaron')}
                      </h2>
                    </div>
                    <button onClick={() => { setParecidos([]); try { sessionStorage.setItem('dmx_dismiss_parecidos', '1'); } catch { /* noop */ } }} data-testid="dismiss-parecidos" title="Ocultar"
                      style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 9999, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 15, lineHeight: 1 }}>✕</button>
                  </div>
                  <div className="dev-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
                    {picks.map(({ dev, r }, i) => (
                      <div key={dev.id} style={{ position: 'relative' }}>
                        <DevelopmentCard dev={dev} index={i} />
                        <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 6, background: 'var(--theme)', color: '#fff', borderRadius: 9999, padding: '5px 13px', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11.5, boxShadow: '0 2px 10px rgba(16,18,28,0.25)', whiteSpace: 'nowrap' }}>
                          porque te gustó {(r.porque || '').split(' ')[0]}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 26, paddingTop: 18, borderTop: '1px solid var(--border)' }} />
                </div>
              );
            })()}
            {showResults && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
                <div data-testid="mkp-results-count" style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>
                  {browseAll && !canSearch ? `Todos los desarrollos · ${developments.length}` : resultsText}
                </div>
                {/* Reversible: vuelve al inicio de la búsqueda guiada (limpia y reaparecen las preguntas "lo que falta"). */}
                <button onClick={() => { setFilters({}); setAiFilters(null); setAiNotice(null); setColoniaFilter(null); setBrowseAll(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  data-testid="volver-a-buscar" className="btn btn-primary" style={{ padding: '9px 18px', fontSize: 13.5 }}>
                  ✨ Nueva búsqueda
                </button>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 280px) 1fr', gap: 24, alignItems: 'flex-start' }}>
              <aside data-testid="marketplace-sidebar" style={{ position: 'sticky', top: 92, maxHeight: 'calc(100vh - 110px)', overflowY: 'auto' }}>
                <OportunidadPanel
                  developments={developments}
                  colonias={colonias}
                  selectedColoniaId={coloniaFilter || (filters.colonia || [])[0] || (aiFilters && (Array.isArray(aiFilters.colonia) ? aiFilters.colonia[0] : aiFilters.colonia))}
                  budget={filters.max_price || (aiFilters && aiFilters.max_price) || budgetMax || 0}
                  onPerfilar={() => { const falta = requiredFields.find((f) => !f.ok); abrirFiltro((falta || {}).fkey || 'filter-location'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                />
              </aside>
              <div>
                {!showResults ? (
                  <div data-testid="mkp-needs-zona-precio" style={{
                    padding: '52px 32px', textAlign: 'center',
                    background: '#fff', border: '1px dashed var(--border)', borderRadius: 18,
                    fontFamily: 'DM Sans', color: 'var(--cream-2)',
                  }}>
                    <div style={{ fontSize: 34, marginBottom: 12 }}>🔎</div>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)', marginBottom: 8 }}>
                      {tc(requiredFields.some((f) => f.ok) ? 'Ya casi — responde lo que falta' : 'Escribe arriba lo que buscas')}
                    </div>
                    <div style={{ fontSize: 13.5, color: 'var(--cream-3)', maxWidth: 500, margin: '0 auto 20px', lineHeight: 1.55 }}>
                      Usa la barra de arriba (ej. <i>"depa 2 rec en Roma máx 8 millones, 80 m²"</i>) — o responde tocando lo que falta. Con estos 4 datos te damos opciones precisas; cualquiera puede ser un rango.
                    </div>
                    {/* Las 4 preguntas: ✓ ya respondida · ○ tócala y se abre el control correcto arriba (un solo set, sin formulario aparte) */}
                    <div style={{ display: 'flex', gap: 9, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 22 }}>
                      {requiredFields.map((f) => (
                        <button key={f.label} data-testid={`falta-${f.fkey}`} disabled={f.ok}
                          onClick={() => abrirFiltro(f.fkey)} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 9999,
                          fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: f.ok ? 'default' : 'pointer',
                          background: f.ok ? 'rgba(31,160,106,0.10)' : '#fff',
                          border: '1.5px solid ' + (f.ok ? 'rgba(31,160,106,0.32)' : 'var(--theme)'),
                          color: f.ok ? '#1FA06A' : 'var(--theme)',
                        }}>{f.ok ? `✓ ${f.label}` : f.pregunta}</button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
                      <button data-testid="ver-todos" onClick={() => setBrowseAll(true)}
                        style={{ padding: '11px 18px', borderRadius: 11, border: '1.5px solid var(--border)', background: '#fff', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14, color: 'var(--cream-2)' }}>
                        o ver los {developments.length} desarrollos →
                      </button>
                    </div>
                  </div>
                ) : loading ? (
                  <div style={{ padding: 60, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>…</div>
                ) : visibleDevs.length === 0 ? (
                  (() => {
                    const acid = coloniaFilter || (filters.colonia || [])[0] || (aiFilters && aiFilters.colonia);
                    const zn = (colonias.find((c) => c.id === acid) || {}).name;
                    const extras = [...(filters.amenity || []), ...(filters.unit_feature || []), ...((aiFilters && aiFilters.amenity) || []), ...((aiFilters && aiFilters.unit_feature) || [])];
                    return (
                      <>
                      <div data-testid="mkp-empty" style={{
                        padding: '48px 32px', textAlign: 'center',
                        background: '#fff', border: '1px dashed var(--border)',
                        borderRadius: 18, fontFamily: 'DM Sans', color: 'var(--cream-2)',
                      }}>
                        <div style={{ fontSize: 34, marginBottom: 10 }}>🔍</div>
                        <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 19, color: 'var(--cream)', marginBottom: 6 }}>
                          No hay desarrollos con todo eso junto{zn ? ` en ${zn}` : ''}
                        </div>
                        <div style={{ fontSize: 13.5, color: 'var(--cream-3)', maxWidth: 460, margin: '0 auto 18px', lineHeight: 1.5 }}>
                          {extras.length > 0
                            ? 'Pediste varias amenidades y características a la vez. Quita alguna para ver más opciones — en esa zona quizá no existan todas juntas.'
                            : 'Prueba con otra zona o ajusta los filtros.'}
                        </div>
                        {extras.length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', marginBottom: 8 }}>Para ver más, quita lo que estés dispuesto a ceder:</div>
                            <div style={{ display: 'flex', gap: 7, justifyContent: 'center', flexWrap: 'wrap' }}>
                              {[...new Set(extras)].map((ex) => {
                                const n = relajCounts[ex];
                                return (
                                  <button key={ex} data-testid={`relax-${ex}`} onClick={() => relajarCriterio(ex)}
                                    style={{ padding: '6px 12px', borderRadius: 9999, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, color: 'var(--cream-2)' }}>
                                    ✕ {EXTRA_LABEL[ex] || String(ex).replace(/_/g, ' ')}
                                    {n != null && <span style={{ color: n > 0 ? '#1FA06A' : 'var(--cream-3)', fontWeight: 700 }}> → {n} {n === 1 ? 'opción' : 'opciones'}</span>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                          <button data-testid="empty-clear" onClick={() => { setFilters({}); setAiFilters(null); setAiNotice(null); setColoniaFilter(null); setBrowseAll(true); }} className="btn btn-glass">Ver todos los desarrollos</button>
                        </div>
                      </div>

                      {/* Los que MÁS se asemejan, agrupados por TIERS humanos (no "9/10" crudo · falsa precisión) */}
                      {casiResults.length > 0 && (
                        <div style={{ marginTop: 28 }} data-testid="casi-cumple">
                          <div className="eyebrow" style={{ color: 'var(--theme)', marginBottom: 4 }}>{tc('Lo más cercano')}</div>
                          <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(18px,2.4vw,22px)', color: 'var(--cream)', letterSpacing: '-0.02em', margin: '0 0 18px' }}>
                            {tc('Los que más se asemejan a tu búsqueda')}
                          </h3>
                          {[
                            { lo: 1, hi: 1, title: 'Casi perfectas', sub: 'solo les falta un detalle' },
                            { lo: 2, hi: 2, title: 'Muy buenas', sub: 'les faltan dos cosas' },
                            { lo: 3, hi: 99, title: 'Cercanas', sub: 'les faltan algunas' },
                          ].map((tier) => {
                            const grp = casiResults.filter((d) => { const n = (d.match_falta || []).length; return n >= tier.lo && n <= tier.hi; });
                            if (!grp.length) return null;
                            return (
                              <div key={tier.title} style={{ marginBottom: 24 }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                                  <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>{tc(tier.title)}</span>
                                  <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>· {tier.sub} ({grp.length})</span>
                                </div>
                                <div className="dev-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
                                  {grp.map((dev, i) => (
                                    <div key={dev.id} style={{ display: 'flex', flexDirection: 'column' }}>
                                      <DevelopmentCard dev={dev} index={i} />
                                      {(dev.match_falta || []).length > 0 && (
                                        <div style={{ marginTop: 8, padding: '8px 11px', borderRadius: 10, background: 'rgba(224,163,62,0.10)', border: '1px solid rgba(224,163,62,0.30)', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)' }}>
                                          Cumple <b style={{ color: 'var(--cream)' }}>{dev.match_met}/{dev.match_total}</b> · le falta: <b style={{ color: '#B9822E' }}>{(dev.match_falta || []).join(', ')}</b>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      </>
                    );
                  })()
                ) : (
                  <div className="dev-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 20,
                  }}>
                    {visibleDevs.map((d, i) => (
                      <div key={d.id} data-testid="development-card" style={{ position: 'relative' }}>
                        <DevelopmentCard dev={d} index={i} />
                        {/* W5.x F4.2 — botón "+ Comparar" outline · localStorage basket */}
                        <button
                          type="button"
                          className="mkt-compare-btn"
                          data-testid={`btn-add-compare-${d.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            try {
                              const raw = localStorage.getItem('comparator_basket');
                              const arr = raw ? JSON.parse(raw) : [];
                              if (!Array.isArray(arr) || arr.length >= 3) return;
                              if (arr.some((x) => x.entity_id === d.id)) return;
                              const next = [...arr, { entity_id: d.id, title: d.name || d.title || d.id }];
                              localStorage.setItem('comparator_basket', JSON.stringify(next));
                              window.dispatchEvent(new CustomEvent('comparator_basket_updated', { detail: { count: next.length } }));
                            } catch { /* ignore */ }
                          }}
                          style={{
                            position: 'absolute', top: 48, left: 12, zIndex: 5,
                            padding: '6px 12px', borderRadius: 9999,
                            background: 'rgba(255,255,255,0.94)', border: '1px solid var(--border)',
                            color: 'var(--theme)', fontFamily: 'DM Sans, sans-serif',
                            fontSize: 11.5, fontWeight: 700,
                            cursor: 'pointer', backdropFilter: 'blur(8px)',
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            boxShadow: '0 2px 8px rgba(16,18,28,0.12)',
                          }}
                        >
                          + Comparar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── Vista Mapa ── */}
        {viewMode === 'mapa' && (
          <section
            data-testid="marketplace-map-section"
            style={{
              height: 'calc(100vh - 130px)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {!TOKEN && (
              <div style={{
                position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
                zIndex: Z.DROPDOWN, padding: '14px 20px',
                background: 'rgba(239,68,68,0.14)',
                border: '1px solid rgba(239,68,68,0.4)',
                borderRadius: 12, fontFamily: 'DM Sans', fontSize: 13, color: '#fca5a5',
              }}>
                Mapbox token requerido
              </div>
            )}

            {/* Mapbox container */}
            <div
              ref={mapContainer}
              style={{ position: 'absolute', inset: 0 }}
              data-testid="marketplace-map-container"
            />

            {/* Heatmap layer component */}
            {mapInstance && (
              <MarketplaceHeatmapLayer
                mapInstance={mapInstance}
                onColoniaClick={handleColoniaClick}
              />
            )}

            {/* Colonia Sidebar */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              <div style={{ position: 'relative', height: '100%', pointerEvents: 'none' }}>
                <div style={{ pointerEvents: 'auto' }}>
                  <ColoniaSidebar
                    coloniaId={selectedColonia}
                    onClose={() => setSelectedColonia(null)}
                    onFilterByColonia={handleFilterByColonia}
                  />
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* W5.x F4.2 — Comparator basket FAB badge */}
      <ComparatorBasketFAB />

      {/* Image Search Modal */}
      <ImageSearchModal
        open={imgSearchOpen}
        onClose={() => setImgSearchOpen(false)}
      />

      {/* URL Search Modal */}
      <UrlSearchModal
        open={urlSearchOpen}
        onClose={() => setUrlSearchOpen(false)}
      />

      {/* Save Search Modal */}
      <SaveSearchModal
        open={saveSearchOpen}
        onClose={() => setSaveSearchOpen(false)}
        filters={filters}
        aiFilters={aiFilters}
      />

      {/* Batch 26 — Quiz Modal */}
      <ColoniaQuizModal
        open={quizOpen}
        onClose={() => setQuizOpen(false)}
        onSelectColonia={(coloniaId) => { setQuizOpen(false); setColoniaFilter(coloniaId); }}
      />

      <style>{`
        @media (max-width: 1200px) { .dev-grid { grid-template-columns: repeat(3, 1fr) !important; } }
        @media (max-width: 900px) { .dev-grid { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (max-width: 560px) { .dev-grid { grid-template-columns: 1fr !important; } }
      `}</style>
      <AtlaxBubble theme="light" />
      {viewMode === 'lista' && <Footer />}
    </LightScope>
  );
}


// W5.x F4.2 — Comparator basket FAB · muestra count y abre /portal/comparador
function ComparatorBasketFAB() {
  const [count, setCount] = React.useState(0);
  React.useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem('comparator_basket');
        const arr = raw ? JSON.parse(raw) : [];
        setCount(Array.isArray(arr) ? arr.length : 0);
      } catch { setCount(0); }
    };
    read();
    const onEvt = () => read();
    window.addEventListener('comparator_basket_updated', onEvt);
    window.addEventListener('storage', onEvt);
    return () => {
      window.removeEventListener('comparator_basket_updated', onEvt);
      window.removeEventListener('storage', onEvt);
    };
  }, []);
  if (!count) return null;
  const goCompare = () => {
    try {
      const raw = localStorage.getItem('comparator_basket');
      const arr = raw ? JSON.parse(raw) : [];
      const ids = (arr || []).map((x) => x.entity_id).join(',');
      window.location.href = `/portal/comparador?ids=${encodeURIComponent(ids)}`;
    } catch {
      window.location.href = '/portal/comparador';
    }
  };
  return (
    <button
      type="button"
      data-testid="comparator-basket-fab"
      onClick={goCompare}
      style={{
        position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 50,
        boxShadow: '0 10px 30px rgba(124,92,255,0.4)',
        padding: '12px 22px', borderRadius: 9999, border: 'none',
        background: 'linear-gradient(90deg, #6366F1, #EC4899)', color: '#FFFFFF',
        fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 12,
        letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
        backdropFilter: 'blur(24px)',
      }}
    >
      Comparador ({count})
    </button>
  );
}
