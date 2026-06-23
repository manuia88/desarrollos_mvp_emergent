// ZonaPropiedades — el tab "Propiedades" de la página de zona unificada (Fase 3).
// Marketplace colonia-scoped EMBEBIDO: reusa TopFilters + DevelopmentCard + fetchDevelopments (no duplica el motor).
// La colonia está fija a esta zona; el perfil (lente global) da el orden por defecto (Fase 4 lo amplía).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TopFilters from '../marketplace/TopFilters';
import DevelopmentCard from '../marketplace/DevelopmentCard';
import { fetchDevelopments } from '../../api/marketplace';

const PAGE_SIZE = 24;

export default function ZonaPropiedades({ colonia, colonias = [], profile, zonaName, onVerZona }) {
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState('recent');
  const [developments, setDevelopments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef(null);

  // colonia SIEMPRE fija a esta zona · perfil 'primera' → muestra primero lo más accesible (lente global, Fase 4)
  const effSort = (profile === 'primera' && sort === 'recent') ? 'price_asc' : sort;
  const mergedFilters = useMemo(() => ({ ...filters, colonia, sort: effSort }), [filters, colonia, effSort]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchDevelopments({ ...mergedFilters, limit: PAGE_SIZE, offset: 0 }).then((list) => {
      if (!active) return;
      const arr = Array.isArray(list) ? list : [];
      setDevelopments(arr); setNextOffset(arr.length); setHasMore(arr.length === PAGE_SIZE); setLoading(false);
    }).catch(() => { if (active) { setDevelopments([]); setHasMore(false); setLoading(false); } });
    return () => { active = false; };
  }, [mergedFilters]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    fetchDevelopments({ ...mergedFilters, limit: PAGE_SIZE, offset: nextOffset }).then((list) => {
      const arr = Array.isArray(list) ? list : [];
      setDevelopments((prev) => [...prev, ...arr]); setNextOffset((o) => o + arr.length); setHasMore(arr.length === PAGE_SIZE); setLoadingMore(false);
    }).catch(() => setLoadingMore(false));
  }, [loadingMore, hasMore, loading, nextOffset, mergedFilters]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return undefined;
    const io = new IntersectionObserver((entries) => { if (entries[0] && entries[0].isIntersecting) loadMore(); }, { rootMargin: '700px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  const addCompare = (d) => {
    try {
      const raw = localStorage.getItem('comparator_basket');
      const arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr) || arr.length >= 3) return;
      if (arr.some((x) => x.entity_id === d.id)) return;
      const next = [...arr, { entity_id: d.id, title: d.name || d.title || d.id }];
      localStorage.setItem('comparator_basket', JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('comparator_basket_updated', { detail: { count: next.length } }));
    } catch { /* ignore */ }
  };

  const sec = { maxWidth: 1080, margin: '0 auto', padding: '0 24px' };

  return (
    <div>
      <div style={{ ...sec, marginTop: 18 }}>
        {onVerZona && (
          <button type="button" onClick={onVerZona} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginBottom: 14, padding: '10px 16px', borderRadius: 12, border: '1px solid rgba(99,102,241,0.25)', background: 'linear-gradient(135deg, rgba(124,92,255,0.06), rgba(192,38,211,0.04))', color: '#6D28D9', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
            📖 ¿Por qué {zonaName || 'esta zona'}? Conócela a fondo →
          </button>
        )}
        <TopFilters colonias={colonias} filters={filters} setFilters={setFilters} sort={sort} setSort={setSort}
          onAIQuery={() => {}} aiLoading={false} aiFilters={null} onAIClear={() => {}} />
        <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: '#8A8FA6', marginTop: 12, fontWeight: 600 }}>
          {loading ? 'Buscando desarrollos…' : `${developments.length}${hasMore ? '+' : ''} ${developments.length === 1 ? 'desarrollo' : 'desarrollos'} en esta zona`}
        </div>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 20, marginTop: 16 }}>
            {[0, 1, 2].map((i) => <div key={i} style={{ height: 360, borderRadius: 16, background: 'rgba(16,18,28,0.04)' }} />)}
          </div>
        ) : developments.length === 0 ? (
          <div style={{ padding: 30, marginTop: 16, borderRadius: 16, border: '1px solid rgba(16,18,28,0.08)', background: '#fff', textAlign: 'center', fontFamily: 'DM Sans', fontSize: 13.5, color: '#6B6F86' }}>
            No hay desarrollos que cumplan estos filtros en esta zona. Prueba aflojar alguno.
          </div>
        ) : (
          <div className="dev-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 20, marginTop: 16 }}>
            {developments.map((d, i) => (
              <div key={d.id} data-testid="development-card" style={{ position: 'relative' }}>
                <DevelopmentCard dev={d} index={i} colonia={colonia} />
                <button type="button" data-testid={`btn-add-compare-${d.id}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); addCompare(d); }}
                  style={{ position: 'absolute', top: 48, left: 12, zIndex: 5, padding: '6px 12px', borderRadius: 9999, background: 'rgba(255,255,255,0.94)', border: '1px solid rgba(16,18,28,0.12)', color: '#6D28D9', fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', backdropFilter: 'blur(8px)', boxShadow: '0 2px 8px rgba(16,18,28,0.12)' }}>
                  + Comparar
                </button>
              </div>
            ))}
          </div>
        )}
        {hasMore && <div ref={sentinelRef} style={{ height: 1 }} aria-hidden />}
        {loadingMore && <div style={{ textAlign: 'center', padding: '22px 0 6px', fontFamily: 'DM Sans', fontSize: 13, color: '#8A8FA6' }}>Cargando más desarrollos…</div>}
      </div>
    </div>
  );
}
