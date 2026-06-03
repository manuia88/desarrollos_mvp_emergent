/**
 * Phase 4 Batch 10 — Sub-chunk B
 * /desarrollador/proyectos/:slug — Proyecto Detail con 8 tabs
 * URL sync: ?tab= (default: ventas)
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { KPIStrip } from '../../components/shared/KPIStrip';
import HealthScore from '../../components/shared/HealthScore';
import VentasTab from '../../components/developer/VentasTab';
import AvanceObraTab from '../../components/developer/AvanceObraTab';
import GeolocalizacionTab from '../../components/developer/GeolocalizacionTab';
import ContenidoTab from '../../components/developer/ContenidoTab';
import AmenidadesTab from '../../components/developer/AmenidadesTab';
import LegalTab from '../../components/developer/LegalTab';
import ComercializacionTab from '../../components/developer/ComercializacionTab';
import InsightsTab from '../../components/developer/insights/InsightsTab';
import BulkUploadModal from '../../components/developer/BulkUploadModal';
import DiagnosticReportContent from '../../components/developer/DiagnosticReportContent';
import BrochureGenerator from '../../components/brochure/BrochureGenerator';
// W4.9.6 — Tours 3D
import Tour3DStatusBadge from '../../components/tour3d/Tour3DStatusBadge';
import Tour3DUploader from '../../components/tour3d/Tour3DUploader';
import Tour3DOnboardingWizard from '../../components/tour3d/Tour3DOnboardingWizard';
import Tour3DViewer from '../../components/tour3d/Tour3DViewer';
import { EntityDrawer } from '../../components/shared/EntityDrawer';
import { getProjectSummary, listProjectsWithStats, getDevAmenityRanker } from '../../api/developer';
import { getLatestDiagnostic } from '../../api/diagnostic';
import { ChevronRight, Building, Activity } from '../../components/icons';
import AISuggestionCard from '../../components/shared/AISuggestionCard';
import useInlineSaver from '../../hooks/useInlineSaver';
import { Z } from '../../styles/zIndex';

const DEV_V2 = process.env.REACT_APP_DEV_V2 === 'true';
const MARGIN_COLORS = { verde: 'var(--ok, #1FA06A)', amarillo: 'var(--warm, #E2982E)', rojo: 'var(--hot, #F2635B)', gris: 'var(--cream-3)' };

// ─── Operación del activo (IA-first · upgrade Mis Proyectos) ──────────────────
// Surfacea motores vivos que no tenían UI en la ficha: margen semáforo, absorción
// (meses para agotar) y qué atributo sube el valor en la zona. Lee, no edita.
const SCORE_COLOR = (g) => (['AAA', 'AA'].includes(g) ? 'var(--ok, #1FA06A)' : ['A', 'B'].includes(g) ? 'var(--warm, #E2982E)' : 'var(--hot, #F2635B)');
function AssetOpCockpit({ slug, summary }) {
  const [margin, setMargin] = useState(null);
  const [absorption, setAbsorption] = useState(null);
  const [driver, setDriver] = useState(null);
  const [score, setScore] = useState(null);
  useEffect(() => {
    listProjectsWithStats()
      .then(r => {
        const arr = Array.isArray(r) ? r : (r.projects || r.items || []);
        const p = arr.find(x => x.id === slug) || arr.find(x => (x.name || '') === (summary?.name || ''));
        if (p) {
          setMargin(p.margin || null);
          setScore(p.full_score || null);
          const by = p.units_by_status || {};
          const avail = by.disponible || 0;
          const ws = p.weekly_sales || [];
          const rate = ws.length ? ws.slice(-4).reduce((a, b) => a + b, 0) / Math.min(4, ws.slice(-4).length) : 0;
          setAbsorption(rate > 0 ? { months: Math.round(avail / (rate * 4.33)), avail, rate: rate.toFixed(1) } : { months: null, avail, rate: '0' });
        }
      })
      .catch(() => {});
    // Modelo hedónico es cross-zona: global (sano), no por colonia (muestra chica = ruido).
    // "Qué SUBE el valor" → top atributo POSITIVO significativo (no el de mayor impacto absoluto).
    getDevAmenityRanker()
      .then(d => {
        const pos = (d.amenity_ranker || []).filter(a => a.significativo && a.impacto_pct_precio_m2 > 0)
          .sort((a, b) => b.impacto_pct_precio_m2 - a.impacto_pct_precio_m2);
        setDriver(pos[0] || null);
      })
      .catch(() => {});
  }, [slug, summary]);

  const Card = ({ children, accent }) => (
    <div style={{ background: 'var(--surface, #fff)', border: '1px solid var(--border-2, var(--border))', borderRadius: 13, padding: '13px 15px', borderLeft: `3px solid ${accent}` }}>{children}</div>
  );
  return (
    <div data-testid="asset-op-cockpit" style={{ marginBottom: 20 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>OPERACIÓN DEL ACTIVO</div>

      {/* "1 número" — Full Project Score (titular · funde las 5 señales en uno comparable) */}
      {score && score.score != null && (
        <div data-testid="full-score" style={{ display: 'flex', alignItems: 'center', gap: 16, background: 'var(--surface, #fff)', border: '1px solid var(--border-2, var(--border))', borderLeft: `4px solid ${SCORE_COLOR(score.grade)}`, borderRadius: 14, padding: '14px 18px', marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 800, fontSize: 34, color: 'var(--cream)', lineHeight: 1 }}>{score.score}</span>
            <span style={{ fontSize: 13, color: 'var(--cream-3)' }}>/100</span>
            <span style={{ marginLeft: 4, fontSize: 13, fontWeight: 800, color: '#fff', background: SCORE_COLOR(score.grade), borderRadius: 7, padding: '3px 9px' }}>{score.grade}</span>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--cream)', fontFamily: 'DM Sans,sans-serif' }}>Score del proyecto · 1 número</div>
            <div style={{ fontSize: 10.5, color: 'var(--cream-3)', marginTop: 2 }}>
              Funde salud + margen + absorción + ritmo + demanda. Comparable entre proyectos.
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 5 }}>
              {(score.breakdown || []).map((b, i) => (
                <span key={i} style={{ fontSize: 10, color: 'var(--cream-2)' }}>{b.dim} <b style={{ color: 'var(--cream)' }}>{b.value}</b></span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {/* Margen */}
        <Card accent={margin ? MARGIN_COLORS[margin.color] : 'var(--cream-3)'}>
          <div style={{ fontSize: 11, color: 'var(--cream-3)', marginBottom: 3 }}>Margen estimado</div>
          {margin && margin.margin_pct != null ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: MARGIN_COLORS[margin.color] }} />
                <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>{margin.margin_pct}%</span>
              </div>
              <div style={{ fontSize: 10.5, color: MARGIN_COLORS[margin.color], marginTop: 3 }}>{margin.verdict}</div>
            </>
          ) : <div style={{ fontSize: 12, color: 'var(--cream-3)' }}>—</div>}
        </Card>
        {/* Absorción */}
        <Card accent="var(--theme, #6D4AFF)">
          <div style={{ fontSize: 11, color: 'var(--cream-3)', marginBottom: 3 }}>Se agota en</div>
          {absorption ? (
            <>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
                {absorption.months != null ? `${absorption.months} meses` : 'sin ritmo'}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--cream-3)', marginTop: 3 }}>{absorption.avail} uds · ritmo {absorption.rate}/sem</div>
            </>
          ) : <div style={{ fontSize: 12, color: 'var(--cream-3)' }}>—</div>}
        </Card>
        {/* Qué sube el valor en la zona */}
        <Card accent="var(--ok, #1FA06A)">
          <div style={{ fontSize: 11, color: 'var(--cream-3)', marginBottom: 3 }}>Qué sube el valor · tu mercado</div>
          {driver ? (
            <>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>{driver.atributo}</div>
              <div style={{ fontSize: 10.5, color: driver.impacto_pct_precio_m2 >= 0 ? 'var(--ok, #1FA06A)' : 'var(--hot, #F2635B)', marginTop: 3 }}>
                {driver.impacto_pct_precio_m2 >= 0 ? '+' : ''}{driver.impacto_pct_precio_m2}% en precio/m² · tu mercado
              </div>
            </>
          ) : <div style={{ fontSize: 12, color: 'var(--cream-3)' }}>Aún sin muestra suficiente</div>}
        </Card>
      </div>
    </div>
  );
}

