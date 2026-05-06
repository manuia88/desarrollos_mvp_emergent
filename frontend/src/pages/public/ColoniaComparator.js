/**
 * ColoniaComparator (page) — Phase 4 Batch 26 (C5)
 * Página pública en /comparar para comparar 1-3 colonias o propiedades
 * lado-a-lado con highlights del ganador por métrica + export PDF.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '../../components/landing/Navbar';
import { useAuth } from '../../App';
import { fetchColonias, compareEntities, downloadComparePdf } from '../../api/marketplace';
import { X, Plus, Download, ArrowRight, Sparkle } from '../../components/icons';

const MAX_SLOTS = 3;

function SlotPicker({ index, value, onPick, onClear, options, entityType }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 12);
    return options.filter(o =>
      (o.label || '').toLowerCase().includes(q) ||
      (o.id || '').toLowerCase().includes(q)
    ).slice(0, 12);
  }, [query, options]);

  if (value) {
    return (
      <div
        data-testid={`comp-slot-${index}-filled`}
        style={{
          padding: '14px 16px', borderRadius: 14,
          background: 'rgba(99,102,241,0.10)',
          border: '1px solid rgba(99,102,241,0.32)',
          minHeight: 84,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          gap: 10,
        }}
      >
        <div>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700,
            color: 'rgba(99,102,241,0.85)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            marginBottom: 4,
          }}>
            {entityType === 'colonia' ? 'Colonia' : 'Propiedad'} {index + 1}
          </div>
          <div style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 17,
            color: 'var(--cream, #F0EBE0)',
            letterSpacing: '-0.01em',
          }}>
            {value.label}
          </div>
        </div>
        <button
          data-testid={`comp-slot-${index}-clear`}
          onClick={() => onClear(index)}
          style={{
            width: 26, height: 26, borderRadius: 9999,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(240,235,224,0.18)',
            color: 'rgba(240,235,224,0.6)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <X size={10} />
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid={`comp-slot-${index}-empty`}
      style={{
        padding: '14px 16px', borderRadius: 14,
        background: 'rgba(255,255,255,0.03)',
        border: '1px dashed rgba(240,235,224,0.15)',
        minHeight: 84,
      }}
    >
      <div style={{
        fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700,
        color: 'rgba(240,235,224,0.4)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        marginBottom: 6,
      }}>
        Slot {index + 1}
      </div>
      {!open ? (
        <button
          data-testid={`comp-slot-${index}-add`}
          onClick={() => setOpen(true)}
          style={{
            width: '100%', padding: '8px 0',
            borderRadius: 9999,
            background: 'transparent',
            border: '1px solid rgba(240,235,224,0.18)',
            color: 'rgba(240,235,224,0.65)',
            fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Plus size={12} /> Agregar {entityType === 'colonia' ? 'colonia' : 'propiedad'}
        </button>
      ) : (
        <div>
          <input
            data-testid={`comp-slot-${index}-search`}
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Buscar ${entityType === 'colonia' ? 'colonia' : 'propiedad'}…`}
            style={{
              width: '100%', padding: '9px 11px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(240,235,224,0.18)',
              borderRadius: 9, outline: 'none',
              fontFamily: 'DM Sans', fontSize: 13,
              color: 'var(--cream, #F0EBE0)',
              boxSizing: 'border-box', marginBottom: 8,
            }}
          />
          <div style={{
            maxHeight: 200, overflowY: 'auto',
            background: 'rgba(13,16,23,0.7)',
            border: '1px solid rgba(240,235,224,0.10)',
            borderRadius: 9,
          }}>
            {filtered.length === 0 ? (
              <div style={{
                padding: 12, fontFamily: 'DM Sans', fontSize: 12,
                color: 'rgba(240,235,224,0.4)', textAlign: 'center',
              }}>
                Sin coincidencias
              </div>
            ) : filtered.map(opt => (
              <button
                key={opt.id}
                data-testid={`comp-slot-${index}-opt-${opt.id}`}
                onClick={() => { onPick(index, opt); setOpen(false); setQuery(''); }}
                style={{
                  width: '100%', padding: '9px 12px',
                  background: 'transparent', border: 'none', textAlign: 'left',
                  fontFamily: 'DM Sans', fontSize: 13,
                  color: 'var(--cream, #F0EBE0)', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <span>{opt.label}</span>
                {opt.sub && (
                  <span style={{ fontSize: 11, color: 'rgba(240,235,224,0.4)' }}>{opt.sub}</span>
                )}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setOpen(false); setQuery(''); }}
            style={{
              width: '100%', marginTop: 6, padding: '6px 0', borderRadius: 9999,
              background: 'transparent', border: 'none',
              color: 'rgba(240,235,224,0.4)',
              fontFamily: 'DM Sans', fontSize: 11, cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

export default function ColoniaComparator() {
  const { user, logout, openAuth } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [entityType, setEntityType] = useState('colonia');
  const [slots, setSlots] = useState([null, null, null]);
  const [colonias, setColonias] = useState([]);
  const [matrix, setMatrix] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Cargar colonias para el picker
  useEffect(() => {
    fetchColonias().then(list => {
      const opts = (list || []).map(c => ({
        id: c.id || c.slug,
        label: c.name || c.nombre,
        sub: c.alcaldia,
      }));
      setColonias(opts);
    }).catch(() => setColonias([]));
  }, []);

  // Pre-seleccionar desde query params: ?colonia=polanco,roma-norte
  useEffect(() => {
    const colParam = searchParams.get('colonia');
    if (colParam && colonias.length > 0) {
      const ids = colParam.split(',').slice(0, MAX_SLOTS);
      const next = [null, null, null];
      ids.forEach((id, i) => {
        const opt = colonias.find(c => c.id === id);
        if (opt) next[i] = opt;
      });
      setSlots(next);
    }
  }, [searchParams, colonias]);

  const filledIds = slots.filter(Boolean).map(s => s.id);
  const canCompare = filledIds.length >= 2;

  const handleCompare = async () => {
    if (!canCompare) return;
    setLoading(true); setError(null);
    try {
      const data = await compareEntities(entityType, filledIds);
      setMatrix(data);
    } catch (err) {
      setError(err?.message || 'Error en la comparación');
      setMatrix(null);
    } finally {
      setLoading(false);
    }
  };

  const handlePdf = async () => {
    if (!canCompare) return;
    setPdfLoading(true);
    try {
      const blob = await downloadComparePdf(entityType, filledIds);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'comparacion_desarrollosmx.pdf';
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err?.message || 'Error al descargar el PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  const handlePick = (i, opt) => {
    setSlots(prev => { const n = [...prev]; n[i] = opt; return n; });
    setMatrix(null);
  };
  const handleClear = (i) => {
    setSlots(prev => { const n = [...prev]; n[i] = null; return n; });
    setMatrix(null);
  };

  return (
    <div style={{ background: 'var(--bg, #06080F)', minHeight: '100vh' }}>
      <Navbar onLogin={() => openAuth('login')} user={user} onLogout={logout} />

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 28px 80px' }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '4px 12px', borderRadius: 9999,
            background: 'rgba(99,102,241,0.12)',
            border: '1px solid rgba(99,102,241,0.28)',
            fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700,
            color: 'rgba(99,102,241,0.9)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            marginBottom: 12,
          }}>
            <Sparkle size={11} /> Comparador
          </div>
          <h1 style={{
            fontFamily: 'Outfit', fontWeight: 800,
            fontSize: 'clamp(28px, 4vw, 44px)',
            color: 'var(--cream, #F0EBE0)',
            letterSpacing: '-0.025em', lineHeight: 1.05, margin: 0,
          }}>
            Compara hasta 3 {entityType === 'colonia' ? 'colonias' : 'propiedades'}
          </h1>
          <p style={{
            fontFamily: 'DM Sans', fontSize: 15, marginTop: 12,
            color: 'rgba(240,235,224,0.55)', maxWidth: 640,
          }}>
            Decisión side-by-side con métricas reales: precios, scores IE, riesgos urbanos,
            climate twin y desarrollos activos. Descarga el PDF para llevarlo a tu reunión.
          </p>
        </div>

        {/* Toggle entity type */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
          {[
            { k: 'colonia', label: 'Colonias' },
            { k: 'property', label: 'Propiedades' },
          ].map(({ k, label }) => (
            <button
              key={k}
              data-testid={`comp-type-${k}`}
              onClick={() => { setEntityType(k); setSlots([null, null, null]); setMatrix(null); }}
              style={{
                padding: '8px 18px', borderRadius: 9999, cursor: 'pointer',
                border: entityType === k
                  ? '1px solid rgba(99,102,241,0.55)'
                  : '1px solid rgba(240,235,224,0.15)',
                background: entityType === k
                  ? 'rgba(99,102,241,0.15)'
                  : 'rgba(255,255,255,0.04)',
                fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                color: entityType === k ? 'rgba(99,102,241,0.95)' : 'rgba(240,235,224,0.55)',
                transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Slots */}
        <div className="comp-slots" style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14,
          marginBottom: 22,
        }}>
          {[0, 1, 2].map(i => (
            <SlotPicker
              key={i}
              index={i}
              value={slots[i]}
              onPick={handlePick}
              onClear={handleClear}
              options={entityType === 'colonia' ? colonias : []}
              entityType={entityType}
            />
          ))}
        </div>

        {/* CTAs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 28 }}>
          <button
            data-testid="comp-go"
            onClick={handleCompare}
            disabled={!canCompare || loading}
            style={{
              padding: '12px 24px', borderRadius: 9999, border: 'none',
              background: !canCompare || loading
                ? 'rgba(99,102,241,0.3)'
                : 'linear-gradient(90deg,#6366F1,#EC4899)',
              color: '#fff',
              fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14,
              cursor: !canCompare || loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            {loading ? 'Comparando…' : <>Comparar <ArrowRight size={13} /></>}
          </button>
          {matrix && canCompare && (
            <button
              data-testid="comp-pdf"
              onClick={handlePdf}
              disabled={pdfLoading}
              style={{
                padding: '12px 22px', borderRadius: 9999,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(240,235,224,0.18)',
                color: 'var(--cream, #F0EBE0)',
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
                cursor: pdfLoading ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <Download size={13} /> {pdfLoading ? 'Generando…' : 'Descargar PDF'}
            </button>
          )}
        </div>

        {error && (
          <div style={{
            padding: '12px 16px', borderRadius: 10,
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
            fontFamily: 'DM Sans', fontSize: 13, color: '#FCA5A5',
            marginBottom: 18,
          }}>
            {error}
          </div>
        )}

        {/* Matriz comparativa */}
        {matrix && matrix.entities && (
          <div data-testid="comp-matrix" style={{
            background: 'rgba(13,16,23,0.85)',
            border: '1px solid rgba(240,235,224,0.10)',
            borderRadius: 16, overflow: 'hidden',
          }}>
            <div className="comp-table-wrap" style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%', borderCollapse: 'collapse',
                fontFamily: 'DM Sans',
              }}>
                <thead>
                  <tr style={{
                    background: 'linear-gradient(90deg,rgba(99,102,241,0.18),rgba(236,72,153,0.10))',
                  }}>
                    <th style={thStyle}>Métrica</th>
                    {matrix.entities.map((e, i) => (
                      <th key={e.id} style={{ ...thStyle, textAlign: 'center' }}>
                        {e.nombre}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(matrix.metrics || []).map((m, ri) => (
                    <tr key={m.label} style={{
                      borderTop: '1px solid rgba(240,235,224,0.06)',
                    }}>
                      <td style={tdLabelStyle}>{m.label}</td>
                      {(m.values || []).map((v, ci) => {
                        const winner = m.winner_idx === ci;
                        return (
                          <td
                            key={ci}
                            data-testid={`comp-cell-${ri}-${ci}${winner ? '-winner' : ''}`}
                            style={{
                              ...tdValStyle,
                              background: winner ? 'rgba(99,102,241,0.16)' : 'transparent',
                              fontWeight: winner ? 800 : 600,
                              color: winner ? 'rgba(165,180,252,1)' : 'var(--cream, #F0EBE0)',
                              borderLeft: '1px solid rgba(240,235,224,0.05)',
                            }}
                          >
                            {v}
                            {winner && (
                              <span style={{
                                marginLeft: 6, fontSize: 10, padding: '1px 6px',
                                borderRadius: 9999,
                                background: 'linear-gradient(90deg,#6366F1,#EC4899)',
                                color: '#fff', fontWeight: 700,
                                textTransform: 'uppercase', letterSpacing: '0.06em',
                              }}>
                                Top
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!matrix && !loading && filledIds.length < 2 && (
          <div style={{
            padding: '40px 24px', textAlign: 'center',
            background: 'rgba(255,255,255,0.02)',
            border: '1px dashed rgba(240,235,224,0.10)',
            borderRadius: 14,
            fontFamily: 'DM Sans', fontSize: 14,
            color: 'rgba(240,235,224,0.45)',
          }}>
            Selecciona al menos 2 {entityType === 'colonia' ? 'colonias' : 'propiedades'} para comparar.
          </div>
        )}

        <button
          onClick={() => navigate('/marketplace')}
          style={{
            marginTop: 28,
            padding: '8px 14px', borderRadius: 9999,
            background: 'transparent',
            border: '1px solid rgba(240,235,224,0.15)',
            color: 'rgba(240,235,224,0.55)',
            fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
            cursor: 'pointer',
          }}
        >
          ← Volver al marketplace
        </button>
      </main>

      <style>{`
        @media (max-width: 768px) {
          .comp-slots { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

const thStyle = {
  padding: '12px 14px',
  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11,
  color: 'rgba(240,235,224,0.85)',
  textTransform: 'uppercase', letterSpacing: '0.07em',
  textAlign: 'left',
};

const tdLabelStyle = {
  padding: '12px 14px',
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
  color: 'rgba(240,235,224,0.7)',
  whiteSpace: 'nowrap',
};

const tdValStyle = {
  padding: '12px 14px',
  fontFamily: 'DM Sans', fontSize: 13,
  textAlign: 'center',
};
