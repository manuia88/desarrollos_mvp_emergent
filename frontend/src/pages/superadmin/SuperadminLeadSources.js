/**
 * W5.ASR.5 Parte 2 — SuperadminLeadSources
 * Ruta: /superadmin/lead-sources
 * Panel de estadísticas de captura automática de leads para superadmin.
 */
import React, { useEffect, useState } from 'react';
import SuperadminLayout from "../../components/superadmin/SuperadminLayout";
import { PageHeader, Card, Empty } from '../../components/advisor/primitives';
import { getSourcesStats } from '../../api/lead_capture';
import { TrendingUp, Mail, Building2, Megaphone, Globe, AlertTriangle } from 'lucide-react';

const SOURCE_LABELS = {
  email_alias:        'Email Alias',
  portal_inmuebles24: 'Inmuebles24',
  portal_lamudi:      'Lamudi',
  fb_lead_ads:        'FB Lead Ads',
  landing:            'Landing',
  manual:             'Manual',
};

const SOURCE_COLORS = {
  email_alias:        'var(--theme-2)',
  portal_inmuebles24: '#fda4af',
  portal_lamudi:      '#fcd34d',
  fb_lead_ads:        '#93c5fd',
  landing:            '#86efac',
  manual:             '#94a3b8',
};

const DAYS_OPTIONS = [7, 30, 90];

function KpiCard({ label, value, sub, icon: Icon, color = 'var(--cream)' }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '16px 20px', flex: '1 1 160px', minWidth: 140,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {Icon && <Icon size={14} color={color} />}
        <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      </div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color, marginBottom: 2 }}>{value}</div>
      {sub && <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{sub}</div>}
    </div>
  );
}

function DonutBar({ by_source = {} }) {
  const total = Object.values(by_source).reduce((a, b) => a + b, 0);
  if (!total) return <div style={{ color: 'var(--cream-3)', fontSize: 13, padding: 16 }}>Sin datos de fuentes</div>;

  return (
    <div>
      <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
        {Object.entries(by_source).map(([src, count]) => (
          <div key={src}
            title={`${SOURCE_LABELS[src] || src}: ${count}`}
            style={{
              width: `${(count / total) * 100}%`,
              background: SOURCE_COLORS[src] || '#555',
              transition: 'width 0.4s',
            }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
        {Object.entries(by_source).map(([src, count]) => (
          <div key={src} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: SOURCE_COLORS[src] || '#555' }} />
            <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-2)' }}>
              {SOURCE_LABELS[src] || src}
            </span>
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-3)' }}>
              {count} ({Math.round((count / total) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SuperadminLeadSources({ user, onLogout, embedded }) {
  const [days, setDays]     = useState(30);
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await getSourcesStats(days);
      if (r.detail) { setError(r.detail); }
      else { setStats(r); }
    } catch { setError('Error al cargar estadísticas'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [days]); // eslint-disable-line

  return (
    <SuperadminLayout user={user} onLogout={onLogout} bare={embedded}>
      <PageHeader
        eyebrow="SUPERADMIN · LEAD SOURCES"
        title="Lead Sources"
        sub="Estadísticas de captura automática de leads por canal."
        actions={
          <div style={{ display: 'flex', gap: 6 }}>
            {DAYS_OPTIONS.map(d => (
              <button
                key={d}
                data-testid={`days-btn-${d}`}
                onClick={() => setDays(d)}
                style={{
                  padding: '6px 14px', borderRadius: 6, fontSize: 12,
                  fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer',
                  background: days === d ? 'rgba(var(--theme-rgb),0.22)' : 'rgba(255,255,255,0.04)',
                  border: days === d ? '1px solid rgba(var(--theme-rgb),0.45)' : '1px solid var(--border)',
                  color: days === d ? 'var(--theme-2)' : 'var(--cream-2)',
                  transition: 'all 0.15s',
                }}>
                {d}d
              </button>
            ))}
          </div>
        }
      />

      {loading && (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
          Cargando estadísticas…
        </div>
      )}

      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 10, color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 13,
        }}>
          <AlertTriangle size={15} />
          {error}
        </div>
      )}

      {!loading && stats && (
        <>
          {/* KPI strip */}
          <div data-testid="stats-kpi-strip" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <KpiCard
              label="Total eventos"
              value={stats.total_events}
              sub={`últimos ${days} días`}
              icon={TrendingUp}
              color="var(--theme-2)"
            />
            <KpiCard
              label="Leads capturados"
              value={stats.total_captured}
              sub="con datos extraídos"
              icon={Mail}
              color="#86efac"
            />
            <KpiCard
              label="Tasa de éxito"
              value={`${stats.success_rate}%`}
              sub="extracción exitosa"
              icon={TrendingUp}
              color={stats.success_rate >= 70 ? '#86efac' : stats.success_rate >= 40 ? '#fcd34d' : '#fca5a5'}
            />
          </div>

          {/* Sources donut */}
          <Card style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)', marginBottom: 14 }}>
              Distribucion por fuente
            </div>
            <DonutBar by_source={stats.by_source} />
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            {/* Top aliases */}
            <Card>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)', marginBottom: 12 }}>
                Top aliases de email
              </div>
              {(stats.top_aliases || []).length === 0 ? (
                <Empty title="Sin datos" sub="No hay capturas por alias en el periodo." />
              ) : (
                <table data-testid="top-aliases-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--cream-3)', fontWeight: 600 }}>Alias</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--cream-3)', fontWeight: 600 }}>Leads</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.top_aliases.map((a, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 10px', color: 'var(--theme-2)', fontFamily: 'DM Mono, monospace', fontSize: 10 }}>{a.alias}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--cream)', fontWeight: 700 }}>{a.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            {/* Top FB forms */}
            <Card>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)', marginBottom: 12 }}>
                Top FB Lead Ad forms
              </div>
              {(stats.top_fb_forms || []).length === 0 ? (
                <Empty title="Sin datos FB" sub="No hay capturas via FB Lead Ads en el periodo." />
              ) : (
                <table data-testid="top-fb-forms-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--cream-3)', fontWeight: 600 }}>Form ID</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--cream-3)', fontWeight: 600 }}>Leads</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.top_fb_forms.map((f, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 10px', color: '#93c5fd', fontFamily: 'DM Mono, monospace', fontSize: 10 }}>{f.form_id}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--cream)', fontWeight: 700 }}>{f.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          {/* Failures */}
          {Object.keys(stats.failures_by_reason || {}).length > 0 && (
            <Card>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)', marginBottom: 12 }}>
                Fallos por razon
              </div>
              <table data-testid="failures-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--cream-3)', fontWeight: 600 }}>Razon</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--cream-3)', fontWeight: 600 }}>Ocurrencias</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(stats.failures_by_reason).map(([reason, count]) => (
                    <tr key={reason} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 10px', color: '#fca5a5', fontFamily: 'DM Mono, monospace', fontSize: 10 }}>{reason}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--cream)', fontWeight: 700 }}>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </SuperadminLayout>
  );
}
