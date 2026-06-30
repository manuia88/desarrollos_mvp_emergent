/**
 * CompradorHistorial — Phase 4 Batch 28
 * Timeline vertical de últimas 50 vistas con filter chips + clear all.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listHistory, clearHistoryAll } from '../../api/comprador';
import CompradorLayout from '../../components/comprador/CompradorLayout';
import { Clock, ArrowRight, X } from '../../components/icons';
import { tc } from '../../lib/titleCase';

function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'hace unos segundos';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 7) return `hace ${Math.floor(diff / 86400)} días`;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

const SOURCE_LABEL = {
  marketplace: 'Marketplace',
  comparator: 'Comparador',
  quiz: 'Quiz',
  report: 'Reporte',
  favorites: 'Favoritos',
};

export default function CompradorHistorial() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filterSource, setFilterSource] = useState('all');
  const [filterType, setFilterType] = useState('all');

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await listHistory(50);
      setItems(data || []);
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const handleClear = async () => {
    if (!window.confirm('¿Limpiar todo tu histórico? Esta acción es irreversible.')) return;
    await clearHistoryAll();
    load();
  };

  const filtered = useMemo(() => {
    return items.filter(v => {
      if (filterSource !== 'all' && v.source !== filterSource) return false;
      if (filterType !== 'all' && v.item_type !== filterType) return false;
      return true;
    });
  }, [items, filterSource, filterType]);

  return (
    <CompradorLayout>
      <div data-testid="historial-page">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 14, marginBottom: 22 }}>
          <div>
            <h1 style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 30,
              color: 'var(--cream, #F0EBE0)', letterSpacing: '-0.025em',
              margin: 0, lineHeight: 1.1,
            }}>
              {tc('Mi histórico')}
            </h1>
            <p style={{
              fontFamily: 'DM Sans', fontSize: 13,
              color: 'rgba(240,235,224,0.55)', marginTop: 8,
            }}>
              Últimas 50 vistas en el marketplace y comparador.
            </p>
          </div>
          {items.length > 0 && (
            <button
              data-testid="historial-clear"
              onClick={handleClear}
              style={{
                padding: '9px 16px', borderRadius: 9999,
                background: 'rgba(239,68,68,0.06)',
                border: '1px solid rgba(239,68,68,0.22)',
                color: '#FCA5A5',
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 7,
              }}
            >
              <X size={11} /> Limpiar histórico
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 22 }}>
          <FilterGroup
            label="Origen"
            options={[
              { k: 'all', label: 'Todos' },
              { k: 'marketplace', label: 'Marketplace' },
              { k: 'comparator', label: 'Comparador' },
              { k: 'quiz', label: 'Quiz' },
            ]}
            value={filterSource}
            onChange={setFilterSource}
            testIdPrefix="hist-source"
          />
          <FilterGroup
            label="Tipo"
            options={[
              { k: 'all', label: 'Todos' },
              { k: 'project', label: 'Proyectos' },
              { k: 'colonia', label: 'Colonias' },
              { k: 'unit', label: 'Unidades' },
            ]}
            value={filterType}
            onChange={setFilterType}
            testIdPrefix="hist-type"
          />
        </div>

        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState onRetry={load} />
        ) : filtered.length === 0 ? (
          <Empty hasItems={items.length > 0} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(v => <HistRow key={v.view_id} v={v} />)}
          </div>
        )}
      </div>
    </CompradorLayout>
  );
}

function FilterGroup({ label, options, value, onChange, testIdPrefix }) {
  return (
    <div>
      <div style={{
        fontFamily: 'DM Sans', fontSize: 9, fontWeight: 700,
        color: 'rgba(240,235,224,0.45)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        marginBottom: 6,
      }}>{tc(label)}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map(({ k, label: l }) => (
          <button
            key={k}
            data-testid={`${testIdPrefix}-${k}`}
            onClick={() => onChange(k)}
            style={chipStyle(value === k)}
          >{tc(l)}</button>
        ))}
      </div>
    </div>
  );
}

function HistRow({ v }) {
  const t = v.thumb || {};
  const isProject = v.item_type === 'project';
  return (
    <div data-testid={`hist-${v.view_id}`} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px', borderRadius: 12,
      background: 'rgba(13,16,23,0.92)',
      border: '1px solid rgba(240,235,224,0.10)',
      backdropFilter: 'blur(24px)',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 10, flexShrink: 0,
        background: t.cover_photo
          ? `url(${t.cover_photo}) center/cover`
          : 'linear-gradient(135deg,rgba(99,102,241,0.18),rgba(236,72,153,0.10))',
        border: '1px solid rgba(240,235,224,0.10)',
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'Outfit', fontWeight: 700, fontSize: 14,
          color: 'var(--cream, #F0EBE0)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {t.name || v.item_id}
        </div>
        <div style={{
          display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 4,
        }}>
          <span style={{
            padding: '2px 8px', borderRadius: 9999,
            background: 'rgba(99,102,241,0.10)',
            border: '1px solid rgba(99,102,241,0.25)',
            fontFamily: 'DM Sans', fontWeight: 600, fontSize: 10,
            color: 'rgba(165,180,252,1)',
          }}>{SOURCE_LABEL[v.source] || v.source}</span>
          {t.colonia && (
            <span style={{
              fontFamily: 'DM Sans', fontSize: 10,
              color: 'rgba(240,235,224,0.5)',
            }}>{t.colonia}</span>
          )}
          <span style={{
            fontFamily: 'DM Sans', fontSize: 10,
            color: 'rgba(240,235,224,0.4)',
          }}>· {timeAgo(v.viewed_at)}</span>
        </div>
      </div>
      {isProject && (
        <Link
          to={`/desarrollo/${v.item_id}`}
          style={{
            padding: '7px 12px', borderRadius: 9999,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(240,235,224,0.15)',
            color: 'rgba(240,235,224,0.7)',
            fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11,
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >Ver</Link>
      )}
    </div>
  );
}

const Loading = () => (
  <div style={{ padding: 40, textAlign: 'center', fontFamily: 'DM Sans', color: 'rgba(240,235,224,0.5)' }}>
    Cargando histórico…
  </div>
);

const ErrorState = ({ onRetry }) => (
  <div data-testid="hist-error" style={{
    padding: '32px 24px', borderRadius: 14,
    background: 'rgba(255,255,255,0.03)',
    border: '1px dashed rgba(240,235,224,0.12)',
    textAlign: 'center',
  }}>
    <div style={{
      fontFamily: 'Outfit', fontWeight: 700, fontSize: 17,
      color: 'var(--cream, #F0EBE0)', marginBottom: 6,
    }}>
      No pudimos cargar tu histórico
    </div>
    <div style={{
      fontFamily: 'DM Sans', fontSize: 12,
      color: 'rgba(240,235,224,0.5)', marginBottom: 18,
    }}>
      Revisa tu conexión e inténtalo de nuevo.
    </div>
    <button onClick={onRetry} data-testid="hist-retry" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '9px 18px', borderRadius: 9999,
      background: 'linear-gradient(90deg,#6366F1,#EC4899)',
      color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
      border: 'none', cursor: 'pointer',
    }}>Reintentar</button>
  </div>
);

const Empty = ({ hasItems }) => (
  <div style={{
    padding: '32px 24px', borderRadius: 14,
    background: 'rgba(255,255,255,0.03)',
    border: '1px dashed rgba(240,235,224,0.12)',
    textAlign: 'center',
  }}>
    <div style={{
      width: 44, height: 44, margin: '0 auto 14px',
      borderRadius: 9999,
      background: 'rgba(99,102,241,0.10)',
      border: '1px solid rgba(99,102,241,0.30)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'rgba(99,102,241,0.95)',
    }}>
      <Clock size={18} />
    </div>
    <div style={{
      fontFamily: 'Outfit', fontWeight: 700, fontSize: 17,
      color: 'var(--cream, #F0EBE0)', marginBottom: 6,
    }}>
      {hasItems ? 'Sin resultados con los filtros aplicados' : 'Aún no exploras desarrollos'}
    </div>
    <div style={{
      fontFamily: 'DM Sans', fontSize: 12,
      color: 'rgba(240,235,224,0.5)', marginBottom: 18,
    }}>
      {hasItems ? 'Cambia de filtros o limpia para ver todo.' : 'Cuando visites una ficha aparecerá aquí.'}
    </div>
    {!hasItems && (
      <Link to="/marketplace" style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '9px 18px', borderRadius: 9999,
        background: 'linear-gradient(90deg,#6366F1,#EC4899)',
        color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
        textDecoration: 'none',
      }}>Explorar <ArrowRight size={11} /></Link>
    )}
  </div>
);

const chipStyle = (active) => ({
  padding: '6px 12px', borderRadius: 9999,
  background: active ? 'rgba(99,102,241,0.16)' : 'rgba(255,255,255,0.04)',
  border: active ? '1px solid rgba(99,102,241,0.35)' : '1px solid rgba(240,235,224,0.12)',
  color: active ? 'rgba(165,180,252,1)' : 'rgba(240,235,224,0.65)',
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11,
  cursor: 'pointer',
});
