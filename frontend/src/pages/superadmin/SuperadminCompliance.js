// W3.7 — /superadmin/compliance — Compliance LFPDPPP dashboard
import React, { useEffect, useState } from 'react';
import { Shield, RefreshCw, Download } from 'lucide-react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card } from '../../components/advisor/primitives';
import { DsrRequestCard } from '../../components/superadmin/DsrRequestCard';
import {
  listDsrRequests,
  processDsr,
  getComplianceAuditTrail,
} from '../../api/superadminCompliance';

const TABS = [
  { id: 'dsr',   label: 'Solicitudes DSR' },
  { id: 'audit', label: 'Audit Trail' },
];

const DSR_STATUSES = [
  { id: '',          label: 'Todos' },
  { id: 'pending',   label: 'Pendiente' },
  { id: 'verified',  label: 'Verificado' },
  { id: 'completed', label: 'Completado' },
  { id: 'rejected',  label: 'Rechazado' },
];

const pill = (active) => ({
  padding: '5px 14px', borderRadius: 9999,
  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, cursor: 'pointer',
  border: active ? 'none' : '1px solid rgba(255,255,255,0.12)',
  background: active ? 'linear-gradient(90deg,#6366F1,#EC4899)' : 'rgba(255,255,255,0.04)',
  color: 'var(--cream)',
});

