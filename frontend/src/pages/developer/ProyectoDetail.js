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
import BulkUploadModal from '../../components/developer/BulkUploadModal';
import DiagnosticReportContent from '../../components/developer/DiagnosticReportContent';
import { EntityDrawer } from '../../components/shared/EntityDrawer';
import { getProjectSummary } from '../../api/developer';
import { getLatestDiagnostic } from '../../api/diagnostic';
import { ChevronRight, Building, Activity } from '../../components/icons';

const STAGE_LABELS = {
  preventa: 'Preventa',
  en_construccion: 'En construcción',
  entrega_inmediata: 'Entrega inmediata',
  exclusiva: 'Exclusiva',
  entregado: 'Entregado',
};

const STAGE_BADGE_STYLE = {
  preventa:         { bg: 'rgba(245,158,11,0.15)',   color: '#f59e0b' },
  en_construccion:  { bg: 'rgba(96,165,250,0.15)',   color: '#60a5fa' },
  entrega_inmediata:{ bg: 'rgba(34,197,94,0.12)',    color: '#22c55e' },
  exclusiva:        { bg: 'rgba(240,235,224,0.12)',  color: 'var(--cream-2)' },
  entregado:        { bg: 'rgba(34,197,94,0.10)',    color: '#22c55e' },
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

function PlaceholderTab({ tabLabel, phase }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '64px 24px', gap: 12, textAlign: 'center',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: 'rgba(240,235,224,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 4,
      }}>
        <Building size={22} color="rgba(240,235,224,0.2)" />
      </div>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
        {tabLabel}
      </h3>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--cream-3)', maxWidth: 320 }}>
        Disponible en el próximo release
        {phase ? ` (Batch ${phase})` : ''}.
      </p>
    </div>
  );
}

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
        position: 'fixed', top: 80, right: 24, width: 280, zIndex: 1000,
        background: 'rgba(6,8,15,0.97)', border: '1px solid rgba(240,235,224,0.18)',
        borderRadius: 12, overflow: 'hidden',
        backdropFilter: 'blur(16px)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(240,235,224,0.1)' }}>
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
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(240,235,224,0.06)'}
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
                  fontSize: 11, fontWeight: 700, padding: '3px 10px',
                  borderRadius: 6, letterSpacing: '0.04em',
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
                            'rgba(240,235,224,0.08)',
                color: diagBadge?.criticals > 0 ? '#ef4444' :
                       diagBadge?.failed > 0 ? '#f59e0b' : 'var(--cream)',
                border: `1px solid ${diagBadge?.criticals > 0 ? 'rgba(239,68,68,0.3)' :
                                     diagBadge?.failed > 0 ? 'rgba(245,158,11,0.25)' :
                                     'rgba(240,235,224,0.16)'}`,
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
                background: 'rgba(240,235,224,0.08)', color: 'var(--cream)',
                border: '1px solid rgba(240,235,224,0.16)', borderRadius: 8,
                padding: '7px 14px', fontSize: 12, cursor: 'pointer',
              }}
            >
              Editar
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        {!loading && (
          <div style={{ marginBottom: 20 }}>
            <KPIStrip items={kpiItems} />
          </div>
        )}

        {/* Tabs bar */}
        <div
          style={{
            display: 'flex', overflowX: 'auto', gap: 0,
            border: '1px solid rgba(240,235,224,0.12)', borderRadius: 10,
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
                background: activeTab === t.key ? 'rgba(240,235,224,0.10)' : 'transparent',
                color: activeTab === t.key ? 'var(--cream)' : 'var(--cream-3)',
                border: 'none',
                borderRight: i < TABS.length - 1 ? '1px solid rgba(240,235,224,0.08)' : 'none',
                fontSize: 12, fontWeight: activeTab === t.key ? 700 : 400,
                cursor: 'pointer', transition: 'all 0.12s', fontFamily: 'DM Sans,sans-serif',
                position: 'relative',
              }}
            >
              {t.label}
              {t.phase && (
                <span style={{
                  position: 'absolute', top: 4, right: 4,
                  fontSize: 7, color: 'rgba(240,235,224,0.25)',
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
            <ComercializacionTab devId={slug} user={user} />
          )}
          {activeTab === 'insights' && (
            <PlaceholderTab
              tabLabel="Insights"
              phase="B22"
            />
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
