/**
 * UrlSearchModal — Phase 4 Batch 25
 * Búsqueda de propiedades similares pegando URL de portal externo
 * (Inmuebles24, Vivanuncios, EasyBroker)
 */
import React, { useRef, useState } from 'react';
import { parseExternalUrl } from '../../api/marketplace';
import { X, ExternalLink, Search } from '../icons';

const SUPPORTED = ['inmuebles24.com.mx', 'vivanuncios.com.mx', 'easybroker.com'];

function SimilarityBadge({ pct }) {
  const color = pct >= 65 ? '#22C55E' : pct >= 40 ? '#F59E0B' : '#6B7280';
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 9999,
      border: `1px solid ${color}44`,
      background: `${color}18`,
      fontFamily: 'DM Sans', fontWeight: 700, fontSize: 10, color,
    }}>
      {pct}% similar
    </span>
  );
}

function ExternalPropertyCard({ property }) {
  const price = property.price_mxn
    ? `$${(property.price_mxn / 1_000_000).toFixed(1)}M`
    : '—';
  const cover = property.photos?.[0] || '';

  return (
    <div style={{
      padding: '14px 16px',
      background: 'rgba(var(--theme-rgb),0.08)',
      border: '1px solid rgba(var(--theme-rgb),0.22)',
      borderRadius: 14, marginBottom: 16,
      display: 'flex', gap: 14, alignItems: 'flex-start',
    }}>
      {cover && (
        <img
          src={cover}
          alt={property.title || ''}
          style={{
            width: 90, height: 64, objectFit: 'cover',
            borderRadius: 8, flexShrink: 0,
          }}
          onError={e => { e.target.style.display = 'none'; }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'Outfit', fontWeight: 700, fontSize: 14,
          color: 'var(--cream, #F0EBE0)',
          marginBottom: 4,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {property.title || 'Propiedad externa'}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
          {property.location?.colonia && (
            <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.55)' }}>
              {property.location.colonia}
            </span>
          )}
          {property.m2_total && (
            <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.45)' }}>
              {property.m2_total} m²
            </span>
          )}
          {property.rooms && (
            <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.45)' }}>
              {property.rooms} rec.
            </span>
          )}
        </div>
        <div style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 16,
          background: 'linear-gradient(90deg, var(--theme), var(--theme-3))',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          {price}
        </div>
        {property.source && (
          <div style={{
            marginTop: 4,
            fontFamily: 'DM Sans', fontSize: 10,
            color: 'rgba(var(--theme-rgb),0.6)',
          }}>
            Fuente: {property.source}
          </div>
        )}
        {property.warning && (
          <div style={{
            marginTop: 6, padding: '4px 8px',
            background: 'rgba(245,158,11,0.12)',
            border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: 6,
            fontFamily: 'DM Sans', fontSize: 10,
            color: 'rgba(245,158,11,0.8)',
          }}>
            {property.warning}
          </div>
        )}
      </div>
    </div>
  );
}

function MatchCard({ match }) {
  const price = match.precio
    ? `$${(match.precio / 1_000_000).toFixed(1)}M`
    : '—';
  return (
    <div style={{
      borderRadius: 12, overflow: 'hidden',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(240,235,224,0.10)',
      transition: 'border-color 0.2s', cursor: 'pointer',
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(var(--theme-rgb),0.45)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(240,235,224,0.10)'}
    >
      <div style={{
        width: '100%', paddingTop: '56%', position: 'relative',
        background: 'rgba(var(--theme-rgb),0.10)',
      }}>
        {match.thumbnail_url && (
          <img
            src={match.thumbnail_url}
            alt={match.nombre}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.target.style.display = 'none'; }}
          />
        )}
        <div style={{ position: 'absolute', top: 7, right: 7 }}>
          <SimilarityBadge pct={match.similarity_pct} />
        </div>
      </div>
      <div style={{ padding: '9px 11px' }}>
        <div style={{
          fontFamily: 'Outfit', fontWeight: 700, fontSize: 12,
          color: 'var(--cream, #F0EBE0)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 2,
        }}>
          {match.nombre || 'Proyecto'}
        </div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(240,235,224,0.5)', marginBottom: 3 }}>
          {match.zona}
        </div>
        <div style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 13,
          background: 'linear-gradient(90deg, var(--theme), var(--theme-3))',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>
          {price}
        </div>
      </div>
    </div>
  );
}

