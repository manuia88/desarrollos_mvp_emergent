// Marketplace page — developments grid + Heatmap Map Intelligence (Batch 24)
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LightScope, PublicNav, Footer } from '../components/ui';
import TopFilters from '../components/marketplace/TopFilters';
import RiskScoreSubscribeWidget from '../components/marketplace/RiskScoreSubscribeWidget';
import DevelopmentCard from '../components/marketplace/DevelopmentCard';
import ImageSearchModal from '../components/marketplace/ImageSearchModal';
import UrlSearchModal from '../components/marketplace/UrlSearchModal';
import SaveSearchModal from '../components/marketplace/SaveSearchModal';
import AtlaxBubble from '../components/landing/AtlaxBubble';
// BuyerCoach retirado: Atlax es la asistente única (unificación · evita "mil bubbles").
import OportunidadPanel from '../components/marketplace/OportunidadPanel';
import { Camera, ExternalLink, Bell } from '../components/icons';
import { Link, useNavigate } from 'react-router-dom';
import { fetchColonias, fetchDevelopments, aiSearchParse, fetchCasiCumple } from '../api/marketplace';
import { saveMatchCriteria } from '../lib/unitMatch';
import { tc } from '../lib/titleCase';
import ColoniaQuizModal from '../components/marketplace/ColoniaQuizModal';
import { visitorId } from '../lib/buyerSignal';
// W4.2D1 — URL state sync helpers
import { urlToFilters, filtersToUrl } from '../utils/marketplaceUrlState';
import MarketplaceMetaTags from '../components/seo/MarketplaceMetaTags';
import { Z } from '../styles/zIndex';

