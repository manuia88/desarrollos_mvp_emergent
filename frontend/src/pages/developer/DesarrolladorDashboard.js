// /desarrollador — executive overview (Phase 4 Batch 14: Weekly Brief + Activity Feed + Setup Checklist + Quick Actions)
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Card } from '../../components/advisor/primitives';
import * as api from '../../api/developer';
import * as docsApi from '../../api/documents';
import { ActivityFeed } from '../../components/shared/ActivityFeed';
import { FloatingQuickActions } from '../../components/shared/FloatingQuickActions';
import { resolveQuickActions } from '../../config/quickActions';
import { ArrowRight, Sparkle, TrendUp, TrendDown, Activity, AlertCircle, Users, Calendar } from '../../components/icons';
import { usePresentationMode } from '../../hooks/usePresentationMode';
import { blurPriceCSS } from '../../lib/anonymize';
import { DirectorChatPanel } from '../../components/director/DirectorChatPanel';
import WhatIfPanel from '../../components/whatif/WhatIfPanel';
import AIROIPanelDev from '../../components/agentic_crm/AIROIPanelDev';
import ZoneIntelligence from '../../components/developer/ZoneIntelligence';
import MarketIntelligence from '../../components/developer/MarketIntelligence';
import CubeIntelligence from '../../components/developer/CubeIntelligence';
import { getCerebroStatus, getCerebroTasks, getCerebroLearning, getCerebroRecommendations, applyCerebroRecommendation, detectCerebroMarket, approveCerebroTask, rejectCerebroTask } from '../../api/cerebro';
import PortfolioCockpit from '../../components/developer/PortfolioCockpit';

const API = process.env.REACT_APP_BACKEND_URL;

