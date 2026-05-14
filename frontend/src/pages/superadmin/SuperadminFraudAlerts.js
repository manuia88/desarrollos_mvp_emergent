// W3.4A — Superadmin Fraud Alerts page
import React, { useEffect, useState } from 'react';
import { Shield, RefreshCw } from 'lucide-react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card, Empty } from '../../components/advisor/primitives';
import FraudAlertCard from '../../components/superadmin/FraudAlertCard';
import { listAlerts, manualScan } from '../../api/fraudDetection';

const SEVERITIES = [
  { id: '', label: 'Todas' },
  { id: 'critical', label: 'Crítica' },
  { id: 'amber', label: 'Amber' },
  { id: 'info', label: 'Info' },
];
const SOURCES = [
  { id: '', label: 'Todas' },
  { id: 'price_anomaly', label: 'Anomalía precio' },
  { id: 'duplicate', label: 'Duplicado' },
  { id: 'title_chain', label: 'Cadena título' },
];
const STATUSES = [
  { id: '', label: 'Todos' },
  { id: 'open', label: 'Abierta' },
  { id: 'investigating', label: 'Investigando' },
  { id: 'resolved', label: 'Resuelta' },
  { id: 'dismissed', label: 'Descartada' },
];

export default function SuperadminFraudAlerts() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [kpis, setKpis] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [skip, setSkip] = useState(0);
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterStatus, setFilterStatus] = useState('open');

  const refresh = async (newSkip = 0) => {
    setLoading(true);
    try {
      const r = await listAlerts({
        severity: filterSeverity || undefined,
        source: filterSource || undefined,
        status: filterStatus || undefined,
        limit: 20, skip: newSkip,
      });
      setItems(newSkip === 0 ? (r.items || []) : [...items, ...(r.items || [])]);
      setTotal(r.count_total || 0);
      setKpis(r.kpis || {});
      setSkip(newSkip);
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(0); /* eslint-disable-next-line */ }, [filterSeverity, filterSource, filterStatus]);

  const onScan = async () => {
    if (busy) return; setBusy(true);
    try { await manualScan(); await refresh(0); } finally { setBusy(false); }
  };

  return (
    <SuperadminLayout>
      <PageHeader
        eyebrow="W3.4A · Fraud Detection AI"
        title="Alertas de fraude"
        sub="IsolationForest + duplicate detection + title chain heuristic. Scan diario 03:00 MX."
        actions={
          <button data-testid="fraud-manual-scan-btn" onClick={onScan} disabled={busy} style={btnPrimary(busy)}>
            <RefreshCw size={14} /> {busy ? 'Escaneando…' : 'Escanear ahora'}
          </button>
        }
      />

      {/* KPI strip */}
      <div data-testid="fraud-kpi-strip" style={{
        display: 'grid', gap: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        marginBottom: 18,
      }}>
        <Kpi label="Críticas abiertas"   value={kpis.critical_open ?? '—'} tone="bad" />
        <Kpi label="Amber abiertas"      value={kpis.amber_open ?? '—'}    tone="warn" />
        <Kpi label="Total filtradas"     value={total ?? '—'}              tone="brand" />
        <Kpi label="ML estimate"         value="≥10% baseline"             tone="muted" />
      </div>

      <Card style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
          <FilterRow label="Severidad" testid="fraud-filter-severity" options={SEVERITIES} value={filterSeverity} onChange={setFilterSeverity} />
          <FilterRow label="Fuente"    testid="fraud-filter-source"   options={SOURCES}    value={filterSource}   onChange={setFilterSource} />
          <FilterRow label="Estado"    testid="fraud-filter-status"   options={STATUSES}   value={filterStatus}   onChange={setFilterStatus} />
        </div>
      </Card>

      {loading && items.length === 0 ? (
        <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Cargando…</div>
      ) : items.length === 0 ? (
        <Empty title="Sin alertas" sub="Ningún signo de fraude con los filtros actuales." />
      ) : (
        <>
          {items.map(a => (
            <FraudAlertCard key={a.id} alert={a} onChanged={() => refresh(0)} />
          ))}
          {items.length < total && (
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button data-testid="fraud-load-more-btn"
                onClick={() => refresh(skip + 20)}
                style={btnSecondary}>Cargar más ({total - items.length})</button>
            </div>
          )}
        </>
      )}
    </SuperadminLayout>
  );
}

function Kpi({ label, value, tone }) {
  const colors = {
    bad:   { bg: 'rgba(239,68,68,0.10)',  bd: 'rgba(239,68,68,0.34)',  fg: '#fca5a5' },
    warn:  { bg: 'rgba(245,158,11,0.10)', bd: 'rgba(245,158,11,0.34)', fg: '#fcd34d' },
    brand: { bg: 'rgba(var(--theme-rgb),0.10)', bd: 'rgba(var(--theme-rgb),0.34)', fg: 'var(--theme)' },
    muted: { bg: 'rgba(255,255,255,0.04)',bd: 'rgba(255,255,255,0.10)', fg: 'var(--cream-3)' },
  }[tone] || {};
  return (
    <div data-testid={`fraud-kpi-${tone}`} style={{
      background: colors.bg, border: `1px solid ${colors.bd}`,
      borderRadius: 14, padding: 14,
    }}>
      <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: colors.fg, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function FilterRow({ label, options, value, onChange, testid }) {
  return (
    <div style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      <span style={{ fontFamily: 'DM Sans', color: 'var(--cream-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      {options.map(o => (
        <button key={o.id || 'all'} data-testid={`${testid}-${o.id || 'all'}`}
          onClick={() => onChange(o.id)}
          style={{
            padding: '5px 12px', borderRadius: 9999,
            background: value === o.id ? 'rgba(var(--theme-rgb),0.18)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${value === o.id ? 'rgba(var(--theme-rgb),0.42)' : 'rgba(255,255,255,0.10)'}`,
            color: 'var(--cream)', cursor: 'pointer',
            fontFamily: 'DM Sans', fontSize: 11.5,
          }}>{o.label}</button>
      ))}
    </div>
  );
}

const btnPrimary = (busy) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', borderRadius: 9999,
  background: busy ? 'rgba(255,255,255,0.06)' : 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))',
  border: '1px solid rgba(255,255,255,0.16)',
  color: '#fff', cursor: busy ? 'not-allowed' : 'pointer',
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
});
const btnSecondary = {
  padding: '8px 16px', borderRadius: 9999,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.16)',
  color: 'var(--cream)', cursor: 'pointer',
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
};