export default function Marketplace({ user, onLogin, onLogout }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [colonias, setColonias] = useState([]);
  const [filters, setFilters] = useState({});
  const [aiFilters, setAiFilters] = useState(null);
  const [aiNotice, setAiNotice] = useState(null);   // zona pedida que NO cubrimos (honestidad)
  const [aiNoticeSlug, setAiNoticeSlug] = useState(null); // slug de la zona para enlazar a /zona
  const [aiCrossZone, setAiCrossZone] = useState([]);     // si no alcanza la zona pedida → desarrollos en OTRAS zonas que sí cumplen
  const [aiMensSupuesto, setAiMensSupuesto] = useState(null); // supuesto usado para mapear mensualidad→precio (enganche·plazo·tasa)
  const [aiBrecha, setAiBrecha] = useState(null);         // brecha: lo + barato en la zona pedida vs lo que el comprador puede pagar
  const [aiCrossRelax, setAiCrossRelax] = useState(null); // cómo se relajó el cruce: null=estricto · 'esquema' · 'cercano'
  const [casiResults, setCasiResults] = useState([]);   // "los que más se asemejan" cuando 0 exactos
  const [relajCounts, setRelajCounts] = useState({});   // C · "si quitas X → N opciones" (conteo predictivo)
  const [aiLoading, setAiLoading] = useState(false);
  const [sort, setSort] = useState('recent');
  const [developments, setDevelopments] = useState([]);
  const [loading, setLoading] = useState(true);
  // Paginación (infinite scroll) — no cargar 20,000 de golpe
  const PAGE_SIZE = 24;
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef(null);

  // Batch 24 — View mode
  const [viewMode] = useState('lista'); // vista única (el mapa vive en /mapa)
  const [imgSearchOpen, setImgSearchOpen] = useState(false);
  const [coloniaFilter, setColoniaFilter] = useState(null);

  // Batch 25 — New modals
  const [urlSearchOpen, setUrlSearchOpen] = useState(false);
  const [saveSearchOpen, setSaveSearchOpen] = useState(false);

  // Batch 26 — Lead-capture tools
  const [quizOpen, setQuizOpen] = useState(false);
  // E2 · gusto: "parecidos a los que te gustaron" (de los likes del visitor · Netflix-style)
  const [parecidos, setParecidos] = useState([]);
  const [gustoPerfil, setGustoPerfil] = useState(null);   // perfil de gusto (amenidades/precio/recámaras) → lente para Atlax
  // E4 · casamentera: lo que el sistema encontró para ti (de tu búsqueda guardada con alerta)
  const [alertas, setAlertas] = useState([]);

  // W5.2 Sub-C — Subscore filters (zone dimensions)
  const [subscoreMin, setSubscoreMin] = useState({});
  // W5.3 Parte 2B Sub-E — Forecast 12m growth minimum filter
  const [forecastDeltaMin, setForecastDeltaMin] = useState(0);


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
        .then((r) => r.json()).then((d) => { setParecidos(d?.parecidos || []); setGustoPerfil(d?.gusto || null); }).catch(() => {});
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

  // Filtros combinados (búsqueda obligatoria + IA + zona + subscores) — compartidos por el fetch inicial y "cargar más".
  const mergedFilters = useMemo(() => {
    const hasActiveSubscores = Object.keys(subscoreMin).length > 0;
    return {
      ...filters,
      ...(aiFilters || {}),
      ...(coloniaFilter ? { colonia: coloniaFilter } : {}),
      ...(hasActiveSubscores ? { subscore_min: JSON.stringify(subscoreMin) } : {}),
      ...(forecastDeltaMin > 0 ? { forecast_delta_min: forecastDeltaMin } : {}),
      ...(sort === 'taste' ? { visitor_id: visitorId() } : {}),   // 'Para ti' → reordena por gusto del visitante
      sort,
    };
  }, [filters, aiFilters, sort, coloniaFilter, subscoreMin, forecastDeltaMin]);

  // CONTEXTO PARA ATLAX: resumen en lenguaje natural de lo que el usuario busca AHORA → la info fluye búsqueda → asistente.
  const atlaxContext = useMemo(() => {
    const f = { ...filters, ...(aiFilters || {}), ...(coloniaFilter ? { colonia: coloniaFilter } : {}) };
    const colName = (id) => (colonias || []).find((c) => c.id === id)?.name || String(id).replace(/-/g, ' ');
    const money = (n) => `$${Number(n).toLocaleString('es-MX')}`;
    const parts = [];
    if (f.colonia) { const arr = Array.isArray(f.colonia) ? f.colonia : [f.colonia]; if (arr.length) parts.push(`zona ${arr.map(colName).join(', ')}`); }
    if (f.beds) parts.push(`${f.beds}+ recámaras`);
    if (f.baths) parts.push(`${f.baths}+ baños`);
    if (f.parking) parts.push(`${f.parking}+ estacionamiento`);
    if (f.tipo) parts.push(String(f.tipo));
    if (f.min_price || f.max_price) parts.push(`precio ${f.min_price ? money(f.min_price) : ''}${f.min_price && f.max_price ? '–' : ''}${f.max_price ? money(f.max_price) : (f.min_price ? '+' : '')}`.trim());
    if (f.mensualidad_max) parts.push(`mensualidad hasta ${money(f.mensualidad_max)}`);
    if (f.enganche_max) parts.push(`enganche hasta ${money(f.enganche_max)}`);
    if (Array.isArray(f.amenity) && f.amenity.length) parts.push(`amenidades: ${f.amenity.join(', ')}`);
    if (f.stage) parts.push(String(f.stage).replace(/_/g, ' '));
    // Lente de gusto: lo que el visitante ha likeado → Atlax personaliza ("por lo que te ha gustado…").
    let gustoNota = '';
    if (gustoPerfil && (gustoPerfil.amenidades || []).length) {
      const g = [];
      if ((gustoPerfil.amenidades || []).length) g.push(`amenidades como ${gustoPerfil.amenidades.slice(0, 4).join(', ')}`);
      if (gustoPerfil.precio_m2_prom) g.push(`~$${Number(gustoPerfil.precio_m2_prom).toLocaleString('es-MX')}/m²`);
      if (gustoPerfil.recamaras) g.push(`${gustoPerfil.recamaras} recámaras`);
      if (g.length) gustoNota = ` Por lo que le ha gustado antes, prefiere ${g.join(' · ')} — tenlo en cuenta al recomendar.`;
    }
    if (!parts.length) return `El usuario está en el marketplace de desarrollos (CDMX), explorando sin filtros aún.${gustoNota}`;
    return `El usuario está en el marketplace buscando: ${parts.join(' · ')}. Hay ${developments.length} resultado(s) visibles ahora. Responde sobre ESTA búsqueda: ayúdalo a afinar, comparar zonas, o entender financiamiento.${gustoNota}`;
  }, [filters, aiFilters, coloniaFilter, colonias, developments.length, gustoPerfil]);

  // Fetch inicial (página 1) — se reinicia cuando cambian los filtros. Guard "última respuesta gana" (race fix).
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchDevelopments({ ...mergedFilters, limit: PAGE_SIZE, offset: 0 }).then(list => {
      if (!active) return;
      const arr = Array.isArray(list) ? list : [];
      setDevelopments(arr);
      setNextOffset(arr.length);
      setHasMore(arr.length === PAGE_SIZE);
      setLoading(false);
    }).catch(() => { if (active) { setDevelopments([]); setHasMore(false); setLoading(false); } });
    return () => { active = false; };
  }, [mergedFilters]);

  // Cargar más (infinite scroll) — agrega la siguiente página sin recargar la actual.
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    fetchDevelopments({ ...mergedFilters, limit: PAGE_SIZE, offset: nextOffset }).then(list => {
      const arr = Array.isArray(list) ? list : [];
      setDevelopments(prev => [...prev, ...arr]);
      setNextOffset(o => o + arr.length);
      setHasMore(arr.length === PAGE_SIZE);
      setLoadingMore(false);
    }).catch(() => setLoadingMore(false));
  }, [loadingMore, hasMore, loading, nextOffset, mergedFilters]);

  // Centinela al final de la lista → dispara "cargar más" al acercarse (700px antes).
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries[0] && entries[0].isIntersecting) loadMore();
    }, { rootMargin: '700px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

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
      setAiNoticeSlug(resp?.zona_no_disponible_slug || null);
      setAiCrossZone(Array.isArray(resp?.cross_zone) ? resp.cross_zone : []);
      setAiMensSupuesto(resp?.mensualidad_supuesto || null);
      setAiBrecha(resp?.brecha_zona || null);
      setAiCrossRelax(resp?.cross_relax || null);
    } finally {
      setAiLoading(false);
    }
  };


  const handleClearColoniaFilter = () => setColoniaFilter(null);

  // La lista visible = los desarrollos cargados. (El filtrado por presupuesto/etapa lo hace el fetch del servidor +
  // los filtros de la barra; el panel de oportunidad ya no filtra client-side — es una terminal de inteligencia de zona.)
  const visibleDevs = developments;

  // Campos OBLIGATORIOS para buscar (regla founder): ZONA + PRESUPUESTO + RECÁMARAS + METRAJE (m²). Cualquiera puede
  // ser multi/rango. Sin los 4 → no hay búsqueda; la alerta dice EXACTAMENTE cuáles faltan (filtros más asertivos).
  const hasZona = !!(coloniaFilter || (filters.colonia || []).length || (aiFilters && aiFilters.colonia));
  // Presupuesto = precio O mensualidad O enganche O apartado (cualquier forma de decir "cuánto puedo pagar" cuenta).
  const _budgetKeys = ['min_price', 'max_price', 'mensualidad_max', 'enganche_max', 'apartado_max'];
  const hasPrecio = _budgetKeys.some((k) => filters[k] || (aiFilters && aiFilters[k]));
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
  // ¿Hay una colonia activa en la búsqueda? → muestra su panel de inteligencia (si no, grid full-width, sin sidebar).
  const coloniaActiva = coloniaFilter || (filters.colonia || [])[0] || (aiFilters && (Array.isArray(aiFilters.colonia) ? aiFilters.colonia[0] : aiFilters.colonia)) || null;
  const coloniaNombre = coloniaActiva ? ((colonias.find((c) => c.id === coloniaActiva) || {}).name || coloniaActiva) : null;

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
      max_price: filters.max_price || (aiFilters && aiFilters.max_price),
      min_sqm: filters.min_sqm || (aiFilters && aiFilters.min_sqm),
      max_sqm: filters.max_sqm || (aiFilters && aiFilters.max_sqm),
      unit_feature: [...(filters.unit_feature || []), ...((aiFilters && aiFilters.unit_feature) || [])],
      orientacion: [...(filters.orientacion || []), ...((aiFilters && aiFilters.orientacion) || [])],
    };
    saveMatchCriteria(canSearch ? c : null);
  }, [canSearch, filters, aiFilters]);

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
              {/* W4.18.2A — Ver en mapa (Mapa Cerebro Espacial DMX) · lleva la colonia activa de la búsqueda → el mapa enfoca ahí */}
              <Link
                to={(() => { const c = coloniaFilter || (aiFilters && aiFilters.colonia) || filters.colonia; const id = Array.isArray(c) ? c[0] : c; return id ? `/mapa?colonia=${encodeURIComponent(id)}` : '/mapa'; })()}
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
                onAIClear={() => { setAiFilters(null); setAiNotice(null); setAiNoticeSlug(null); setAiCrossZone([]); setAiMensSupuesto(null); setAiBrecha(null); setAiCrossRelax(null); }}
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
                  <span>Aún no tenemos desarrollos en <b style={{ color: 'var(--cream)', textTransform: 'capitalize' }}>{aiNotice}</b> (cubrimos CDMX). Te mostramos lo más cercano.{(() => { const slug = aiNoticeSlug || ((colonias || []).find((x) => (x.name || '').toLowerCase() === String(aiNotice).toLowerCase()) || {}).id; return slug ? <> <Link to={`/zona/${slug}`} style={{ color: 'var(--theme)', fontWeight: 800, textDecoration: 'none' }}>Conoce {aiNotice} a fondo →</Link></> : null; })()}</span>
                </div>
              )}
              {/* BRECHA DE PRESUPUESTO: honestidad — lo más económico que existe en la zona pedida vs lo que el comprador puso. */}
              {aiBrecha && aiBrecha.gap > 0 && (
                <div data-testid="ai-brecha" style={{
                  marginTop: 10, padding: '11px 15px', borderRadius: 12,
                  background: 'rgba(236,72,153,0.08)', border: '1px solid rgba(236,72,153,0.28)',
                  fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ fontSize: 15 }}>📊</span>
                  <span>En esta zona lo más económico arranca en <b style={{ color: 'var(--cream)' }}>~${Number(aiBrecha.mens_zona_pedida || 0).toLocaleString('es-MX')}/mes</b> — unos <b style={{ color: '#F0A0C0' }}>${Number(aiBrecha.gap).toLocaleString('es-MX')}/mes</b> arriba de tu presupuesto. {aiCrossZone.length > 0 ? 'Abajo te muestro zonas donde tu número sí alcanza.' : 'Sube un poco tu mensualidad o ajusta el esquema de pago para ver opciones.'}</span>
                </div>
              )}
              {/* CROSS-ZONA: no alcanzó la zona pedida → estos desarrollos en otras zonas SÍ cumplen lo que buscas. */}
              {aiCrossZone.length > 0 && (
                <div data-testid="ai-cross-zone" style={{ marginTop: 12, padding: '14px 16px', borderRadius: 14, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.28)' }}>
                  <div style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13.5, color: 'var(--cream)', display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ fontSize: 16 }}>🧭</span> {aiCrossRelax === 'cercano' ? 'Nada entró exacto en tu presupuesto — esto es lo más cercano en otras zonas:' : aiCrossRelax === 'esquema' ? 'En crédito no alcanzó, pero con otro esquema de pago sí — mira estas opciones:' : 'Tu presupuesto rinde más en otras zonas — esto cumple lo que buscas:'}</div>
                  {aiMensSupuesto ? <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-2)', marginTop: 4 }}>Mensualidad por desarrollo, en sus dos esquemas — <b style={{ color: 'var(--cream)' }}>💳 crédito</b> (enganche {aiMensSupuesto.enganche} · {aiMensSupuesto.plazo_anios} años · {aiMensSupuesto.tasa}) y <b style={{ color: 'var(--cream)' }}>🏗️ preventa</b> (lo que pagas al mes durante la obra). {aiMensSupuesto.nota}</div> : null}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10, marginTop: 12 }}>
                    {aiCrossZone.map((c) => (
                      <Link key={c.id || c.name} to={`/zona/${c.colonia_id || c.slug}`} style={{ textDecoration: 'none', display: 'block', padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 800, color: 'var(--theme)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.colonia || c.colonia_id}</div>
                          {typeof c.match === 'number' ? <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: c.match >= 8 ? '#34D399' : '#A5B4FC', flexShrink: 0 }}>{c.match}<span style={{ fontSize: 9, opacity: 0.7 }}>/10</span></span> : null}
                        </div>
                        <div style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 14.5, color: 'var(--cream)', marginTop: 2 }}>{c.name}</div>
                        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', marginTop: 4 }}>{Array.isArray(c.bedrooms_range) ? `${c.bedrooms_range[0]}–${c.bedrooms_range[1]} rec` : ''}{Array.isArray(c.m2_range) ? ` · ${c.m2_range[0]}–${c.m2_range[1]} m²` : ''}</div>
                        {c.price_from ? <div style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13.5, color: '#34D399', marginTop: 4 }}>desde {c.price_from_display || `$${Number(c.price_from).toLocaleString('es-MX')}`}</div> : null}
                        {(c.mensualidad_credito || c.mensualidad_preventa) ? (
                          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-2)', marginTop: 3, lineHeight: 1.5 }}>
                            {c.mensualidad_credito ? <div>💳 crédito: <b style={{ color: 'var(--cream)' }}>~${Number(c.mensualidad_credito).toLocaleString('es-MX')}/mes</b></div> : null}
                            {c.mensualidad_preventa ? <div>🏗️ preventa: <b style={{ color: 'var(--cream)' }}>~${Number(c.mensualidad_preventa).toLocaleString('es-MX')}/mes</b></div> : null}
                            {c.contado ? <div>💵 contado: <b style={{ color: '#34D399' }}>${Number(c.contado.precio).toLocaleString('es-MX')}</b> <span style={{ opacity: 0.8 }}>(ahorras ${Number(c.contado.ahorro).toLocaleString('es-MX')} · {c.contado.pct}%)</span></div> : null}
                            <div style={{ fontSize: 9.5, opacity: 0.7, marginTop: 1 }}>{c.plan_real ? '✓ plan del desarrollador' : 'estimado'}</div>
                          </div>
                        ) : null}
                        {c.sobre_presupuesto > 0 ? <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: '#F0A0C0', marginTop: 4 }}>~${Number(c.sobre_presupuesto).toLocaleString('es-MX')}/mes arriba de tu presupuesto</div> : null}
                        {Array.isArray(c.falta) && c.falta.length > 0 ? <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(245,200,120,0.85)', marginTop: 5 }}>le falta: {c.falta.join(' · ')}</div> : null}
                      </Link>
                    ))}
                  </div>
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
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Quiz accesible en browse general (sin colonia, donde más sirve "¿qué zona?") */}
                  {!coloniaActiva && (
                    <button type="button" data-testid="abrir-quiz-colonia" onClick={() => setQuizOpen(true)}
                      style={{ padding: '9px 16px', borderRadius: 9999, border: '1px solid rgba(99,102,241,0.28)', background: 'rgba(99,102,241,0.06)', color: '#6D28D9', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13 }}>
                      🧭 ¿No sabes qué zona? Haz el test
                    </button>
                  )}
                  {/* Reversible: vuelve al inicio de la búsqueda guiada (limpia y reaparecen las preguntas "lo que falta"). */}
                  <button onClick={() => { setFilters({}); setAiFilters(null); setAiNotice(null); setAiCrossZone([]); setAiMensSupuesto(null); setAiBrecha(null); setAiCrossRelax(null); setColoniaFilter(null); setBrowseAll(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    data-testid="volver-a-buscar" className="btn btn-primary" style={{ padding: '9px 18px', fontSize: 13.5 }}>
                    ✨ Nueva búsqueda
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: coloniaActiva ? 'minmax(260px, 280px) 1fr' : '1fr', gap: 24, alignItems: 'flex-start' }}>
              {/* Panel de inteligencia SOLO cuando hay una colonia activa · sin scroll propio (un solo scroll) */}
              {coloniaActiva && (
                <aside data-testid="marketplace-sidebar" style={{ alignSelf: 'start' }}>
                  <OportunidadPanel
                    developments={developments}
                    colonias={colonias}
                    selectedColoniaId={coloniaActiva}
                    onPerfilar={() => { const falta = requiredFields.find((f) => !f.ok); abrirFiltro((falta || {}).fkey || 'filter-location'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  />
                  {/* General → específico: del marketplace a la página de zona a fondo */}
                  <Link to={`/zona/${coloniaActiva}`} style={{ display: 'block', width: '100%', marginTop: 12, padding: '12px', borderRadius: 14, background: 'linear-gradient(135deg,#6D4AFF,#C026D3)', color: '#fff', textAlign: 'center', textDecoration: 'none', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13.5 }}>
                    📖 Conoce {coloniaNombre} a fondo →
                  </Link>
                  <button type="button" data-testid="abrir-quiz-colonia" onClick={() => setQuizOpen(true)}
                    style={{ width: '100%', marginTop: 10, padding: '11px', borderRadius: 14, border: '1px solid rgba(99,102,241,0.28)', background: 'rgba(99,102,241,0.06)', color: '#6D28D9', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13 }}>
                    🧭 ¿Otra zona? Haz el test
                  </button>
                </aside>
              )}
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
                        {/* Honesto: colonia buscada SIN inventario → su inteligencia de zona sí existe (página de zona) */}
                        {coloniaActiva && (
                          <div data-testid="empty-zona-cta" style={{ marginBottom: 16, padding: '16px 20px', borderRadius: 14, background: 'linear-gradient(135deg, rgba(124,92,255,0.06), rgba(192,38,211,0.04))', border: '1px solid rgba(99,102,241,0.2)', maxWidth: 560, margin: '0 auto 16px' }}>
                            <div style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-2)', marginBottom: 11, lineHeight: 1.5 }}>
                              Aún no hay desarrollos cargados en <b style={{ color: 'var(--cream)', textTransform: 'capitalize' }}>{coloniaNombre}</b> — pero su <b>inteligencia de zona</b> (precios, plusvalía, riesgo, cómo se vive) sí está lista.
                            </div>
                            <Link to={`/zona/${coloniaActiva}`} style={{ display: 'inline-block', padding: '11px 20px', borderRadius: 12, background: 'linear-gradient(135deg,#6D4AFF,#C026D3)', color: '#fff', textDecoration: 'none', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13.5 }}>
                              📖 Conoce {coloniaNombre} a fondo →
                            </Link>
                          </div>
                        )}
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
                          {/* Cero callejones: convertir el "no hay" en una relación → te aviso cuando entre inventario que encaje (casamentera horaria). */}
                          <button data-testid="empty-save-alert" onClick={() => setSaveSearchOpen(true)} style={{ padding: '11px 22px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#6D4AFF,#C026D3)', color: '#fff', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13.5, display: 'inline-flex', alignItems: 'center', gap: 7 }}>🔔 Te aviso cuando llegue algo así</button>
                          <button data-testid="empty-clear" onClick={() => { setFilters({}); setAiFilters(null); setAiNotice(null); setAiCrossZone([]); setAiMensSupuesto(null); setAiBrecha(null); setAiCrossRelax(null); setColoniaFilter(null); setBrowseAll(true); }} className="btn btn-glass">Ver todos los desarrollos</button>
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

                {/* Infinite scroll: centinela (dispara cargar más) + indicador */}
                {hasMore && <div ref={sentinelRef} style={{ height: 1 }} aria-hidden />}
                {loadingMore && (
                  <div style={{ textAlign: 'center', padding: '22px 0 6px', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>
                    Cargando más desarrollos…
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

      </main>

      {/* Comparador ahora vive en la barra de filtros (TopFilters · ComparadorPill) */}

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
        filters={{ ...filters, ...(coloniaFilter ? { colonia: coloniaFilter } : {}) }}
        aiFilters={aiFilters}
      />

      {/* Batch 26 — Quiz Modal */}
      <ColoniaQuizModal
        open={quizOpen}
        onClose={() => setQuizOpen(false)}
        onSelectColonia={(coloniaId) => { setQuizOpen(false); navigate(`/zona/${coloniaId}?ver=propiedades`); }}
      />

      <style>{`
        @media (max-width: 1200px) { .dev-grid { grid-template-columns: repeat(3, 1fr) !important; } }
        @media (max-width: 900px) { .dev-grid { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (max-width: 560px) { .dev-grid { grid-template-columns: 1fr !important; } }
      `}</style>
      <AtlaxBubble theme="light" context={atlaxContext} />
      {viewMode === 'lista' && <Footer />}
    </LightScope>
  );
}


// Comparador reubicado a la barra de filtros (TopFilters · ComparadorPill).
