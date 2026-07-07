// W3.3 ZZ.3 — Superadmin Investment Explorer page
import React, { useEffect, useState } from 'react';
import { Target } from 'lucide-react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card, Badge, Empty } from '../../components/advisor/primitives';
import { listZones, fetchZoneDetail } from '../../api/investmentExplorer';
import HedonicCoefficientsTable from '../../components/superadmin/HedonicCoefficientsTable';
import { Z } from '../../styles/zIndex';

const SORTS = [
  { id: 'score',     label: 'Zone Score' },
  { id: 'yield',     label: 'Yield' },
  { id: 'growth_30d',label: 'Growth Δ' },
  { id: 'risk',      label: 'Risk' },
  { id: 'dom',       label: 'DOM' },
];
const OBJECTIVES = [
  { id: 'cashflow', label: 'Cashflow' },
  { id: 'appreciation', label: 'Apreciación' },
  { id: 'balanced', label: 'Balanceado' },
];

function fmt(v, dec = 1) {
  if (v == null) return '—';
  return Number(v).toFixed(dec);
}

export default function SuperadminInvestmentExplorer({ embedded }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState('score');
  const [obj, setObj] = useState('balanced');
  const [tier, setTier] = useState('colonia');
  const [loading, setLoading] = useState(true);
  const [drawerZone, setDrawerZone] = useState(null);
  const [drawerData, setDrawerData] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listZones({ sort, tier, buyer_objective: obj, limit: 100 })
      .then(r => { if (alive) { setItems(r.items || []); setTotal(r.count_total || 0); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [sort, obj, tier]);

  const openDrawer = async (zone) => {
    setDrawerZone(zone);
    try { const d = await fetchZoneDetail(zone.zone_id, zone.tier); setDrawerData(d); }
    catch { setDrawerData(null); }
  };

  const exportCSV = () => {
    const headers = ['zone_id','zone_name','zone_score_letter','zone_score_numeric',
                     'yield_pct','growth_pct_30d','risk_score','dom_avg',
                     'median_price_per_m2','transactions_count_30d','recommended_for_objective'];
    const rows = items.map(i => headers.map(h => String(i[h] ?? '')).join(','));
    const blob = new Blob([headers.join(',') + '\n' + rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `investment_explorer_${obj}_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SuperadminLayout bare={embedded}>
      <PageHeader
        eyebrow="W3.3 · Investment Explorer"
        title="Inversión por colonia"
        sub="Tabla densidad-aware: combina Zone Score (W3.1A), DRPI (W3.3), Risk (W3.4), DOM y precio mediano. Filtra por objetivo."
        actions={
          <button data-testid="ie-export-csv-btn" onClick={exportCSV} style={btnSecondary}>Exportar CSV</button>
        }
      />

      <Card style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
          <FilterRow label="Sort" testid="ie-filter-sort" options={SORTS} value={sort} onChange={setSort} />
          <FilterRow label="Tier" testid="ie-filter-tier" options={[{id:'colonia',label:'Colonia'},{id:'alcaldia',label:'Alcaldía'}]} value={tier} onChange={setTier} />
          <FilterRow label="Objetivo" testid="ie-filter-objective" options={OBJECTIVES} value={obj} onChange={setObj} />
          <span style={{ marginLeft: 'auto', fontFamily: 'DM Sans', color: 'var(--cream-3)', fontSize: 12 }}>
            <Target size={11} style={{ marginRight: 4 }} />
            Resultados: <span style={{ color: 'var(--cream)', fontWeight: 700 }}>{total}</span>
          </span>
        </div>
      </Card>

      {loading ? (
        <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Cargando…</div>
      ) : items.length === 0 ? (
        <Empty title="Sin datos" sub="Sin transacciones suficientes para construir la tabla." />
      ) : (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table data-testid="ie-zones-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
                  <Th>Zona</Th><Th>Score</Th><Th>Yield %</Th><Th>Δ 30d %</Th>
                  <Th>Risk</Th><Th>DOM</Th><Th>Precio/m²</Th><Th>Tx 30d</Th><Th>Rec.</Th>
                </tr>
              </thead>
              <tbody>
                {items.map(z => (
                  <tr key={z.zone_id}
                      data-testid={`ie-row-${z.zone_id}`}
                      onClick={() => openDrawer(z)}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}>
                    <Td>
                      <div style={{ color: 'var(--cream)', fontWeight: 600 }}>{z.zone_name}</div>
                      <div style={{ color: 'var(--cream-3)', fontSize: 11 }}>{z.zone_id}</div>
                    </Td>
                    <Td>
                      {z.zone_score_letter
                        ? <Badge tone={z.zone_score_letter <= 'B' ? 'ok' : z.zone_score_letter <= 'D' ? 'warn' : 'bad'}>
                            {z.zone_score_letter} · {fmt(z.zone_score_numeric, 1)}
                          </Badge>
                        : '—'}
                    </Td>
                    <Td>{fmt(z.yield_pct, 2)}</Td>
                    <Td>
                      <span style={{ color: (z.growth_pct_30d ?? 0) > 0 ? '#86efac' : (z.growth_pct_30d ?? 0) < 0 ? '#fca5a5' : 'var(--cream-2)' }}>
                        {z.growth_pct_30d != null ? `${z.growth_pct_30d > 0 ? '+' : ''}${fmt(z.growth_pct_30d, 2)}%` : '—'}
                      </span>
                    </Td>
                    <Td>{fmt(z.risk_score, 0)}</Td>
                    <Td>{fmt(z.dom_avg, 1)}</Td>
                    <Td>{z.median_price_per_m2 ? `$${Number(z.median_price_per_m2).toLocaleString('es-MX')}` : '—'}</Td>
                    <Td>{z.transactions_count_30d ?? 0}</Td>
                    <Td>{z.recommended_for_objective ? <Badge tone="brand">SI</Badge> : <Badge>—</Badge>}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Drawer */}
      {drawerZone && (
        <div data-testid="ie-drawer-overlay" onClick={() => { setDrawerZone(null); setDrawerData(null); }}
          style={{ position: 'fixed', inset: 0, zIndex: Z.MODAL_CRITICAL, background: 'rgba(6,8,15,0.78)' }}>
          <div onClick={e => e.stopPropagation()} data-testid="ie-drawer"
            style={{
              position: 'absolute', right: 0, top: 0, bottom: 0,
              width: 'min(680px, 96vw)', overflowY: 'auto',
              background: 'rgba(13,16,23,0.98)',
              borderLeft: '1px solid rgba(255,255,255,0.10)', padding: 24,
            }}>
            <h3 style={{ fontFamily: 'Outfit', color: 'var(--cream)', margin: 0, fontWeight: 800 }}>
              {drawerZone.zone_name}
            </h3>
            <p style={{ fontFamily: 'DM Sans', color: 'var(--cream-3)', fontSize: 12, marginTop: 4 }}>
              Scorecard completa · {drawerZone.zone_id}
            </p>

            {!drawerData ? <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', marginTop: 14 }}>Cargando…</div> : (
              <>
                <h4 style={{ fontFamily: 'Outfit', color: 'var(--cream)', fontSize: 14, margin: '20px 0 8px' }}>Métricas clave</h4>
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                  {Object.entries(drawerData.zone || {}).slice(0, 12).map(([k, v]) => (
                    <div key={k} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, padding: 10 }}>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase' }}>{k}</div>
                      <div style={{ fontFamily: 'Outfit', color: 'var(--cream)', fontSize: 14, fontWeight: 700, marginTop: 4 }}>{String(v ?? '—')}</div>
                    </div>
                  ))}
                </div>
                {drawerData.hedonic_model && (
                  <>
                    <h4 style={{ fontFamily: 'Outfit', color: 'var(--cream)', fontSize: 14, margin: '20px 0 8px' }}>Coeficientes hedónicos</h4>
                    <HedonicCoefficientsTable model={drawerData.hedonic_model} />
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </SuperadminLayout>
  );
}

function FilterRow({ label, options, value, onChange, testid }) {
  return (
    <div style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      <span style={{ fontFamily: 'DM Sans', color: 'var(--cream-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      {options.map(o => (
        <button key={o.id}
          data-testid={`${testid}-${o.id}`}
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
  return (<td style={{ padding: '8px 8px', fontSize: 13, color: 'var(--cream-2)', verticalAlign: 'top' }}>{children}</td>);
}