// Hover compartido para tarjetas (eleva + glow de marca discreto)
const cardEnter = (e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 24px -12px rgba(109,74,255,0.40)'; e.currentTarget.style.borderColor = 'rgba(109,74,255,0.45)'; };
const cardLeave = (e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--asr-shadow, none)'; e.currentTarget.style.borderColor = 'var(--border-2, var(--border))'; };
const CARD_TR = 'transform .16s, box-shadow .16s, border-color .16s';

// ─── Weekly Brief Widget ──────────────────────────────────────────────────────
function WeeklyBriefWidget() {
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/api/panel/weekly-brief`, { credentials: 'include' });
        if (res.ok) setBrief(await res.json());
      } catch (_) {}
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div style={{ height: 100, borderRadius: 12, background: 'rgba(var(--cream-rgb),0.04)', animation: 'pulse 1.5s ease-in-out infinite' }} />
    );
  }
  if (!brief || brief.error) return null;

  const kpis = brief.kpi_changes || [];

  return (
    <div
      data-testid="weekly-brief-widget"
      style={{
        position: 'relative', overflow: 'hidden', marginBottom: 18, borderRadius: 18, padding: '22px 24px',
        background: 'linear-gradient(120deg, #4B2BD4 0%, #6D4AFF 48%, #B23BC0 100%)',
        boxShadow: '0 18px 40px -16px rgba(76,43,212,0.55)', color: '#fff',
      }}
    >
      <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: 'rgba(var(--cream-rgb),0.85)', display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
        <Sparkle size={12} color="#fff" /> ESTA SEMANA · IA
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: '#fff', lineHeight: 1.4, fontFamily: 'Outfit,sans-serif', maxWidth: 760 }}>
        {brief.summary}
      </p>

      {/* KPIs como tiles blancos sólidos sobre el hero (alto contraste) */}
      {kpis.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 16 }}>
          {kpis.map((k, i) => {
            const tone = k.trend === 'up' ? '31,160,106' : k.trend === 'down' ? '242,99,91' : '109,74,255';
            return (
              <div key={i} style={{
                padding: '13px 15px', borderRadius: 13, background: '#fff',
                boxShadow: '0 8px 20px -10px rgba(0,0,0,0.35)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 10.5, color: '#434A5C', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 800 }}>{k.label}</div>
                  {k.trend === 'up' && <TrendUp size={15} color={`rgb(${tone})`} />}
                  {k.trend === 'down' && <TrendDown size={15} color={`rgb(${tone})`} />}
                </div>
                <div style={{ fontSize: 27, fontWeight: 800, color: `rgb(${tone})`, fontFamily: 'Outfit,sans-serif', marginTop: 3, lineHeight: 1 }}>{k.value}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* acción = botón blanco (resalta sobre el hero) · riesgo = contorno */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {brief.top_action && (
          <button style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer',
            padding: '10px 17px', borderRadius: 10, fontSize: 13, fontWeight: 800, fontFamily: 'DM Sans,sans-serif',
            background: '#fff', color: '#4B2BD4', border: 'none', boxShadow: '0 6px 16px -8px rgba(0,0,0,0.4)',
          }}>
            <Activity size={14} /> {brief.top_action}
          </button>
        )}
        {brief.top_risk && (
          <button style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer',
            padding: '10px 17px', borderRadius: 10, fontSize: 13, fontWeight: 700, fontFamily: 'DM Sans,sans-serif',
            background: 'rgba(var(--cream-rgb),0.14)', color: '#fff', border: '1px solid rgba(var(--cream-rgb),0.5)',
          }}>
            <AlertCircle size={14} /> {brief.top_risk}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Tus jugadas de hoy (VALOR: fusión dato + mercado · diseño con carácter) ───
function DevPlaysWidget() {
  const navigate = useNavigate();
  const [plays, setPlays] = useState(null);
  useEffect(() => { api.getDevPlays().then(d => setPlays(d.plays || [])).catch(() => setPlays([])); }, []);
  if (!plays || !plays.length) return null;
  const TONE = { alta: '242,99,91', media: '226,152,46', oportunidad: '31,160,106' };
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="eyebrow" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--theme)' }}>
        <Sparkle size={11} /> TUS JUGADAS DE HOY · ORDENADAS POR $ EN JUEGO
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 12 }}>
        {plays.map((pl, i) => {
          const tone = TONE[pl.severity] || '109,74,255';
          return (
            <div key={i} data-testid={`play-${i}`}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 16px 30px -14px rgba(${tone},0.45)`; e.currentTarget.style.borderColor = `rgba(${tone},0.5)`; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--asr-shadow, none)'; e.currentTarget.style.borderColor = 'var(--border-2, var(--border))'; }}
              style={{ position: 'relative', overflow: 'hidden', background: 'var(--surface, #fff)', border: '1px solid var(--border-2, var(--border))', borderRadius: 14, padding: '15px 16px 15px 18px', boxShadow: 'var(--asr-shadow, none)', transition: 'transform .16s, box-shadow .16s, border-color .16s', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: `rgb(${tone})` }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 18 }}>{pl.emoji}</span>
                <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: '#fff', background: `rgb(${tone})`, borderRadius: 999, padding: '3px 9px' }}>{pl.type}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 800, color: `rgb(${tone})`, fontFamily: 'Outfit,sans-serif' }}>{pl.impact_label}</span>
              </div>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif', lineHeight: 1.3 }}>{pl.title}</div>
              <div style={{ fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.45 }}>{pl.detail}</div>
              <div style={{ fontSize: 10.5, color: 'var(--cream-3)' }}>Fuente: {pl.sources}</div>
              <button onClick={() => navigate(pl.action_route)} data-testid={`play-cta-${i}`}
                style={{ alignSelf: 'flex-start', marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--grad, linear-gradient(120deg,#6366F1,#EC4899))', color: '#fff', border: 'none', borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>
                {pl.action_label} <ArrowRight size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tu asistente (Cerebro surfaceado en el Puente de Mando · IA-native, loop visible) ──
function AsistentePanel() {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [busyRec, setBusyRec] = useState(false);
  const [recDone, setRecDone] = useState(false);
  const [busy, setBusy] = useState({});
  useEffect(() => {
    (async () => {
      try {
        const st = await getCerebroStatus();
        if (!st?.enabled) { setD({ enabled: false }); return; }
        try { await detectCerebroMarket(); } catch (_) {}   // protagonista: lee el cubo y propone
        const [tk, lr, rc] = await Promise.allSettled([getCerebroTasks(), getCerebroLearning(), getCerebroRecommendations()]);
        const tasks = tk.status === 'fulfilled' ? (tk.value?.tasks || []) : [];
        setD({
          enabled: true,
          plays: tasks.filter(t => ['proposed', 'awaiting_approval'].includes(t.status)),
          learning: lr.status === 'fulfilled' ? lr.value : null,
          recs: rc.status === 'fulfilled' ? ((rc.value?.recommendations || []).filter(r => r.live)) : [],
        });
      } catch (_) { setD({ enabled: false }); }
    })();
  }, []);
  if (!d) return null;

  const goSala = () => navigate('/desarrollador/crm/sala-control');

  // Apagado (prod sin flag): invitación sutil, no rompe.
  if (!d.enabled) {
    return (
      <Card style={{ marginBottom: 18, position: 'relative', overflow: 'hidden', borderColor: 'var(--border-2, var(--border))' }}>
        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: 'var(--theme, #6D4AFF)' }} />
        <div className="eyebrow" style={{ marginBottom: 6, color: 'var(--theme)' }}><Sparkle size={11} /> TU ASISTENTE</div>
        <div style={{ fontSize: 13.5, color: 'var(--cream-2)' }}>Tu asistente con IA está listo para operar tu día. Actívalo para que trabaje por ti.</div>
      </Card>
    );
  }

  const plays = d.plays || [];
  const lessons = (d.learning?.lessons || []).length;
  const retrains = (d.learning?.retrains || []).length;
  const aprende = lessons || retrains
    ? `He aprendido ${lessons} lección${lessons === 1 ? '' : 'es'}${retrains ? ` · ${retrains} reentreno${retrains === 1 ? '' : 's'}` : ''}.`
    : 'Aprendo de cada trato que cierras.';
  const topRec = (!plays.length && !recDone) ? (d.recs || [])[0] : null;
  const applyRec = async () => {
    if (!topRec) return;
    setBusyRec(true);
    try { await applyCerebroRecommendation(topRec.apply); setRecDone(true); } catch (_) {}
    setBusyRec(false);
  };
  const act = async (t, approve) => {
    setBusy((b) => ({ ...b, [t.id]: true }));
    try {
      if (approve) await approveCerebroTask(t.id); else await rejectCerebroTask(t.id);
      setD((prev) => ({ ...prev, plays: (prev.plays || []).filter((p) => p.id !== t.id) }));
    } catch (_) {}
    setBusy((b) => ({ ...b, [t.id]: false }));
  };

  return (
    <Card data-testid="asistente-panel" style={{ marginBottom: 18, position: 'relative', overflow: 'hidden', borderColor: 'var(--border-2, var(--border))' }}>
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: plays.length ? 'var(--warm, #E2982E)' : 'var(--ok, #1FA06A)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="eyebrow" style={{ marginBottom: 8, color: 'var(--theme)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkle size={11} /> TU ASISTENTE
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ok, #1FA06A)', boxShadow: '0 0 0 3px rgba(31,160,106,0.18)' }} />
          </div>
          {plays.length > 0 ? (
            <>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                Veo {plays.length} {plays.length === 1 ? 'jugada' : 'jugadas'} en tu mercado
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {plays.slice(0, 3).map((t) => (
                  <div key={t.id} data-testid="asistente-play" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 9, background: 'rgba(var(--cream-rgb),0.04)', border: '1px solid rgba(var(--cream-rgb),0.08)' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: t.needs_approval ? 'var(--warm, #E2982E)' : 'var(--theme, #6D4AFF)' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cream)', fontFamily: 'DM Sans,sans-serif' }}>{t.params?.titulo || t.action}</div>
                      {t.params?.detalle && <div style={{ fontSize: 11, color: 'var(--cream-2)', marginTop: 1 }}>{t.params.detalle}</div>}
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button onClick={() => act(t, true)} disabled={busy[t.id]} style={{ padding: '4px 11px', borderRadius: 7, fontSize: 11, fontWeight: 800, fontFamily: 'DM Sans,sans-serif', cursor: busy[t.id] ? 'wait' : 'pointer', background: 'var(--grad, linear-gradient(120deg,#6366F1,#EC4899))', color: '#fff', border: 'none', opacity: busy[t.id] ? 0.6 : 1 }}>{t.needs_approval ? 'Aprobar' : 'Hecho'}</button>
                        <button onClick={() => act(t, false)} disabled={busy[t.id]} style={{ padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, fontFamily: 'DM Sans,sans-serif', cursor: 'pointer', background: 'transparent', color: 'var(--cream-3)', border: '1px solid rgba(var(--cream-rgb),0.14)' }}>Descartar</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : topRec ? (
            <>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--theme)', marginBottom: 3 }}>Te propongo</div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: 'var(--cream)', letterSpacing: '-0.01em', lineHeight: 1.25 }}>
                {topRec.title}
              </div>
              {topRec.detail && <div style={{ fontSize: 12.5, color: 'var(--cream-2)', marginTop: 4 }}>{topRec.detail}</div>}
              <button onClick={applyRec} disabled={busyRec} data-testid="asistente-apply-rec" style={{
                marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: busyRec ? 'wait' : 'pointer',
                padding: '7px 14px', borderRadius: 9, fontSize: 12, fontWeight: 800, fontFamily: 'DM Sans,sans-serif',
                background: 'var(--grad, linear-gradient(120deg,#6366F1,#EC4899))', color: '#fff', border: 'none', opacity: busyRec ? 0.7 : 1,
              }}>{busyRec ? 'Aplicando…' : 'Aplicar'} <ArrowRight size={12} /></button>
            </>
          ) : (
            <>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                {recDone ? '¡Listo! Aplicado' : 'Al día · estoy trabajando por ti'}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--cream-2)', marginTop: 5 }}>{aprende}</div>
            </>
          )}
        </div>
        <button onClick={goSala} data-testid="asistente-cta" style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', alignSelf: 'center',
          padding: '10px 17px', borderRadius: 10, fontSize: 13, fontWeight: 800, fontFamily: 'DM Sans,sans-serif',
          background: plays.length ? 'var(--grad, linear-gradient(120deg,#6366F1,#EC4899))' : 'var(--surface, #fff)',
          color: plays.length ? '#fff' : 'var(--theme, #6D4AFF)',
          border: plays.length ? 'none' : '1px solid rgba(109,74,255,0.4)',
        }}>
          {plays.length ? 'Revisar mi turno' : 'Abrir mi asistente'} <ArrowRight size={13} />
        </button>
      </div>
    </Card>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function DesarrolladorDashboard({ user, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [syncPending, setSyncPending] = useState({ count: 0, items: [] });
  const [activeTab, setActiveTab] = useState('resumen');

  // B19 Sub-C — Presentation mode
  const { isActive: pmActive, config: pmConfig } = usePresentationMode();

  useEffect(() => {
    api.getDashboard().then(setData).catch(() => setData(null));
    docsApi.getSyncPending('developer').then(setSyncPending).catch(() => {});
  }, []);

  const totalPendingFields = syncPending.items?.reduce((acc, x) => acc + (x.synced_field_count || 0), 0) || 0;
  const pausedDevs = (syncPending.items || []).filter(x => x.auto_sync_paused_reason).length;

  // Quick actions for this route
  const quickActionDefs = resolveQuickActions(location.pathname);
  const quickActions = quickActionDefs.map(a => ({
    ...a,
    icon: a.key === 'create_lead' ? Users : a.key === 'create_cita' ? Calendar : Activity,
    onClick: () => {
      if (a.href) navigate(a.href);
    },
  }));

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="PORTAL DESARROLLADOR"
        title={`Buenos días, ${(user?.name || '').split(' ')[0]}`}
        sub="Panorama operativo del portafolio en tiempo real."
      />

      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid var(--border, rgba(var(--cream-rgb),0.07))', paddingBottom: 4 }}>
        {[['resumen', 'Resumen'], ['director', 'Asistente · Chat'], ['whatif', 'What-if'], ['roi', 'Costo de mi IA']].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} data-testid={`ddash-tab-${key}`}
            style={{
              padding: '7px 16px', borderRadius: 9999, fontSize: 12.5,
              fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer', border: 'none',
              background: activeTab === key ? 'linear-gradient(90deg,#6366F1,#EC4899)' : 'var(--surface-2, rgba(var(--cream-rgb),0.05))',
              color: activeTab === key ? '#fff' : 'var(--cream-2)',
              transition: 'background 0.18s, color 0.18s',
            }}
          >{label}</button>
        ))}
      </div>

      {/* Director AI tab */}
      {activeTab === 'director' && (
        <DirectorChatPanel user={user} />
      )}

      {/* W4.8 Y.5 — AI ROI Phase Y per-Dev */}
      {activeTab === 'roi' && (
        <AIROIPanelDev user={user} />
      )}

      {/* What-if tab */}
      {activeTab === 'whatif' && (
        <WhatIfPanel
          user={user}
          projects={(data?.developments || data?.projects || []).map(p => ({
            id: p.id || p.slug || p._id,
            name: p.name,
            price_from: p.price_from,
            price_to: p.price_to,
            m2_range: p.m2_range,
          }))}
        />
      )}

      {/* Resumen tab (existing content) */}
      {activeTab === 'resumen' && (
        <>
      {/* TU NEGOCIO HOY — estado del negocio (hero IA) */}
      <WeeklyBriefWidget />

      {!data ? <div style={{ padding: 60, color: 'var(--cream-3)', textAlign: 'center' }}>Cargando…</div>
        : (
          <>
            {/* TABLERO CENTRAL — signos vitales + cada proyecto con todos sus instrumentos */}
            <PortfolioCockpit />

            {/* HOY · LO QUE MUEVE LA AGUJA — zona de acción (jugadas + asistente lado a lado) */}
            <div className="eyebrow" style={{ marginBottom: 10 }}>HOY · LO QUE MUEVE LA AGUJA</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 14, marginBottom: 26, alignItems: 'start' }} className="ddash-action">
              <div><DevPlaysWidget /></div>
              <div><AsistentePanel /></div>
            </div>

            {/* MERCADO — posición, alertas y pulso (ir a fondo en Inteligencia) */}
            <div className="eyebrow" style={{ marginBottom: 10 }}>MERCADO</div>

            {/* Fase 3.2 · Lente del cubo — tu slice vs mercado anónimo + hedónico + dónde construir */}
            <div data-testid="dev-cube-intel" style={{ marginBottom: 22 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>TU CUBO · DECISIONES DE MERCADO</div>
              <CubeIntelligence />
            </div>

            {/* Inteligencia de Zona — mercado (Live Pulse) × tu negocio + veredicto de acción */}
            <div data-testid="dev-zone-intel" style={{ marginBottom: 22 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>INTELIGENCIA DE TUS ZONAS</div>
              <ZoneIntelligence user={user} />
            </div>

            {/* Inteligencia de Mercado — 4 viz reales: embudo, plusvalía, precio/m² vs CDMX, radar */}
            <div data-testid="dev-market-intel" style={{ marginBottom: 22 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>INTELIGENCIA DE MERCADO · CDMX</div>
              <MarketIntelligence user={user} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 22 }} className="ddash-grid">
              <Card onMouseEnter={cardEnter} onMouseLeave={cardLeave} style={{ position: 'relative', overflow: 'hidden', borderColor: 'var(--border-2, var(--border))', transition: CARD_TR }}>
                <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: 'var(--warm, #E2982E)' }} />
                <div className="eyebrow" style={{ marginBottom: 8, color: 'var(--cream-2)' }}>SUGERENCIAS DE PRECIO</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 38, color: 'var(--warm, #E2982E)', letterSpacing: '-0.022em', lineHeight: 1 }}>
                    {data.pricing_alerts}
                  </div>
                  <Link to="/desarrollador/pricing" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--grad, linear-gradient(120deg,#6366F1,#EC4899))', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 15px', fontSize: 12.5, fontWeight: 800, textDecoration: 'none', boxShadow: '0 6px 16px -8px rgba(109,74,255,0.5)' }}>Revisar <ArrowRight size={12} /></Link>
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', marginTop: 6 }}>pendientes de aprobación del director comercial</div>
              </Card>
              <Card onMouseEnter={cardEnter} onMouseLeave={cardLeave} style={{ position: 'relative', overflow: 'hidden', borderColor: 'var(--border-2, var(--border))', transition: CARD_TR }}>
                <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: (data.competitor_alerts || 0) > 0 ? 'var(--hot, #F2635B)' : 'var(--theme, #6D4AFF)' }} />
                <div className="eyebrow" style={{ marginBottom: 8, color: 'var(--cream-2)' }}>ALERTAS DE COMPETIDORES</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 38, color: (data.competitor_alerts || 0) > 0 ? 'var(--hot, #F2635B)' : 'var(--cream)', letterSpacing: '-0.022em', lineHeight: 1 }}>
                    {data.competitor_alerts || 0}
                  </div>
                  <Link to="/desarrollador/competidores" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--surface, #fff)', color: 'var(--theme, #6D4AFF)', border: '1px solid rgba(109,74,255,0.4)', borderRadius: 9, padding: '9px 15px', fontSize: 12.5, fontWeight: 800, textDecoration: 'none' }}>Radar <ArrowRight size={12} /></Link>
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', marginTop: 6 }}>movimientos relevantes en tu zona</div>
              </Card>
            </div>

            {/* Phase 7.5 — Auto-Sync widget */}
            {syncPending.count > 0 && (
              <Card data-testid="dash-sync-card" onMouseEnter={cardEnter} onMouseLeave={cardLeave} style={{ marginBottom: 22, background: 'linear-gradient(140deg, rgba(99,102,241,0.1), transparent)', borderColor: 'var(--border-2, var(--border))', transition: CARD_TR }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div className="eyebrow" style={{ marginBottom: 6 }}>AUTO-SYNC · DOCUMENT INTELLIGENCE</div>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', letterSpacing: '-0.018em', marginBottom: 4 }}>
                      <Sparkle size={13} color="var(--indigo-3)" /> {totalPendingFields} campo{totalPendingFields === 1 ? '' : 's'} sincronizado{totalPendingFields === 1 ? '' : 's'} en {syncPending.count} desarrollo{syncPending.count === 1 ? '' : 's'}
                    </div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5 }}>
                      Tus documentos legales y comerciales están alimentando automáticamente la ficha pública del marketplace.
                      {pausedDevs > 0 && <span style={{ color: 'var(--amber)' }}> · {pausedDevs} pausado{pausedDevs === 1 ? '' : 's'} por críticos cross-check.</span>}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                      {syncPending.items.slice(0, 4).map(s => (
                        <Link key={s.development_id} to={`/desarrollador/proyectos/${s.development_id}`} style={{
                          padding: '4px 12px', borderRadius: 9999, textDecoration: 'none',
                          background: s.auto_sync_paused_reason ? 'rgba(245,158,11,0.10)' : 'rgba(99,102,241,0.10)',
                          border: `1px solid ${s.auto_sync_paused_reason ? 'rgba(245,158,11,0.32)' : 'rgba(99,102,241,0.28)'}`,
                          color: s.auto_sync_paused_reason ? '#fcd34d' : '#c7d2fe',
                          fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
                        }}>{s.development_id} · {s.synced_field_count} campos</Link>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Actividad reciente (los proyectos viven en el tablero central de arriba) */}
            <div className="eyebrow" style={{ marginBottom: 10 }}>ACTIVIDAD RECIENTE</div>
            <Card data-testid="activity-feed-card" onMouseEnter={cardEnter} onMouseLeave={cardLeave} style={{ borderColor: 'var(--border-2, var(--border))', transition: CARD_TR }}>
              <ActivityFeed limit={20} />
            </Card>
          </>
        )}

      {/* END resumen tab */}
        </>
      )}

      {/* Floating Quick Actions */}
      {quickActions.length > 0 && (
        <FloatingQuickActions actions={quickActions} />
      )}

      <style>{`
        @media (max-width: 980px) {
          .ddash-action { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 880px) {
          .ddash-grid { grid-template-columns: 1fr !important; }
          .ddash-bottom { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </DeveloperLayout>
  );
}