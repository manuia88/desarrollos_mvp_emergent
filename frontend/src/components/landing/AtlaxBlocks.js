// AtlaxBlocks — Capa 1 F3 · render de los "bloques generativos" que arma Atlax (la respuesta construye UI inline).
// Recibe message.blocks=[{type,data}] del backend (atlax_blocks.py, datos REALES) y los pinta dentro del chat.
// Hoy: comparison_table (compara zonas) + development_cards (resultados de búsqueda). Cero dato inventado.
import React from 'react';

const fmtMXN = (n) => (n == null ? '—' : `$${Math.round(n).toLocaleString('es-MX')}`);
const fmtM = (n) => {
  if (n == null) return '—';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M`;
  return fmtMXN(n);
};

const cell = (head) => ({
  padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 12.5,
  color: 'var(--cream)', textAlign: head ? 'center' : 'left',
});
const linkBtn = {
  flex: 1, textAlign: 'center', textDecoration: 'none', background: 'rgba(var(--theme-rgb),0.12)',
  color: 'var(--theme)', borderRadius: 8, padding: '7px 8px', fontSize: 11.5, fontWeight: 700,
};

function ComparisonTable({ data }) {
  const zones = (data && data.zones) || [];
  if (zones.length < 2) return null;
  const rows = [
    { label: 'Desde', get: (z) => fmtM(z.precio_desde) },
    { label: 'Hasta', get: (z) => fmtM(z.precio_hasta) },
    { label: 'Precio / m²', get: (z) => fmtMXN(z.precio_m2) },
    { label: 'Recámaras', get: (z) => (z.recamaras ? `${z.recamaras[0]}–${z.recamaras[1]}` : '—') },
    { label: 'Plusvalía / año', get: (z) => (z.plusvalia_pct != null ? `${z.plusvalia_pct}%` : '—'), hot: true },
    { label: 'Entrega inmediata', get: (z) => (z.entrega_inmediata ? `${z.entrega_inmediata}` : '—') },
    { label: 'Desarrollos', get: (z) => (z.n_desarrollos != null ? z.n_desarrollos : '—') },
  ];
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'rgba(255,255,255,0.03)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `1.15fr ${zones.map(() => '1fr').join(' ')}` }}>
        <div style={cell(true)} />
        {zones.map((z) => (
          <div key={z.slug} style={{ ...cell(true), fontWeight: 800 }}>
            {z.name}
            {z.alcaldia && <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--cream-3)' }}>{z.alcaldia}</div>}
          </div>
        ))}
        {rows.map((r) => (
          <React.Fragment key={r.label}>
            <div style={{ ...cell(false), color: 'var(--cream-3)' }}>{r.label}</div>
            {zones.map((z) => (
              <div key={z.slug} style={{ ...cell(false), ...(r.hot ? { color: '#10B981', fontWeight: 800 } : {}) }}>{r.get(z)}</div>
            ))}
          </React.Fragment>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: 8 }}>
        {zones.map((z) => (
          <a key={z.slug} href={`/zona/${z.slug}`} style={linkBtn}>Ver {z.name} →</a>
        ))}
      </div>
    </div>
  );
}

function DevelopmentCards({ data }) {
  const cards = (data && data.cards) || [];
  if (!cards.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.zona && <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--cream-3)' }}>Desarrollos en {data.zona}</div>}
      {cards.map((c) => (
        <a key={c.id} href={c.url || '#'} style={{
          display: 'flex', gap: 10, textDecoration: 'none', border: '1px solid var(--border)',
          borderRadius: 12, overflow: 'hidden', background: 'rgba(255,255,255,0.03)',
        }}>
          <div style={{ width: 72, height: 72, flexShrink: 0, background: '#1a1d2b' }}>
            {c.image && <img src={c.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
          </div>
          <div style={{ padding: '8px 10px 8px 0', minWidth: 0 }}>
            <div style={{ fontWeight: 800, color: 'var(--cream)', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
            <div style={{ color: 'var(--cream-3)', fontSize: 11.5 }}>{c.colonia}{c.alcaldia ? ` · ${c.alcaldia}` : ''}</div>
            <div style={{ color: 'var(--theme)', fontWeight: 800, fontSize: 12.5, marginTop: 2 }}>{c.price_display || fmtM(c.price_from)}</div>
          </div>
        </a>
      ))}
    </div>
  );
}

export default function AtlaxBlocks({ blocks }) {
  if (!blocks || !blocks.length) return null;
  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {blocks.map((b, i) => {
        if (b.type === 'comparison_table') return <ComparisonTable key={i} data={b.data} />;
        if (b.type === 'development_cards') return <DevelopmentCards key={i} data={b.data} />;
        return null;
      })}
    </div>
  );
}
