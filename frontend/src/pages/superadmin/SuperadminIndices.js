// I04 — Superadmin · Terminal de Índices DMX (producto licenciable).
// Los 5 índices compuestos (IPV/IAB/IDS/IRE/ICO) + maestro IDM por colonia, ordenados por IDM.
// Bloomberg-style: malla de zonas con semáforo por índice. Mismo motor que dev/comprador.
import React, { useEffect, useMemo, useState } from 'react';
import { Gauge } from 'lucide-react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card, Empty } from '../../components/advisor/primitives';
import { listIndices } from '../../api/indices';

const BAND = { verde: '#86efac', ambar: '#fcd34d', rojo: '#fca5a5' };
const cellCol = (i) => BAND[i.color] || 'var(--cream-2)';

export default function SuperadminIndices() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listIndices({ tier: tier || undefined, limit: 200 })
      .then(r => { if (alive) setData(r); })
      .catch(() => { if (alive) setData(false); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tier]);

  const items = useMemo(() => (data && data.items) || [], [data]);
  const leyenda = (data && data.leyenda) || [];
  const kpis = (data && data.kpis) || {};
  const cobertura = (data && data.cobertura) || null;
  const tiers = useMemo(() => [...new Set(items.map(r => r.tier).filter(Boolean))], [items]);

  const exportCSV = () => {
    const cols = ['IPV', 'IAB', 'IDS', 'IRE', 'ICO'];
    const headers = ['zona', 'tier', 'price_m2', 'IDM', ...cols];
    const rows = items.map(r => {
      const by = Object.fromEntries((r.indices || []).map(i => [i.key, i.valor]));
      return [r.zona, r.tier, r.price_m2, r.idm.valor, ...cols.map(c => by[c] ?? '')].join(',');
    });
    const blob = new Blob([headers.join(',') + '\n' + rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `indices_dmx_${items.length}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SuperadminLayout>
      <PageHeader
        eyebrow="I04 · ÍNDICES DMX"
        title="Índices DMX"
        sub="Los 5 índices compuestos por colonia (IPV plusvalía · IAB absorción · IDS demanda · IRE renta · ICO calidad) + el maestro IDM. Producto licenciable."
        actions={<button data-testid="ix-export-csv" onClick={exportCSV} style={btnSecondary}>Exportar CSV</button>}
      />

      {/* KPIs de la malla */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 18 }}>
        {[
          ['IDM promedio', kpis.avg_idm ?? '—', <Gauge key="g" size={15} />],
          ['Zona más fuerte', kpis.zona_top || '—', null],
          ['IDM más alto', kpis.idm_top ?? '—', null],
          ['Zonas grado A', kpis.grado_A ?? '—', null],
        ].map(([lbl, val, icon], i) => (
          <Card key={i} style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>{icon}{lbl}</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', marginTop: 4 }}>{val}</div>
          </Card>
        ))}
      </div>

      {/* Cobertura de colonias por ciudad (EX · crece al cargar el catálogo oficial / otras ciudades) */}
      {cobertura && (
        <Card data-testid="ix-cobertura" style={{ marginBottom: 18, padding: 14 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>Cobertura</span>
            <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)' }}>
              {cobertura.total_colonias} colonias · {cobertura.total_ciudades} ciudad{cobertura.total_ciudades === 1 ? '' : 'es'}
            </span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
              {(cobertura.ciudades || []).map(c => (
                <span key={c.city} style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)', padding: '4px 10px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}>
                  {c.city} <b style={{ color: 'var(--cream)' }}>{c.colonias}</b>
                </span>
              ))}
            </div>
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 8 }}>
            Crece al cargar el catálogo oficial CDMX (~1,800) y nuevas ciudades. Las señales se comparan por ciudad.
          </div>
        </Card>
      )}

      {/* Leyenda + filtro tier */}
      <Card style={{ marginBottom: 18, padding: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
          {leyenda.map(l => (
            <span key={l.key} title={l.que_mide} style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>
              <b style={{ color: 'var(--cream)' }}>{l.key}</b> {l.nombre}
            </span>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>Tier:</span>
            {['', ...tiers].map(t => (
              <button key={t || 'all'} onClick={() => setTier(t)}
                style={{ padding: '5px 12px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 11.5, cursor: 'pointer',
                  background: tier === t ? 'rgba(var(--theme-rgb),0.18)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${tier === t ? 'rgba(var(--theme-rgb),0.42)' : 'rgba(255,255,255,0.10)'}`, color: 'var(--cream)' }}>
                {t || 'todas'}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {loading ? (
        <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Cargando…</div>
      ) : !data ? (
        <Empty title="No se pudo cargar" sub="Revisa el backend de índices." />
      ) : items.length === 0 ? (
        <Empty title="Sin zonas" sub="No hay colonias para ese tier." />
      ) : (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table data-testid="ix-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
                  <Th>Zona</Th><Th>Tier</Th><Th>$/m²</Th>
                  <Th center>IDM</Th><Th center>IPV</Th><Th center>IAB</Th><Th center>IDS</Th><Th center>IRE</Th><Th center>ICO</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((r, idx) => {
                  const by = Object.fromEntries((r.indices || []).map(i => [i.key, i]));
                  return (
                    <tr key={r.zona + idx} data-testid={`ix-row-${idx}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <Td><span style={{ color: 'var(--cream)', fontWeight: 600 }}>{r.zona}</span></Td>
                      <Td>{r.tier}</Td>
                      <Td>${(r.price_m2 / 1000).toFixed(0)}k</Td>
                      <Td center><span style={{ fontWeight: 800, color: BAND[r.idm.color] || 'var(--cream)' }}>{r.idm.valor}<span style={{ fontSize: 10, opacity: 0.7, marginLeft: 3 }}>{r.idm.letra}</span></span></Td>
                      {['IPV', 'IAB', 'IDS', 'IRE', 'ICO'].map(k => (
                        <Td key={k} center>
                          <span title={by[k] && by[k].fuente === 'estimado' ? 'estimado' : ''} style={{ fontWeight: 700, color: by[k] ? cellCol(by[k]) : 'var(--cream-3)' }}>
                            {by[k] ? by[k].valor : '—'}
                          </span>
                        </Td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </SuperadminLayout>
  );
}

const btnSecondary = {
  padding: '8px 16px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.16)', color: 'var(--cream)', cursor: 'pointer',
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
};
function Th({ children, center }) {
  return (<th style={{ textAlign: center ? 'center' : 'left', padding: '10px 8px', fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{children}</th>);
}
function Td({ children, center }) {
  return (<td style={{ padding: '9px 8px', fontSize: 13, color: 'var(--cream-2)', textAlign: center ? 'center' : 'left' }}>{children}</td>);
}
