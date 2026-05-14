// F0.2·Sub-E — Free Audit Funnel (Superadmin)
// Métricas de conversión del Free Audit + listado reciente de submissions.
import React, { useEffect, useState } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card, Empty } from '../../components/advisor/primitives';

const API = process.env.REACT_APP_BACKEND_URL;

const PERIOD_OPTIONS = [
  { value: 7, label: '7 días' },
  { value: 30, label: '30 días' },
  { value: 90, label: '90 días' },
];

async function authFetch(path) {
  const token = localStorage.getItem('access_token') || localStorage.getItem('token');
  const res = await fetch(`${API}${path}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-MX', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return String(iso).slice(0, 16);
  }
}

function StatusBadge({ status }) {
  const map = {
    ready: { bg: 'rgba(34,197,94,0.14)', fg: '#86efac', bd: 'rgba(34,197,94,0.40)' },
    processing: { bg: 'rgba(var(--theme-rgb),0.14)', fg: 'var(--theme)', bd: 'rgba(var(--theme-rgb),0.40)' },
    failed: { bg: 'rgba(239,68,68,0.14)', fg: '#fca5a5', bd: 'rgba(239,68,68,0.40)' },
  };
  const c = map[status] || { bg: 'rgba(255,255,255,0.05)', fg: 'var(--cream-2)', bd: 'rgba(255,255,255,0.18)' };
  return (
    <span style={{
      padding: '2px 10px', borderRadius: 9999,
      background: c.bg, color: c.fg, border: `1px solid ${c.bd}`,
      fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, textTransform: 'capitalize',
    }}>{status || 'unknown'}</span>
  );
}

function StatCard({ label, value, sub, testId }) {
  return (
    <div
      data-testid={testId}
      style={{
        background: 'rgba(15,18,28,0.55)',
        border: '1px solid rgba(240,235,224,0.10)',
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div style={{
        fontFamily: 'DM Sans', fontSize: 10, letterSpacing: '0.10em',
        color: 'var(--cream-3, #a0a4b0)', textTransform: 'uppercase',
      }}>{label}</div>
      <div style={{
        fontFamily: 'Outfit', fontWeight: 800, fontSize: 26,
        color: 'var(--cream)', marginTop: 6,
      }}>{value}</div>
      {sub && (
        <div style={{
          fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3, #a0a4b0)', marginTop: 4,
        }}>{sub}</div>
      )}
    </div>
  );
}

export default function SuperadminFreeAuditFunnel({ user, onLogout }) {
  const [period, setPeriod] = useState(30);
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, r] = await Promise.all([
        authFetch(`/api/free-audit/admin/funnel-stats?period_days=${period}`),
        authFetch('/api/free-audit/admin/recent?limit=50'),
      ]);
      setStats(s);
      setRecent(r.items || []);
    } catch (e) {
      if (e.status === 403) {
        setError('Acceso restringido a superadmin.');
      } else if (e.status === 401) {
        window.location.href = '/?login=1&next=/superadmin/free-audit-funnel';
        return;
      } else {
        setError('No se pudo cargar el dashboard.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [period]);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="MARKETING · FUNNEL"
        title="Free Audit Funnel"
        subtitle="Conversión submission → PDF → email enviado · top colonias · UTMs."
      />

      <div data-testid="free-audit-funnel-page" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Period selector + Export CSV */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{
            fontFamily: 'DM Sans', fontSize: 11, letterSpacing: '0.08em',
            color: 'var(--cream-3, #a0a4b0)', textTransform: 'uppercase',
          }}>Periodo</span>
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              data-testid={`fa-funnel-period-${opt.value}`}
              type="button"
              onClick={() => setPeriod(opt.value)}
              style={{
                padding: '6px 14px', borderRadius: 9999,
                background: period === opt.value
                  ? 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))'
                  : 'transparent',
                border: period === opt.value
                  ? 'none'
                  : '1px solid rgba(240,235,224,0.20)',
                color: period === opt.value ? '#fff' : 'var(--cream)',
                fontFamily: 'Outfit', fontWeight: 700, fontSize: 11, letterSpacing: '0.08em',
                cursor: 'pointer',
              }}
            >
              {opt.label.toUpperCase()}
            </button>
          ))}
          <a
            href={`${API}/api/free-audit/admin/export.csv?period_days=${period}`}
            download={`free_audit_${period}d.csv`}
            data-testid="free-audit-export-csv-btn"
            title="Descarga submissions para CRM (Excel-friendly UTF-8 BOM)"
            style={{
              marginLeft: 'auto',
              padding: '8px 18px', borderRadius: 9999,
              background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))',
              color: '#fff', textDecoration: 'none',
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 11, letterSpacing: '0.1em',
              border: 'none',
            }}
          >
            EXPORTAR CSV
          </a>
        </div>

        {loading && (
          <Card>
            <div style={{ padding: 24, fontFamily: 'DM Sans', color: 'var(--cream-3)' }}>
              Cargando…
            </div>
          </Card>
        )}

        {error && (
          <Card>
            <div data-testid="fa-funnel-error" style={{
              padding: 24, fontFamily: 'DM Sans', color: '#fca5a5',
            }}>
              {error}
            </div>
          </Card>
        )}

        {!loading && !error && stats && (
          <>
            {/* KPI grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}>
              <StatCard
                testId="fa-stat-submitted"
                label="Submissions"
                value={stats.submitted ?? 0}
                sub={`En los últimos ${period} días`}
              />
              <StatCard
                testId="fa-stat-pdf"
                label="PDF generados"
                value={stats.pdf_ready ?? 0}
                sub={`${stats.pdf_conversion_pct ?? 0}% conversión`}
              />
              <StatCard
                testId="fa-stat-emails"
                label="Emails enviados"
                value={stats.emails_sent ?? 0}
                sub={`${stats.email_conversion_pct ?? 0}% conversión`}
              />
              <StatCard
                testId="fa-stat-avgtime"
                label="Tiempo medio PDF"
                value={`${stats.avg_pdf_gen_seconds ?? 0}s`}
                sub="submitted → ready"
              />
            </div>

            {/* Top colonias + UTM grids */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 12,
            }}>
              <Card title="Top colonias">
                {(stats.top_colonias || []).length === 0 ? (
                  <Empty title="Sin datos" />
                ) : (
                  <div data-testid="fa-top-colonias" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(stats.top_colonias || []).map((c, i) => (
                      <div key={c.slug} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 12px',
                        background: 'rgba(15,18,28,0.55)',
                        borderRadius: 10,
                      }}>
                        <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)' }}>
                          {i + 1}. {(c.slug || '—').replace(/-/g, ' ')}
                        </span>
                        <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--theme)' }}>
                          {c.count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="Top fuentes UTM">
                {(stats.top_utm_sources || []).length === 0 ? (
                  <Empty title="Sin datos" />
                ) : (
                  <div data-testid="fa-top-utm" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(stats.top_utm_sources || []).map((c) => (
                      <div key={c.source} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 12px',
                        background: 'rgba(15,18,28,0.55)',
                        borderRadius: 10,
                      }}>
                        <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)' }}>
                          {c.source || 'direct'}
                        </span>
                        <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: '#f9a8d4' }}>
                          {c.count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Recent submissions table */}
            <Card title="Últimas submissions">
              {recent.length === 0 ? (
                <Empty title="Sin submissions todavía" />
              ) : (
                <div data-testid="fa-recent-table" style={{ overflowX: 'auto' }}>
                  <table style={{
                    width: '100%', borderCollapse: 'collapse',
                    fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream)',
                  }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--cream-3, #a0a4b0)' }}>
                        <th style={{ padding: '8px 10px', fontWeight: 600 }}>Fecha</th>
                        <th style={{ padding: '8px 10px', fontWeight: 600 }}>Proyecto</th>
                        <th style={{ padding: '8px 10px', fontWeight: 600 }}>Colonia</th>
                        <th style={{ padding: '8px 10px', fontWeight: 600 }}>Email</th>
                        <th style={{ padding: '8px 10px', fontWeight: 600 }}>UTM</th>
                        <th style={{ padding: '8px 10px', fontWeight: 600 }}>Estado</th>
                        <th style={{ padding: '8px 10px', fontWeight: 600 }}>Email enviado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((r) => (
                        <tr key={r.audit_id} style={{ borderTop: '1px solid rgba(240,235,224,0.06)' }}>
                          <td style={{ padding: '8px 10px' }}>{fmtDate(r.submitted_at)}</td>
                          <td style={{ padding: '8px 10px' }}>{(r.project_name || '—').slice(0, 36)}</td>
                          <td style={{ padding: '8px 10px' }}>{(r.colonia_slug || '—').replace(/-/g, ' ')}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--cream-3, #a0a4b0)' }}>
                            {(r.submitted_email || '—').slice(0, 28)}
                          </td>
                          <td style={{ padding: '8px 10px' }}>{r.utm_source || 'direct'}</td>
                          <td style={{ padding: '8px 10px' }}><StatusBadge status={r.status} /></td>
                          <td style={{ padding: '8px 10px', color: r.sent_email_at ? '#86efac' : 'var(--cream-3)' }}>
                            {r.sent_email_at ? 'Sí' : 'No'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </SuperadminLayout>
  );
}
