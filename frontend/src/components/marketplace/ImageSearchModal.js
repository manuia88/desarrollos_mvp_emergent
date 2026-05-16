/**
 * ImageSearchModal — Phase 4 Batch 24
 * Modal para búsqueda de propiedades por imagen (foto → similar).
 * Props:
 *   open    — boolean
 *   onClose — callback
 */
import React, { useCallback, useRef, useState } from 'react';
import { searchByImage } from '../../api/marketplace';
import { X, Search } from '../icons';
import { Z } from '../../styles/zIndex';

function SimilarityBadge({ pct }) {
  const color = pct >= 60 ? '#22C55E' : pct >= 35 ? '#F59E0B' : '#6B7280';
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 9999,
      border: `1px solid ${color}44`,
      background: `${color}18`,
      fontFamily: 'DM Sans', fontWeight: 700, fontSize: 10,
      color,
    }}>
      {pct}% similar
    </span>
  );
}

function ResultCard({ match }) {
  const price = match.precio
    ? `$${(match.precio / 1_000_000).toFixed(1)}M`
    : '—';

  return (
    <div
      data-testid="img-search-result-card"
      style={{
        borderRadius: 14,
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(240,235,224,0.10)',
        cursor: 'pointer',
        transition: 'border-color 0.2s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(var(--theme-rgb),0.45)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(240,235,224,0.10)'}
    >
      {/* Thumbnail */}
      <div style={{
        width: '100%', paddingTop: '60%',
        position: 'relative', background: 'rgba(var(--theme-rgb),0.12)',
      }}>
        {match.thumbnail_url ? (
          <img
            src={match.thumbnail_url}
            alt={match.nombre}
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              objectFit: 'cover',
            }}
            onError={e => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(var(--theme-rgb),0.4)', fontSize: 24,
          }}>
            &#9635;
          </div>
        )}
        <div style={{ position: 'absolute', top: 8, right: 8 }}>
          <SimilarityBadge pct={match.similarity_pct} />
        </div>
      </div>
      {/* Info */}
      <div style={{ padding: '10px 12px' }}>
        <div style={{
          fontFamily: 'Outfit', fontWeight: 700, fontSize: 13,
          color: 'var(--cream, #F0EBE0)',
          marginBottom: 3,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {match.nombre || 'Proyecto'}
        </div>
        <div style={{
          fontFamily: 'DM Sans', fontSize: 11,
          color: 'rgba(240,235,224,0.5)',
          marginBottom: 4,
        }}>
          {match.zona || '—'}
        </div>
        <div style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 14,
          background: 'linear-gradient(90deg, var(--theme), var(--theme-3))',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          {price}
        </div>
      </div>
    </div>
  );
}

