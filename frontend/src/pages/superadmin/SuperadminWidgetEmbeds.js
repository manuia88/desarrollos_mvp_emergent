// W5.25 · SuperadminWidgetEmbeds — Widget Embed Analytics dashboard.
// Ruta: /superadmin/widget-embeds · superadmin only · sección Operación (naranja).
// Cero hex hardcoded · usa var(--theme*) / var(--cream*) / var(--border).
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card, Toast } from '../../components/advisor/primitives';
import { RefreshCw, ExternalLink, Filter } from 'lucide-react';
import { getEmbedStats } from '../../api/widget_embed_analytics';

const WIDGET_TYPE_FILTERS = [
  { key: '', labelKey: 'filter_all' },
  { key: 'avm', labelKey: 'filter_avm' },
  { key: 'score', labelKey: 'filter_score' },
  { key: 'risk', labelKey: 'filter_risk' },
  { key: 'notaria_title', labelKey: 'filter_notaria_title' },
  { key: 'investor_yield', labelKey: 'filter_investor_yield' },
  { key: 'bank_avm', labelKey: 'filter_bank_avm' },
  { key: 'insurance_risk', labelKey: 'filter_insurance_risk' },
];

const DAYS_FILTERS = [7, 30, 90];

function pillStyle(active) {
  return {
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 11,
    fontFamily: 'DM Sans',
    fontWeight: 600,
    cursor: 'pointer',
    background: active ? 'rgba(var(--theme-rgb), 0.22)' : 'rgba(255,255,255,0.04)',
    border: active ? '1px solid rgba(var(--theme-rgb), 0.45)' : '1px solid var(--border)',
    color: active ? 'var(--theme-2)' : 'var(--cream-2)',
    transition: 'all 0.15s',
  };
}

const thStyle = {
  padding: '8px 12px',
  fontSize: 10,
  color: 'var(--cream-3)',
  textTransform: 'uppercase',
  fontWeight: 700,
  letterSpacing: '0.04em',
  borderBottom: '1px solid var(--border)',
  textAlign: 'left',
  fontFamily: 'DM Sans',
};

const tdStyle = {
  padding: '10px 12px',
  fontSize: 12,
  color: 'var(--cream)',
  borderBottom: '1px solid var(--border)',
  fontFamily: 'DM Sans',
};

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function SuperadminWidgetEmbeds({ embedded }) {
  const { t } = useTranslation();
  const tt = (k, opts) => t(`widget_embeds.${k}`, opts);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [widgetType, setWidgetType] = useState('');
  const [days, setDays] = useState(30);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getEmbedStats({ widget_type: widgetType, days, limit: 200, skip: 0 })
      .then(d => {
        if (cancelled) return;
        setItems(d.items || []);
        setLoading(false);
      })
      .catch(e => {
        if (cancelled) return;
        setToast({ kind: 'error', text: e.message || tt('toast.error_generic') });
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [widgetType, days, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const totalEmbeds = items.reduce((acc, r) => acc + (r.total_embeds || 0), 0);
    const domains = new Set(items.map(r => r.hostname));
    const topWidget = (() => {
      const sums = {};
      for (const r of items) {
        sums[r.widget_type] = (sums[r.widget_type] || 0) + (r.total_embeds || 0);
      }
      const sorted = Object.entries(sums).sort((a, b) => b[1] - a[1]);
      return sorted.length > 0 ? sorted[0][0] : '—';
    })();
    return {
      totalDomains: domains.size,
      totalEmbeds,
      topWidget,
    };
  }, [items]);

  function openHostname(hostname) {
    if (!hostname) return;
    const url = hostname.startsWith('http') ? hostname : `https://${hostname}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <SuperadminLayout bare={embedded}>
      <PageHeader
        eyebrow={tt('eyebrow')}
        title={tt('title')}
        sub={tt('sub')}
      />

      {/* Toolbar · widget_type + days filters */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 12,
        marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Filter size={12} style={{ color: 'var(--cream-3)' }} />
          <span style={{ fontSize: 11, color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>
            {tt('toolbar.widget_type')}:
          </span>
          {WIDGET_TYPE_FILTERS.map(f => (
            <button
              key={f.key || '__all'}
              data-testid={`filter-widget-${f.key || 'all'}`}
              onClick={() => setWidgetType(f.key)}
              style={pillStyle(widgetType === f.key)}
            >
              {tt(`toolbar.${f.labelKey}`)}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>
            {tt('toolbar.days')}:
          </span>
          {DAYS_FILTERS.map(d => (
            <button
              key={d}
              data-testid={`filter-days-${d}`}
              onClick={() => setDays(d)}
              style={pillStyle(days === d)}
            >
              {d}d
            </button>
          ))}
        </div>

        <div style={{ marginLeft: 'auto' }}>
          <button
            data-testid="refresh-btn"
            onClick={() => setRefreshKey(k => k + 1)}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--cream-2)',
              fontFamily: 'DM Sans',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <RefreshCw size={13} />
            {tt('toolbar.refresh')}
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 32, padding: '12px 16px', fontFamily: 'DM Sans', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--cream-3)', textTransform: 'uppercase' }}>
              {tt('kpi.total_domains')}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--cream)' }}>{stats.totalDomains}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--cream-3)', textTransform: 'uppercase' }}>
              {tt('kpi.total_embeds')}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--cream)' }}>{stats.totalEmbeds}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--cream-3)', textTransform: 'uppercase' }}>
              {tt('kpi.top_widget')}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--theme-2)' }}>{stats.topWidget}</div>
          </div>
        </div>
      </Card>

      {/* Tabla principal */}
      <Card>
        <div style={{ padding: 4 }}>
          {loading ? (
            <div style={{ padding: 28, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
              {tt('table.loading')}
            </div>
          ) : items.length === 0 ? (
            <div data-testid="empty-state" style={{ padding: 28, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
              {tt('table.empty')}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table data-testid="embed-stats-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>{tt('table.col_hostname')}</th>
                    <th style={thStyle}>{tt('table.col_widget_type')}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{tt('table.col_total_embeds')}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{tt('table.col_slugs_count')}</th>
                    <th style={thStyle}>{tt('table.col_last_seen')}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{tt('table.col_action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, i) => (
                    <tr key={`${row.hostname}-${row.widget_type}-${i}`}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{row.hostname}</td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 700,
                          background: 'rgba(var(--theme-rgb), 0.14)',
                          border: '1px solid rgba(var(--theme-rgb), 0.35)',
                          color: 'var(--theme-2)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          whiteSpace: 'nowrap',
                        }}>
                          {row.widget_type}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: 'var(--theme-2)' }}>
                        {row.total_embeds}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{row.slugs_count}</td>
                      <td style={{ ...tdStyle, color: 'var(--cream-2)' }}>{formatDate(row.last_seen)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <button
                          data-testid={`investigate-${i}`}
                          onClick={() => openHostname(row.hostname)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 6,
                            background: 'transparent',
                            border: '1px solid var(--border)',
                            color: 'var(--cream-2)',
                            fontFamily: 'DM Sans',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <ExternalLink size={11} />
                          {tt('table.btn_investigate')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          fontFamily: 'DM Sans',
          fontSize: 11,
          color: 'var(--cream-3)',
        }}>
          <div>
            {tt('table.footer_count', { count: items.length })}
          </div>
        </div>
      </Card>

      {toast && (
        <Toast
          kind={toast.kind}
          text={toast.text}
          onClose={() => setToast(null)}
        />
      )}
    </SuperadminLayout>
  );
}
