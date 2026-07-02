/**
 * CompradorFavoritos — Phase 4 Batch 28
 * Grid de favoritos con filtros + delete + share-with-asesor.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listFavorites, deleteFavorite } from '../../api/comprador';
import CompradorLayout from '../../components/comprador/CompradorLayout';
import { Heart, X, Share, ArrowRight } from '../../components/icons';
import { tc } from '../../lib/titleCase';

function fmtMxn(n) {
  if (!n) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n / 1000)}k`;
}

// Etiqueta legible del tipo de favorito (en vez del valor crudo project/colonia/unit)
const TYPE_LABEL = { project: 'Proyecto', colonia: 'Colonia', unit: 'Unidad' };

export default function CompradorFavoritos() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filterType, setFilterType] = useState('all');

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await listFavorites();
      setItems(data || []);
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async (favId) => {
    if (!window.confirm('¿Eliminar este favorito?')) return;
    try {
      await deleteFavorite(favId);
    } catch (e) {
      /* el borrado falló — el load() de abajo resincroniza y muestra el estado real */
    }
    load();
  };

  const filtered = useMemo(
    () => items.filter(f => filterType === 'all' || f.item_type === filterType),
    [items, filterType],
  );

  return (
    <CompradorLayout>
      <div data-testid="favoritos-page">
        <h1 style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 30,
          color: 'var(--cream, #F0EBE0)', letterSpacing: '-0.025em',
          margin: 0, lineHeight: 1.1,
        }}>
          {tc('Mis favoritos')}
        </h1>
        <p style={{
          fontFamily: 'DM Sans', fontSize: 13,
          color: 'rgba(240,235,224,0.55)', marginTop: 8, marginBottom: 22,
        }}>
          Tus desarrollos, colonias y unidades guardadas.
        </p>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
          {[
            { k: 'all', label: 'Todos' },
            { k: 'project', label: 'Proyectos' },
            { k: 'colonia', label: 'Colonias' },
            { k: 'unit', label: 'Unidades' },
          ].map(({ k, label }) => (
            <button key={k}
              data-testid={`fav-filter-${k}`}
              onClick={() => setFilterType(k)}
              style={chipStyle(filterType === k)}
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
          <div className="cmp-fav-grid" style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14,
          }}>
            {filtered.map(f => (
              <FavCard key={f.fav_id} fav={f} onDelete={() => handleDelete(f.fav_id)} />
            ))}
          </div>
        )}

        <style>{`
          @media (max-width: 600px) {
            .cmp-fav-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    </CompradorLayout>
  );
}

function FavCard({ fav, onDelete }) {
  const t = fav.thumb || {};
  const isProject = fav.item_type === 'project';
  return (
    <div data-testid={`fav-${fav.fav_id}`} style={{
      borderRadius: 14, overflow: 'hidden',
      background: 'rgba(13,16,23,0.92)',
      border: '1px solid rgba(240,235,224,0.10)',
      backdropFilter: 'blur(24px)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        height: 140,
        background: t.cover_photo
          ? `url(${t.cover_photo}) center/cover`
          : 'linear-gradient(135deg,rgba(99,102,241,0.18),rgba(236,72,153,0.10))',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: 10, left: 10,
          padding: '3px 10px', borderRadius: 9999,
          background: 'rgba(13,16,23,0.85)',
          border: '1px solid rgba(240,235,224,0.18)',
          fontFamily: 'DM Sans', fontSize: 9, fontWeight: 700,
          color: 'rgba(240,235,224,0.85)',
          textTransform: 'uppercase', letterSpacing: '0.07em',
          backdropFilter: 'blur(8px)',
        }}>
          {TYPE_LABEL[fav.item_type] || fav.item_type}
        </div>
        <button
          onClick={onDelete}
          data-testid={`fav-delete-${fav.fav_id}`}
          style={{
            position: 'absolute', top: 10, right: 10,
            width: 28, height: 28, borderRadius: 9999,
            background: 'rgba(13,16,23,0.85)',
            border: '1px solid rgba(240,235,224,0.18)',
            color: 'rgba(240,235,224,0.7)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          aria-label="Quitar de favoritos"
        >
          <X size={11} />
        </button>
      </div>
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <div style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 16,
          color: 'var(--cream, #F0EBE0)', letterSpacing: '-0.01em',
        }}>
          {t.name || fav.item_id}
        </div>
        {t.colonia && (
          <div style={{
            fontFamily: 'DM Sans', fontSize: 11,
            color: 'rgba(240,235,224,0.5)',
          }}>{t.colonia}</div>
        )}
        {t.price_from && (
          <div style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 16,
            color: 'rgba(165,180,252,1)',
          }}>
            Desde {fmtMxn(t.price_from)}
          </div>
        )}

        {/* Tags */}
        {Array.isArray(fav.tags) && fav.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
            {fav.tags.slice(0, 3).map((tag, i) => (
              <span key={i} style={{
                padding: '2px 8px', borderRadius: 9999,
                background: 'rgba(236,72,153,0.10)',
                border: '1px solid rgba(236,72,153,0.25)',
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 10,
                color: '#F9A8D4',
              }}>{tag}</span>
            ))}
          </div>
        )}

        <div style={{ flex: 1 }} />
        {isProject && (
          <Link
            to={`/desarrollo/${fav.item_id}`}
            style={{
              marginTop: 10,
              padding: '8px 12px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(240,235,224,0.15)',
              color: 'var(--cream, #F0EBE0)',
              fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11,
              textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            Ver detalle <ArrowRight size={11} />
          </Link>
        )}
      </div>
    </div>
  );
}

const Loading = () => (
  <div style={{ padding: 40, textAlign: 'center', fontFamily: 'DM Sans', color: 'rgba(240,235,224,0.5)' }}>
    Cargando favoritos…
  </div>
);

const ErrorState = ({ onRetry }) => (
  <div data-testid="fav-error" style={{
    padding: '32px 24px', borderRadius: 14,
    background: 'rgba(255,255,255,0.03)',
    border: '1px dashed rgba(240,235,224,0.12)',
    textAlign: 'center',
  }}>
    <div style={{
      fontFamily: 'Outfit', fontWeight: 700, fontSize: 17,
      color: 'var(--cream, #F0EBE0)', marginBottom: 6,
    }}>
      No pudimos cargar tus favoritos
    </div>
    <div style={{
      fontFamily: 'DM Sans', fontSize: 12,
      color: 'rgba(240,235,224,0.5)', marginBottom: 18,
    }}>
      Revisa tu conexión e inténtalo de nuevo.
    </div>
    <button onClick={onRetry} data-testid="fav-retry" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '9px 18px', borderRadius: 9999,
      background: 'linear-gradient(90deg,#6366F1,#EC4899)',
      color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
      border: 'none', cursor: 'pointer',
    }}>Reintentar</button>
  </div>
);

const Empty = () => (
  <div data-testid="fav-empty" style={{
    padding: '32px 24px', borderRadius: 14,
    background: 'rgba(255,255,255,0.03)',
    border: '1px dashed rgba(240,235,224,0.12)',
    textAlign: 'center',
  }}>
    <div style={{
      width: 44, height: 44, margin: '0 auto 14px',
      borderRadius: 9999,
      background: 'rgba(236,72,153,0.10)',
      border: '1px solid rgba(236,72,153,0.30)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#F472B6',
    }}>
      <Heart size={18} />
    </div>
    <div style={{
      fontFamily: 'Outfit', fontWeight: 700, fontSize: 17,
      color: 'var(--cream, #F0EBE0)', marginBottom: 6,
    }}>
      {tc('Sin favoritos todavía')}
    </div>
    <div style={{
      fontFamily: 'DM Sans', fontSize: 12,
      color: 'rgba(240,235,224,0.5)', marginBottom: 18,
    }}>
      Marca con el corazón los desarrollos y colonias que más te gusten.
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

const chipStyle = (active) => ({
  padding: '7px 14px', borderRadius: 9999,
  background: active ? 'rgba(99,102,241,0.16)' : 'rgba(255,255,255,0.04)',
  border: active ? '1px solid rgba(99,102,241,0.35)' : '1px solid rgba(240,235,224,0.12)',
  color: active ? 'rgba(165,180,252,1)' : 'rgba(240,235,224,0.65)',
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
  cursor: 'pointer',
});
