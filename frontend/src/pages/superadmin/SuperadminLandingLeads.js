// W4.2D3.5 — Superadmin Landing Leads Dashboard
// Tabla + filtros + CSV export para leads capturados desde landing pages SEO.
import React, { useEffect, useState } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card, Empty } from '../../components/advisor/primitives';
import {
  getLandingLeadsSummary,
  getLandingLeadsByZone,
  getLandingLeads,
  downloadLandingLeadsCsv,
} from '../../api/superadminLandingLeads';

const PAGE_TYPE_OPTIONS = [
  { id: '', label: 'Todos' },
  { id: 'colonia', label: 'Colonia' },
  { id: 'alcaldia', label: 'Alcaldía' },
  { id: 'intent', label: 'Intent CDMX' },
];

function fmtDateMx(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return String(iso).slice(0, 16);
  }
}

function fmtDateShort(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: '2-digit',
    });
  } catch {
    return String(iso).slice(0, 10);
  }
}

function pageTypeBadge(type) {
  const colors = {
    colonia: { bg: 'rgba(var(--theme-rgb),0.14)', bd: 'rgba(var(--theme-rgb),0.40)', fg: 'var(--theme)' },
    alcaldia: { bg: 'rgba(34,197,94,0.14)', bd: 'rgba(34,197,94,0.40)', fg: '#86efac' },
    intent: { bg: 'rgba(var(--theme-rgb),0.14)', bd: 'rgba(var(--theme-rgb),0.40)', fg: '#f9a8d4' },
  };
  const c = colors[type] || { bg: 'rgba(255,255,255,0.05)', bd: 'rgba(255,255,255,0.18)', fg: 'var(--cream-2)' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 9px', borderRadius: 9999,
      background: c.bg, border: `1px solid ${c.bd}`, color: c.fg,
      fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700,
      textTransform: 'capitalize',
    }}>
      {type}
    </span>
  );
}

