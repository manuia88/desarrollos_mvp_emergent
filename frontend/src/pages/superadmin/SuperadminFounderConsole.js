// W2.6 SA8 — Founder Console (root /superadmin)
import React, { useEffect, useState, useCallback } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import ExecutiveKpiGrid from '../../components/superadmin/ExecutiveKpiGrid';
import AnomalyFeed from '../../components/superadmin/AnomalyFeed';
import QuickActionsToolbar from '../../components/superadmin/QuickActionsToolbar';
import CatalogoQuickSearch from '../../components/superadmin/CatalogoQuickSearch';
import { LayoutDashboard, RefreshCw, Sparkles, Command, TrendingDown, TrendingUp } from 'lucide-react';
import {
  getDashboard, listAnomalies, listQuickActions, detectAnomaliesNow, getDemandInsights, getStudioOpportunities, getProductBrief,
} from '../../api/superadminFounderConsole';
import { fetchEquipoEnRiesgo } from '../../api/superadminDevmaster';
import { useFounderPrefetch } from '../../contexts/FounderPrefetchContext';
import { Z } from '../../styles/zIndex';

function fmtRel(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return 'hace un momento';
    if (sec < 3600) return `hace ${Math.floor(sec / 60)}m`;
    if (sec < 86400) return `hace ${Math.floor(sec / 3600)}h`;
    return `hace ${Math.floor(sec / 86400)}d`;
  } catch { return '—'; }
}

// Mini sparkline reused from W2.3 pattern
function Spark({ values, label, accent = 'var(--theme)' }) {
  const phVals = (values || []).filter(v => v != null && !isNaN(v));
  let path = '';
  let last = '—';
  if (phVals.length > 1) {
    const min = Math.min(...phVals);
    const max = Math.max(...phVals);
    const range = max - min || 1;
    const W = 220, H = 50;
    path = phVals.map((v, i) => {
      const x = (i / (phVals.length - 1)) * W;
      const y = H - ((v - min) / range) * H;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
    last = phVals[phVals.length - 1];
  }
  return (
    <div style={{
      flex: 1, minWidth: 220, padding: 14, borderRadius: 12,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
    }}>
      <div style={{
        fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.07em',
        color: 'rgba(240,235,224,0.55)', marginBottom: 8,
      }}>{label}</div>
      {path ? (
        <svg viewBox="0 0 220 50" width="100%" height="50">
          <path d={path} stroke={accent} strokeWidth="2.5" fill="none"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        // El vacío explica POR QUÉ está vacío (regla: vacío se ve vacío, y se dice la razón).
        // Antes esta caja nunca se veía porque la serie se fabricaba multiplicando el valor de hoy
        // por constantes; ahora aparece hasta que haya historia de verdad que graficar.
        <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, lineHeight: 1.4,
          color: 'rgba(240, 235, 224, 0.5)', height: 50,
          display: 'flex', alignItems: 'center' }}>
          Todavía no hay historia suficiente para dibujar la tendencia.
        </div>
      )}
      <div style={{
        marginTop: 4, fontFamily: 'DM Mono, monospace', fontSize: 11,
        color: 'rgba(240,235,224,0.55)',
      }}>último: <strong style={{ color: accent }}>
        {typeof last === 'number' ? last.toLocaleString('es-MX') : last}
      </strong></div>
    </div>
  );
}

