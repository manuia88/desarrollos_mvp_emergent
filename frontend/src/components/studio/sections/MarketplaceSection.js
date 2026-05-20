// W5.22 Z.8.4 — MarketplaceSection · mini-portal inmobiliario completo del asesor
// Filters sticky · search · price slider · status pills · amenities · sort · map · pagination
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from '../../../api/studio_z8';

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN || '';
const PAGE_SIZE = 12;

function fmtPrice(n) {
  if (!n) return '$—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function useDebounced(value, delay = 400) {
  const [d, setD] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setD(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return d;
}

function PropertyCard({ dev, theme, variant }) {
  const palette = theme?.palette || {};
  const themePrimary = palette.primary || '#6366F1';
  const themeSecondary = palette.secondary || '#EC4899';
  const grad = palette.gradient || `linear-gradient(135deg, ${themePrimary}, ${themeSecondary})`;
  const text = palette.text || '#F0EBE0';
  const textDim = palette.text_dim || 'rgba(240,235,224,0.62)';
  const radius = parseInt(theme?.layout?.border_radius || '14', 10) || 0;
  const headingFont = theme?.typography?.heading_font || "'Outfit', sans-serif";
  const dataFont = theme?.typography?.data_font || headingFont;

  const isPolaroid = variant === 'polaroid-stack';
  const isCompact = variant === 'data-table';

  return (
    <article
      data-testid={`mp-card-${dev.id}`}
      style={{
        background: isPolaroid ? '#fff' : 'rgba(13,16,23,0.65)',
        border: `1px solid ${themePrimary}33`,
        borderRadius: isPolaroid ? 2 : radius || 14,
        overflow: 'hidden',
        color: isPolaroid ? '#111' : text,
        padding: isPolaroid ? 10 : 0,
        boxShadow: isPolaroid ? '0 8px 30px rgba(0,0,0,0.35)' : 'none',
        transform: isPolaroid ? 'rotate(-0.6deg)' : 'none',
        transition: `transform 320ms ${theme?.animation?.transition_curve || 'cubic-bezier(0.22, 1, 0.36, 1)'}`,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ aspectRatio: '16/10', background: dev.image ? `url(${dev.image}) center/cover` : grad, position: 'relative' }}>
        <div style={{ position: 'absolute', top: 10, left: 10, padding: '4px 10px', borderRadius: 9999, background: grad, color: '#fff', fontSize: 11, fontWeight: 700, fontFamily: dataFont }}>
          Desde {fmtPrice(dev.price_from)}
        </div>
        {dev.featured && (
          <div style={{ position: 'absolute', top: 10, right: 10, padding: '4px 10px', borderRadius: 9999, background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em' }}>★ FEATURED</div>
        )}
        {dev.units_available != null && (
          <div style={{ position: 'absolute', bottom: 10, left: 10, padding: '4px 10px', borderRadius: 9999, background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 11 }}>
            {dev.units_available}/{dev.units_total} disponibles
          </div>
        )}
      </div>
      <div style={{ padding: isCompact ? 12 : 16, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ margin: 0, fontFamily: headingFont, fontSize: isCompact ? 14 : 16, color: isPolaroid ? '#111' : text }}>{dev.name}</h3>
        <div style={{ marginTop: 4, fontSize: 12, color: isPolaroid ? '#555' : textDim }}>{dev.colonia}{dev.alcaldia ? ` · ${dev.alcaldia}` : ''}</div>
        {!isCompact && (dev.amenities || []).length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(dev.amenities || []).slice(0, 3).map((a, i) => (
              <span key={i} style={{ padding: '3px 8px', borderRadius: 9999, background: isPolaroid ? '#f3f3f3' : `${themePrimary}1f`, color: isPolaroid ? '#555' : text, fontSize: 10 }}>{a}</span>
            ))}
            {(dev.amenities || []).length > 3 && <span style={{ fontSize: 10, color: textDim, alignSelf: 'center' }}>+{(dev.amenities || []).length - 3}</span>}
          </div>
        )}
        <div style={{ marginTop: 'auto', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: isPolaroid ? '#666' : textDim }}>{dev.delivery_estimate || dev.stage || ''}</span>
          <a
            data-testid={`mp-card-link-${dev.id}`}
            href={`/proyecto/${dev.slug || dev.id}`}
            target="_blank"
            rel="noreferrer"
            style={{ padding: '6px 12px', borderRadius: 9999, background: grad, color: '#fff', textDecoration: 'none', fontSize: 11, fontWeight: 700 }}
          >
            Ver detalle →
          </a>
        </div>
      </div>
    </article>
  );
}

function TableRow({ dev, theme }) {
  const palette = theme?.palette || {};
  const themePrimary = palette.primary || '#3B82F6';
  const text = palette.text || '#E2E8F0';
  const textDim = palette.text_dim || 'rgba(226,232,240,0.6)';
  const dataFont = theme?.typography?.data_font || theme?.typography?.heading_font || "'Outfit', sans-serif";
  return (
    <tr data-testid={`mp-row-${dev.id}`} style={{ borderTop: `1px solid ${themePrimary}22` }}>
      <td style={{ padding: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 56, height: 40, borderRadius: 4, background: dev.image ? `url(${dev.image}) center/cover` : 'rgba(255,255,255,0.06)' }} />
          <div>
            <div style={{ color: text, fontWeight: 600, fontSize: 13 }}>{dev.name}</div>
            <div style={{ color: textDim, fontSize: 11 }}>{dev.colonia} · {dev.alcaldia}</div>
          </div>
        </div>
      </td>
      <td style={{ padding: 12, fontFamily: dataFont, color: themePrimary, fontWeight: 700, textAlign: 'right' }}>{fmtPrice(dev.price_from)}</td>
      <td style={{ padding: 12, color: textDim, fontSize: 12, textAlign: 'center' }}>{dev.units_available}/{dev.units_total}</td>
      <td style={{ padding: 12, color: textDim, fontSize: 12 }}>{dev.delivery_estimate || dev.stage}</td>
      <td style={{ padding: 12, textAlign: 'right' }}>
        <a href={`/proyecto/${dev.slug || dev.id}`} target="_blank" rel="noreferrer" style={{ padding: '6px 12px', borderRadius: 6, background: themePrimary, color: '#fff', textDecoration: 'none', fontSize: 11, fontWeight: 600 }}>Ver →</a>
      </td>
    </tr>
  );
}

export default function MarketplaceSection({ config = {}, brandKit = {}, theme = {}, linkedEntity, landingSlug, isPreview }) {
  const { t } = useTranslation('common');
  const palette = theme.palette || {};
  const typography = theme.typography || {};
  const layout = theme.layout || {};
  const sectionVariants = theme.section_variants || {};
  const variant = sectionVariants.marketplace || 'masonry-clean';

  const themePrimary = palette.primary || brandKit.color_primary || '#6366F1';
  const themeSecondary = palette.secondary || brandKit.color_secondary || '#EC4899';
  const grad = palette.gradient || `linear-gradient(90deg, ${themePrimary}, ${themeSecondary})`;
  const text = palette.text || '#F0EBE0';
  const textDim = palette.text_dim || 'rgba(240,235,224,0.62)';
  const radius = parseInt(layout.border_radius || '14', 10) || 0;
  const sectionPadding = layout.section_padding || '4rem 1.5rem';
  const headingFont = typography.heading_font || "'Outfit', sans-serif";
  const bodyFont = typography.body_font || "'DM Sans', sans-serif";

  // Marketplace config (de landing.content.marketplace_config) o defaults
  const mpCfg = config.marketplace_config || {
    limit: 100, sort_by: 'date_new', enable_map: true, enable_search: true, pagination_mode: 'buttons',
    default_filters: { cities: [], colonias: [], status: [], price_min: null, price_max: null, amenities_required: [] },
  };

  // Server-hydrated initial data
  const initial = linkedEntity?.type === 'marketplace' ? linkedEntity : null;
  const initialFacets = initial?.facets || { cities: [], colonias: [], amenities: [], status: ['preventa', 'venta', 'cerrado'], price_min: 0, price_max: 0 };

  const [searchInput, setSearchInput] = useState('');
  const searchQ = useDebounced(searchInput, 400);
  const [filters, setFilters] = useState({
    cities: mpCfg.default_filters?.cities || [],
    colonias: mpCfg.default_filters?.colonias || [],
    status: mpCfg.default_filters?.status || [],
    price_min: mpCfg.default_filters?.price_min,
    price_max: mpCfg.default_filters?.price_max,
    amenities_required: mpCfg.default_filters?.amenities_required || [],
  });
  const [sortBy, setSortBy] = useState(mpCfg.sort_by || 'date_new');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState(initial?.developments || []);
  const [total, setTotal] = useState(initial?.total || 0);
  const [pages, setPages] = useState(initial?.pages || 1);
  const [facets] = useState(initialFacets);
  const [loading, setLoading] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const observerRef = useRef(null);

  const paginationMode = mpCfg.pagination_mode || 'buttons';
  const showMap = mpCfg.enable_map !== false;
  const showSearch = mpCfg.enable_search !== false;

  const refetch = useCallback(async (overridePage) => {
    if (!landingSlug || isPreview) return;
    setLoading(true);
    try {
      const params = {
        page: overridePage ?? page,
        page_size: PAGE_SIZE,
        q: searchQ || undefined,
        cities: filters.cities,
        colonias: filters.colonias,
        status: filters.status,
        price_min: filters.price_min,
        price_max: filters.price_max,
        amenities: filters.amenities_required,
        sort_by: sortBy,
      };
      const r = await api.queryMarketplace(landingSlug, params);
      if (paginationMode === 'infinite' && overridePage && overridePage > 1) {
        setItems((prev) => [...prev, ...(r.items || [])]);
      } else {
        setItems(r.items || []);
      }
      setTotal(r.total || 0);
      setPages(r.pages || 1);
    } catch (e) {
      // soft-fail · keep current items
    } finally {
      setLoading(false);
    }
  }, [landingSlug, isPreview, page, searchQ, filters, sortBy, paginationMode]);

  // Re-fetch on filter/sort/search change (reset page to 1)
  useEffect(() => {
    setPage(1);
    refetch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQ, filters, sortBy, landingSlug]);

  // Infinite scroll observer
  useEffect(() => {
    if (paginationMode !== 'infinite') return undefined;
    if (page >= pages) return undefined;
    const sentinel = observerRef.current;
    if (!sentinel) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loading) {
        const next = page + 1;
        setPage(next);
        refetch(next);
      }
    }, { rootMargin: '200px' });
    io.observe(sentinel);
    return () => io.disconnect();
  }, [page, pages, paginationMode, loading, refetch]);

  const toggleStatus = (s) => {
    setFilters((f) => ({ ...f, status: f.status.includes(s) ? f.status.filter((x) => x !== s) : [...f.status, s] }));
  };
  const toggleAmenity = (a) => {
    setFilters((f) => ({ ...f, amenities_required: f.amenities_required.includes(a) ? f.amenities_required.filter((x) => x !== a) : [...f.amenities_required, a] }));
  };
  const toggleCity = (c) => {
    setFilters((f) => ({ ...f, cities: f.cities.includes(c) ? f.cities.filter((x) => x !== c) : [...f.cities, c] }));
  };
  const clearFilters = () => {
    setFilters({ cities: [], colonias: [], status: [], price_min: null, price_max: null, amenities_required: [] });
    setSearchInput('');
  };

  const isTable = variant === 'data-table' || variant === 'comparison-table';
  const gridCols = variant === 'grid-tight-elegant' || variant === 'comparison-table' ? 'repeat(auto-fill, minmax(220px, 1fr))'
    : variant === 'video-thumbs' ? 'repeat(auto-fill, minmax(300px, 1fr))'
    : 'repeat(auto-fill, minmax(280px, 1fr))';
  const cardGap = variant === 'polaroid-stack' ? 28 : variant === 'grid-tight-elegant' ? 4 : 16;

  return (
    <section data-testid="sec-marketplace" data-variant={variant} style={{ padding: sectionPadding, maxWidth: 1280, margin: '0 auto', fontFamily: bodyFont, color: text }}>
      {/* Header + filters toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: headingFont, fontSize: 'clamp(1.5rem, 3vw, 2.25rem)' }}>{config.title || t('studio.landings.marketplace.title') || 'Catalogo'}</h2>
          <p style={{ marginTop: 6, color: textDim, fontSize: 14 }}>
            {loading ? t('studio.landings.marketplace.loading') || 'Cargando...' : `${total} ${total === 1 ? 'propiedad' : 'propiedades'}`}
            {searchQ && <span> · {t('studio.landings.marketplace.search_label') || 'Buscando'} "{searchQ}"</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" data-testid="mp-toggle-filters" onClick={() => setFiltersOpen(!filtersOpen)} style={{ padding: '8px 14px', borderRadius: 9999, background: `${themePrimary}1f`, color: text, border: `1px solid ${themePrimary}55`, cursor: 'pointer', fontSize: 13, fontFamily: bodyFont }}>
            {filtersOpen ? `▾ ${t('studio.landings.marketplace.filters_title') || 'Filtros'}` : `▸ ${t('studio.landings.marketplace.filters_title') || 'Filtros'}`}
          </button>
          {showMap && (
            <button type="button" data-testid="mp-toggle-map" onClick={() => setMapOpen(!mapOpen)} style={{ padding: '8px 14px', borderRadius: 9999, background: mapOpen ? grad : `${themePrimary}1f`, color: mapOpen ? '#fff' : text, border: `1px solid ${themePrimary}55`, cursor: 'pointer', fontSize: 13, fontFamily: bodyFont }}>
              {mapOpen ? (t('studio.landings.marketplace.hide_map') || 'Ocultar mapa') : (t('studio.landings.marketplace.show_map') || 'Ver mapa')}
            </button>
          )}
        </div>
      </div>

      {/* Sticky filter bar */}
      {filtersOpen && (
        <div data-testid="mp-filters" style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(18px)', border: `1px solid ${themePrimary}33`, borderRadius: radius || 16, padding: 16, marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {showSearch && (
              <div>
                <label style={{ display: 'block', fontSize: 11, color: textDim, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('studio.landings.marketplace.search_placeholder') || 'Buscar'}</label>
                <input data-testid="mp-search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={t('studio.landings.marketplace.search_placeholder') || 'nombre, colonia, alcaldia'} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${themePrimary}33`, background: 'rgba(255,255,255,0.04)', color: text, fontSize: 13 }} />
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontSize: 11, color: textDim, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('studio.landings.marketplace.sort_by') || 'Ordenar'}</label>
              <select data-testid="mp-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${themePrimary}33`, background: 'rgba(255,255,255,0.04)', color: text, fontSize: 13 }}>
                <option value="date_new">{t('studio.landings.marketplace.sort_date_new') || 'Mas recientes'}</option>
                <option value="price_asc">{t('studio.landings.marketplace.sort_price_asc') || 'Precio asc'}</option>
                <option value="price_desc">{t('studio.landings.marketplace.sort_price_desc') || 'Precio desc'}</option>
                <option value="name_az">{t('studio.landings.marketplace.sort_name_az') || 'Nombre A-Z'}</option>
                <option value="zone">{t('studio.landings.marketplace.sort_zone') || 'Zona'}</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: textDim, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('studio.landings.marketplace.filter_price_range') || 'Precio'}</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input data-testid="mp-price-min" type="number" placeholder="min" value={filters.price_min ?? ''} onChange={(e) => setFilters((f) => ({ ...f, price_min: e.target.value ? Number(e.target.value) : null }))} style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: `1px solid ${themePrimary}33`, background: 'rgba(255,255,255,0.04)', color: text, fontSize: 13 }} />
                <input data-testid="mp-price-max" type="number" placeholder="max" value={filters.price_max ?? ''} onChange={(e) => setFilters((f) => ({ ...f, price_max: e.target.value ? Number(e.target.value) : null }))} style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: `1px solid ${themePrimary}33`, background: 'rgba(255,255,255,0.04)', color: text, fontSize: 13 }} />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: textDim, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('studio.landings.marketplace.filter_status') || 'Estado'}</label>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {(facets.status || ['preventa', 'venta', 'cerrado']).map((s) => {
                  const on = filters.status.includes(s);
                  return (
                    <button key={s} type="button" data-testid={`mp-status-${s}`} onClick={() => toggleStatus(s)} style={{ padding: '6px 12px', borderRadius: 9999, background: on ? grad : `${themePrimary}14`, color: on ? '#fff' : text, border: `1px solid ${themePrimary}33`, cursor: 'pointer', fontSize: 11, textTransform: 'capitalize', fontWeight: on ? 700 : 500 }}>{s}</button>
                  );
                })}
              </div>
            </div>
          </div>
          {(facets.cities || []).length > 0 && (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 11, color: textDim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('studio.landings.marketplace.filter_cities') || 'Zonas'} ({filters.cities.length})</summary>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                {(facets.cities || []).map((c) => {
                  const on = filters.cities.includes(c);
                  return (
                    <button key={c} type="button" data-testid={`mp-city-${c}`} onClick={() => toggleCity(c)} style={{ padding: '4px 10px', borderRadius: 9999, background: on ? `${themePrimary}55` : `${themePrimary}14`, color: text, border: `1px solid ${themePrimary}33`, cursor: 'pointer', fontSize: 11 }}>{c}</button>
                  );
                })}
              </div>
            </details>
          )}
          {(facets.amenities || []).length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', fontSize: 11, color: textDim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('studio.landings.marketplace.filter_amenities') || 'Amenidades'} ({filters.amenities_required.length})</summary>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                {(facets.amenities || []).slice(0, 24).map((a) => {
                  const on = filters.amenities_required.includes(a);
                  return (
                    <button key={a} type="button" onClick={() => toggleAmenity(a)} style={{ padding: '4px 10px', borderRadius: 9999, background: on ? `${themeSecondary}55` : `${themePrimary}14`, color: text, border: `1px solid ${themePrimary}33`, cursor: 'pointer', fontSize: 11 }}>{a}</button>
                  );
                })}
              </div>
            </details>
          )}
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button data-testid="mp-clear-filters" type="button" onClick={clearFilters} style={{ padding: '6px 14px', borderRadius: 9999, background: 'transparent', color: textDim, border: 'none', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}>{t('studio.landings.marketplace.clear_filters') || 'Limpiar filtros'}</button>
          </div>
        </div>
      )}

      {/* Map */}
      {showMap && mapOpen && (
        <div data-testid="mp-map" style={{ aspectRatio: '21/9', borderRadius: radius || 16, overflow: 'hidden', marginBottom: 18, background: `linear-gradient(135deg, ${themePrimary}22, ${themeSecondary}22)`, position: 'relative' }}>
          {MAPBOX_TOKEN ? (
            <iframe title="map" width="100%" height="100%" src={`https://api.mapbox.com/styles/v1/mapbox/dark-v11.html?title=false&access_token=${MAPBOX_TOKEN}&zoomwheel=true#11.5/19.42/-99.14`} style={{ border: 0 }} />
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: textDim, fontSize: 12 }}>Configura REACT_APP_MAPBOX_TOKEN para mapa</div>
          )}
        </div>
      )}

      {/* Results */}
      {items.length === 0 && !loading ? (
        <div data-testid="mp-empty" style={{ padding: 60, textAlign: 'center', background: `${themePrimary}0a`, border: `1px dashed ${themePrimary}55`, borderRadius: radius || 16 }}>
          <div style={{ fontFamily: headingFont, fontSize: 20, color: text }}>{t('studio.landings.marketplace.empty_state') || 'Sin resultados'}</div>
          <div style={{ marginTop: 8, color: textDim, fontSize: 13 }}>Ajusta los filtros o limpia la busqueda.</div>
        </div>
      ) : isTable ? (
        <div style={{ overflow: 'auto', borderRadius: radius || 8, border: `1px solid ${themePrimary}33` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={{ background: `${themePrimary}11` }}>
                <th style={{ padding: 12, textAlign: 'left', fontFamily: headingFont, fontSize: 12, color: text }}>Propiedad</th>
                <th style={{ padding: 12, textAlign: 'right', fontFamily: headingFont, fontSize: 12, color: text }}>Precio</th>
                <th style={{ padding: 12, textAlign: 'center', fontFamily: headingFont, fontSize: 12, color: text }}>Unidades</th>
                <th style={{ padding: 12, textAlign: 'left', fontFamily: headingFont, fontSize: 12, color: text }}>Entrega</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((dev) => <TableRow key={dev.id} dev={dev} theme={theme} />)}
            </tbody>
          </table>
        </div>
      ) : (
        <div data-testid="mp-grid" style={{ display: 'grid', gridTemplateColumns: gridCols, gap: cardGap }}>
          {items.map((dev) => <PropertyCard key={dev.id} dev={dev} theme={theme} variant={variant} />)}
        </div>
      )}

      {loading && (
        <div data-testid="mp-loading" style={{ marginTop: 18, textAlign: 'center', color: textDim, fontSize: 12 }}>{t('studio.landings.marketplace.loading') || 'Cargando...'}</div>
      )}

      {/* Pagination */}
      {paginationMode === 'buttons' && pages > 1 && (
        <div data-testid="mp-pagination" style={{ marginTop: 24, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
          <button data-testid="mp-prev" type="button" disabled={page <= 1} onClick={() => { const next = page - 1; setPage(next); refetch(next); }} style={{ padding: '8px 14px', borderRadius: 9999, background: page <= 1 ? 'rgba(255,255,255,0.04)' : `${themePrimary}1f`, color: text, border: `1px solid ${themePrimary}55`, cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.4 : 1, fontSize: 13 }}>← {t('studio.landings.marketplace.prev') || 'Anterior'}</button>
          <span style={{ color: textDim, fontSize: 13 }}>Pag {page} / {pages}</span>
          <button data-testid="mp-next" type="button" disabled={page >= pages} onClick={() => { const next = page + 1; setPage(next); refetch(next); }} style={{ padding: '8px 14px', borderRadius: 9999, background: page >= pages ? 'rgba(255,255,255,0.04)' : `${themePrimary}1f`, color: text, border: `1px solid ${themePrimary}55`, cursor: page >= pages ? 'default' : 'pointer', opacity: page >= pages ? 0.4 : 1, fontSize: 13 }}>{t('studio.landings.marketplace.next') || 'Siguiente'} →</button>
        </div>
      )}
      {paginationMode === 'infinite' && page < pages && (
        <div ref={observerRef} style={{ marginTop: 20, height: 24 }} />
      )}
    </section>
  );
}
