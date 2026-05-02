/**
 * Phase 4 Batch 10 — Sub-chunk A
 * /desarrollador/proyectos — Mis Proyectos lista con stats enriquecidos
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import HealthScore from '../../components/shared/HealthScore';
import { listProjectsWithStats } from '../../api/developer';
import { Plus, Building, BarChart, Users, TrendUp } from '../../components/icons';

// ─── Mini Sparkline SVG ──────────────────────────────────────────────────────
function MiniSparkline({ data = [], color = '#22c55e', width = 80, height = 28 }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (v / max) * (height - 4) - 2;
    return [x, y];
  });

  const polyline = pts.map(([x, y]) => `${x},${y}`).join(' ');
  const area = [
    `0,${height}`,
    ...pts.map(([x, y]) => `${x},${y}`),
    `${width},${height}`,
  ].join(' ');

  const gradId = `sg-${color.replace('#', '')}`;
  const [lx, ly] = pts[pts.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} overflow="visible">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradId})`} />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2.5" fill={color} />
    </svg>
  );
}

const STAGE_LABELS = {
  preventa: 'Preventa',
  en_construccion: 'En construcción',
  entrega_inmediata: 'Entrega inmediata',
  exclusiva: 'Exclusiva',
  entregado: 'Entregado',
};

const STAGE_COLORS = {
  preventa: { bg: 'rgba(245,158,11,0.12)', fg: 'var(--amber)' },
  en_construccion: { bg: 'rgba(59,130,246,0.12)', fg: '#60a5fa' },
  entrega_inmediata: { bg: 'rgba(34,197,94,0.12)', fg: 'var(--green)' },
  exclusiva: { bg: 'rgba(240,235,224,0.12)', fg: 'var(--cream-2)' },
  entregado: { bg: 'rgba(34,197,94,0.10)', fg: 'var(--green)' },
};

const fmtMXN = (v) => {
  if (!v || v === 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  return `$${(v / 1_000).toFixed(0)}K`;
};

const ALL_STAGES = ['todos', 'preventa', 'en_construccion', 'entrega_inmediata', 'exclusiva', 'entregado'];
const SORT_OPTIONS = [
  { value: 'nombre', label: 'Nombre A-Z' },
  { value: 'fecha', label: 'Fecha creación' },
  { value: 'pct_vendido', label: '% Vendido' },
  { value: 'revenue', label: 'Ingresos MTD' },
];

const PAGE_SIZE = 20;

// ─── Project Card ────────────────────────────────────────────────────────────
function ProjectCard({ project, onClick }) {
  const stage = project.stage || 'preventa';
  const stageColor = STAGE_COLORS[stage] || STAGE_COLORS.preventa;
  const total = Math.max(1, project.units_total || 1);
  const by = project.units_by_status || {};
  const sold = (by.vendido || 0) + (by.reservado || 0);
  const pctVendido = Math.round((sold / total) * 100);
  const disponibles = by.disponible || 0;

  return (
    <article
      data-testid={`project-card-${project.id}`}
      onClick={onClick}
      style={{
        background: 'rgba(240,235,224,0.04)',
        border: '1px solid rgba(240,235,224,0.12)',
        borderRadius: 12,
        cursor: 'pointer',
        overflow: 'hidden',
        transition: 'border-color 0.18s, transform 0.18s',
        display: 'flex',
        flexDirection: 'column',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'rgba(240,235,224,0.28)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'rgba(240,235,224,0.12)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Hero image */}
      <div style={{ height: 130, position: 'relative', background: 'rgba(6,8,15,0.6)', flexShrink: 0 }}>
        {project.cover_photo ? (
          <img
            src={project.cover_photo}
            alt={project.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'linear-gradient(135deg, rgba(6,8,15,0.9) 0%, rgba(240,235,224,0.06) 100%)',
          }}>
            <Building size={36} color="rgba(240,235,224,0.18)" />
          </div>
        )}
        {/* Stage badge */}
        <span style={{
          position: 'absolute', top: 10, left: 10,
          background: stageColor.bg, color: stageColor.fg,
          fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
          padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase',
          backdropFilter: 'blur(6px)', border: `1px solid ${stageColor.fg}30`,
        }}>
          {STAGE_LABELS[stage] || stage}
        </span>
        {/* Diagnostic warning badge */}
        {(project.health_score || 0) < 70 && (project.health_score || 0) > 0 && (
          <span
            data-testid={`diagnostic-badge-${project.id}`}
            title="Salud del proyecto requiere atención"
            style={{
              position: 'absolute', bottom: 8, left: 10,
              background: 'rgba(245,158,11,0.15)',
              border: '1px solid rgba(245,158,11,0.35)',
              color: '#fcd34d',
              fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
              padding: '2px 7px', borderRadius: 4,
              backdropFilter: 'blur(6px)',
            }}
          >
            ATENCIÓN
          </span>
        )}
        {/* Health Score */}
        <div style={{ position: 'absolute', top: 8, right: 8 }}>
          <HealthScore score={project.health_score || 0} size="sm" />
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif', lineHeight: 1.3 }}>
            {project.name}
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--cream-3)' }}>
            {project.colonia}
          </p>
        </div>

        {/* Progress bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--cream-3)' }}>Vendido</span>
            <span style={{ fontSize: 11, color: 'var(--cream-2)', fontWeight: 600 }}>{pctVendido}%</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'rgba(240,235,224,0.1)' }}>
            <div style={{
              height: '100%', borderRadius: 2, width: `${pctVendido}%`,
              background: 'linear-gradient(90deg, var(--gradient-from,#06080F), var(--cream))',
              transition: 'width 0.5s',
            }} />
          </div>
        </div>

        {/* Stats strip */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <StatPill icon={<Building size={12} />} label="Vendidas/Total" value={`${sold}/${total}`} />
          <StatPill icon={<Users size={12} />} label="Leads 30d" value={project.leads_30d || project.leads_active || 0} />
          <StatPill icon={<TrendUp size={12} />} label="Conversión" value={`${Math.round(project.conversion_pct || 0)}%`} />
          <StatPill icon={<BarChart size={12} />} label="Días listado" value={project.days_listed || '—'} />
        </div>

        {/* Weekly sales sparkline */}
        {project.weekly_sales && project.weekly_sales.some(v => v > 0) && (
          <div style={{ borderTop: '1px solid rgba(240,235,224,0.08)', paddingTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 9, color: 'var(--cream-3)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4 }}>
                  Ventas · últimas 8 semanas
                </div>
                <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 700 }}>
                  +{project.weekly_sales[project.weekly_sales.length - 1]} esta semana
                </div>
              </div>
              <MiniSparkline data={project.weekly_sales} color="#22c55e" width={80} height={28} />
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function StatPill({ icon, label, value }) {
  return (
    <div style={{
      background: 'rgba(240,235,224,0.04)',
      borderRadius: 8, padding: '6px 10px',
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--cream-3)' }}>
        {icon}
        <span style={{ fontSize: 10 }}>{label}</span>
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>{value}</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MisProyectos({ user, onLogout }) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState('todos');
  const [sort, setSort] = useState('nombre');
  const [viewMode, setViewMode] = useState('cards');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listProjectsWithStats();
      setProjects(data || []);
    } catch (e) {
      console.error('Error loading projects:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filter
  const filtered = projects.filter(p =>
    stageFilter === 'todos' || p.stage === stageFilter
  );

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'nombre') return a.name.localeCompare(b.name);
    if (sort === 'pct_vendido') {
      const aV = ((a.units_by_status?.vendido || 0) + (a.units_by_status?.reservado || 0)) / Math.max(1, a.units_total || 1);
      const bV = ((b.units_by_status?.vendido || 0) + (b.units_by_status?.reservado || 0)) / Math.max(1, b.units_total || 1);
      return bV - aV;
    }
    if (sort === 'revenue') return (b.revenue_mtd_est || 0) - (a.revenue_mtd_est || 0);
    return 0;
  });

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const stageCounts = {};
  ALL_STAGES.forEach(s => {
    stageCounts[s] = s === 'todos' ? projects.length : projects.filter(p => p.stage === s).length;
  });

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 4px 48px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
              Mis Proyectos
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--cream-3)' }}>
              {loading ? 'Cargando…' : `${projects.length} proyecto${projects.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            data-testid="nuevo-proyecto-btn"
            onClick={() => navigate('/desarrollador/proyectos/nuevo')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--cream)', color: 'var(--navy)',
              border: 'none', borderRadius: 8, padding: '8px 16px',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'DM Sans,sans-serif',
            }}
          >
            <Plus size={15} /> Nuevo proyecto
          </button>
        </div>

        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Stage chips */}
          <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
            {ALL_STAGES.filter(s => stageCounts[s] > 0 || s === 'todos').map(s => (
              <button
                key={s}
                data-testid={`stage-filter-${s}`}
                onClick={() => { setStageFilter(s); setPage(1); }}
                style={{
                  background: stageFilter === s ? 'var(--cream)' : 'rgba(240,235,224,0.06)',
                  color: stageFilter === s ? 'var(--navy)' : 'var(--cream-2)',
                  border: stageFilter === s ? 'none' : '1px solid rgba(240,235,224,0.14)',
                  borderRadius: 20, padding: '5px 12px',
                  fontSize: 12, fontWeight: stageFilter === s ? 700 : 400,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {s === 'todos' ? 'Todos' : STAGE_LABELS[s] || s}
                <span style={{ marginLeft: 5, opacity: 0.7 }}>{stageCounts[s]}</span>
              </button>
            ))}
          </div>

          {/* Sort */}
          <select
            data-testid="sort-select"
            value={sort}
            onChange={e => setSort(e.target.value)}
            style={{
              background: 'rgba(240,235,224,0.06)', color: 'var(--cream)',
              border: '1px solid rgba(240,235,224,0.14)', borderRadius: 8,
              padding: '5px 10px', fontSize: 12, cursor: 'pointer',
            }}
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value} style={{ background: 'var(--navy)' }}>{o.label}</option>)}
          </select>

          {/* View toggle */}
          <div style={{ display: 'flex', background: 'rgba(240,235,224,0.06)', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(240,235,224,0.14)' }}>
            {['cards', 'lista'].map(m => (
              <button
                key={m}
                data-testid={`view-${m}`}
                onClick={() => setViewMode(m)}
                style={{
                  background: viewMode === m ? 'rgba(240,235,224,0.14)' : 'transparent',
                  color: viewMode === m ? 'var(--cream)' : 'var(--cream-3)',
                  border: 'none', padding: '5px 12px', fontSize: 12, cursor: 'pointer',
                  fontFamily: 'DM Sans,sans-serif',
                }}
              >
                {m === 'cards' ? 'Tarjetas' : 'Lista'}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <LoadingSkeleton viewMode={viewMode} />
        ) : paged.length === 0 ? (
          <EmptyState stageFilter={stageFilter} />
        ) : viewMode === 'cards' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 18 }}>
            {paged.map(p => (
              <ProjectCard
                key={p.id}
                project={p}
                onClick={() => navigate(`/desarrollador/proyectos/${p.id}`)}
              />
            ))}
          </div>
        ) : (
          <ListaView projects={paged} onSelect={id => navigate(`/desarrollador/proyectos/${id}`)} />
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 28 }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={paginationBtnStyle(page === 1)}
            >
              Anterior
            </button>
            <span style={{ fontSize: 13, color: 'var(--cream-2)' }}>
              {page} / {totalPages} &nbsp;·&nbsp; {sorted.length} proyectos
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={paginationBtnStyle(page === totalPages)}
            >
              Siguiente
            </button>
          </div>
        )}
      </div>
    </DeveloperLayout>
  );
}

const paginationBtnStyle = (disabled) => ({
  background: disabled ? 'rgba(240,235,224,0.04)' : 'rgba(240,235,224,0.10)',
  color: disabled ? 'var(--cream-4)' : 'var(--cream)',
  border: '1px solid rgba(240,235,224,0.14)',
  borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: disabled ? 'default' : 'pointer',
});

function EmptyState({ stageFilter }) {
  return (
    <div style={{ textAlign: 'center', padding: '64px 24px' }}>
      <Building size={48} color="rgba(240,235,224,0.15)" style={{ marginBottom: 16 }} />
      <h3 style={{ margin: '0 0 8px', fontSize: 18, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
        {stageFilter !== 'todos' ? `No hay proyectos en "${STAGE_LABELS[stageFilter] || stageFilter}"` : 'No tienes proyectos aún'}
      </h3>
      <p style={{ margin: 0, color: 'var(--cream-3)', fontSize: 13 }}>
        Sube tu primer proyecto para comenzar a gestionar inventario, leads y reportes.
      </p>
    </div>
  );
}

function LoadingSkeleton({ viewMode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 18 }}>
      {[...Array(8)].map((_, i) => (
        <div key={i} style={{
          height: 280, borderRadius: 12,
          background: 'rgba(240,235,224,0.04)',
          border: '1px solid rgba(240,235,224,0.08)',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      ))}
    </div>
  );
}

function ListaView({ projects, onSelect }) {
  return (
    <div style={{ border: '1px solid rgba(240,235,224,0.12)', borderRadius: 10, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'rgba(240,235,224,0.06)' }}>
            {['Proyecto', 'Etapa', 'Vendido', 'Disponibles', 'Leads', 'Revenue MTD', 'Salud'].map(h => (
              <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--cream-3)', borderBottom: '1px solid rgba(240,235,224,0.1)' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {projects.map((p, i) => {
            const total = Math.max(1, p.units_total || 1);
            const by = p.units_by_status || {};
            const sold = (by.vendido || 0) + (by.reservado || 0);
            const pct = Math.round((sold / total) * 100);
            return (
              <tr
                key={p.id}
                onClick={() => onSelect(p.id)}
                style={{
                  cursor: 'pointer',
                  borderBottom: i < projects.length - 1 ? '1px solid rgba(240,235,224,0.07)' : 'none',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(240,235,224,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)' }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>{p.colonia}</div>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ fontSize: 11, color: STAGE_COLORS[p.stage]?.fg || 'var(--cream-2)' }}>
                    {STAGE_LABELS[p.stage] || p.stage}
                  </span>
                </td>
                <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--cream-2)', fontWeight: 600 }}>{pct}%</td>
                <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--cream-2)' }}>{by.disponible || 0}</td>
                <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--cream-2)' }}>{p.leads_active || 0}</td>
                <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>{fmtMXN(p.revenue_mtd_est)}</td>
                <td style={{ padding: '10px 14px' }}>
                  <HealthScore score={p.health_score || 0} size="sm" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