// Equipo en riesgo · asesores/usuarios que se enfrían (reusa el motor de churn). FAIL-OPEN.
function EquipoEnRiesgoPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetchEquipoEnRiesgo(50, 12)
      .then(r => { if (alive) setData(r); })
      .catch(() => { if (alive) setData({ en_riesgo: [], total: 0, lectura: 'No se pudo cargar ahora mismo.' }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const band = (s) => (s >= 75 ? '#F87171' : s >= 60 ? '#FACC15' : '#FB923C');
  const rows = data?.en_riesgo || [];

  return (
    <div style={{
      padding: 18, borderRadius: 14,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)', marginBottom: 18,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <TrendingDown size={16} color="#F87171" />
        <span style={{
          fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.07em',
          color: 'rgba(240,235,224,0.55)',
        }}>Equipo en riesgo de enfriarse</span>
        {data?.total ? (
          <span style={{
            marginLeft: 'auto', fontFamily: 'DM Mono, monospace', fontSize: 11,
            color: '#F87171', fontWeight: 700,
          }}>{data.total}{data.criticos ? ` · ${data.criticos} crítico${data.criticos !== 1 ? 's' : ''}` : ''}</span>
        ) : null}
      </div>
      <p style={{
        fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.72)',
        margin: '0 0 12px',
      }}>{loading ? 'Calculando quién baja su actividad…' : (data?.lectura || '')}</p>

      {!loading && rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((u, i) => (
            <div key={u.user_id || i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 10,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: band(u.churn_risk_score || 0), flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
                  color: 'var(--cream)', whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{u.name || u.email || u.user_id || 'Usuario'}</div>
                <div style={{
                  fontFamily: 'DM Sans', fontSize: 11,
                  color: 'rgba(240,235,224,0.55)', whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{u.recommendation || (u.role ? `Rol: ${u.role}` : 'Bajó su actividad reciente.')}</div>
              </div>
              <div style={{
                fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 700,
                color: band(u.churn_risk_score || 0), flexShrink: 0,
              }}>{Math.round(u.churn_risk_score || 0)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Oportunidad #3 — Demanda → "¿Dónde construir?": interés real por zona (buyer_signals K-anon≥3) + qué NO encontraron.
function DemandWhereToBuildCard() {
  const [data, setData] = useState(null);
  const [openZona, setOpenZona] = useState(null);   // colonia con el brief generativo abierto
  const [brief, setBrief] = useState(null);          // { [colonia]: briefData | 'loading' }
  useEffect(() => { getDemandInsights(12).then(setData).catch(() => setData({ zonas: [] })); }, []);
  const rows = data ? (data.zonas || []) : null;
  const conces = (data && data.concesiones) || [];
  const toggleBrief = (col) => {
    if (openZona === col) { setOpenZona(null); return; }
    setOpenZona(col);
    if (!brief || !brief[col]) {
      setBrief((b) => ({ ...(b || {}), [col]: 'loading' }));
      getProductBrief(col).then((d) => setBrief((b) => ({ ...(b || {}), [col]: d }))).catch(() => setBrief((b) => ({ ...(b || {}), [col]: { brief: null } })));
    }
  };
  if (rows && rows.length === 0) return null;
  return (
    <div data-testid="founder-demand-insights" style={{ marginBottom: 18, padding: 16, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.10)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <TrendingUp size={15} color="var(--theme)" />
        <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: 'var(--cream)' }}>Demanda · ¿dónde construir?</span>
        <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.5)' }}>interés real por zona + qué no encontraron</span>
        <a href="/superadmin/gemelo-demanda" style={{ marginLeft: 'auto', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, color: 'var(--theme, #6D4AFF)', textDecoration: 'none' }}>Gemelo de demanda →</a>
      </div>
      {!rows ? (
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.5)', padding: 8 }}>Cargando demanda…</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.slice(0, 8).map((z, i) => {
            const isOpen = openZona === z.colonia;
            const b = brief && brief[z.colonia];
            return (
              <div key={i}>
                <button onClick={() => toggleBrief(z.colonia)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none', display: 'grid', gridTemplateColumns: '1.1fr 70px 2fr 16px', gap: 12, alignItems: 'center', padding: '8px 10px', borderRadius: 9, background: isOpen ? 'rgba(var(--theme-rgb),0.08)' : 'rgba(255,255,255,0.02)' }}>
                  <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, color: 'var(--cream)', textTransform: 'capitalize' }}>{z.colonia}</span>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--theme)' }} title={`${z.visitantes} compradores distintos`}>{z.interes}</span>
                  <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.7)' }}>
                    {(z.falta && z.falta.length) ? <>falta: <span style={{ color: '#F59E0B', fontWeight: 600 }}>{z.falta.join(' · ')}</span></> : <span style={{ color: 'rgba(240,235,224,0.4)' }}>la oferta cubre la demanda</span>}
                  </span>
                  <span style={{ color: 'rgba(240,235,224,0.4)', fontSize: 12 }}>{isOpen ? '▾' : '▸'}</span>
                </button>
                {isOpen && (
                  <div style={{ padding: '10px 12px', margin: '4px 0 8px', borderRadius: 9, background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(var(--theme-rgb),0.18)' }}>
                    {(b === 'loading' || !b) ? (
                      <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.5)' }}>Generando producto óptimo…</div>
                    ) : (!b.brief || !(b.brief.mezcla || []).length) ? (
                      <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.5)' }}>Aún sin demanda suficiente en la zona para recomendar producto.</div>
                    ) : (
                      <>
                        <div style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--theme)', marginBottom: 6 }}>¿Qué construir aquí?</div>
                        <div style={{ display: 'grid', gap: 4 }}>
                          {(b.brief.mezcla || []).slice(0, 4).map((u, j) => (
                            <div key={j} style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)' }}>
                              <span style={{ fontWeight: 700 }}>{u.unidades}× {u.tipologia}</span>
                              <span style={{ color: 'rgba(240,235,224,0.6)' }}> · {u.m2_promedio}m²{u.precio_tipico ? ` · ~$${(u.precio_tipico / 1e6).toFixed(1)}M` : ''}{u.amenidades && u.amenidades.length ? ` · ${u.amenidades.slice(0, 2).join(', ')}` : ''}</span>
                            </div>
                          ))}
                        </div>
                        {(b.brief.rationale || [])[0] && <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.6)', marginTop: 7, lineHeight: 1.5 }}>{b.brief.rationale[0]}</div>}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {conces.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.07)', fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.65)' }}>
          <span style={{ fontWeight: 700, color: 'var(--cream-2)' }}>El mercado transige antes en:</span> {conces.map((c) => c.cedio).join(' · ')}
        </div>
      )}
    </div>
  );
}

// Oportunidad #5 — Studio Opportunity: devs que la demanda rechaza por sus FOTOS (aunque encajen) → pipeline de Studio.
function StudioOpportunityCard() {
  const [gaps, setGaps] = useState(null);
  useEffect(() => { getStudioOpportunities().then((d) => setGaps(d.gap_presentacion || [])).catch(() => setGaps([])); }, []);
  if (gaps && gaps.length === 0) return null;
  const title = (id) => String(id || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <div data-testid="founder-studio-opps" style={{ marginBottom: 18, padding: 16, borderRadius: 14, background: 'rgba(224,163,62,0.07)', border: '1px solid rgba(224,163,62,0.30)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <Sparkles size={15} color="#E0A33E" />
        <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: 'var(--cream)' }}>Studio Opportunity</span>
        <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.55)' }}>la demanda los rechaza por las FOTOS, no por el producto → vender Studio</span>
      </div>
      {!gaps ? (
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.5)', padding: 8 }}>Cargando…</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {gaps.slice(0, 8).map((g, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12, alignItems: 'center', padding: '8px 10px', borderRadius: 9, background: 'rgba(255,255,255,0.02)' }}>
              <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>{title(g.dev_id)}</span>
              <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#E0A33E', fontWeight: 600 }}>{g.pct_fotos}% de rechazos son por fotos <span style={{ color: 'rgba(240,235,224,0.45)', fontWeight: 400 }}>({g.por_fotos})</span></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SuperadminFounderConsole({ user, onLogout }) {
  const prefetch = useFounderPrefetch();
  const [dashboard, setDashboard] = useState(prefetch.get('dashboard'));
  const [anomalies, setAnomalies] = useState(prefetch.get('anomalies_open')?.items || []);
  const [quickActions, setQuickActions] = useState(prefetch.get('quick_actions')?.items || []);
  const [loadingAnoms, setLoadingAnoms] = useState(!anomalies.length);
  const [detecting, setDetecting] = useState(false);
  const [toast, setToast] = useState('');
  const [lastLogin, setLastLogin] = useState(localStorage.getItem('dmx_last_login') || null);

  const loadDashboard = useCallback(async () => {
    try {
      const d = await getDashboard();
      setDashboard(d);
      prefetch.set && prefetch.set('dashboard', d);
    } catch (e) { setToast(e.message || 'Error dashboard'); }
  }, [prefetch]);

  const loadAnomalies = useCallback(async () => {
    setLoadingAnoms(true);
    try {
      const r = await listAnomalies({ status: 'open', limit: 20 });
      setAnomalies(r.items || []);
      prefetch.set && prefetch.set('anomalies_open', r);
    } catch (e) {
      setToast(e.message || 'Error anomalías');
    } finally {
      setLoadingAnoms(false);
    }
  }, [prefetch]);

  const loadQuickActions = useCallback(async () => {
    try {
      const r = await listQuickActions();
      setQuickActions(r.items || []);
      prefetch.set && prefetch.set('quick_actions', r);
    } catch (e) { setToast(e.message || 'Error quick actions'); }
  }, [prefetch]);

  useEffect(() => {
    if (!dashboard) loadDashboard();
    // NUNCA EMPEZABA A CARGAR (auditoría 07-26). `loadingAnoms` arranca en `true` cuando no hay
    // anomalías precargadas, y esta línea solo cargaba si era `false`: la condición no se cumplía
    // jamás. El panel se quedaba en "Cargando anomalías…" para siempre —verificado a los 20 s— y
    // mostraba "(0)" mientras la tarjeta de arriba decía "1". No era lentitud: era que nadie
    // disparaba la carga. Este efecto corre una sola vez al montar, así que no hace falta el
    // candado contra doble llamada.
    if (!anomalies.length) loadAnomalies();
    if (!quickActions.length) loadQuickActions();
    // record last login
    if (!lastLogin) {
      const now = new Date().toISOString();
      localStorage.setItem('dmx_last_login', now);
      setLastLogin(now);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 2500);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const onDetectNow = async () => {
    setDetecting(true);
    try {
      const r = await detectAnomaliesNow();
      setToast(`Detección: ${r.inserted} nuevas · ${r.candidates} candidatos`);
      await loadAnomalies();
      await loadDashboard();
    } catch (e) {
      setToast(e.message || 'Error');
    } finally {
      setDetecting(false);
    }
  };

  // GRÁFICAS FABRICADAS, ELIMINADAS (auditoría A–Z 07-26). Estas tres series se construían
  // multiplicando el valor de HOY por constantes fijas (0.78, 0.82, 0.86…) y se pintaban etiquetadas
  // "MRR (90d trend)", "Costo IA (30d)" y "Conversión (30d)". El comentario original lo admitía:
  // *"Simulated 90d sparkline data for visual interest"*. El efecto era una curva SIEMPRE ascendente,
  // a un clic de la Sala de Inversionistas — no era decoración, era un número inventado con forma de
  // evidencia.
  //
  // Se sirven solo si el backend manda historia REAL. Mientras no la mande, la tarjeta muestra su
  // número sin gráfica: un dato sin tendencia es honesto; una tendencia inventada, no.
  const _serieReal = (v) => (Array.isArray(v) && v.length >= 2 ? v : []);
  const mrrSeries = _serieReal(dashboard?.mrr_series_90d);
  const aiSeries = _serieReal(dashboard?.ai_cost_series_30d);
  const convSeries = _serieReal(dashboard?.conversion_series_30d);

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div data-testid="superadmin-founder-console">
        {toast && (
          <div data-testid="founder-toast" style={{
            position: 'fixed', top: 76, right: 20, zIndex: Z.TOAST,
            padding: '11px 18px', borderRadius: 10,
            background: 'rgba(var(--theme-rgb),0.18)',
            border: '1px solid rgba(var(--theme-rgb),0.35)',
            color: 'var(--theme)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
            backdropFilter: 'blur(24px)',
          }}>{toast}</div>
        )}

        {/* Header */}
        <div style={{
          marginBottom: 22, display: 'flex', alignItems: 'flex-start',
          gap: 10, flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4,
            }}>
              <LayoutDashboard size={20} color="var(--theme)" />
              <h1 style={{
                fontFamily: 'Outfit', fontWeight: 800, fontSize: 26,
                color: 'var(--cream)', margin: 0, letterSpacing: '-0.025em',
              }}>Bienvenido, {user?.name?.split(' ')[0] || 'founder'}</h1>
            </div>
            <p style={{
              fontFamily: 'DM Sans', fontSize: 13,
              color: 'rgba(240, 235, 224, 0.72)', margin: 0,
            }}>
              Founder Console · estado del negocio cross-functional · último acceso {fmtRel(lastLogin)}
            </p>
          </div>
          <div style={{
            padding: '6px 12px', borderRadius: 9999,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.10)',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: 'DM Mono, monospace', fontSize: 11,
            color: 'rgba(240,235,224,0.65)',
          }}>
            <Command size={11} /> + K · paleta de comandos
          </div>
          <button data-testid="founder-detect-now" onClick={onDetectNow}
            disabled={detecting}
            style={{
              padding: '8px 14px', borderRadius: 9999,
              background: 'rgba(var(--theme-rgb),0.10)',
              border: '1px solid rgba(var(--theme-rgb),0.30)',
              color: 'var(--theme)', fontFamily: 'DM Sans',
              fontSize: 11.5, fontWeight: 600,
              cursor: detecting ? 'wait' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 5,
              opacity: detecting ? 0.6 : 1,
            }}>
            <Sparkles size={11} style={{
              animation: detecting ? 'spin 1s linear infinite' : 'none',
            }} />
            {detecting ? 'Detectando…' : 'Detectar anomalías'}
          </button>
          <button data-testid="founder-refresh" onClick={() => { loadDashboard(); loadAnomalies(); }}
            style={{
              padding: '8px 12px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: 'rgba(240,235,224,0.65)', fontFamily: 'DM Sans',
              fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
            }}>
            <RefreshCw size={11} />
          </button>
        </div>

        {/* FASE B · pregunta y filtra: el buscador del Catálogo al frente de la Home */}
        <CatalogoQuickSearch />

        {/* KPI Grid */}
        {dashboard ? (
          <ExecutiveKpiGrid data={dashboard} />
        ) : (
          <div data-testid="founder-loading" style={{
            padding: 30, fontFamily: 'DM Sans', fontSize: 13,
            color: 'rgba(240, 235, 224, 0.70)', marginBottom: 18,
          }}>Cargando KPIs ejecutivos…</div>
        )}

        {/* Demanda → ¿dónde construir? (oportunidad #3) + Studio Opportunity (#5) */}
        <DemandWhereToBuildCard />
        <StudioOpportunityCard />

        {/* 2-col: anomalies + quick actions */}
        <div className="founder-2col" style={{
          display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 16,
          marginBottom: 18,
        }}>
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 8,
            }}>
              <span style={{
                fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.07em',
                color: 'rgba(240,235,224,0.55)',
              }}>Anomalías abiertas ({anomalies.length})</span>
            </div>
            <AnomalyFeed items={anomalies} loading={loadingAnoms}
              onChanged={() => { loadAnomalies(); loadDashboard(); }} />
          </div>
          <div>
            <QuickActionsToolbar items={quickActions} onChanged={loadQuickActions} />
          </div>
        </div>

        {/* Equipo en riesgo (churn) — quién se está enfriando */}
        <EquipoEnRiesgoPanel />

        {/* Bottom row: 3 sparklines */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Spark values={mrrSeries} label="MRR (90d trend)" accent="var(--theme)" />
          <Spark values={aiSeries} label="Costo IA (30d)" accent="#FACC15" />
          <Spark values={convSeries} label="Conversión (30d)" accent="#4ADE80" />
        </div>
      </div>

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        @media (max-width: 900px) {
          .founder-2col { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </SuperadminLayout>
  );
}
