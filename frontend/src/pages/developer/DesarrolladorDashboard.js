// /desarrollador — executive overview (Phase 4 Batch 14: Weekly Brief + Activity Feed + Setup Checklist + Quick Actions)
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Card } from '../../components/advisor/primitives';
import * as api from '../../api/developer';
import * as docsApi from '../../api/documents';
import { ActivityFeed } from '../../components/shared/ActivityFeed';
import { ErrorState } from '../../components/shared/LoadingState';
import { captureEvent } from '../../observability';
import { FloatingQuickActions } from '../../components/shared/FloatingQuickActions';
import { resolveQuickActions } from '../../config/quickActions';
import { ArrowRight, Sparkle, TrendUp, TrendDown, Activity, AlertCircle, Users, Calendar } from '../../components/icons';
import { DirectorChatPanel } from '../../components/director/DirectorChatPanel';
import WhatIfPanel from '../../components/whatif/WhatIfPanel';
import CuboBuzonPanel from '../../components/shared/CuboBuzonPanel';
import DevMemoryPanel from '../../components/developer/DevMemoryPanel';
import AIROIPanelDev from '../../components/agentic_crm/AIROIPanelDev';
import { getCerebroStatus, getCerebroTasks, getCerebroLearning, getCerebroRecommendations, applyCerebroRecommendation, detectCerebroMarket, approveCerebroTask, rejectCerebroTask } from '../../api/cerebro';
import PortfolioCockpit from '../../components/developer/PortfolioCockpit';
import PortfolioReading from '../../components/developer/PortfolioReading';
import ZonaCambios from '../../components/developer/ZonaCambios';

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
  const [open, setOpen] = useState({});   // disclosure progresivo: el dato detrás de cada jugada
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

              {/* Disclosure progresivo: el dev que quiere los números, los abre */}
              {Array.isArray(pl.evidence) && pl.evidence.length > 0 && (
                <div>
                  <button onClick={() => setOpen(o => ({ ...o, [i]: !o[i] }))} data-testid={`play-evidence-toggle-${i}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11.5, fontWeight: 700, color: `rgb(${tone})`, fontFamily: 'DM Sans,sans-serif' }}>
                    {open[i] ? 'Ocultar el dato' : 'Ver el dato'}
                    <span style={{ transform: open[i] ? 'rotate(180deg)' : 'none', transition: 'transform .15s', fontSize: 9 }}>▾</span>
                  </button>
                  {open[i] && (
                    <div data-testid={`play-evidence-${i}`} style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr auto', gap: '5px 12px', padding: '10px 12px', borderRadius: 9, background: `rgba(${tone},0.06)`, border: `1px solid rgba(${tone},0.16)` }}>
                      {pl.evidence.map((e, k) => (
                        <React.Fragment key={k}>
                          <span style={{ fontSize: 11.5, color: 'var(--cream-2)', fontFamily: 'DM Sans,sans-serif' }}>{e.k}</span>
                          <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--cream)', textAlign: 'right', fontFamily: 'Outfit,sans-serif' }}>{e.v}</span>
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                </div>
              )}

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

// ─── Puerta al terminal de Inteligencia ───────────────────────────────────────
// El Inicio queda ligero (cockpit + asistente). El análisis profundo vive en el
// terminal /desarrollador/mercado. Esta tira da un dato real + lleva al terminal.
function MarketDoorway() {
  const navigate = useNavigate();
  const [head, setHead] = useState(null);
  useEffect(() => {
    api.getDevBenchmark()
      .then(r => {
        const cells = (r.cells || []).filter(c => c && c.tu && c.mercado);
        const top = cells.slice().sort((a, b) => Math.abs(b.abs_delta_pts || 0) - Math.abs(a.abs_delta_pts || 0))[0];
        setHead(top || false);
      })
      .catch(() => setHead(false));
  }, []);
  const go = () => navigate('/desarrollador/mercado');
  const cap = (s) => String(s || '').replace(/(^|\s|-)([a-záéíóúñ])/g, (m, p, c) => p + c.toUpperCase());
  const sub = head
    ? `En ${cap(head.colonia)}: tu absorción ${head.tu.absorcion_pct}% vs ${head.mercado.absorcion_pct}% del mercado. Y 4 análisis más.`
    : 'Tú vs el mercado, qué sube el valor de tus unidades, dónde construir y el pulso de tus zonas.';
  return (
    <div data-testid="market-doorway" onClick={go}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 14px 28px -14px rgba(109,74,255,0.40)'; e.currentTarget.style.borderColor = 'rgba(109,74,255,0.45)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--asr-shadow, none)'; e.currentTarget.style.borderColor = 'var(--border-2, var(--border))'; }}
      style={{ cursor: 'pointer', marginBottom: 22, background: 'var(--surface, #fff)', border: '1px solid var(--border-2, var(--border))', borderRadius: 14, padding: '15px 18px', boxShadow: 'var(--asr-shadow, none)', transition: 'transform .16s, box-shadow .16s, border-color .16s', display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, var(--theme, #6D4AFF), #EC4899)' }}>
          <Activity size={19} color="#fff" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>Inteligencia de mercado</div>
          <div style={{ fontSize: 12, color: 'var(--cream-2)', marginTop: 1 }}>{sub}</div>
        </div>
      </div>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, background: 'var(--grad, linear-gradient(120deg,#6366F1,#EC4899))', color: '#fff', borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 800, fontFamily: 'DM Sans,sans-serif' }}>
        Ver a fondo <ArrowRight size={13} />
      </span>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function DesarrolladorDashboard({ user, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [syncPending, setSyncPending] = useState({ count: 0, items: [] });
  const [activeTab, setActiveTab] = useState('resumen');
  // Re-arquitectura: en V2 el Inicio es UN solo flujo (sin tabs). El chat se abre desde
  // el asistente (IA-first); What-if vive en Inteligencia y Costo de IA en Ajustes.
  const DEV_V2 = process.env.REACT_APP_DEV_V2 === 'true';
  const [chatOpen, setChatOpen] = useState(false);

  const load = React.useCallback(() => {
    setErr(false);
    api.getDashboard().then(setData).catch(() => {
      setData(null); setErr(true);
      captureEvent('dev_screen_load_error', { screen: 'inicio' });
    });
    docsApi.getSyncPending('developer').then(setSyncPending).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

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

      {/* Buzón del cubo — lo que el superadmin (la inteligencia central) te mandó construir/ajustar. Hide-if-empty. */}
      <CuboBuzonPanel
        fetchActions={api.getCubeActions}
        setEstado={api.setCubeActionEstado}
        titulo="El cubo te manda"
        subtitulo="construir / ajustar según la demanda real"
        accent="#6366f1"
        verbo="Lo haré"
      />

      {/* Lo que aprendí de ti — memoria/contexto persistente del dev (lente Personal). Hide-if-empty. */}
      <DevMemoryPanel />

      {/* V1: barra de tabs (legacy, intacta). V2: un solo flujo, sin tabs. */}
      {!DEV_V2 && (
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
      )}

      {/* V2 · lanzador de chat con el asistente (IA-first, sin tab). */}
      {DEV_V2 && (
        <div style={{ marginBottom: 16 }}>
          <button onClick={() => setChatOpen(o => !o)} data-testid="ddash-chat-launch"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, fontFamily: 'DM Sans,sans-serif', border: chatOpen ? 'none' : '1px solid rgba(109,74,255,0.4)', background: chatOpen ? 'var(--grad, linear-gradient(120deg,#6366F1,#EC4899))' : 'var(--surface, #fff)', color: chatOpen ? '#fff' : 'var(--theme, #6D4AFF)' }}>
            <Sparkle size={14} /> {chatOpen ? 'Cerrar chat' : 'Hablar con tu asistente'}
          </button>
        </div>
      )}

      {/* Chat con el asistente — V1: tab "director" · V2: toggle del lanzador. */}
      {((DEV_V2 && chatOpen) || (!DEV_V2 && activeTab === 'director')) && (
        <DirectorChatPanel user={user} />
      )}

      {/* Costo de mi IA — V1: tab "roi". En V2 vive en Ajustes (re-ubicado). */}
      {!DEV_V2 && activeTab === 'roi' && (
        <AIROIPanelDev user={user} />
      )}

      {/* What-if — V1: tab "whatif". En V2 vive en Inteligencia (re-ubicado). */}
      {!DEV_V2 && activeTab === 'whatif' && (
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

      {/* Flujo principal — V1: tab "resumen" · V2: siempre (es la página). */}
      {(DEV_V2 || activeTab === 'resumen') && (
        <>
      {/* TU NEGOCIO HOY — estado del negocio (hero IA) */}
      <WeeklyBriefWidget />

      {err ? <ErrorState message="No pudimos cargar tu Inicio. Revisa tu conexión e intenta de nuevo." onRetry={load} />
        : !data ? <div style={{ padding: 60, color: 'var(--cream-3)', textAlign: 'center' }}>Cargando…</div>
        : (
          <>
            {/* HOY · LO QUE MUEVE LA AGUJA — el Asistente protagonista ARRIBA (sintetiza el día);
                el resto es drill-down. (arquitectura founder: "Asistente arriba, secciones como drill-downs") */}
            <div className="eyebrow" style={{ marginBottom: 10 }}>HOY · LO QUE MUEVE LA AGUJA</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 14, marginBottom: 26, alignItems: 'start' }} className="ddash-action">
              <div><DevPlaysWidget /></div>
              <div><AsistentePanel /></div>
            </div>

            {/* TABLERO CENTRAL — la lectura (interpreta los números) precede a los signos vitales */}
            <PortfolioReading />
            <ZonaCambios />
            <PortfolioCockpit />

            {/* MERCADO — Inicio ligero: una puerta con un dato real al terminal de Inteligencia.
                El análisis profundo (cubo, zonas, CDMX) vive en /desarrollador/mercado (sin duplicar). */}
            <div className="eyebrow" style={{ marginBottom: 10 }}>MERCADO</div>
            <MarketDoorway />

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