const kpiCard = (label, value, sub) => (
  <div style={{
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10, padding: '14px 18px',
  }}>
    <p style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
    <p style={{ fontFamily: 'Outfit', fontWeight: 900, fontSize: 26, color: 'var(--cream)', margin: 0 }}>{value ?? '—'}</p>
    {sub && <p style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', margin: '4px 0 0' }}>{sub}</p>}
  </div>
);

export default function SuperadminCompliance() {
  const [tab, setTab] = useState('dsr');
  const [dsrData, setDsrData] = useState({ items: [], kpis: {} });
  const [auditData, setAuditData] = useState({ items: [], kpis: {} });
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterEndpoint, setFilterEndpoint] = useState('');
  const [days, setDays] = useState(30);

  const loadDsr = async () => {
    try {
      const r = await listDsrRequests({ status: filterStatus || undefined, days, limit: 100 });
      setDsrData(r);
    } catch (e) {
      console.error('[compliance] DSR load error:', e.message);
    }
  };

  const loadAudit = async () => {
    try {
      const r = await getComplianceAuditTrail({
        endpoint: filterEndpoint || undefined,
        days, limit: 200,
      });
      setAuditData(r);
    } catch (e) {
      console.error('[compliance] audit load error:', e.message);
    }
  };

  const refresh = async () => {
    setLoading(true);
    try {
      await Promise.all([loadDsr(), loadAudit()]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [filterStatus, filterEndpoint, days]);

  const handleProcess = async (dsr_id) => {
    if (!window.confirm('¿Ejecutar eliminación/anonimización de datos? Esta acción no es reversible.')) return;
    setProcessing(dsr_id);
    try {
      await processDsr(dsr_id);
      await loadDsr();
    } catch (e) {
      alert('Error procesando DSR: ' + e.message);
    } finally {
      setProcessing(null);
    }
  };

  const exportCsv = () => {
    if (!auditData.items?.length) return;
    const cols = ['id', 'ts', 'action', 'endpoint', 'api_key_id', 'response_pii_stripped', 'k_anonymity_passed', 'records_returned', 'requestor_ip'];
    const header = cols.join(',');
    const rows = auditData.items.map(r =>
      cols.map(c => JSON.stringify(r[c] ?? '')).join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `compliance_audit_${days}d.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const kpis = dsrData.kpis || {};

  return (
    <SuperadminLayout>
      <PageHeader
        eyebrow="W3.7 · Phase Z.5 · LFPDPPP"
        title="Compliance"
        sub="k-anonimidad · PII stripping · DSR · Audit trail 5 años"
        actions={
          <button
            data-testid="compliance-refresh-btn"
            onClick={refresh}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(99,102,241,0.15)',
              border: '1px solid rgba(99,102,241,0.35)',
              color: '#a5b4fc', fontFamily: 'DM Sans', fontWeight: 700,
              fontSize: 13, padding: '8px 18px', borderRadius: 9999, cursor: 'pointer',
            }}
          >
            <RefreshCw size={13} /> Actualizar
          </button>
        }
      />

      {/* KPI strip */}
      <div data-testid="compliance-kpi-strip" style={{
        display: 'grid', gap: 10,
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        marginBottom: 20,
      }}>
        {kpiCard('DSR Pendientes', kpis.dsr_pending, 'Requieren verificación')}
        {kpiCard('DSR Completados 30d', kpis.dsr_completed_30d, 'Borrados ejecutados')}
        {kpiCard('Bloqueos k-anon 30d', kpis.k_anon_blocks_30d, '< 5 props en zona')}
        {kpiCard('Eventos audit 30d', kpis.audit_events_30d, 'Registro LFPDPPP')}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            data-testid={`compliance-tab-${t.id}`}
            onClick={() => setTab(t.id)}
            style={pill(tab === t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── DSR TAB ── */}
      {tab === 'dsr' && (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>Estado:</span>
            {DSR_STATUSES.map(s => (
              <button key={s.id} data-testid={`dsr-filter-${s.id || 'all'}`}
                onClick={() => setFilterStatus(s.id)} style={pill(filterStatus === s.id)}>
                {s.label}
              </button>
            ))}
            <select
              value={days}
              onChange={e => setDays(Number(e.target.value))}
              style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12,
                padding: '5px 10px', marginLeft: 'auto',
              }}
            >
              {[7, 30, 90, 365].map(d => <option key={d} value={d}>{d} días</option>)}
            </select>
          </div>

          {loading ? (
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>Cargando…</p>
          ) : !dsrData.items?.length ? (
            <div style={{
              textAlign: 'center', padding: '40px 20px',
              color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 14,
            }}>
              <Shield size={32} style={{ opacity: 0.3, margin: '0 auto 12px', display: 'block' }} />
              Sin solicitudes DSR en este período
            </div>
          ) : (
            <div data-testid="dsr-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dsrData.items.map(item => (
                <DsrRequestCard
                  key={item.id}
                  item={item}
                  onProcess={handleProcess}
                  processing={processing}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── AUDIT TRAIL TAB ── */}
      {tab === 'audit' && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
            <input
              data-testid="audit-filter-endpoint"
              placeholder="Filtrar por endpoint…"
              value={filterEndpoint}
              onChange={e => setFilterEndpoint(e.target.value)}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8, color: 'var(--cream)',
                fontFamily: 'DM Sans', fontSize: 13, padding: '7px 12px', outline: 'none',
                flex: '1', minWidth: 200,
              }}
            />
            <select
              value={days}
              onChange={e => setDays(Number(e.target.value))}
              style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12,
                padding: '7px 10px',
              }}
            >
              {[7, 30, 90, 365].map(d => <option key={d} value={d}>{d} días</option>)}
            </select>
            <button
              data-testid="audit-export-csv-btn"
              onClick={exportCsv}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'var(--cream-2)', fontFamily: 'DM Sans', fontWeight: 700,
                fontSize: 12, padding: '7px 14px', borderRadius: 9999, cursor: 'pointer',
              }}
            >
              <Download size={13} /> Exportar CSV
            </button>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table data-testid="audit-trail-table" style={{
              width: '100%', borderCollapse: 'collapse',
              fontFamily: 'DM Sans', fontSize: 12,
            }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
                  {['Timestamp', 'Acción', 'Endpoint', 'API Key', 'PII Strip', 'k-anon', 'Registros', 'IP'].map(h => (
                    <th key={h} style={{
                      padding: '8px 10px', textAlign: 'left',
                      color: 'var(--cream-3)', fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 11,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} style={{ padding: 20, color: 'var(--cream-3)', textAlign: 'center' }}>Cargando…</td></tr>
                ) : !auditData.items?.length ? (
                  <tr><td colSpan={8} style={{ padding: 20, color: 'var(--cream-3)', textAlign: 'center' }}>Sin eventos en este período</td></tr>
                ) : auditData.items.map((row, i) => (
                  <tr key={row.id || i} style={{
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                  }}>
                    <td style={{ padding: '7px 10px', color: 'var(--cream-3)', whiteSpace: 'nowrap' }}>
                      {row.ts ? new Date(row.ts).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                    </td>
                    <td style={{ padding: '7px 10px', color: 'var(--cream-2)' }}>
                      <code style={{ fontSize: 11 }}>{row.action}</code>
                    </td>
                    <td style={{ padding: '7px 10px', color: 'var(--cream-3)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.endpoint}
                    </td>
                    <td style={{ padding: '7px 10px', color: 'var(--cream-3)' }}>
                      {row.api_key_id ? <code style={{ fontSize: 10 }}>{row.api_key_id}</code> : '—'}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                      {row.response_pii_stripped
                        ? <span style={{ color: '#6ee7b7', fontWeight: 700 }}>SI</span>
                        : <span style={{ color: 'var(--cream-3)' }}>—</span>}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                      {row.k_anonymity_passed === false
                        ? <span style={{ color: '#fca5a5', fontWeight: 700 }}>BLOQ</span>
                        : <span style={{ color: '#6ee7b7' }}>OK</span>}
                    </td>
                    <td style={{ padding: '7px 10px', color: 'var(--cream-3)', textAlign: 'right' }}>
                      {row.records_returned ?? 0}
                    </td>
                    <td style={{ padding: '7px 10px', color: 'var(--cream-3)' }}>
                      {row.requestor_ip || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {auditData.total_matching > auditData.items?.length && (
            <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 10 }}>
              Mostrando {auditData.items?.length} de {auditData.total_matching} registros. Ajusta el rango de días o filtra por endpoint.
            </p>
          )}
        </>
      )}
    </SuperadminLayout>
  );
}