export default function SuperadminLandingLeads({ embedded }) {
  const [tab, setTab] = useState('by-zone'); // by-zone | list
  const [summary, setSummary] = useState(null);
  const [byZone, setByZone] = useState([]);
  const [list, setList] = useState([]);
  const [filters, setFilters] = useState({ zone_interest: '', page_type: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadSummary = async () => {
    try {
      const s = await getLandingLeadsSummary();
      setSummary(s);
    } catch (e) {
      setError(e.message);
    }
  };

  const loadByZone = async () => {
    setLoading(true);
    try {
      const r = await getLandingLeadsByZone();
      setByZone(r.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadList = async () => {
    setLoading(true);
    try {
      const params = { limit: 200 };
      if (filters.zone_interest) params.zone_interest = filters.zone_interest;
      if (filters.page_type) params.page_type = filters.page_type;
      const r = await getLandingLeads(params);
      setList(r.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
    if (tab === 'by-zone') loadByZone();
    if (tab === 'list') loadList();
    // eslint-disable-next-line
  }, [tab, filters.zone_interest, filters.page_type]);

  return (
    <SuperadminLayout bare={embedded}>
      <PageHeader
        eyebrow="W4.2D3.5 · Programmatic SEO"
        title="Leads landing"
        sub="Suscriptores capturados desde landing pages SEO sin inventario propio. Datos para priorizar onboarding tier 2."
      />

      {/* W4.6 Y.3E — Nurture Intelligent active badge */}
      <NurtureIntelligentGlobalBadge />

      {/* KPI strip */}
      <div data-testid="landing-leads-kpi-strip" style={{
        display: 'grid', gap: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        marginBottom: 18,
      }}>
        <Kpi label="Total leads" value={summary?.total ?? '—'} tone="brand" testid="kpi-total" />
        <Kpi label="Últimos 7 días" value={summary?.last_7d ?? '—'} tone="ok" testid="kpi-7d" />
        <Kpi label="Zonas únicas" value={summary?.unique_zones ?? '—'} tone="warn" testid="kpi-zones" />
        <Kpi
          label="Top zona"
          value={summary?.top_zone ? `${summary.top_zone.zone_slug} · ${summary.top_zone.lead_count}` : '—'}
          tone="bad"
          testid="kpi-top-zone"
        />
      </div>

      {/* Tab toggle + Export CSV */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
          <div style={{ display: 'inline-flex', gap: 6 }}>
            <TabBtn label="Por zona" active={tab === 'by-zone'} onClick={() => setTab('by-zone')} testid="landing-leads-tab-by-zone" />
            <TabBtn label="Lista completa" active={tab === 'list'} onClick={() => setTab('list')} testid="landing-leads-tab-list" />
          </div>
          <button
            data-testid="landing-leads-export-csv"
            onClick={() => downloadLandingLeadsCsv(filters)}
            style={{
              padding: '8px 18px', borderRadius: 9999,
              background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))',
              border: 'none', color: '#fff', cursor: 'pointer',
              fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
            }}
          >
            Export CSV
          </button>
        </div>
      </Card>

      {/* Filters (only for list tab) */}
      {tab === 'list' && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
            <FilterRow
              label="Tipo"
              testid="landing-leads-filter-page-type"
              options={PAGE_TYPE_OPTIONS}
              value={filters.page_type}
              onChange={(v) => setFilters({ ...filters, page_type: v })}
            />
            <input
              data-testid="landing-leads-filter-zone"
              value={filters.zone_interest}
              onChange={e => setFilters({ ...filters, zone_interest: e.target.value.toLowerCase() })}
              placeholder="zone_interest (zone-polanco, alcaldia-iztapalapa…)"
              style={{
                padding: '7px 14px', borderRadius: 9999,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
                color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5,
                minWidth: 280, flex: '1 1 280px',
              }}
            />
          </div>
        </Card>
      )}

      {/* Content */}
      {error && (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 13 }}>
            Error: {error}
          </div>
        </Card>
      )}

      {loading ? (
        <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', padding: 24 }}>
          Cargando…
        </div>
      ) : tab === 'by-zone' ? (
        byZone.length === 0 ? (
          <Empty
            title="Aún no hay leads"
            sub="Cuando alguien envíe el formulario en una landing page SEO, aparecerá aquí agrupado por zona."
          />
        ) : (
          <ByZoneTable rows={byZone} onClickRow={(zi) => {
            setFilters({ zone_interest: zi, page_type: '' });
            setTab('list');
          }} />
        )
      ) : (
        list.length === 0 ? (
          <Empty
            title="Sin leads con esos filtros"
            sub="Ajusta los filtros o cambia a la pestaña 'Por zona' para ver agregados."
          />
        ) : (
          <ListTable rows={list} />
        )
      )}
    </SuperadminLayout>
  );
}

// ── ByZone aggregated table ─────────────────────────────────────────────────
function ByZoneTable({ rows, onClickRow }) {
  return (
    <div data-testid="landing-leads-by-zone-table" style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <Th>Zona</Th>
            <Th>Tipo</Th>
            <Th align="right">Leads</Th>
            <Th>Último lead</Th>
            <Th>Primer lead</Th>
            <Th></Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr
              key={r.zone_interest}
              data-testid={`landing-leads-zone-row-${r.zone_slug}`}
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
            >
              <Td>
                <div style={{ fontFamily: 'DM Sans', fontSize: 13.5, fontWeight: 700, color: 'var(--cream)' }}>
                  {r.zone_slug}
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--cream-3)' }}>
                  {r.zone_interest}
                </div>
              </Td>
              <Td>{pageTypeBadge(r.page_type)}</Td>
              <Td align="right">
                <span style={{
                  fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--theme)',
                }}>{r.lead_count}</span>
              </Td>
              <Td>{fmtDateShort(r.last_lead_at)}</Td>
              <Td>{fmtDateShort(r.first_lead_at)}</Td>
              <Td align="right">
                <button
                  data-testid={`landing-leads-view-${r.zone_slug}`}
                  onClick={() => onClickRow(r.zone_interest)}
                  style={{
                    padding: '5px 14px', borderRadius: 9999,
                    background: 'rgba(var(--theme-rgb),0.14)',
                    border: '1px solid rgba(var(--theme-rgb),0.40)',
                    color: 'var(--theme)', cursor: 'pointer',
                    fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 700,
                  }}
                >
                  Ver leads
                </button>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── List full table ─────────────────────────────────────────────────────────
function ListTable({ rows }) {
  return (
    <div data-testid="landing-leads-list-table" style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <Th>Email</Th>
            <Th>Zona</Th>
            <Th>Tipo</Th>
            <Th>Notas</Th>
            <Th>Fecha</Th>
            <Th>Notificado</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr
              key={r.lead_id}
              data-testid={`landing-leads-row-${r.lead_id}`}
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
            >
              <Td>
                <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)' }}>{r.email}</div>
              </Td>
              <Td>
                <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)' }}>{r.zone_slug}</div>
                <div style={{ fontFamily: 'monospace', fontSize: 10.5, color: 'var(--cream-3)' }}>{r.zone_interest}</div>
              </Td>
              <Td>{pageTypeBadge(r.page_type)}</Td>
              <Td>
                <div style={{
                  fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)',
                  maxWidth: 280, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }} title={r.notes}>
                  {r.notes || '—'}
                </div>
              </Td>
              <Td>{fmtDateMx(r.created_at)}</Td>
              <Td>
                {r.last_nurture_sent_at ? (
                  <span style={{
                    fontFamily: 'DM Sans', fontSize: 11, color: '#86efac',
                    padding: '2px 9px', borderRadius: 9999,
                    background: 'rgba(34,197,94,0.10)',
                    border: '1px solid rgba(34,197,94,0.30)',
                  }}>{fmtDateShort(r.last_nurture_sent_at)}</span>
                ) : (
                  <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>Pendiente</span>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const tableStyle = {
  width: '100%', borderCollapse: 'collapse',
  fontFamily: 'DM Sans', fontSize: 13,
};

function Th({ children, align = 'left' }) {
  return (
    <th style={{
      textAlign: align,
      padding: '10px 12px',
      fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11,
      color: 'var(--cream-3)',
      textTransform: 'uppercase', letterSpacing: '0.08em',
      borderBottom: '1px solid rgba(255,255,255,0.10)',
    }}>{children}</th>
  );
}

function Td({ children, align = 'left' }) {
  return (
    <td style={{
      padding: '12px',
      textAlign: align,
      verticalAlign: 'middle',
      color: 'var(--cream)',
    }}>{children}</td>
  );
}

function TabBtn({ label, active, onClick, testid }) {
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      style={{
        padding: '7px 18px', borderRadius: 9999,
        background: active ? 'rgba(var(--theme-rgb),0.18)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? 'rgba(var(--theme-rgb),0.42)' : 'rgba(255,255,255,0.10)'}`,
        color: active ? 'var(--theme)' : 'var(--cream)',
        cursor: 'pointer',
        fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 700,
      }}
    >
      {label}
    </button>
  );
}

function Kpi({ label, value, tone, testid }) {
  const colors = {
    bad: { bg: 'rgba(239,68,68,0.10)', bd: 'rgba(239,68,68,0.34)', fg: '#fca5a5' },
    warn: { bg: 'rgba(245,158,11,0.10)', bd: 'rgba(245,158,11,0.34)', fg: '#fcd34d' },
    ok: { bg: 'rgba(16,185,129,0.10)', bd: 'rgba(16,185,129,0.34)', fg: '#86efac' },
    brand: { bg: 'rgba(var(--theme-rgb),0.10)', bd: 'rgba(var(--theme-rgb),0.34)', fg: 'var(--theme)' },
  }[tone] || {};
  return (
    <div data-testid={testid} style={{
      background: colors.bg, border: `1px solid ${colors.bd}`,
      borderRadius: 14, padding: '14px 16px',
    }}>
      <div style={{
        fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>{label}</div>
      <div style={{
        fontFamily: 'Outfit', fontWeight: 800,
        fontSize: typeof value === 'string' && value.length > 12 ? 18 : 24,
        color: colors.fg, marginTop: 6, wordBreak: 'break-word',
      }}>{value}</div>
    </div>
  );
}

function FilterRow({ label, options, value, onChange, testid }) {
  return (
    <div style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      <span style={{
        fontFamily: 'DM Sans', color: 'var(--cream-3)', fontSize: 11,
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>{label}</span>
      {options.map(o => (
        <button
          key={String(o.id) || 'all'}
          data-testid={`${testid}-${o.id || 'all'}`}
          onClick={() => onChange(o.id)}
          style={{
            padding: '5px 12px', borderRadius: 9999,
            background: value === o.id ? 'rgba(var(--theme-rgb),0.18)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${value === o.id ? 'rgba(var(--theme-rgb),0.42)' : 'rgba(255,255,255,0.10)'}`,
            color: 'var(--cream)', cursor: 'pointer',
            fontFamily: 'DM Sans', fontSize: 11.5,
          }}
        >{o.label}</button>
      ))}
    </div>
  );
}


// W4.6 Y.3E — badge global indicando si alguna org tiene Nurture Intelligent activo
function NurtureIntelligentGlobalBadge() {
  const [activeOrgs, setActiveOrgs] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const API = process.env.REACT_APP_BACKEND_URL;
        const r = await fetch(`${API}/api/superadmin/phase-y/settings-overview`, { credentials: 'include' });
        if (!r.ok) return;
        const data = await r.json();
        if (cancelled) return;
        const orgs = (data?.orgs || []).filter(
          (o) => (o?.feature_tiers?.nurture_intelligent || 'off') !== 'off',
        );
        setActiveOrgs(orgs.length);
      } catch {
        // silent fail · badge oculto
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!activeOrgs) return null;

  return (
    <div
      data-testid="nurture-intelligent-active-badge"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 12px', borderRadius: 9999,
        background: 'linear-gradient(90deg, rgba(var(--theme-rgb),0.18), rgba(var(--theme-rgb),0.14))',
        border: '1px solid rgba(var(--theme-rgb),0.4)',
        color: 'var(--theme-2)',
        fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 700,
        marginBottom: 14,
      }}
    >
      Nurture Intelligent activo · {activeOrgs} {activeOrgs === 1 ? 'org' : 'orgs'}
    </div>
  );
}
