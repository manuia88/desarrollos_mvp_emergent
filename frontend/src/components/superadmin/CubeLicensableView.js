/**
 * CubeLicensableView — la LENTE LICENCIABLE del Hub (decisión Terminal Mercado = vender data, estilo
 * HouseCanary/Bloomberg). Agregados de mercado por colonia listos para licenciar: precio/m², absorción,
 * inventario — con k-anon ≥3 (celdas chicas suprimidas) y SIN nombres de desarrollo. Exportable a CSV.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Download, AlertCircle } from 'lucide-react';
import { getCubeLicensable } from '../../api/superadminMetricsCube';

const nf = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
const tc = (s) => String(s ?? '—').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const money = (v) => (v == null ? '—' : `$${nf.format(v)}`);

const int = (v) => (v == null ? '—' : nf.format(v));   // honestidad: sin dato → "—", no "0" inventado
const COLS = [
  ['colonia', 'Colonia', (v) => tc(v)],
  ['unidades', 'Unidades', int],
  ['disponibles', 'Disponibles', int],
  ['precio_m2', '$/m²', money],
  ['precio_prom', 'Precio prom.', money],
  ['m2_prom', 'm² prom.', (v) => (v == null ? '—' : v)],
  ['absorcion_pct', 'Absorción', (v) => (v == null ? '—' : `${v}%`)],
];

export default function CubeLicensableView({ period = 'current' }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    getCubeLicensable(period)
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setErr(e?.message || 'No se pudo cargar.'); });
    return () => { alive = false; };
  }, [period]);

  const rows = useMemo(() => (data && data.colonias) || [], [data]);

  const exportCsv = () => {
    const header = COLS.map(([, label]) => label).join(',');
    const body = rows.map((r) => COLS.map(([k]) => {
      const v = r[k];
      return typeof v === 'string' ? `"${v}"` : (v == null ? '' : v);
    }).join(',')).join('\n');
    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `dmx-market-data-${period}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (err) return <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fecaca', fontFamily: 'DM Sans', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}><AlertCircle size={15} /> {err}</div>;
  if (!data) return <div style={{ padding: 26, fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.7)' }}>Preparando el paquete de datos…</div>;

  const th = { fontFamily: 'DM Mono, monospace', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(240,235,224,0.55)', padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.08)' };
  const td = { fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.88)', padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };

  return (
    <div data-testid="cube-licensable-view">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ maxWidth: 620 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={16} style={{ color: '#10B981' }} />
            <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)' }}>Datos de mercado para licenciar</span>
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.6)', marginTop: 6, lineHeight: 1.5 }}>
            {data.licencia?.producto}. {data.licencia?.nota} {data.suprimidas_kanon > 0 && <b style={{ color: '#4ADE80' }}>{data.suprimidas_kanon} zonas suprimidas por privacidad.</b>}
          </div>
        </div>
        <button onClick={exportCsv} disabled={!rows.length} data-testid="licensable-export"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 11, border: 'none', cursor: rows.length ? 'pointer' : 'default', background: 'linear-gradient(120deg,#10B981,#059669)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13, opacity: rows.length ? 1 : 0.5 }}>
          <Download size={14} /> Exportar CSV
        </button>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: 26, borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.7)' }}>
          Aún no hay suficiente inventario por colonia para publicar datos con privacidad. Se llena conforme entra oferta.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)' }}>
          <table data-testid="licensable-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead><tr>{COLS.map(([k, label], i) => <th key={k} style={{ ...th, textAlign: i === 0 ? 'left' : 'right' }}>{label}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.colonia || i} style={{ background: i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                  {COLS.map(([k, , fmt], j) => <td key={k} style={{ ...td, textAlign: j === 0 ? 'left' : 'right', fontWeight: j === 0 ? 700 : 400, color: j === 0 ? 'var(--cream)' : td.color }}>{fmt(r[k])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.4)', marginTop: 10 }}>
        {rows.length} colonias · k-anon ≥{data.k_anon} · sin identidad de desarrollo. Este es el producto de datos que DMX puede licenciar.
      </div>
    </div>
  );
}