export default function ImageSearchModal({ open, onClose }) {
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const handleFile = useCallback((f) => {
    if (!f) return;
    setFile(f);
    setResults(null);
    setError(null);
    const url = URL.createObjectURL(f);
    setPreview(url);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith('image/')) handleFile(f);
  }, [handleFile]);

  const handleSearch = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const data = await searchByImage(file);
      setResults(data);
    } catch (err) {
      setError(err?.message || 'Error al procesar la imagen. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPreview(null);
    setFile(null);
    setResults(null);
    setError(null);
    onClose();
  };

  if (!open) return null;

  const hasMatches = results?.matches?.length > 0;

  return (
    <div
      data-testid="image-search-modal-backdrop"
      onClick={handleClose}
      style={{
        position: 'fixed', inset: 0, zIndex: Z.DROPDOWN,
        background: 'rgba(6,8,15,0.80)',
        backdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        data-testid="image-search-modal"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'rgba(13,16,23,0.98)',
          border: '1px solid rgba(240,235,224,0.12)',
          borderRadius: 20,
          width: '100%', maxWidth: 680,
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '24px',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: 20,
        }}>
          <div>
            <div style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 20,
              color: 'var(--cream, #F0EBE0)',
              letterSpacing: '-0.02em',
            }}>
              Buscar por imagen
            </div>
            <div style={{
              fontFamily: 'DM Sans', fontSize: 12,
              color: 'rgba(240,235,224,0.45)', marginTop: 2,
            }}>
              Sube una foto y encontramos propiedades similares con IA
            </div>
          </div>
          <button
            data-testid="image-search-close"
            onClick={handleClose}
            style={{
              width: 32, height: 32, borderRadius: 9999,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(240,235,224,0.15)',
              color: 'rgba(240,235,224,0.6)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Drop zone */}
        {!results && (
          <div
            data-testid="image-drop-zone"
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? 'rgba(var(--theme-rgb),0.7)' : 'rgba(240,235,224,0.18)'}`,
              borderRadius: 16,
              padding: preview ? 12 : '40px 24px',
              cursor: 'pointer',
              transition: 'border-color 0.2s, background 0.2s',
              background: dragOver ? 'rgba(var(--theme-rgb),0.07)' : 'rgba(255,255,255,0.02)',
              marginBottom: 16,
              textAlign: preview ? 'left' : 'center',
              display: preview ? 'flex' : 'block',
              alignItems: 'center', gap: 16,
            }}
          >
            {preview ? (
              <>
                <img
                  src={preview}
                  alt="preview"
                  style={{
                    width: 100, height: 70,
                    objectFit: 'cover', borderRadius: 10,
                    flexShrink: 0,
                  }}
                />
                <div>
                  <div style={{
                    fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
                    color: 'var(--cream, #F0EBE0)',
                  }}>
                    {file?.name}
                  </div>
                  <div style={{
                    fontFamily: 'DM Sans', fontSize: 11,
                    color: 'rgba(240,235,224,0.45)', marginTop: 3,
                  }}>
                    {file ? `${Math.round(file.size / 1024)} KB · ` : ''}
                    Haz click para cambiar
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={{
                  width: 48, height: 48, borderRadius: 9999,
                  background: 'rgba(var(--theme-rgb),0.12)',
                  border: '1px solid rgba(var(--theme-rgb),0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 12px',
                }}>
                  <Search size={20} style={{ color: 'rgba(var(--theme-rgb),0.7)' }} />
                </div>
                <div style={{
                  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 14,
                  color: 'var(--cream, #F0EBE0)', marginBottom: 4,
                }}>
                  Arrastra tu foto aquí o haz click para seleccionar
                </div>
                <div style={{
                  fontFamily: 'DM Sans', fontSize: 12,
                  color: 'rgba(240,235,224,0.40)',
                }}>
                  JPEG, PNG o WebP · Máximo 5 MB
                </div>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              data-testid="image-search-file-input"
              onChange={e => handleFile(e.target.files?.[0])}
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: 10, marginBottom: 14,
            background: 'rgba(239,68,68,0.10)',
            border: '1px solid rgba(239,68,68,0.30)',
            fontFamily: 'DM Sans', fontSize: 13,
            color: '#FCA5A5',
          }}>
            {error}
          </div>
        )}

        {/* Botón buscar */}
        {!results && (
          <button
            data-testid="image-search-submit"
            onClick={handleSearch}
            disabled={!file || loading}
            style={{
              width: '100%', padding: '13px 20px',
              borderRadius: 9999, border: 'none',
              background: (!file || loading)
                ? 'rgba(var(--theme-rgb),0.3)'
                : 'linear-gradient(90deg, var(--theme), var(--theme-3))',
              color: '#fff',
              fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14,
              cursor: (!file || loading) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'background 0.2s',
            }}
          >
            {loading ? (
              <>
                <span style={{
                  width: 16, height: 16, borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff',
                  display: 'inline-block',
                  animation: 'spin 0.7s linear infinite',
                }} />
                Analizando imagen…
              </>
            ) : (
              <>
                <Search size={15} /> Buscar similares
              </>
            )}
          </button>
        )}

        {/* Resultados */}
        {results && (
          <div data-testid="image-search-results">
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: 16,
            }}>
              <div>
                <div style={{
                  fontFamily: 'Outfit', fontWeight: 800, fontSize: 16,
                  color: 'var(--cream, #F0EBE0)',
                }}>
                  {hasMatches
                    ? `${results.matches.length} resultados similares`
                    : 'Sin matches'}
                </div>
                {results.processing_ms && (
                  <div style={{
                    fontFamily: 'DM Sans', fontSize: 11,
                    color: 'rgba(240,235,224,0.35)', marginTop: 2,
                  }}>
                    Procesado en {results.processing_ms} ms
                  </div>
                )}
              </div>
              <button
                onClick={() => { setResults(null); setPreview(null); setFile(null); }}
                style={{
                  padding: '7px 14px', borderRadius: 9999,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(240,235,224,0.15)',
                  color: 'rgba(240,235,224,0.7)',
                  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
                  cursor: 'pointer',
                }}
                data-testid="image-search-reset"
              >
                Nueva búsqueda
              </button>
            </div>

            {!hasMatches ? (
              <div style={{
                padding: '32px 24px', textAlign: 'center',
                background: 'rgba(255,255,255,0.02)',
                border: '1px dashed rgba(240,235,224,0.12)',
                borderRadius: 16,
                fontFamily: 'DM Sans', fontSize: 13,
                color: 'rgba(240,235,224,0.50)',
              }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  Sin matches
                </div>
                <div>
                  Intenta otra foto o ajusta el ángulo
                </div>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12,
              }} className="img-results-grid">
                {results.matches.map((m, i) => (
                  <ResultCard key={i} match={m} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 560px) {
          .img-results-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
