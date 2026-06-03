// Tanda 3 · Panel de costos e impuestos de cierre (motor tax_projector, antes sin UI dev).
// Surfacea /api/tax/closing-cost-total: ISAI + notario + avalúo + gestorías + registro + IVA.
import React, { useState } from 'react';
import { getClosingCost } from '../../api/tax_projector';

const fmt = (v) => (v == null ? '—' : `$${Math.round(v).toLocaleString('es-MX')}`);

const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 9,
  background: 'rgba(var(--cream-rgb),0.05)', border: '1px solid var(--border, rgba(var(--cream-rgb),0.14))',
  color: 'var(--cream)', fontFamily: 'DM Sans,sans-serif', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};
const labelStyle = { fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 5 };

export default function TaxClosingPanel({ defaultPrecio = 5000000 }) {
  const [precio, setPrecio] = useState(defaultPrecio);
  const [catastral, setCatastral] = useState(Math.round(defaultPrecio * 0.6));
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);

  const calc = async () => {
    setLoading(true);
    try {
      setRes(await getClosingCost({
        precio_venta: Number(precio) || 0,
        valor_catastral: Number(catastral) || 0,
        year: 2026, con_credito_hipotecario: false,
      }));
    } catch (_) { setRes(null); }
    setLoading(false);
  };

  const lines = res ? [
    ['ISAI · traslado de dominio', res.isai],
    ['Honorarios de notario', res.notario_fees],
    ['Avalúo', res.avaluo],
    ['Gestorías y certificados', res.gestorias],
    ['Registro público (RPP)', res.registro],
    ['IVA (sobre honorarios)', res.iva],
  ] : [];

  return (
    <div data-testid="tax-closing-panel" style={{
      background: 'var(--surface, rgba(var(--cream-rgb),0.03))', border: '1px solid var(--border, rgba(var(--cream-rgb),0.10))',
      borderRadius: 14, padding: 18, boxShadow: 'var(--asr-shadow, none)',
    }}>
      <div className="eyebrow" style={{ marginBottom: 4, color: 'var(--theme)' }}>COSTOS E IMPUESTOS DE CIERRE</div>
      <div style={{ fontSize: 12.5, color: 'var(--cream-2)', marginBottom: 14 }}>
        Lo que cuesta cerrar la operación (CDMX 2026): ISAI, notario, avalúo, registro e IVA.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end', marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>Precio de venta</label>
          <input type="number" value={precio} onChange={e => setPrecio(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Valor catastral</label>
          <input type="number" value={catastral} onChange={e => setCatastral(e.target.value)} style={inputStyle} />
        </div>
        <button onClick={calc} disabled={loading} style={{
          padding: '9px 18px', borderRadius: 9, border: 'none', cursor: loading ? 'wait' : 'pointer',
          background: 'var(--grad, linear-gradient(120deg,#6366F1,#EC4899))', color: '#fff',
          fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 800, opacity: loading ? 0.7 : 1, whiteSpace: 'nowrap',
        }}>{loading ? 'Calculando…' : 'Calcular'}</button>
      </div>

      {res && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 14px', borderRadius: 10, background: 'rgba(var(--theme-rgb),0.06)', border: '1px solid rgba(var(--theme-rgb),0.18)', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total de cierre</span>
            <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>{fmt(res.total)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {lines.map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--cream-2)' }}>
                <span>{label}</span>
                <span style={{ fontWeight: 700, color: 'var(--cream)' }}>{fmt(val)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
