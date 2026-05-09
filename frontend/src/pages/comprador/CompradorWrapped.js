/**
 * CompradorWrapped — Phase 4 Batch 30
 * Página /comprador/wrapped/:yearMonth?
 * Layout estilo Spotify Wrapped: 7 storytelling cards con scroll snap.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import CompradorLayout from '../../components/comprador/CompradorLayout';
import { fetchWrapped, fetchWrappedList, requestAnnualOptin, shareWrapped } from '../../api/wrapped';
import { Share, ChevronRight } from '../../components/icons';

function fmtMes(yearMonth) {
  if (!yearMonth) return '';
  try {
    if (yearMonth.endsWith('-annual')) {
      return `Año ${yearMonth.replace('-annual', '')}`;
    }
    const [y, m] = yearMonth.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  } catch {
    return yearMonth;
  }
}

function fmtPrice(n) {
  if (!n || n === 0) return 'N/D';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString('es-MX')}`;
}

// ─── Individual scroll-snap card ─────────────────────────────────────────────
function WrappedCard({ children, bg = 'rgba(13,16,23,0.95)', style = {}, id }) {
  return (
    <div
      id={id}
      data-testid={`wrapped-card-${id}`}
      style={{
        minHeight: '60vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'flex-start', justifyContent: 'center',
        padding: '40px 36px',
        borderRadius: 18,
        background: bg,
        border: '1px solid rgba(240,235,224,0.08)',
        backdropFilter: 'blur(24px)',
        marginBottom: 20,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Micro sparkline (daily views) ────────────────────────────────────────────
function DailySparkline({ count }) {
  // Synthetic daily distribution based on total count
  const days = 30;
  const base = count / days;
  const pts = Array.from({ length: days }, (_, i) => {
    const noise = 1 + (Math.sin(i * 13 + count) * 0.6);
    return Math.max(0, Math.round(base * noise));
  });
  const max = Math.max(...pts, 1);
  const W = 300, H = 60;
  const polyPoints = pts.map((v, i) => {
    const x = (i / (days - 1)) * W;
    const y = H - (v / max) * (H - 8) - 4;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}
      style={{ display: 'block', opacity: 0.7 }}>
      <polyline
        points={polyPoints}
        fill="none"
        stroke="#6366F1"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CompradorWrapped() {
  const { yearMonth } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [wrapped, setWrapped] = useState(null);
  const [wrappedList, setWrappedList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [shareInfo, setShareInfo] = useState(null);
  const [generatingAnnual, setGeneratingAnnual] = useState(false);

  // Annual opt-in from URL param
  const searchParams = new URLSearchParams(location.search);
  const annualYear = searchParams.get('annual');

  const loadWrapped = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [w, list] = await Promise.all([
        fetchWrapped(yearMonth || 'latest'),
        fetchWrappedList(),
      ]);
      setWrapped(w);
      setWrappedList(list);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [yearMonth]);

  useEffect(() => { loadWrapped(); }, [loadWrapped]);

  // Auto-trigger annual if URL param present
  useEffect(() => {
    if (annualYear && !loading) {
      handleAnnualOptin(parseInt(annualYear));
    }
  }, [annualYear, loading]);

  const handleAnnualOptin = async (year) => {
    setGeneratingAnnual(true);
    try {
      const annual = await requestAnnualOptin(year);
      setWrapped(annual);
    } catch (e) {
      setError(e.message);
    } finally {
      setGeneratingAnnual(false);
    }
  };

  const handleShare = async () => {
    if (!wrapped) return;
    setSharing(true);
    try {
      const info = await shareWrapped(wrapped.wrapped_id);
      setShareInfo(info);
      // Copy to clipboard
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(
          `https://desarrollosmx.io${info.share_url}`
        );
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSharing(false);
    }
  };

  const stats = wrapped?.stats || {};
  const mes = fmtMes(wrapped?.year_month || yearMonth);
  const topZona = stats.top_zonas?.[0]?.zona || '';
  const currentYear = new Date().getFullYear();
  const hasAnnual = wrappedList.some(w => w.year_month === `${currentYear}-annual`);

  return (
    <CompradorLayout>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

        {/* Sidebar: lista wrappeds previos */}
        <div style={{
          width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column',
          background: 'rgba(13,16,23,0.85)',
          border: '1px solid rgba(240,235,224,0.08)',
          borderRadius: 14, padding: '16px 12px',
        }}>
          <div style={{
            fontFamily: 'Outfit', fontWeight: 700, fontSize: 13,
            color: 'rgba(240,235,224,0.6)', marginBottom: 12, paddingLeft: 4,
          }}>
            Historial
          </div>
          {wrappedList.length === 0 ? (
            <div style={{
              fontFamily: 'DM Sans', fontSize: 11,
              color: 'rgba(240,235,224,0.3)', paddingLeft: 4,
            }}>
              Sin wrappeds previos
            </div>
          ) : (
            wrappedList.map(w => (
              <button
                key={w.wrapped_id}
                onClick={() => navigate(`/comprador/wrapped/${w.year_month}`)}
                data-testid={`wrapped-history-${w.year_month}`}
                style={{
                  padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                  background: (wrapped?.year_month === w.year_month)
                    ? 'rgba(99,102,241,0.15)' : 'transparent',
                  border: (wrapped?.year_month === w.year_month)
                    ? '1px solid rgba(99,102,241,0.30)' : '1px solid transparent',
                  fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
                  color: (wrapped?.year_month === w.year_month)
                    ? 'rgba(165,180,252,0.9)' : 'rgba(240,235,224,0.6)',
                  textAlign: 'left', marginBottom: 3, width: '100%',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <span>{fmtMes(w.year_month)}</span>
                {!w.viewed_at && (
                  <span style={{
                    width: 6, height: 6, borderRadius: 9999,
                    background: 'linear-gradient(90deg,#6366F1,#EC4899)',
                    flexShrink: 0,
                  }} />
                )}
              </button>
            ))
          )}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading || generatingAnnual ? (
            <div style={{
              minHeight: 400, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 14,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 9999,
                background: 'linear-gradient(90deg,#6366F1,#EC4899)',
                animation: 'spin 1s linear infinite',
              }} />
              <div style={{
                fontFamily: 'DM Sans', fontSize: 14,
                color: 'rgba(240,235,224,0.55)',
              }}>
                {generatingAnnual ? 'Generando tu Wrapped anual con IA…' : 'Cargando tu Wrapped…'}
              </div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : error ? (
            <WrappedCard>
              <div style={{
                fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
                color: 'var(--cream, #F0EBE0)', marginBottom: 10,
              }}>
                Aún no hay datos suficientes
              </div>
              <div style={{
                fontFamily: 'DM Sans', fontSize: 14,
                color: 'rgba(240,235,224,0.55)', marginBottom: 20,
              }}>
                {error}. Explora más propiedades para generar tu Wrapped.
              </div>
              <button
                onClick={() => navigate('/marketplace')}
                style={{
                  padding: '10px 22px', borderRadius: 9999, border: 'none',
                  background: 'linear-gradient(90deg,#6366F1,#EC4899)',
                  color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Explorar desarrollos
              </button>
            </WrappedCard>
          ) : (
            <>
              {/* Card 1: Hero */}
              <WrappedCard
                id="hero"
                bg="linear-gradient(135deg, rgba(99,102,241,0.20) 0%, rgba(236,72,153,0.15) 100%)"
                style={{ borderColor: 'rgba(99,102,241,0.25)', minHeight: '45vh' }}
              >
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '4px 12px', borderRadius: 9999,
                  background: 'rgba(99,102,241,0.18)',
                  border: '1px solid rgba(99,102,241,0.35)',
                  fontFamily: 'DM Sans', fontSize: 10, fontWeight: 800,
                  color: 'rgba(165,180,252,0.9)', textTransform: 'uppercase',
                  letterSpacing: '0.08em', marginBottom: 20,
                }}>
                  Tu Wrapped
                </div>
                <div style={{
                  fontFamily: 'Outfit', fontWeight: 900, fontSize: 36,
                  color: 'var(--cream, #F0EBE0)',
                  letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 12,
                }}>
                  Tu {mes} <br />en DesarrollosMX
                </div>
                <div style={{
                  fontFamily: 'DM Sans', fontSize: 14,
                  color: 'rgba(240,235,224,0.55)',
                }}>
                  Resumen personalizado de tu actividad inmobiliaria.
                </div>
              </WrappedCard>

              {/* Card 2: Properties viewed */}
              <WrappedCard id="views">
                <div style={{
                  fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700,
                  color: 'rgba(99,102,241,0.85)', textTransform: 'uppercase',
                  letterSpacing: '0.08em', marginBottom: 12,
                }}>
                  Tu exploración
                </div>
                <div style={{
                  fontFamily: 'Outfit', fontWeight: 900, fontSize: 72,
                  color: 'var(--cream, #F0EBE0)',
                  letterSpacing: '-0.04em', lineHeight: 1, marginBottom: 6,
                }}>
                  {stats.properties_viewed || 0}
                </div>
                <div style={{
                  fontFamily: 'DM Sans', fontSize: 18, fontWeight: 600,
                  color: 'rgba(240,235,224,0.65)', marginBottom: 20,
                }}>
                  propiedades exploradas este {wrapped?.year_month?.endsWith('-annual') ? 'año' : 'mes'}
                </div>
                <DailySparkline count={stats.properties_viewed || 0} />
                {stats.total_time_minutes > 0 && (
                  <div style={{
                    marginTop: 12, fontFamily: 'DM Sans', fontSize: 12,
                    color: 'rgba(240,235,224,0.4)',
                  }}>
                    ~{stats.total_time_minutes} minutos navegando el mercado
                  </div>
                )}
              </WrappedCard>

              {/* Card 3: Top zona */}
              {topZona ? (
                <WrappedCard id="zona"
                  bg="rgba(13,16,23,0.90)"
                  style={{ borderColor: 'rgba(236,72,153,0.18)' }}
                >
                  <div style={{
                    fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700,
                    color: 'rgba(236,72,153,0.85)', textTransform: 'uppercase',
                    letterSpacing: '0.08em', marginBottom: 12,
                  }}>
                    Tu zona favorita
                  </div>
                  <div style={{
                    fontFamily: 'Outfit', fontWeight: 900, fontSize: 48,
                    color: 'var(--cream, #F0EBE0)',
                    letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 16,
                  }}>
                    {topZona}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {stats.top_zonas?.slice(0, 5).map((z, i) => (
                      <span key={z.zona} style={{
                        padding: '5px 12px', borderRadius: 9999,
                        background: i === 0 ? 'rgba(236,72,153,0.15)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${i === 0 ? 'rgba(236,72,153,0.30)' : 'rgba(240,235,224,0.10)'}`,
                        fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
                        color: i === 0 ? '#EC4899' : 'rgba(240,235,224,0.55)',
                      }}>
                        {z.zona} ({z.count})
                      </span>
                    ))}
                  </div>
                </WrappedCard>
              ) : null}

              {/* Card 4: Presupuesto promedio */}
              <WrappedCard id="precio">
                <div style={{
                  fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700,
                  color: 'rgba(134,239,172,0.85)', textTransform: 'uppercase',
                  letterSpacing: '0.08em', marginBottom: 12,
                }}>
                  Presupuesto promedio explorado
                </div>
                <div style={{
                  fontFamily: 'Outfit', fontWeight: 900, fontSize: 52,
                  color: 'var(--cream, #F0EBE0)',
                  letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 10,
                }}>
                  {fmtPrice(stats.avg_price_seen)}
                </div>
                <div style={{
                  fontFamily: 'DM Sans', fontSize: 14,
                  color: 'rgba(240,235,224,0.5)',
                }}>
                  Precio promedio de las propiedades que exploraste
                </div>
              </WrappedCard>

              {/* Card 5: Comparisons + Favorites */}
              <WrappedCard id="actividad">
                <div style={{
                  fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700,
                  color: 'rgba(165,180,252,0.85)', textTransform: 'uppercase',
                  letterSpacing: '0.08em', marginBottom: 20,
                }}>
                  Tu actividad
                </div>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Comparaciones', val: stats.comparisons_count || 0, color: '#6366F1' },
                    { label: 'Favoritos', val: stats.favoritos_added || 0, color: '#EC4899' },
                    { label: 'Alertas enviadas', val: stats.alerts_triggered || 0, color: '#86efac' },
                    { label: 'Asesores consultados', val: stats.asesores_count || 0, color: '#fde68a' },
                  ].map(item => (
                    <div key={item.label} style={{
                      flex: 1, minWidth: 120, padding: '14px 16px',
                      borderRadius: 12, background: 'rgba(255,255,255,0.03)',
                      border: `1px solid ${item.color}22`,
                    }}>
                      <div style={{
                        fontFamily: 'Outfit', fontWeight: 800, fontSize: 32,
                        color: item.color,
                      }}>
                        {item.val}
                      </div>
                      <div style={{
                        fontFamily: 'DM Sans', fontSize: 12,
                        color: 'rgba(240,235,224,0.5)', marginTop: 4,
                      }}>
                        {item.label}
                      </div>
                    </div>
                  ))}
                </div>
              </WrappedCard>

              {/* Card 6: Narrative (Claude Haiku) */}
              {wrapped?.narrative_text && (
                <WrappedCard id="narrativa"
                  bg="linear-gradient(135deg, rgba(99,102,241,0.10), rgba(236,72,153,0.08))"
                  style={{ borderColor: 'rgba(99,102,241,0.18)' }}
                >
                  <div style={{
                    fontFamily: 'DM Sans', fontSize: 11, fontWeight: 800,
                    color: 'rgba(165,180,252,0.7)', textTransform: 'uppercase',
                    letterSpacing: '0.08em', marginBottom: 16,
                  }}>
                    Tu resumen de IA
                  </div>
                  <div style={{
                    fontFamily: 'Outfit', fontWeight: 600, fontSize: 18,
                    color: 'var(--cream, #F0EBE0)',
                    lineHeight: 1.6, letterSpacing: '-0.01em',
                  }}>
                    "{wrapped.narrative_text}"
                  </div>
                </WrappedCard>
              )}

              {/* Card 7: CTA Final */}
              <WrappedCard id="cta">
                <div style={{
                  fontFamily: 'Outfit', fontWeight: 800, fontSize: 24,
                  color: 'var(--cream, #F0EBE0)', marginBottom: 20,
                  letterSpacing: '-0.02em',
                }}>
                  {mes} — en review
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {/* Share */}
                  <button
                    data-testid="wrapped-share-btn"
                    onClick={handleShare}
                    disabled={sharing}
                    style={{
                      padding: '11px 20px', borderRadius: 9999, border: 'none',
                      background: 'linear-gradient(90deg,#6366F1,#EC4899)',
                      color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                      cursor: sharing ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 7,
                      opacity: sharing ? 0.7 : 1,
                    }}
                  >
                    <Share size={14} />
                    {sharing ? 'Generando…' : 'Compartir wrapped'}
                  </button>

                  {/* Anual CTA if December and no annual yet */}
                  {!hasAnnual && new Date().getMonth() === 11 && (
                    <button
                      data-testid="wrapped-annual-cta"
                      onClick={() => handleAnnualOptin(currentYear)}
                      disabled={generatingAnnual}
                      style={{
                        padding: '11px 20px', borderRadius: 9999,
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(240,235,224,0.15)',
                        color: 'rgba(240,235,224,0.75)',
                        fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                        cursor: generatingAnnual ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: 7,
                      }}
                    >
                      Ver Wrapped {currentYear} anual <ChevronRight size={13} />
                    </button>
                  )}
                </div>

                {/* Share confirmation */}
                {shareInfo && (
                  <div style={{
                    marginTop: 14, padding: '10px 14px', borderRadius: 10,
                    background: 'rgba(134,239,172,0.08)',
                    border: '1px solid rgba(134,239,172,0.22)',
                    fontFamily: 'DM Sans', fontSize: 12,
                    color: '#86efac',
                  }}>
                    Link copiado al portapapeles
                  </div>
                )}
              </WrappedCard>
            </>
          )}
        </div>
      </div>
    </CompradorLayout>
  );
}
