// W3.3 ZZ.3 — Superadmin DRPI page
import React, { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card, Badge, Empty } from '../../components/advisor/primitives';
import HedonicCoefficientsTable from '../../components/superadmin/HedonicCoefficientsTable';
import { listSnapshots, recompute, fetchCoefficients } from '../../api/drpi';

function fmtPct(v) {
  if (v == null) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${Number(v).toFixed(2)}%`;
}

export default function SuperadminDRPI() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [drawerZone, setDrawerZone] = useState(null);
  const [drawerModel, setDrawerModel] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [tierFilter, setTierFilter] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await listSnapshots({ tier: tierFilter || undefined, limit: 200 });
      setItems(r.items || []);
      setTotal(r.count_total || 0);
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [tierFilter]);

  const onRecompute = async () => {
    if (busy) return;
    setBusy(true);
    try { await recompute(); await refresh(); } finally { setBusy(false); }
  };

  const onOpenDrawer = async (zoneId, tier) => {
    setDrawerZone({ zoneId, tier });
    setDrawerLoading(true);
    try {
      const r = await fetchCoefficients(zoneId, tier);
      setDrawerModel(r.model);
    } finally { setDrawerLoading(false); }
  };

  const exportCSV = () => {
    const headers = ['zone_id','tier','period','index_value','delta_pct','r_squared','sample_size','available'];
    const rows = items.map(i => headers.map(h => String(i[h] ?? '')).join(','));
    const blob = new Blob([headers.join(',') + '\n' + rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `drpi_snapshots_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SuperadminLayout>
      <PageHeader
        eyebrow="W3.3 · DRPI"
        title="Índice de precios DRPI"
        sub="Snapshots mensuales con regresión hedónica. Click en una fila para ver coeficientes."
        actions={
          <>
            <button
              data-testid="drpi-recompute-btn"
              onClick={onRecompute} disabled={busy}
              style={btnPrimary(busy)}
            >
              <TrendingUp size={14} /> {busy ? 'Recalculando…' : 'Recalcular ahora'}
            </button>
            <button data-testid="drpi-export-csv-btn" onClick={exportCSV} style={btnSecondary}>Exportar CSV</button>
          </>
        }
      />

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <span style={{ fontFamily: 'DM Sans', color: 'var(--cream-3)', fontSize: 12 }}>Tier:</span>
          {['', 'colonia', 'alcaldia', 'national'].map(t => (
            <button key={t || 'all'} data-testid={`drpi-tier-${t || 'all'}`}
              onClick={() => setTierFilter(t)}
              style={{
                padding: '6px 14px', borderRadius: 9999,
                background: tierFilter === t ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${tierFilter === t ? 'rgba(99,102,241,0.42)' : 'rgba(255,255,255,0.10)'}`,
                color: 'var(--cream)', cursor: 'pointer',
                fontFamily: 'DM Sans', fontSize: 12,
              }}
            >{t || 'todas'}</button>
          ))}
          <span style={{ marginLeft: 'auto', fontFamily: 'DM Sans', color: 'var(--cream-3)', fontSize: 12 }}>
            Total snapshots: <span style={{ color: 'var(--cream)', fontWeight: 700 }}>{total}</span>
          </span>
        </div>
      </Card>

      {loading ? (
        <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Cargando…</div>
      ) : items.length === 0 ? (
        <Empty title="Sin snapshots aún" sub="Recalcula manualmente o espera al cron mensual." />
      ) : (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table data-testid="drpi-snapshots-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
                  <Th>Zona</Th><Th>Tier</Th><Th>Período</Th><Th>Índice</Th>
                  <Th>Δ vs ant.</Th><Th>R²</Th><Th>Muestra</Th><Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((s, i) => (
                  <tr key={`${s.zone_id}-${s.tier}-${s.period}-${i}`}
                      data-testid={`drpi-row-${s.zone_id}-${s.period}`}
                      onClick={() => onOpenDrawer(s.zone_id, s.tier)}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        cursor: 'pointer',
                      }}>
                    <Td><span style={{ color: 'var(--cream)', fontWeight: 600 }}>{s.zone_id}</span></Td>
                    <Td>{s.tier}</Td>
                    <Td>{s.period}</Td>
                    <Td>{s.index_value != null ? Number(s.index_value).toFixed(2) : '—'}</Td>
                    <Td><span style={{ color: (s.delta_pct ?? 0) > 0 ? '#86efac' : '#fca5a5' }}>{fmtPct(s.delta_pct)}</span></Td>
                    <Td>{s.r_squared != null ? Number(s.r_squared).toFixed(3) : '—'}</Td>
                    <Td>{s.sample_size ?? '—'}</Td>
                    <Td>
                      {s.available
                        ? <Badge tone="ok">disponible</Badge>
                        : <Badge tone="warn">{s.reason || 'no disponible'}</Badge>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Drawer */}
      {drawerZone && (
        <div data-testid="drpi-drawer-overlay" onClick={() => { setDrawerZone(null); setDrawerModel(null); }}
          style={{ position: 'fixed', inset: 0, zIndex: 8000, background: 'rgba(6,8,15,0.78)' }}>
          <div onClick={e => e.stopPropagation()}
            data-testid="drpi-drawer"
            style={{
              position: 'absolute', right: 0, top: 0, bottom: 0,
              width: 'min(640px, 95vw)', overflowY: 'auto',
              background: 'rgba(13,16,23,0.98)',
              borderLeft: '1px solid rgba(255,255,255,0.10)',
              padding: 24,
            }}>
            <h3 style={{ fontFamily: 'Outfit', color: 'var(--cream)', fontSize: 22, margin: 0, fontWeight: 800 }}>
              Hedónico · {drawerZone.zoneId}
            </h3>
            <p style={{ fontFamily: 'DM Sans', color: 'var(--cream-3)', fontSize: 12, margin: '4px 0 18px' }}>
              Coeficientes OLS · IC 95%
            </p>
            {drawerLoading
              ? <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Cargando coeficientes…</div>
              : <HedonicCoefficientsTable model={drawerModel} />}
          </div>
        </div>
      )}
    </SuperadminLayout>
  );
}

const btnPrimary = (busy) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', borderRadius: 9999,
  background: busy ? 'rgba(255,255,255,0.06)' : 'linear-gradient(90deg,#6366F1,#EC4899)',
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
function Th({ children }) {
  return (<th style={{ textAlign: 'left', padding: '10px 8px', fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{children}</th>);
}
function Td({ children }) {
  return (<td style={{ padding: '8px 8px', fontSize: 13, color: 'var(--cream-2)' }}>{children}</td>);
}
