/**
 * ColoniaSidebar — Phase 4 Batch 24
 * Panel lateral deslizante con información completa de una colonia.
 * Props:
 *   coloniaId   — ID de la colonia seleccionada (null para cerrar)
 *   onClose     — callback para cerrar
 *   onFilterByColonia(id) — CTA para filtrar el marketplace por esta colonia
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchColoniaFull } from '../../api/marketplace';
import { addFavorite } from '../../api/comprador';
import { useAuth } from '../../App';
import { X, ArrowRight, FileText, Heart } from '../icons';
import ColoniaReportModal from './ColoniaReportModal';
import ColoniaHistoryTab from './ColoniaHistoryTab';

const RISK_LABELS = {
  flood:       'Inundación',
  seismic:     'Sismo',
  theft:       'Robo',
  heat_stress: 'Calor',
};

function riskColor(v) {
  if (v <= 30) return '#22C55E';
  if (v <= 60) return '#F59E0B';
  return '#EF4444';
}

function RiskBar({ label, value }) {
  const color = riskColor(value);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontFamily: 'DM Sans', fontSize: 12, marginBottom: 4,
      }}>
        <span style={{ color: 'rgba(240,235,224,0.75)' }}>{label}</span>
        <span style={{ fontWeight: 700, color }}>{value}</span>
      </div>
      <div style={{
        height: 6, borderRadius: 9999,
        background: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', borderRadius: 9999,
          width: `${value}%`,
          background: color,
          transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  );
}

function ScoreChip({ label, value }) {
  return (
    <div style={{
      padding: '8px 10px',
      background: 'rgba(var(--theme-rgb),0.10)',
      border: '1px solid rgba(var(--theme-rgb),0.22)',
      borderRadius: 10,
    }}>
      <div style={{
        fontFamily: 'DM Sans', fontSize: 10,
        color: 'rgba(var(--theme-rgb),0.85)',
        textTransform: 'uppercase', letterSpacing: '0.07em',
        fontWeight: 600, marginBottom: 2,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'Outfit', fontWeight: 800, fontSize: 18,
        color: 'var(--cream, #F0EBE0)',
      }}>
        {value}
      </div>
    </div>
  );
}

export default function ColoniaSidebar({ coloniaId, onClose, onFilterByColonia }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('datos'); // 'datos' | 'historia'
  const [favSaved, setFavSaved] = useState(false);
  const [favError, setFavError] = useState(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!coloniaId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetchColoniaFull(coloniaId)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [coloniaId]);

  const isOpen = !!coloniaId;

  return (
    <>
      {/* Backdrop mobile */}
      {isOpen && (
        <div
          data-testid="colonia-sidebar-backdrop"
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 39,
            background: 'rgba(6,8,15,0.55)',
            backdropFilter: 'blur(4px)',
            display: 'none',
          }}
          className="colonia-sidebar-backdrop"
        />
      )}

      {/* Panel */}
      <div
        data-testid="colonia-sidebar"
        style={{
          position: 'absolute',
          top: 0, right: 0,
          height: '100%',
          width: isOpen ? 380 : 0,
          minWidth: isOpen ? 380 : 0,
          zIndex: 40,
          background: 'rgba(6,8,15,0.97)',
          borderLeft: '1px solid rgba(240,235,224,0.10)',
          backdropFilter: 'blur(24px)',
          overflowY: 'auto',
          overflowX: 'hidden',
          transition: 'width 0.3s cubic-bezier(.4,0,.2,1), min-width 0.3s',
          display: 'flex',
          flexDirection: 'column',
        }}
        className="colonia-sidebar-panel"
      >
        {isOpen && (
          <div style={{ padding: '20px 20px 40px', minWidth: 340 }}>
            {/* ── Header ── */}
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'flex-start', marginBottom: 20,
            }}>
              <div>
                {data && (
                  <>
                    <div style={{
                      fontFamily: 'DM Sans', fontSize: 11,
                      color: 'rgba(240,235,224,0.5)',
                      textTransform: 'uppercase', letterSpacing: '0.1em',
                      fontWeight: 600, marginBottom: 4,
                    }}>
                      {data.colonia?.alcaldia || '—'}
                    </div>
                    <div style={{
                      fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
                      color: 'var(--cream, #F0EBE0)',
                      letterSpacing: '-0.02em',
                    }}>
                      {data.colonia?.nombre}
                    </div>
                    <div style={{
                      display: 'inline-block',
                      marginTop: 6, padding: '3px 10px',
                      border: '1px solid rgba(var(--theme-rgb),0.35)',
                      borderRadius: 9999, fontSize: 11,
                      fontFamily: 'DM Sans', fontWeight: 600,
                      color: 'rgba(var(--theme-rgb),0.9)',
                    }}>
                      {data.colonia?.tier}
                    </div>
                  </>
                )}
                {loading && (
                  <div style={{
                    fontFamily: 'DM Sans', fontSize: 14,
                    color: 'rgba(240,235,224,0.5)', marginTop: 8,
                  }}>
                    Cargando…
                  </div>
                )}
              </div>
              <button
                data-testid="colonia-sidebar-close"
                onClick={onClose}
                style={{
                  width: 30, height: 30,
                  borderRadius: 9999,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(240,235,224,0.15)',
                  color: 'rgba(240,235,224,0.6)',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  marginLeft: 12,
                }}
              >
                <X size={12} />
              </button>
            </div>

            {/* ── Tab switcher: Datos | Historia ── */}
            {data && !error && (
              <div data-testid="colonia-sidebar-tabs" style={{
                display: 'flex', gap: 4, padding: 4,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(240,235,224,0.10)',
                borderRadius: 9999,
                marginBottom: 18,
              }}>
                {[
                  { k: 'datos', label: 'Datos' },
                  { k: 'historia', label: 'Historia' },
                ].map(t => {
                  const active = activeTab === t.k;
                  return (
                    <button
                      key={t.k}
                      data-testid={`colonia-tab-${t.k}`}
                      onClick={() => setActiveTab(t.k)}
                      style={{
                        flex: 1, padding: '7px 0', borderRadius: 9999,
                        border: 'none',
                        background: active ? 'linear-gradient(90deg, var(--theme), var(--theme-3))' : 'transparent',
                        color: active ? '#fff' : 'rgba(240,235,224,0.55)',
                        fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
                        cursor: 'pointer',
                        transition: 'all 0.18s',
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── Error / empty ── */}
            {error && (
              <div style={{
                padding: '24px 16px', textAlign: 'center',
                background: 'rgba(255,255,255,0.03)',
                border: '1px dashed rgba(240,235,224,0.12)',
                borderRadius: 14,
                fontFamily: 'DM Sans', fontSize: 13,
                color: 'rgba(240,235,224,0.5)',
              }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Datos en construcción</div>
                <div>Te avisaremos cuando esté listo.</div>
              </div>
            )}

            {data && !error && activeTab === 'datos' && (
              <>
                {/* ── Sección Mercado ── */}
                <div style={{ marginBottom: 20 }}>
                  <div style={sectionTitle}>Mercado</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <StatCell label="Proyectos" value={data.projects_count ?? 0} />
                    <StatCell
                      label="Precio / m²"
                      value={`$${Math.round((data.avg_price_m2 || 0) / 1000)}k`}
                    />
                    <StatCell
                      label="Momentum 90d"
                      value={data.momentum_label || '—'}
                      highlight={data.momentum_90d > 0 ? '#22C55E' : data.momentum_90d < 0 ? '#EF4444' : undefined}
                    />
                    <StatCell
                      label="Demanda 30d"
                      value={data.demand_heat_30d > 0 ? `${data.demand_heat_30d} ev.` : '—'}
                    />
                  </div>
                </div>

                {/* ── Sección Scores IE ── */}
                {data.scores && Object.keys(data.scores).length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={sectionTitle}>Scores IE Engine</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {Object.entries(data.scores).slice(0, 6).map(([k, v]) => (
                        <ScoreChip key={k} label={SCORE_LABEL[k] || k} value={v} />
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Climate Twin ── */}
                {data.climate_twin && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={sectionTitle}>Climate Twin</div>
                    <div style={{
                      padding: '14px 16px',
                      background: 'rgba(var(--theme-rgb),0.08)',
                      border: '1px solid rgba(var(--theme-rgb),0.18)',
                      borderRadius: 14,
                    }}>
                      <div style={{
                        display: 'flex', justifyContent: 'space-between',
                        alignItems: 'flex-start', marginBottom: 8,
                      }}>
                        <div>
                          <div style={{
                            fontFamily: 'Outfit', fontWeight: 800, fontSize: 15,
                            color: 'var(--cream, #F0EBE0)',
                          }}>
                            {data.climate_twin.city}
                          </div>
                          <div style={{
                            fontFamily: 'DM Sans', fontSize: 12,
                            color: 'rgba(240,235,224,0.55)',
                          }}>
                            {data.climate_twin.country}
                          </div>
                        </div>
                        {data.climate_twin.similarity_pct > 0 && (
                          <div style={{
                            padding: '4px 10px',
                            background: 'linear-gradient(90deg, var(--theme), var(--theme-3))',
                            borderRadius: 9999,
                            fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
                            color: '#fff',
                          }}>
                            {data.climate_twin.similarity_pct}% similar
                          </div>
                        )}
                      </div>
                      {data.climate_twin.description && (
                        <div style={{
                          fontFamily: 'DM Sans', fontSize: 12,
                          color: 'rgba(240,235,224,0.60)',
                          lineHeight: 1.5,
                        }}>
                          {data.climate_twin.description}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Riesgos ── */}
                {data.risks && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={sectionTitle}>Riesgos</div>
                      {data.risks.mock && (
                        <span style={{
                          fontFamily: 'DM Sans', fontSize: 9, fontWeight: 600,
                          color: 'rgba(245,158,11,0.7)',
                          background: 'rgba(245,158,11,0.12)',
                          border: '1px solid rgba(245,158,11,0.25)',
                          borderRadius: 9999, padding: '2px 7px',
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                        }}>
                          Estimado
                        </span>
                      )}
                    </div>
                    {Object.entries(RISK_LABELS).map(([key, label]) => (
                      <RiskBar key={key} label={label} value={data.risks[key] ?? 0} />
                    ))}
                  </div>
                )}

                {/* ── CTA ── */}
                <button
                  data-testid="colonia-sidebar-cta"
                  onClick={() => onFilterByColonia && onFilterByColonia(coloniaId, data.colonia?.nombre)}
                  style={{
                    width: '100%',
                    padding: '13px 20px',
                    borderRadius: 9999,
                    border: 'none',
                    background: 'linear-gradient(90deg, var(--theme), var(--theme-3))',
                    color: '#fff',
                    fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14,
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  Ver desarrollos en {data.colonia?.nombre}
                  <ArrowRight size={14} />
                </button>

                {/* Batch 26 — Reporte gratis */}
                <button
                  data-testid="colonia-sidebar-report"
                  onClick={() => setReportOpen(true)}
                  style={{
                    marginTop: 10,
                    width: '100%',
                    padding: '11px 18px',
                    borderRadius: 9999,
                    background: 'rgba(var(--theme-rgb),0.10)',
                    border: '1px solid rgba(var(--theme-rgb),0.32)',
                    color: 'rgba(var(--theme-rgb),0.95)',
                    fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  }}
                >
                  <FileText size={13} /> Reporte completo (PDF gratis)
                </button>

                {/* Batch 28 — Guardar colonia como favorito (gate auth) */}
                <button
                  data-testid="colonia-sidebar-favorite"
                  onClick={async () => {
                    if (!user) {
                      navigate('/login-comprador');
                      return;
                    }
                    setFavError(null);
                    try {
                      await addFavorite('colonia', coloniaId, [], `Colonia ${data?.colonia?.nombre || coloniaId}`);
                      setFavSaved(true);
                    } catch (e) {
                      setFavError(e?.message || 'Error');
                    }
                  }}
                  disabled={favSaved}
                  style={{
                    marginTop: 8,
                    width: '100%',
                    padding: '11px 18px',
                    borderRadius: 9999,
                    background: favSaved ? 'rgba(34,197,94,0.10)' : 'rgba(var(--theme-rgb),0.10)',
                    border: `1px solid ${favSaved ? 'rgba(34,197,94,0.32)' : 'rgba(var(--theme-rgb),0.32)'}`,
                    color: favSaved ? '#86EFAC' : '#F472B6',
                    fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                    cursor: favSaved ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  }}
                >
                  <Heart size={13} filled={favSaved} />
                  {favSaved ? 'Guardada en favoritos' : (user ? 'Guardar como favorito' : 'Inicia sesión para guardar')}
                </button>
                {favError && (
                  <div style={{
                    marginTop: 6,
                    fontFamily: 'DM Sans', fontSize: 11,
                    color: '#FCA5A5',
                    textAlign: 'center',
                  }}>{favError}</div>
                )}
              </>
            )}

            {/* ── Tab Historia ── */}
            {data && !error && activeTab === 'historia' && (
              <ColoniaHistoryTab
                coloniaId={coloniaId}
                coloniaNombre={data?.colonia?.nombre}
              />
            )}
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 640px) {
          .colonia-sidebar-panel {
            width: 100% !important;
            min-width: 100% !important;
            position: fixed !important;
            top: 0 !important;
            right: 0 !important;
            height: 100% !important;
            border-left: none !important;
            border-top: 1px solid rgba(240,235,224,0.10) !important;
            z-index: 50 !important;
          }
          .colonia-sidebar-backdrop { display: block !important; }
        }
      `}</style>

      {/* Batch 26 — Reporte modal */}
      <ColoniaReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        coloniaId={coloniaId}
        coloniaNombre={data?.colonia?.nombre}
      />
    </>
  );
}

const sectionTitle = {
  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11,
  color: 'rgba(240,235,224,0.5)',
  textTransform: 'uppercase', letterSpacing: '0.10em',
  marginBottom: 10,
};

const SCORE_LABEL = {
  vida: 'Calidad de vida', movilidad: 'Movilidad',
  seguridad: 'Seguridad', comercio: 'Comercio',
  plusvalia: 'Plusvalía', educacion: 'Educación',
  riesgo: 'Riesgo global',
};

function StatCell({ label, value, highlight }) {
  return (
    <div style={{
      padding: '10px 12px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(240,235,224,0.08)',
      borderRadius: 10,
    }}>
      <div style={{
        fontFamily: 'DM Sans', fontSize: 10,
        color: 'rgba(240,235,224,0.45)', marginBottom: 3,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'Outfit', fontWeight: 700, fontSize: 15,
        color: highlight || 'var(--cream, #F0EBE0)',
      }}>
        {value}
      </div>
    </div>
  );
}
