/**
 * ColoniaComparator (page) — Phase 4 Batch 26 (C5)
 * Página pública en /comparar para comparar 1-3 colonias o propiedades
 * lado-a-lado con highlights del ganador por métrica + export PDF.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import ToolNav from '../../components/ui/ToolNav';
import { useAuth } from '../../App';
import { fetchColonias, compareEntities, compareEntitiesBuyer, downloadComparePdf, downloadComparePdfBuyer } from '../../api/marketplace';
import { X, Plus, Download, ArrowRight, Sparkle } from '../../components/icons';
import ShareLinkButton from '../../components/marketplace/ShareLinkButton';
import { Z } from '../../styles/zIndex';

const MAX_SLOTS = 3;

// ─── Premium sections (buyer tier) ─────────────────────────────────────────────

function Sparkline({ data, color = '#6366F1' }) {
  if (!data || data.length < 2) return null;
  const vals = data.map(d => d.valor || 0).filter(Boolean);
  if (!vals.length) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const W = 160, H = 48;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((d.valor - min) / range) * (H - 8) - 4;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PremiumSectionRow({ label, badge = 'PREMIUM', children, blurred = false, onLogin }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
      }}>
        <div style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 14,
          color: '#1E2230', letterSpacing: '-0.01em',
        }}>
          {label}
        </div>
        <span style={{
          padding: '2px 8px', borderRadius: 9999,
          background: 'rgba(109,74,255,0.10)',
          border: '1px solid rgba(109,74,255,0.24)',
          fontFamily: 'DM Sans', fontSize: 9, fontWeight: 800,
          color: '#6D4AFF', letterSpacing: '0.08em',
        }}>
          {badge}
        </span>
      </div>
      <div style={{ position: 'relative' }}>
        {blurred && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: Z.BASE,
            backdropFilter: 'blur(8px)',
            background: 'rgba(255,255,255,0.72)',
            borderRadius: 12,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            <div style={{
              fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700,
              color: '#5A5F6E',
            }}>
              Inicia sesión para ver más
            </div>
            <Link
              to="/login-comprador"
              style={{
                padding: '8px 18px', borderRadius: 9999,
                background: 'linear-gradient(90deg,#6366F1,#EC4899)',
                color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
                textDecoration: 'none',
              }}
              data-testid="premium-login-cta"
            >
              Acceder al portal
            </Link>
          </div>
        )}
        <div style={{
          padding: '16px 18px', borderRadius: 12,
          background: '#FFFFFF',
          border: '1px solid #ECECEC',
          filter: blurred ? 'blur(4px)' : 'none',
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function PremiumSections({ premium, entities, isBuyer, onLogin }) {
  if (!entities || entities.length === 0) return null;

  const n = entities.length;
  const COLORS = ['#6366F1', '#EC4899', '#1FA06A'];

  return (
    <div style={{ marginTop: 28 }} data-testid="premium-sections">
      {/* Histórico de precios */}
      <PremiumSectionRow label="Histórico de precios" blurred={!isBuyer && !premium} onLogin={onLogin}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(n, 3)}, 1fr)`,
          gap: 16,
        }}>
          {(isBuyer && premium ? Array(n).fill(null).map((_, i) => i) : [0, 1, 2].slice(0, n)).map(i => {
            const entity = entities[i];
            const hist = premium?.precio_historico_12m?.[i] || [];
            const lastVal = hist[hist.length - 1]?.valor;
            return (
              <div key={entity?.id || i}>
                <div style={{
                  fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700,
                  color: '#5A5F6E', marginBottom: 8,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {entity?.nombre || `Entidad ${i + 1}`}
                </div>
                <Sparkline data={hist} color={COLORS[i % COLORS.length]} />
                {lastVal > 0 && (
                  <div style={{
                    fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700,
                    color: '#1E2230', marginTop: 6,
                  }}>
                    ${lastVal.toLocaleString('es-MX')} / m²
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </PremiumSectionRow>

      {/* Momentum */}
      <PremiumSectionRow label="Momentum (90d)" blurred={!isBuyer && !premium} onLogin={onLogin}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {entities.map((entity, i) => {
            const pct = premium?.momentum_signed_pct?.[i] ?? 0;
            const pos = pct >= 0;
            return (
              <div
                key={entity.id}
                data-testid={`momentum-${entity.id}`}
                style={{
                  flex: 1, minWidth: 100, padding: '12px 16px',
                  borderRadius: 10,
                  background: pos ? 'rgba(31,160,106,0.08)' : 'rgba(229,72,77,0.08)',
                  border: `1px solid ${pos ? 'rgba(31,160,106,0.24)' : 'rgba(229,72,77,0.24)'}`,
                }}
              >
                <div style={{
                  fontFamily: 'DM Sans', fontSize: 11,
                  color: '#5A5F6E', marginBottom: 4,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {entity.nombre}
                </div>
                <div style={{
                  fontFamily: 'Outfit', fontWeight: 800, fontSize: 20,
                  color: pos ? '#1FA06A' : '#E5484D',
                }}>
                  {pos ? '+' : ''}{pct}%
                </div>
              </div>
            );
          })}
        </div>
      </PremiumSectionRow>

      {/* Demand heat */}
      <PremiumSectionRow label="Heat de demanda (30d)" blurred={!isBuyer && !premium} onLogin={onLogin}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {entities.map((entity, i) => {
            const visits = premium?.demand_heat_30d?.[i] ?? 0;
            return (
              <div
                key={entity.id}
                data-testid={`demand-heat-${entity.id}`}
                style={{
                  flex: 1, minWidth: 100, padding: '12px 16px',
                  borderRadius: 10,
                  background: 'rgba(109,74,255,0.08)',
                  border: '1px solid rgba(109,74,255,0.20)',
                }}
              >
                <div style={{
                  fontFamily: 'DM Sans', fontSize: 11,
                  color: '#5A5F6E', marginBottom: 4,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {entity.nombre}
                </div>
                <div style={{
                  fontFamily: 'Outfit', fontWeight: 800, fontSize: 20,
                  color: '#6D4AFF',
                }}>
                  {visits.toLocaleString('es-MX')}
                </div>
                <div style={{
                  fontFamily: 'DM Sans', fontSize: 10,
                  color: '#9AA0AE', marginTop: 2,
                }}>
                  visitas
                </div>
              </div>
            );
          })}
        </div>
      </PremiumSectionRow>

      {/* ROI estimado */}
      <PremiumSectionRow label="ROI estimado" blurred={!isBuyer && !premium} onLogin={onLogin}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {entities.map((entity, i) => {
            const roi = premium?.roi_estimado_pct?.[i] ?? 0;
            const pv5 = premium?.plusvalia_5y_pct?.[i] ?? 0;
            return (
              <div
                key={entity.id}
                data-testid={`roi-${entity.id}`}
                style={{
                  flex: 1, minWidth: 100, padding: '12px 16px',
                  borderRadius: 10,
                  background: 'rgba(31,160,106,0.06)',
                  border: '1px solid rgba(31,160,106,0.18)',
                }}
              >
                <div style={{
                  fontFamily: 'DM Sans', fontSize: 11,
                  color: '#5A5F6E', marginBottom: 4,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {entity.nombre}
                </div>
                <div style={{
                  fontFamily: 'Outfit', fontWeight: 800, fontSize: 20,
                  color: '#1FA06A',
                }}>
                  {roi}% anual
                </div>
                <div style={{
                  fontFamily: 'DM Sans', fontSize: 11,
                  color: '#1FA06A', marginTop: 2,
                }}>
                  Plusvalía 5a: +{pv5}%
                </div>
              </div>
            );
          })}
        </div>
      </PremiumSectionRow>
    </div>
  );
}

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
          background: 'rgba(109,74,255,0.08)',
          border: '1px solid rgba(109,74,255,0.28)',
          minHeight: 84,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          gap: 10,
        }}
      >
        <div>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700,
            color: '#6D4AFF',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            marginBottom: 4,
          }}>
            {entityType === 'colonia' ? 'Colonia' : 'Propiedad'} {index + 1}
          </div>
          <div style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 17,
            color: '#1E2230',
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
            background: '#F6F7FA',
            border: '1px solid #ECECEC',
            color: '#5A5F6E', cursor: 'pointer',
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
        background: '#F6F7FA',
        border: '1px dashed #ECECEC',
        minHeight: 84,
      }}
    >
      <div style={{
        fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700,
        color: '#9AA0AE',
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
            border: '1px solid #ECECEC',
            color: '#5A5F6E',
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
              background: '#FFFFFF',
              border: '1px solid #ECECEC',
              borderRadius: 9, outline: 'none',
              fontFamily: 'DM Sans', fontSize: 13,
              color: '#1E2230',
              boxSizing: 'border-box', marginBottom: 8,
            }}
          />
          <div style={{
            maxHeight: 200, overflowY: 'auto',
            background: '#FFFFFF',
            border: '1px solid #ECECEC',
            borderRadius: 9,
          }}>
            {filtered.length === 0 ? (
              <div style={{
                padding: 12, fontFamily: 'DM Sans', fontSize: 12,
                color: '#9AA0AE', textAlign: 'center',
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
                  color: '#1E2230', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <span>{opt.label}</span>
                {opt.sub && (
                  <span style={{ fontSize: 11, color: '#9AA0AE' }}>{opt.sub}</span>
                )}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setOpen(false); setQuery(''); }}
            style={{
              width: '100%', marginTop: 6, padding: '6px 0', borderRadius: 9999,
              background: 'transparent', border: 'none',
              color: '#9AA0AE',
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
  const { user, openAuth } = useAuth();
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

  // Pre-seleccionar desde query params:
  //  - B26 legacy: ?colonia=polanco,roma-norte
  //  - B27 share:  ?ids=polanco,roma-norte&type=colonia (auto-compare)
  useEffect(() => {
    const colParam = searchParams.get('colonia');
    const idsParam = searchParams.get('ids');
    const typeParam = searchParams.get('type');

    if (typeParam === 'property' || typeParam === 'colonia') {
      setEntityType(typeParam);
    }

    const sourceIds = idsParam || colParam;
    if (sourceIds && colonias.length > 0) {
      const ids = sourceIds.split(',').slice(0, MAX_SLOTS).map(s => s.trim());
      const next = [null, null, null];
      ids.forEach((id, i) => {
        const opt = colonias.find(c => c.id === id);
        if (opt) next[i] = opt;
      });
      setSlots(next);
    }
  }, [searchParams, colonias]);

  // Auto-compare cuando llega vía ?ids=...&type=... (B27 share-link)
  useEffect(() => {
    const idsParam = searchParams.get('ids');
    if (!idsParam) return;
    const filled = slots.filter(Boolean);
    if (filled.length >= 2 && !matrix && !loading) {
      handleCompare();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, searchParams]);

  const filledIds = slots.filter(Boolean).map(s => s.id);
  const canCompare = filledIds.length >= 2;

  const isBuyer = user?.role === 'buyer' || user?.role === 'superadmin';

  const handleCompare = async () => {
    if (!canCompare) return;
    setLoading(true); setError(null);
    try {
      const fn = isBuyer ? compareEntitiesBuyer : compareEntities;
      const data = await fn(entityType, filledIds);
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
      const blob = isBuyer
        ? await downloadComparePdfBuyer(entityType, filledIds)
        : await downloadComparePdf(entityType, filledIds);
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
    <div className="theme-light-scope" style={{ background: '#FBFAFC', minHeight: '100vh' }}>
      <ToolNav />

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 28px 80px' }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '4px 12px', borderRadius: 9999,
            background: 'rgba(109,74,255,0.10)',
            border: '1px solid rgba(109,74,255,0.24)',
            fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700,
            color: '#6D4AFF',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            marginBottom: 12,
          }}>
            <Sparkle size={11} /> Comparador
          </div>
          <h1 style={{
            fontFamily: 'Outfit', fontWeight: 800,
            fontSize: 'clamp(28px, 4vw, 44px)',
            color: '#1E2230',
            letterSpacing: '-0.025em', lineHeight: 1.05, margin: 0,
          }}>
            Compara hasta 3 {entityType === 'colonia' ? 'colonias' : 'propiedades'}
          </h1>
          <p style={{
            fontFamily: 'DM Sans', fontSize: 15, marginTop: 12,
            color: '#5A5F6E', maxWidth: 640,
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
                  ? '1px solid rgba(109,74,255,0.45)'
                  : '1px solid #ECECEC',
                background: entityType === k
                  ? 'rgba(109,74,255,0.12)'
                  : '#F6F7FA',
                fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                color: entityType === k ? '#6D4AFF' : '#5A5F6E',
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
                ? 'rgba(109,74,255,0.30)'
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
                background: '#F6F7FA',
                border: '1px solid #ECECEC',
                color: '#1E2230',
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
                cursor: pdfLoading ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <Download size={13} /> {pdfLoading ? 'Generando…' : 'Descargar PDF'}
            </button>
          )}
          {matrix && canCompare && (
            <ShareLinkButton
              entityType={entityType}
              ids={filledIds}
              title={`Compara ${matrix.entities?.map(e => e.nombre).join(' · ')} en DesarrollosMX`}
            />
          )}
        </div>

        {error && (
          <div style={{
            padding: '12px 16px', borderRadius: 10,
            background: 'rgba(229,72,77,0.08)',
            border: '1px solid rgba(229,72,77,0.25)',
            fontFamily: 'DM Sans', fontSize: 13, color: '#E5484D',
            marginBottom: 18,
          }}>
            {error}
          </div>
        )}

        {/* Matriz comparativa */}
        {matrix && matrix.entities && (
          <div data-testid="comp-matrix" style={{
            background: '#FFFFFF',
            border: '1px solid #ECECEC',
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
                      borderTop: '1px solid #ECECEC',
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
                              background: winner ? 'rgba(109,74,255,0.12)' : 'transparent',
                              fontWeight: winner ? 800 : 600,
                              color: winner ? '#6D4AFF' : '#1E2230',
                              borderLeft: '1px solid #ECECEC',
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
            background: '#F6F7FA',
            border: '1px dashed #ECECEC',
            borderRadius: 14,
            fontFamily: 'DM Sans', fontSize: 14,
            color: '#9AA0AE',
          }}>
            Selecciona al menos 2 {entityType === 'colonia' ? 'colonias' : 'propiedades'} para comparar.
          </div>
        )}

        {/* Premium sections — buyer tier */}
        {matrix && (
          <PremiumSections
            premium={matrix.premium}
            entities={matrix.entities}
            isBuyer={isBuyer}
            onLogin={() => openAuth && openAuth('login')}
          />
        )}

        <button
          onClick={() => navigate('/marketplace')}
          style={{
            marginTop: 28,
            padding: '8px 14px', borderRadius: 9999,
            background: 'transparent',
            border: '1px solid #ECECEC',
            color: '#5A5F6E',
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
  color: '#1E2230',
  textTransform: 'uppercase', letterSpacing: '0.07em',
  textAlign: 'left',
};

const tdLabelStyle = {
  padding: '12px 14px',
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
  color: '#5A5F6E',
  whiteSpace: 'nowrap',
};

const tdValStyle = {
  padding: '12px 14px',
  fontFamily: 'DM Sans', fontSize: 13,
  textAlign: 'center',
};