const STAGE_LABELS = {
  preventa: 'Preventa',
  en_construccion: 'En construcción',
  entrega_inmediata: 'Entrega inmediata',
  exclusiva: 'Exclusiva',
  entregado: 'Entregado',
};

const STAGE_BADGE_STYLE = {
  preventa:         { bg: '#E2982E', color: '#fff' },
  en_construccion:  { bg: '#3B82F6', color: '#fff' },
  entrega_inmediata:{ bg: '#1FA06A', color: '#fff' },
  exclusiva:        { bg: '#6D4AFF', color: '#fff' },
  entregado:        { bg: '#1FA06A', color: '#fff' },
};

const fmtMXN = (v) => {
  if (!v || v === 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  return `$${(v / 1_000).toFixed(0)}K`;
};

const TABS = [
  { key: 'ventas',          label: 'Ventas',          phase: null },
  { key: 'contenido',       label: 'Contenido',       phase: null },
  { key: 'avance',          label: 'Avance de obra',  phase: null },
  { key: 'ubicacion',       label: 'Ubicación',       phase: null },
  { key: 'amenidades',      label: 'Amenidades',      phase: null },
  { key: 'legal',           label: 'Legal',           phase: null },
  { key: 'comercializacion',label: 'Comercialización',phase: null },
  { key: 'insights',        label: 'Insights',        phase: 'B22' },
];

// ─── Cmd+P Project Switcher ─────────────────────────────────────────────────
function ProjectSwitcher({ currentSlug, onSwitch }) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState([]);
  const [search, setSearch] = useState('');
  const ref = useRef();

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('dmx_recent_projects') || '[]');
      setRecent(saved.filter(r => r.id !== currentSlug).slice(0, 5));
    } catch {}
  }, [currentSlug]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const filteredRecent = recent.filter(r =>
    !search || r.name?.toLowerCase().includes(search.toLowerCase())
  );

  if (!open) return null;
  return (
    <div
      ref={ref}
      style={{
        position: 'fixed', top: 80, right: 24, width: 280, zIndex: Z.MODAL,
        background: 'rgba(var(--bg-rgb),0.97)', border: '1px solid rgba(var(--cream-rgb),0.18)',
        borderRadius: 12, overflow: 'hidden',
        backdropFilter: 'blur(16px)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(var(--cream-rgb),0.1)' }}>
        <input
          autoFocus
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar proyecto…"
          style={{
            width: '100%', background: 'transparent', border: 'none',
            color: 'var(--cream)', fontSize: 13, outline: 'none',
            fontFamily: 'DM Sans,sans-serif',
          }}
        />
      </div>
      {filteredRecent.length > 0 ? (
        <div>
          <div style={{ padding: '6px 12px', fontSize: 10, color: 'var(--cream-3)', fontWeight: 600, letterSpacing: '0.06em' }}>
            RECIENTES
          </div>
          {filteredRecent.map(r => (
            <button
              key={r.id}
              onClick={() => { onSwitch(r.id); setOpen(false); }}
              style={{
                width: '100%', background: 'none', border: 'none',
                padding: '8px 12px', textAlign: 'left', cursor: 'pointer',
                color: 'var(--cream)', fontSize: 13, transition: 'background 0.1s',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--cream-rgb),0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <Building size={13} color="var(--cream-3)" />
              {r.name}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ padding: '16px 12px', fontSize: 12, color: 'var(--cream-3)', textAlign: 'center' }}>
          {search ? 'Sin resultados' : 'No hay proyectos recientes'}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ProyectoDetail({ user, onLogout }) {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [showBrochure, setShowBrochure] = useState(false);

  const activeTab = searchParams.get('tab') || 'ventas';
  const diagnosticOpen = searchParams.get('diagnostic') === 'open';
  const [diagBadge, setDiagBadge] = useState(null);

  // Load diagnostic badge count
  useEffect(() => {
    getLatestDiagnostic(slug).then(d => {
      if (!d.never_run) {
        setDiagBadge({ failed: d.failed || 0, criticals: d.criticals || 0 });
      } else setDiagBadge({ failed: 0, criticals: 0, never: true });
    }).catch(() => setDiagBadge(null));
  }, [slug]);

  const setDiagnosticOpen = (open) => {
    const next = new URLSearchParams(searchParams);
    if (open) next.set('diagnostic', 'open');
    else next.delete('diagnostic');
    setSearchParams(next, { replace: true });
  };

  const setTab = (key) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    // reset subtab when changing main tab
    next.delete('subtab');
    next.delete('status_filter');
    setSearchParams(next, { replace: true });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getProjectSummary(slug);
      setSummary(data);

      // Save to recent projects
      try {
        const saved = JSON.parse(localStorage.getItem('dmx_recent_projects') || '[]');
        const next = [{ id: slug, name: data.name }, ...saved.filter(r => r.id !== slug)].slice(0, 10);
        localStorage.setItem('dmx_recent_projects', JSON.stringify(next));
      } catch {}
    } catch (e) {
      console.error('ProyectoDetail load error:', e);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  // Phase 4 Batch 17 — inline edit saver for project fields
  // Registra el contexto de edición inline del proyecto (efecto del hook; sin variable sin uso).
  useInlineSaver('project', slug, {
    onUpdated: load,
    toastMessage: 'Proyecto actualizado',
  });

  const stageStyle = summary ? (STAGE_BADGE_STYLE[summary.stage] || STAGE_BADGE_STYLE.preventa) : {};

  const kpiItems = summary ? [
    { label: '% Vendido', value: `${summary.sold_pct ?? 0}%`, icon: Building },
    { label: 'Uds. vendidas', value: summary.sold_units ?? 0, subtext: `de ${summary.units_total}` },
    { label: 'Revenue MTD', value: fmtMXN(summary.revenue_mtd_est), icon: Building },
    { label: 'Leads activos', value: summary.leads_active ?? 0 },
  ] : [];

  const handleSwitchProject = (id) => {
    navigate(`/desarrollador/proyectos/${id}?tab=${activeTab}`);
  };

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 4px 48px' }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, fontSize: 12, color: 'var(--cream-3)' }}>
          <Link to="/desarrollador/proyectos" style={{ color: 'var(--cream-3)', textDecoration: 'none', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--cream)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--cream-3)'}
          >
            Mis Proyectos
          </Link>
          <ChevronRight size={12} />
          <span style={{ color: 'var(--cream-2)' }}>{loading ? '…' : summary?.name || slug}</span>
        </div>

        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
                {loading ? '…' : summary?.name || slug}
              </h1>
              {summary && (
                <span style={{
                  background: stageStyle.bg, color: stageStyle.color,
                  fontSize: 11, fontWeight: 800, padding: '4px 11px',
                  borderRadius: 7, letterSpacing: '0.04em', textTransform: 'uppercase',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                }}>
                  {STAGE_LABELS[summary.stage] || summary.stage}
                </span>
              )}
            </div>
            {summary?.colonia && (
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--cream-3)' }}>
                {summary.colonia} {summary.delivery_estimate ? `· Entrega: ${summary.delivery_estimate}` : ''}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ textAlign: 'center' }}>
              <HealthScore score={summary?.health_score || 0} size="md" />
            </div>
            <button
              data-testid="diagnostic-btn"
              onClick={() => setDiagnosticOpen(true)}
              title="Ejecutar diagnóstico del proyecto"
              style={{
                position: 'relative',
                background: diagBadge?.criticals > 0 ? 'rgba(239,68,68,0.12)' :
                            diagBadge?.failed > 0 ? 'rgba(245,158,11,0.10)' :
                            'rgba(var(--cream-rgb),0.08)',
                color: diagBadge?.criticals > 0 ? '#ef4444' :
                       diagBadge?.failed > 0 ? '#f59e0b' : 'var(--cream)',
                border: `1px solid ${diagBadge?.criticals > 0 ? 'rgba(239,68,68,0.3)' :
                                     diagBadge?.failed > 0 ? 'rgba(245,158,11,0.25)' :
                                     'rgba(var(--cream-rgb),0.16)'}`,
                borderRadius: 8, padding: '7px 12px', fontSize: 12,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Activity size={13} />
              Diagnóstico
              {diagBadge && !diagBadge.never && diagBadge.failed > 0 && (
                <span style={{
                  background: diagBadge.criticals > 0 ? '#ef4444' : '#f59e0b',
                  color: 'white', fontSize: 9, fontWeight: 700,
                  padding: '1px 5px', borderRadius: 8, marginLeft: 2,
                }}>
                  {diagBadge.failed}
                </span>
              )}
            </button>
            <button
              data-testid="edit-proyecto-btn"
              style={{
                background: 'rgba(var(--cream-rgb),0.08)', color: 'var(--cream)',
                border: '1px solid rgba(var(--cream-rgb),0.16)', borderRadius: 8,
                padding: '7px 14px', fontSize: 12, cursor: 'pointer',
              }}
            >
              Editar
            </button>
            <button
              data-testid="brochure-generate-cta"
              onClick={() => setShowBrochure(true)}
              title="Generar brochure PDF + variantes sociales"
              style={{
                background: 'linear-gradient(90deg, #6366F1, #EC4899)',
                color: '#fff', border: 'none', borderRadius: 9999,
                padding: '7px 16px', fontSize: 12, fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Brochure
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        {!loading && (
          <div style={{ marginBottom: 20 }}>
            <KPIStrip items={kpiItems} />
          </div>
        )}

        {/* V2 · Operación del activo (IA-first): margen, absorción, qué sube el valor. */}
        {DEV_V2 && !loading && summary && (
          <AssetOpCockpit slug={slug} summary={summary} />
        )}

        {/* Phase 4 Batch 16 — AI Suggestions Inline */}
        {!loading && slug && (
          <div style={{ marginBottom: 20 }} data-testid="proyecto-ai-suggestions">
            <AISuggestionCard entityType="project" entityId={slug} onNavigate={(p) => navigate(p)} />
          </div>
        )}

        {/* Tabs bar */}
        {/* Hub de tarjetas vivas (Tanda 4) — agrupado Operar / Ficha, cada una con su estado real */}
        {summary && [
          { group: 'Operar', cards: [
            { key: 'ventas', label: 'Ventas', stat: `${summary.sold_pct ?? 0}% vendido`, accent: 'var(--ok, #1FA06A)' },
            { key: 'comercializacion', label: 'Comercialización', stat: `${summary.leads_active ?? 0} leads activos`, accent: 'var(--theme, #6D4AFF)' },
            { key: 'avance', label: 'Avance de obra', stat: 'Ver progreso', accent: 'var(--warm, #E2982E)' },
            { key: 'insights', label: 'Insights', stat: `Salud ${summary.health_score ?? '—'}/100`, accent: 'var(--theme, #6D4AFF)' },
          ] },
          { group: 'Ficha del proyecto', cards: [
            { key: 'contenido', label: 'Contenido', stat: 'Fotos y descripción', accent: 'var(--cream-3)' },
            { key: 'ubicacion', label: 'Ubicación', stat: 'Mapa y entorno', accent: 'var(--cream-3)' },
            { key: 'amenidades', label: 'Amenidades', stat: 'Equipamiento', accent: 'var(--cream-3)' },
            { key: 'legal', label: 'Legal', stat: 'Documentos', accent: 'var(--cream-3)' },
          ] },
        ].map(grp => (
          <div key={grp.group} style={{ marginBottom: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 8, color: 'var(--cream-2)' }}>{grp.group.toUpperCase()}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              {grp.cards.map(c => {
                const on = activeTab === c.key;
                return (
                  <button key={c.key} onClick={() => setTab(c.key)} data-testid={`hubcard-${c.key}`}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 24px -12px rgba(109,74,255,0.35)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--asr-shadow, none)'; }}
                    style={{
                      position: 'relative', overflow: 'hidden', textAlign: 'left', cursor: 'pointer',
                      background: 'var(--surface, #fff)', border: `1px solid ${on ? 'rgba(109,74,255,0.5)' : 'var(--border-2, var(--border))'}`,
                      borderRadius: 12, padding: '13px 14px 13px 16px', boxShadow: 'var(--asr-shadow, none)',
                      transition: 'transform .15s, box-shadow .15s, border-color .15s', fontFamily: 'DM Sans,sans-serif',
                    }}>
                    <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: c.accent }} />
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: 'var(--cream)' }}>{c.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--cream-2)', marginTop: 3 }}>{c.stat}</div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div
          style={{
            display: 'flex', overflowX: 'auto', gap: 0,
            border: '1px solid rgba(var(--cream-rgb),0.12)', borderRadius: 10,
            marginBottom: 24, flexShrink: 0,
          }}
          data-testid="proyecto-tabs"
        >
          {TABS.map((t, i) => (
            <button
              key={t.key}
              data-testid={`tab-${t.key}`}
              onClick={() => setTab(t.key)}
              style={{
                whiteSpace: 'nowrap', padding: '10px 16px',
                background: activeTab === t.key ? 'rgba(var(--cream-rgb),0.10)' : 'transparent',
                color: activeTab === t.key ? 'var(--cream)' : 'var(--cream-3)',
                border: 'none',
                borderRight: i < TABS.length - 1 ? '1px solid rgba(var(--cream-rgb),0.08)' : 'none',
                fontSize: 12, fontWeight: activeTab === t.key ? 700 : 400,
                cursor: 'pointer', transition: 'all 0.12s', fontFamily: 'DM Sans,sans-serif',
                position: 'relative',
              }}
            >
              {t.label}
              {t.phase && (
                <span style={{
                  position: 'absolute', top: 4, right: 4,
                  fontSize: 7, color: 'rgba(var(--cream-rgb),0.25)',
                }}>
                  {t.phase}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div data-testid="tab-content">
          {activeTab === 'ventas' && (
            <VentasTab devId={slug} user={user} onBulkUpload={() => setShowBulkUpload(true)} />
          )}
          {activeTab === 'contenido' && (
            <ContenidoTab devId={slug} user={user} />
          )}
          {activeTab === 'avance' && (
            <AvanceObraTab devId={slug} />
          )}
          {activeTab === 'ubicacion' && (
            <GeolocalizacionTab devId={slug} user={user} />
          )}
          {activeTab === 'amenidades' && (
            <AmenidadesTab devId={slug} user={user} />
          )}
          {activeTab === 'legal' && (
            <LegalTab devId={slug} user={user} />
          )}
          {activeTab === 'comercializacion' && (
            <>
              <ComercializacionTab devId={slug} user={user} />
              <Tours3DSection
                projectSlug={slug}
                devId={summary?.dev_org_id || summary?.developer_id || (user?.dev_org_id || user?.tenant_id)}
                user={user}
              />
            </>
          )}
          {activeTab === 'insights' && (
            <InsightsTab projectId={slug} user={user} />
          )}
        </div>

        {/* Bulk Upload Modal */}
        {showBulkUpload && (
          <BulkUploadModal
            devId={slug}
            onClose={() => setShowBulkUpload(false)}
            onCommitted={() => { setShowBulkUpload(false); load(); }}
          />
        )}

        {/* W4.9 — Brochure Generator Modal */}
        {showBrochure && (
          <BrochureGenerator
            projectId={slug}
            projectName={summary?.name || slug}
            onClose={() => setShowBrochure(false)}
          />
        )}

        {/* Cmd+P Project Switcher */}
        <ProjectSwitcher currentSlug={slug} onSwitch={handleSwitchProject} />

        {/* Phase 4 Batch 0.5 — Diagnostic Drawer */}
        <EntityDrawer
          isOpen={diagnosticOpen}
          onClose={() => setDiagnosticOpen(false)}
          title="Diagnóstico del proyecto"
          entity_type="diagnostic_report"
          user={user}
          width={600}
          body={diagnosticOpen ? (
            <DiagnosticReportContent devId={slug} user={user} />
          ) : null}
        />
      </div>
    </DeveloperLayout>
  );
}


// ─── W4.9.6 · Tours 3D Section ────────────────────────────────────────────────
function Tours3DSection({ projectSlug, devId, user }) {
  const API = process.env.REACT_APP_BACKEND_URL;
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [showUploader, setShowUploader] = useState(false);
  const [previewScan, setPreviewScan] = useState(null);
  const [units, setUnits] = useState([]);

  const role = user?.role;
  const canManage = role === 'superadmin' || role === 'developer_admin' || role === 'dev_admin';

  const reload = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/tour-3dgs/scans?project_slug=${encodeURIComponent(projectSlug)}&limit=100`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setScans(d?.items || []))
      .catch(() => setScans([]))
      .finally(() => setLoading(false));
  }, [API, projectSlug]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    // Fetch units for the uploader dropdown (best-effort)
    fetch(`${API}/api/marketplace/development/${encodeURIComponent(projectSlug)}`)
      .then((r) => r.json())
      .then((d) => setUnits(Array.isArray(d?.units) ? d.units : []))
      .catch(() => setUnits([]));
  }, [API, projectSlug]);

  const handleDelete = async (scanId) => {
    if (!window.confirm('¿Eliminar este tour 3D? No se puede deshacer.')) return;
    try {
      const res = await fetch(`${API}/api/tour-3dgs/scans/${scanId}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok && res.status !== 204) throw new Error('delete_failed');
      reload();
    } catch (_) {
      alert('No se pudo eliminar el tour.');
    }
  };

  return (
    <div data-testid="tours-3d-section" style={{
      marginTop: 28,
      background: 'rgba(var(--bg-rgb),0.92)',
      border: '1px solid rgba(var(--cream-rgb),0.10)',
      borderRadius: 16,
      padding: 20,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', marginBottom: 14,
      }}>
        <div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)' }}>
            Tours 3D · Gaussian Splatting
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
            Captura inmersiva por unidad. Compatible con iframe embedable.
          </div>
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => setShowWizard(true)}
              style={{
                background: 'linear-gradient(90deg, #6366F1, #EC4899)',
                color: '#fff', border: 'none', borderRadius: 9999,
                padding: '8px 18px',
                fontFamily: 'Outfit', fontWeight: 800, fontSize: 11, letterSpacing: '0.1em',
                cursor: 'pointer',
              }}
            >
              CAPTURAR NUEVO TOUR
            </button>
            <button
              type="button"
              onClick={() => setShowUploader(true)}
              style={{
                background: 'transparent', color: 'var(--cream)',
                border: '1px solid rgba(var(--cream-rgb),0.25)', borderRadius: 9999,
                padding: '8px 18px',
                fontFamily: 'Outfit', fontWeight: 700, fontSize: 11, letterSpacing: '0.08em',
                cursor: 'pointer',
              }}
            >
              SUBIR ARCHIVO
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 18, color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
          Cargando…
        </div>
      ) : scans.length === 0 ? (
        <div style={{
          padding: 24, textAlign: 'center',
          border: '1px dashed rgba(var(--cream-rgb),0.18)', borderRadius: 12,
          fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)',
        }}>
          Aún no hay tours 3D para este proyecto.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {scans.map((s) => (
            <div
              key={s.scan_id}
              data-testid={`tour-row-${s.unit_id}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                gap: 12, alignItems: 'center',
                background: 'rgba(var(--bg-rgb),0.7)',
                border: '1px solid rgba(var(--cream-rgb),0.08)',
                borderRadius: 12,
                padding: '10px 14px',
              }}
            >
              <div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>
                  Unidad {s.unit_id}
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
                  {s.source_format} · {s.file_size_kb ? `${s.file_size_kb} KB` : '—'} · {String(s.captured_at || '').slice(0, 10)}
                </div>
              </div>
              <Tour3DStatusBadge
                status={s.status}
                sizeKb={s.file_size_kb}
                format={s.source_format}
                capturedAt={s.captured_at}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  data-testid={`tour-action-preview-${s.unit_id}`}
                  onClick={() => setPreviewScan(s)}
                  disabled={s.status !== 'ready'}
                  style={{
                    background: 'transparent', color: 'var(--cream)',
                    border: '1px solid rgba(var(--cream-rgb),0.25)', borderRadius: 9999,
                    padding: '5px 12px',
                    fontFamily: 'Outfit', fontWeight: 700, fontSize: 10, letterSpacing: '0.06em',
                    cursor: s.status === 'ready' ? 'pointer' : 'not-allowed',
                    opacity: s.status === 'ready' ? 1 : 0.45,
                  }}
                >
                  PREVIEW
                </button>
                {canManage && (
                  <button
                    type="button"
                    data-testid={`tour-action-delete-${s.unit_id}`}
                    onClick={() => handleDelete(s.scan_id)}
                    style={{
                      background: 'rgba(239,68,68,0.10)', color: 'var(--red)',
                      border: '1px solid rgba(239,68,68,0.35)', borderRadius: 9999,
                      padding: '5px 12px',
                      fontFamily: 'Outfit', fontWeight: 700, fontSize: 10, letterSpacing: '0.06em',
                      cursor: 'pointer',
                    }}
                  >
                    BORRAR
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showWizard && (
        <Tour3DOnboardingWizard
          unitId={units[0]?.id || ''}
          projectSlug={projectSlug}
          devId={devId}
          onClose={() => setShowWizard(false)}
          onCreated={() => { setShowWizard(false); reload(); }}
        />
      )}

      {showUploader && (
        <div
          onClick={() => setShowUploader(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(var(--bg-rgb),0.78)', backdropFilter: 'blur(8px)',
            zIndex: Z.MODAL_CRITICAL, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 580 }}>
            <Tour3DUploader
              units={units}
              defaultUnitId={units[0]?.id || ''}
              projectSlug={projectSlug}
              devId={devId}
              onUploaded={() => { setShowUploader(false); reload(); }}
              onClose={() => setShowUploader(false)}
            />
          </div>
        </div>
      )}

      {previewScan && (
        <div
          onClick={() => setPreviewScan(null)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(var(--bg-rgb),0.85)', backdropFilter: 'blur(8px)',
            zIndex: Z.MODAL_CRITICAL, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 1100 }}>
            <Tour3DViewer
              scanId={previewScan.scan_id}
              viewerConfig={previewScan.viewer_config}
              theme="cream"
              uiMode="full"
              onClose={() => setPreviewScan(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