export default function UrlSearchModal({ open, onClose }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const handleSearch = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await parseExternalUrl(trimmed);
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err?.message || 'Error al procesar la URL. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setUrl('');
    setResult(null);
    setError(null);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      data-testid="url-search-modal-backdrop"
      onClick={handleClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(6,8,15,0.82)',
        backdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        data-testid="url-search-modal"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'rgba(13,16,23,0.98)',
          border: '1px solid rgba(240,235,224,0.12)',
          borderRadius: 20, padding: '24px',
          width: '100%', maxWidth: 660,
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 20,
              color: 'var(--cream, #F0EBE0)', letterSpacing: '-0.02em',
            }}>
              Buscar por URL externa
            </div>
            <div style={{
              fontFamily: 'DM Sans', fontSize: 12,
              color: 'rgba(240,235,224,0.45)', marginTop: 2,
            }}>
              Pega el enlace de Inmuebles24, Vivanuncios o EasyBroker
            </div>
          </div>
          <button
            data-testid="url-search-close"
            onClick={handleClose}
            style={{
              width: 30, height: 30, borderRadius: 9999,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(240,235,224,0.15)',
              color: 'rgba(240,235,224,0.6)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={12} />
          </button>
        </div>

        {/* URL input */}
        {!result && (
          <>
            <div style={{
              display: 'flex', gap: 8, marginBottom: 10,
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${error ? 'rgba(239,68,68,0.4)' : 'rgba(240,235,224,0.15)'}`,
              borderRadius: 12, padding: '4px 4px 4px 14px',
              transition: 'border-color 0.2s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, color: 'rgba(var(--theme-rgb),0.5)' }}>
                <ExternalLink size={14} />
              </div>
              <input
                ref={inputRef}
                data-testid="url-search-input"
                type="url"
                value={url}
                onChange={e => { setUrl(e.target.value); setError(null); }}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="https://www.inmuebles24.com.mx/propiedades/..."
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream, #F0EBE0)',
                  padding: '8px 0',
                }}
                autoFocus
              />
              <button
                data-testid="url-search-submit"
                onClick={handleSearch}
                disabled={!url.trim() || loading}
                style={{
                  padding: '9px 18px', borderRadius: 9999, border: 'none',
                  background: (!url.trim() || loading)
                    ? 'rgba(var(--theme-rgb),0.3)'
                    : 'linear-gradient(90deg, var(--theme), var(--theme-3))',
                  color: '#fff',
                  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                  cursor: (!url.trim() || loading) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  flexShrink: 0,
                  transition: 'background 0.2s',
                }}
              >
                {loading ? (
                  <>
                    <span style={{
                      width: 13, height: 13, borderRadius: '50%',
                      border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
                      display: 'inline-block', animation: 'spin 0.7s linear infinite',
                    }} />
                    Procesando…
                  </>
                ) : (
                  <><Search size={13} /> Buscar</>
                )}
              </button>
            </div>

            {/* Sources supported */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
              {SUPPORTED.map(s => (
                <span key={s} style={{
                  padding: '3px 9px', borderRadius: 9999,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(240,235,224,0.12)',
                  fontFamily: 'DM Sans', fontSize: 10,
                  color: 'rgba(240,235,224,0.45)',
                }}>
                  {s}
                </span>
              ))}
            </div>
          </>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding: '12px 16px', borderRadius: 12, marginBottom: 16,
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
            fontFamily: 'DM Sans', fontSize: 13, color: '#FCA5A5',
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{error}</div>
            <div style={{ fontSize: 11, color: 'rgba(252,165,165,0.7)' }}>
              Fuentes soportadas: {SUPPORTED.join(', ')}
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div data-testid="url-search-results">
            {/* External property card */}
            <div style={{ marginBottom: 20 }}>
              <div style={{
                fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11,
                color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase',
                letterSpacing: '0.1em', marginBottom: 10,
              }}>
                Propiedad encontrada
              </div>
              <ExternalPropertyCard property={result.external_property} />
            </div>

            {/* Similar properties */}
            <div>
              <div style={{
                fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11,
                color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase',
                letterSpacing: '0.1em', marginBottom: 10,
              }}>
                {result.matches?.length > 0
                  ? `${result.matches.length} propiedades similares en DesarrollosMX`
                  : 'Sin coincidencias en DesarrollosMX'}
              </div>
              {result.matches?.length > 0 ? (
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
                }} className="url-matches-grid">
                  {result.matches.map((m, i) => <MatchCard key={i} match={m} />)}
                </div>
              ) : (
                <div style={{
                  padding: '28px 24px', textAlign: 'center',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px dashed rgba(240,235,224,0.12)',
                  borderRadius: 14,
                  fontFamily: 'DM Sans', fontSize: 13,
                  color: 'rgba(240,235,224,0.45)',
                }}>
                  No encontramos desarrollos similares en este momento
                </div>
              )}
            </div>

            {/* Reset */}
            <button
              onClick={() => { setResult(null); setUrl(''); }}
              data-testid="url-search-reset"
              style={{
                marginTop: 20, padding: '8px 16px', borderRadius: 9999,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(240,235,224,0.15)',
                color: 'rgba(240,235,224,0.7)',
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Nueva búsqueda
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 540px) { .url-matches-grid { grid-template-columns: repeat(2,1fr) !important; } }
      `}</style>
    </div>
  );
}
