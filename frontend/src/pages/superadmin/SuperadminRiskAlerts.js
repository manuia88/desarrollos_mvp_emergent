// W3.4B — Superadmin Risk Alerts page (letter changes)
import React, { useEffect, useState } from 'react';
import { TrendingDown } from 'lucide-react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card, Empty } from '../../components/advisor/primitives';
import RiskAlertCard from '../../components/superadmin/RiskAlertCard';
import { listAlerts } from '../../api/riskAlerts';

const SEVERITIES = [
  { id: '', label: 'Todas' },
  { id: 'critical', label: 'Crítica' },
  { id: 'warning', label: 'Bajada' },
  { id: 'info', label: 'Mejora' },
];

export default function SuperadminRiskAlerts({ embedded }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [kpis, setKpis] = useState({});
  const [filterSeverity, setFilterSeverity] = useState('');
  const [zoneSearch, setZoneSearch] = useState('');
  const [days, setDays] = useState(30);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = async (newSkip = 0) => {
    setLoading(true);
    try {
      const r = await listAlerts({
        severity: filterSeverity || undefined,
        zoneId: zoneSearch.trim() || undefined,
        days, limit: 20, skip: newSkip,
      });
      setItems(newSkip === 0 ? (r.items || []) : [...items, ...(r.items || [])]);
      setTotal(r.count_total || 0);
      setKpis(r.kpis || {});
      setSkip(newSkip);
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(0); /* eslint-disable-next-line */ }, [filterSeverity, zoneSearch, days]);

  return (
    <SuperadminLayout bare={embedded}>
      <PageHeader
        eyebrow="W3.4B · Risk Alerts"
        title="Cambios de letra"
        sub="Engine compara cada nuevo Risk Score vs anterior. Bajadas drásticas (>2 letras) emiten email crítico."
      />

      <div data-testid="risk-alerts-kpi-strip" style={{
        display: 'grid', gap: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        marginBottom: 18,
      }}>
        <Kpi label="Críticas abiertas" value={kpis.critical_open ?? '—'} tone="bad" />
        <Kpi label={`Bajadas ${days}d`} value={kpis.drops_in_window ?? '—'} tone="warn" />
        <Kpi label={`Subidas ${days}d`} value={kpis.rises_in_window ?? '—'} tone="ok" />
        <Kpi label="Total filtradas" value={total ?? '—'} tone="brand" />
      </div>

      <Card style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
          <FilterRow label="Severidad" testid="risk-alerts-filter-severity" options={SEVERITIES} value={filterSeverity} onChange={setFilterSeverity} />
          <FilterRow label="Ventana" testid="risk-alerts-filter-days"
            options={[{ id: 7, label: '7d' }, { id: 30, label: '30d' }, { id: 90, label: '90d' }, { id: 365, label: '1y' }]}
            value={days} onChange={(v) => setDays(Number(v))} />
          <input data-testid="risk-alerts-zone-search"
            value={zoneSearch}
            onChange={e => setZoneSearch(e.target.value)}
            placeholder="zone_id (e.g. polanco)"
            style={{
              padding: '6px 12px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
              color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12,
              minWidth: 200,
            }} />
        </div>
      </Card>

      {loading && items.length === 0 ? (
        <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Cargando…</div>
      ) : items.length === 0 ? (
        <Empty title="Sin cambios" sub="No hay cambios de letra con los filtros actuales." />
      ) : (
        <>
          {items.map(a => (
            <RiskAlertCard key={a.id} alert={a} onChanged={() => refresh(0)} />
          ))}
          {items.length < total && (
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button data-testid="risk-alerts-load-more-btn"
                onClick={() => refresh(skip + 20)}
                style={{
                  padding: '8px 16px', borderRadius: 9999,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.16)',
                  color: 'var(--cream)', cursor: 'pointer',
                  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
                }}>Cargar más ({total - items.length})</button>
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
    ok:    { bg: 'rgba(16,185,129,0.10)', bd: 'rgba(16,185,129,0.34)', fg: '#86efac' },
    brand: { bg: 'rgba(var(--theme-rgb),0.10)', bd: 'rgba(var(--theme-rgb),0.34)', fg: 'var(--theme)' },
  }[tone] || {};
  return (
    <div data-testid={`risk-alerts-kpi-${tone}`} style={{
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
        <button key={String(o.id) || 'all'} data-testid={`${testid}-${o.id || 'all'}`}
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
