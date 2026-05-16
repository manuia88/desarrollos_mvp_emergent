// Marketplace page — developments grid + Heatmap Map Intelligence (Batch 24)
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import Navbar from '../components/landing/Navbar';
import TopFilters from '../components/marketplace/TopFilters';
import RiskScoreSubscribeWidget from '../components/marketplace/RiskScoreSubscribeWidget';
import DevelopmentCard from '../components/marketplace/DevelopmentCard';
import MarketplaceHeatmapLayer from '../components/marketplace/MarketplaceHeatmapLayer';
import ColoniaSidebar from '../components/marketplace/ColoniaSidebar';
import ImageSearchModal from '../components/marketplace/ImageSearchModal';
import UrlSearchModal from '../components/marketplace/UrlSearchModal';
import SaveSearchModal from '../components/marketplace/SaveSearchModal';
import AtlaxBubble from '../components/landing/AtlaxBubble';
import BuyerCoachWidget from '../components/buyer_coach/BuyerCoachWidget';
import SubscoreFilterPanel from '../components/zones/SubscoreFilterPanel';
import { Camera, ExternalLink, Bell, Sparkle, BarChart } from '../components/icons';
import { Link } from 'react-router-dom';
import { fetchColonias, fetchDevelopments, aiSearchParse } from '../api/marketplace';
import ColoniaQuizModal from '../components/marketplace/ColoniaQuizModal';
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
  const navigate = useNavigate();

  // W5.2 Sub-C — Subscore filters (zone dimensions)
  const [subscoreMin, setSubscoreMin] = useState({});
  // W5.3 Parte 2B Sub-E — Forecast 12m growth minimum filter
  const [forecastDeltaMin, setForecastDeltaMin] = useState(0);

  // Mapbox refs
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const [mapInstance, setMapInstance] = useState(null);

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
    setLoading(true);
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
      setDevelopments(list);
      setLoading(false);
    }).catch(() => { setDevelopments([]); setLoading(false); });
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
      const { filters: parsed } = await aiSearchParse(query);
      setAiFilters(parsed || {});
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
      style: 'mapbox://styles/mapbox/dark-v11',
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

  const resultsText = useMemo(
    () => t('marketplace_v2.results_count', { count: developments.length }),
    [t, developments.length]
  );

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      {/* W4.2D1 — Dynamic meta tags */}
      <MarketplaceMetaTags filters={filters} coloniaFilter={coloniaFilter} resultCount={developments.length} />
      <Navbar user={user} onLogin={onLogin} onLogout={onLogout} />
      <main style={{ paddingTop: 60 }}>
        <section style={{ maxWidth: 1440, margin: '0 auto', padding: '32px 32px 12px' }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>{t('marketplace_v2.hero_eyebrow')}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{
                fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(28px, 4vw, 44px)',
                letterSpacing: '-0.028em', color: 'var(--cream)', lineHeight: 1.05,
                marginBottom: 12, maxWidth: 880, textWrap: 'balance',
              }}>
                {t('marketplace_v2.hero_h1')}
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
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(240,235,224,0.18)',
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
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(240,235,224,0.18)',
                  color: 'var(--cream)',
                  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 7,
                  backdropFilter: 'blur(8px)',
                }}
              >
                <ExternalLink size={14} /> Buscar por URL
              </button>
              {/* Batch 26 — Quiz "Mi colonia ideal" */}
              <button
                data-testid="quiz-trigger"
                onClick={() => setQuizOpen(true)}
                style={{
                  padding: '9px 16px',
                  borderRadius: 9999,
                  background: 'rgba(99,102,241,0.12)',
                  border: '1px solid rgba(99,102,241,0.35)',
                  color: 'rgba(99,102,241,0.95)',
                  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 7,
                  backdropFilter: 'blur(8px)',
                }}
              >
                <Sparkle size={14} /> Mi colonia ideal
              </button>
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
              {/* Batch 26 — Comparador */}
              <button
                data-testid="comparator-trigger"
                onClick={() => navigate('/comparar')}
                style={{
                  padding: '9px 16px',
                  borderRadius: 9999,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(240,235,224,0.18)',
                  color: 'var(--cream)',
                  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 7,
                  backdropFilter: 'blur(8px)',
                }}
              >
                <BarChart size={14} /> Comparar
              </button>
              {/* View mode toggle */}
              <div style={{
                display: 'flex', gap: 4, padding: 4,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(240,235,224,0.12)',
                borderRadius: 9999,
              }}>
                {[
                  { k: 'lista', label: 'Lista' },
                  { k: 'mapa',  label: 'Mapa' },
                ].map(({ k, label }) => (
                  <button
                    key={k}
                    data-testid={`view-toggle-${k}`}
                    onClick={() => setViewMode(k)}
                    style={{
                      padding: '7px 16px', borderRadius: 9999, border: 'none',
                      background: viewMode === k
                        ? 'linear-gradient(90deg,#6366F1,#EC4899)'
                        : 'transparent',
                      color: viewMode === k ? '#fff' : 'var(--cream-3)',
                      fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Sticky filter bar — solo en vista lista */}
        {viewMode === 'lista' && (
          <section
            data-testid="marketplace-search"
            style={{
              position: 'sticky', top: 60, zIndex: Z.DROPDOWN,
              background: 'rgba(6,8,15,0.92)',
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
                onAIClear={() => setAiFilters(null)}
              />
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
            <div data-testid="mkp-results-count" style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', marginBottom: 18 }}>
              {resultsText}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 280px) 1fr', gap: 24, alignItems: 'flex-start' }}>
              <aside data-testid="marketplace-sidebar" style={{ position: 'sticky', top: 130 }}>
                <SubscoreFilterPanel
                  value={subscoreMin}
                  onApply={(v) => setSubscoreMin(v)}
                  onClear={() => setSubscoreMin({})}
                  compact={false}
                  forecastValue={forecastDeltaMin}
                  onForecastChange={(v) => setForecastDeltaMin(Number(v) || 0)}
                />
              </aside>
              <div>
                {loading ? (
                  <div style={{ padding: 60, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>…</div>
                ) : developments.length === 0 ? (
                  <div data-testid="mkp-empty" style={{
                    padding: 60, textAlign: 'center',
                    background: 'rgba(255,255,255,0.03)', border: '1px dashed var(--border-2)',
                    borderRadius: 16, fontFamily: 'DM Sans', color: 'var(--cream-2)',
                  }}>
                    {t('marketplace_v2.empty')}
                  </div>
                ) : (
                  <div className="dev-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 20,
                  }}>
                    {developments.map((d, i) => (
                      <div key={d.id} data-testid="development-card">
                        <DevelopmentCard dev={d} index={i} />
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
      <AtlaxBubble />
      <BuyerCoachWidget />
    </div>
  );
}
