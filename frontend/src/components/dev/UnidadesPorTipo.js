/**
 * UnidadesPorTipo — resumen de inventario por PROTOTIPO (estilo kplr): en vez de una tabla de 56 filas, agrupa por tipo
 * (A/B/PH) con disponibles, tamaño, recámaras/baños y "desde". Da la foto completa del inventario sin revelar cada unidad
 * (la tabla detallada sigue, con su gate). Solo dato real de dev.units.
 */
import React from 'react';

const money = (n) => `$${Number(n).toLocaleString('es-MX')}`;
const PROTO_LABEL = { PH: 'Penthouse', ph: 'Penthouse' };
const protoName = (p) => PROTO_LABEL[p] || `Tipo ${p}`;
const rng = (a, b) => (a === b ? `${a}` : `${a}–${b}`);

export default function UnidadesPorTipo({ dev }) {
  const units = dev.units || [];
  if (!units.length) return null;

  const groups = {};
  units.forEach((u) => { const k = u.prototype || '?'; (groups[k] = groups[k] || []).push(u); });

  const rows = Object.entries(groups).map(([proto, us]) => {
    const avail = us.filter((u) => u.status === 'disponible').length;
    const m2s = us.map((u) => u.m2_total || u.m2_privative).filter(Boolean);
    const beds = us.map((u) => u.bedrooms).filter((x) => x != null);
    const baths = us.map((u) => u.bathrooms).filter((x) => x != null);
    const prices = us.map((u) => u.price).filter(Boolean);
    return {
      proto, total: us.length, avail,
      m2: m2s.length ? [Math.min(...m2s), Math.max(...m2s)] : null,
      beds: beds.length ? [Math.min(...beds), Math.max(...beds)] : null,
      baths: baths.length ? Math.max(...baths) : null,
      from: prices.length ? Math.min(...prices) : null,
    };
  }).sort((a, b) => (a.from || 0) - (b.from || 0));

  return (
    <section data-testid="unidades-tipo" style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Unidades por tipo</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((r) => (
          <div key={r.proto} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', padding: '15px 18px', borderRadius: 14, border: '1px solid var(--card-border, var(--border))', background: 'var(--surface-card)' }}>
            <div style={{ minWidth: 150 }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: 'var(--cream)' }}>{protoName(r.proto)}</div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, marginTop: 2, fontWeight: 700, color: r.avail ? '#059669' : 'var(--cream-3)' }}>
                {r.avail > 0 ? `${r.avail} disponible${r.avail === 1 ? '' : 's'}` : 'Agotado'}
                <span style={{ color: 'var(--cream-3)', fontWeight: 400 }}> · de {r.total}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 18, fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', flexWrap: 'wrap' }}>
              {r.beds && <span>🛏️ {rng(r.beds[0], r.beds[1])} rec</span>}
              {r.baths != null && <span>🛁 {r.baths} baño{r.baths === 1 ? '' : 's'}</span>}
              {r.m2 && <span>📐 {rng(r.m2[0], r.m2[1])} m²</span>}
            </div>
            {r.from && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Desde</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)' }}>{money(r.from)}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
