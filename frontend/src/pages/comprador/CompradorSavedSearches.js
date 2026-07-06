/**
 * CompradorSavedSearches — Phase 4 Batch 28
 * Lista cards saved searches con filtros + delete + nueva búsqueda CTA.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listSavedSearches, deleteSavedSearch } from '../../api/comprador';
import CompradorLayout from '../../components/comprador/CompradorLayout';
import { X, ArrowRight, Search, Bell } from '../../components/icons';
import { tc } from '../../lib/titleCase';

function describeFilters(filters = {}) {
  // Mismas claves que usa el marketplace (max_price/beds/min_sqm) — antes leía claves viejas
  // (price_max/recamaras_min) y toda búsqueda se describía como "Todos los desarrollos".
  const parts = [];
  const cols = filters.colonia;
  if (Array.isArray(cols) && cols.length) parts.push(`Zona${cols.length > 1 ? 's' : ''}: ${cols.map(tc).join(', ')}`);
  else if (typeof cols === 'string' && cols) parts.push(`Zona: ${tc(cols)}`);
  if (filters.zona) parts.push(`Zona: ${tc(filters.zona)}`);
  if (filters.tipo) parts.push(`Tipo: ${filters.tipo}`);
  if (filters.max_price || filters.price_max) parts.push(`Hasta $${((filters.max_price || filters.price_max) / 1_000_000).toFixed(1)}M`);
  if (filters.min_price) parts.push(`Desde $${(filters.min_price / 1_000_000).toFixed(1)}M`);
  if (filters.mensualidad_max) parts.push(`Mens. hasta $${Math.round(filters.mensualidad_max / 1000)}k`);
  if (filters.beds || filters.recamaras_min) parts.push(`${filters.beds || filters.recamaras_min}+ rec`);
  if (filters.baths) parts.push(`${filters.baths}+ baños`);
  if (filters.min_sqm) parts.push(`${filters.min_sqm}+ m²`);
  if (filters.max_sqm) parts.push(`hasta ${filters.max_sqm} m²`);
  return parts.length ? parts : ['Todos los desarrollos'];
}

export default function CompradorSavedSearches() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filterFreq, setFilterFreq] = useState('all'); // all | daily | weekly

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await listSavedSearches();
      setItems(data || []);
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta búsqueda guardada?')) return;
    await deleteSavedSearch(id);
    load();
  };

  const filtered = items.filter(s => filterFreq === 'all' || s.alert_frequency === filterFreq);

  return (
    <CompradorLayout>
      <div data-testid="saved-searches-page">
        <Header />

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
          {[
            { k: 'all', label: 'Todas' },
            { k: 'daily', label: 'Diario' },
            { k: 'weekly', label: 'Semanal' },
          ].map(({ k, label }) => (
            <button
              key={k}
              data-testid={`saved-filter-${k}`}
              onClick={() => setFilterFreq(k)}
              style={chipStyle(filterFreq === k)}
            >{tc(label)}</button>
          ))}
        </div>

        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState onRetry={load} />
        ) : filtered.length === 0 ? (
          <Empty />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map(s => (
              <div key={s.search_id} data-testid={`saved-${s.search_id}`} style={cardStyle}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    {describeFilters(s.filters).map((d, i) => (
                      <span key={i} style={chipReadOnly}>{d}</span>
                    ))}
                  </div>
                  <div style={{
                    fontFamily: 'DM Sans', fontSize: 11,
                    color: 'rgba(240,235,224,0.45)',
                  }}>
                    Frecuencia: <strong style={{ color: 'rgba(165,180,252,1)' }}>
                      {s.alert_frequency || 'weekly'}
                    </strong>
                    {' · '}
                    {s.confirmed ? 'Confirmada' : 'Pendiente confirmación'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    data-testid={`saved-delete-${s.search_id}`}
                    onClick={() => handleDelete(s.search_id)}
                    style={iconBtnStyle}
                    aria-label="Eliminar"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </CompradorLayout>
  );
}

const Header = () => (
  <div style={{ marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 14 }}>
    <div>
      <h1 style={{
        fontFamily: 'Outfit', fontWeight: 800, fontSize: 30,
        color: 'var(--cream, #F0EBE0)', letterSpacing: '-0.025em',
        margin: 0, lineHeight: 1.1,
      }}>
        {tc('Mis búsquedas guardadas')}
      </h1>
      <p style={{
        fontFamily: 'DM Sans', fontSize: 13,
        color: 'rgba(240,235,224,0.55)', marginTop: 8,
      }}>
        Recibe alertas cuando aparezcan nuevos desarrollos que coincidan.
      </p>
    </div>
    <Link to="/marketplace" data-testid="saved-new" style={{
      padding: '11px 18px', borderRadius: 9999,
      background: 'linear-gradient(90deg,#6366F1,#EC4899)',
      color: '#fff',
      fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
      textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 7,
    }}>
      <Search size={13} /> Nueva búsqueda
    </Link>
  </div>
);

const Loading = () => (
  <div style={{ padding: 40, textAlign: 'center', fontFamily: 'DM Sans', color: 'rgba(240,235,224,0.5)' }}>
    Cargando…
  </div>
);

const ErrorState = ({ onRetry }) => (
  <div data-testid="saved-error" style={{
    padding: '32px 24px', borderRadius: 14,
    background: 'rgba(255,255,255,0.03)',
    border: '1px dashed rgba(240,235,224,0.12)',
    textAlign: 'center',
  }}>
    <div style={{
      fontFamily: 'Outfit', fontWeight: 700, fontSize: 17,
      color: 'var(--cream, #F0EBE0)', marginBottom: 6,
    }}>
      No pudimos cargar tus búsquedas
    </div>
    <div style={{
      fontFamily: 'DM Sans', fontSize: 12,
      color: 'rgba(240,235,224,0.5)', marginBottom: 18,
    }}>
      Revisa tu conexión e inténtalo de nuevo.
    </div>
    <button onClick={onRetry} data-testid="saved-retry" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '9px 18px', borderRadius: 9999,
      background: 'linear-gradient(90deg,#6366F1,#EC4899)',
      color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
      border: 'none', cursor: 'pointer',
    }}>Reintentar</button>
  </div>
);

const Empty = () => (
  <div data-testid="saved-empty" style={{
    padding: '32px 24px', borderRadius: 14,
    background: 'rgba(255,255,255,0.03)',
    border: '1px dashed rgba(240,235,224,0.12)',
    textAlign: 'center',
  }}>
    <div style={{
      width: 44, height: 44, margin: '0 auto 14px',
      borderRadius: 9999,
      background: 'rgba(99,102,241,0.12)',
      border: '1px solid rgba(99,102,241,0.30)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'rgba(99,102,241,0.95)',
    }}>
      <Bell size={18} />
    </div>
    <div style={{
      fontFamily: 'Outfit', fontWeight: 700, fontSize: 17,
      color: 'var(--cream, #F0EBE0)', marginBottom: 6,
    }}>
      {tc('No tienes búsquedas aún')}
    </div>
    <div style={{
      fontFamily: 'DM Sans', fontSize: 12,
      color: 'rgba(240,235,224,0.5)', marginBottom: 18,
    }}>
      Aplica filtros en el marketplace y guárdalos para recibir alertas.
    </div>
    <Link to="/marketplace" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '9px 18px', borderRadius: 9999,
      background: 'linear-gradient(90deg,#6366F1,#EC4899)',
      color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
      textDecoration: 'none',
    }}>Explorar <ArrowRight size={11} /></Link>
  </div>
);

const cardStyle = {
  padding: '14px 16px',
  background: 'rgba(13,16,23,0.92)',
  border: '1px solid rgba(240,235,224,0.10)',
  borderRadius: 14,
  display: 'flex', alignItems: 'center', gap: 12,
  backdropFilter: 'blur(24px)',
};
const chipReadOnly = {
  padding: '3px 10px', borderRadius: 9999,
  background: 'rgba(99,102,241,0.10)',
  border: '1px solid rgba(99,102,241,0.25)',
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11,
  color: 'rgba(165,180,252,1)',
};
const iconBtnStyle = {
  width: 30, height: 30, borderRadius: 9999,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(240,235,224,0.15)',
  color: 'rgba(240,235,224,0.6)',
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const chipStyle = (active) => ({
  padding: '7px 14px', borderRadius: 9999,
  background: active ? 'rgba(99,102,241,0.16)' : 'rgba(255,255,255,0.04)',
  border: active ? '1px solid rgba(99,102,241,0.35)' : '1px solid rgba(240,235,224,0.12)',
  color: active ? 'rgba(165,180,252,1)' : 'rgba(240,235,224,0.65)',
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
  cursor: 'pointer',
});
