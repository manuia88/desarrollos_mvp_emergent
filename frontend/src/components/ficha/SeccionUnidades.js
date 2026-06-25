/**
 * SeccionUnidades — UI NUEVA (de cero) para "Las unidades". Solo dato real de dev.units. Tres capas:
 *  1) Resumen por TIPO (A/B/PH) con escasez honesta (status real).
 *  2) Elegir una unidad → su detalle (nivel, m², orientación, vista, terraza, cajones) + alimenta el riel y Tu dinero.
 *  3) Comparador hasta 3 unidades (upgrade).
 * Sistema visual único (Card/serif/tokens). NO reusa el componente viejo.
 */
import React, { useState } from 'react';
import { Card, SERIF, SANS, HEAD } from './ui';

const money = (n) => (n != null ? `$${Number(n).toLocaleString('es-MX')}` : '—');
const PROTO = { PH: 'Penthouse', ph: 'Penthouse' };
const protoName = (p) => PROTO[p] || `Tipo ${p}`;
const rng = (a, b) => (a === b ? `${a}` : `${a}–${b}`);
const STATUS = {
  disponible: { l: 'Disponible', c: '#059669' },
  reservado: { l: 'Reservado', c: '#B45309' },
  vendido: { l: 'Vendido', c: 'var(--cream-3)' },
};

// Escasez honesta: del conteo real de disponibles, no inventado.
function escasez(avail, total) {
  if (avail === 0) return { txt: 'Agotado', c: 'var(--cream-3)', urgente: false };
  if (avail <= 3) return { txt: `Solo ${avail} disponible${avail === 1 ? '' : 's'}`, c: '#DC2626', urgente: true };
  return { txt: `${avail} disponibles`, c: '#059669', urgente: false };
}

function attrs(u) {
  const out = [];
  if (u.level != null) out.push(`Piso ${u.level}`);
  if (u.m2_total || u.m2_privative) out.push(`${u.m2_total || u.m2_privative} m²`);
  if (u.bedrooms != null) out.push(`${u.bedrooms} rec`);
  if (u.bathrooms != null) out.push(`${u.bathrooms} baño${u.bathrooms === 1 ? '' : 's'}`);
  if (u.parking_spots) out.push(`${u.parking_spots} estac.`);
  if (u.orientation) out.push(u.orientation);
  if (u.vista) out.push(`Vista ${String(u.vista).toLowerCase()}`);
  if (u.terraza) out.push('Terraza');
  if (u.balcon) out.push('Balcón');
  if (u.roof_garden) out.push('Roof garden');
  if (u.bodega) out.push('Bodega');
  return out;
}

export default function SeccionUnidades({ dev, selectedUnit, onSelectUnit }) {
  const units = dev.units || [];
  const [openType, setOpenType] = useState(null);
  const [compare, setCompare] = useState([]);
  if (!units.length) return null;

  const groups = {};
  units.forEach((u) => { const k = u.prototype || '?'; (groups[k] = groups[k] || []).push(u); });
  const rows = Object.entries(groups).map(([proto, us]) => {
    const avail = us.filter((u) => u.status === 'disponible').length;
    const m2s = us.map((u) => u.m2_total || u.m2_privative).filter(Boolean);
    const beds = us.map((u) => u.bedrooms).filter((x) => x != null);
    const baths = us.map((u) => u.bathrooms).filter((x) => x != null);
    const park = us.map((u) => u.parking_spots).filter((x) => x != null);
    const prices = us.map((u) => u.price).filter(Boolean);
    return {
      proto, us, total: us.length, avail,
      m2: m2s.length ? [Math.min(...m2s), Math.max(...m2s)] : null,
      beds: beds.length ? [Math.min(...beds), Math.max(...beds)] : null,
      baths: baths.length ? [Math.min(...baths), Math.max(...baths)] : null,
      park: park.length ? [Math.min(...park), Math.max(...park)] : null,
      from: prices.length ? Math.min(...prices) : null,
    };
  }).sort((a, b) => (a.from || 0) - (b.from || 0));

  const toggleCompare = (id, e) => { e.stopPropagation(); setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : (c.length < 3 ? [...c, id] : c))); };
  const compareUnits = compare.map((id) => units.find((u) => u.id === id)).filter(Boolean);
  const totalAvail = units.filter((u) => u.status === 'disponible').length;

  return (
    <div>
      {/* resumen global honesto */}
      <div style={{ fontFamily: SANS, fontSize: 13.5, color: 'var(--cream-2)', marginBottom: 16 }}>
        <strong style={{ color: 'var(--cream)' }}>{totalAvail} de {units.length}</strong> unidades disponibles · {rows.length} tipo{rows.length === 1 ? '' : 's'}
      </div>

      {/* CAPA 1 · por tipo */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map((r) => {
          const esc = escasez(r.avail, r.total);
          const open = openType === r.proto;
          return (
            <Card key={r.proto} style={{ padding: 0, overflow: 'hidden' }}>
              <button onClick={() => setOpenType(open ? null : r.proto)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', padding: '18px 20px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ minWidth: 160 }}>
                  <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 22, color: 'var(--cream)' }}>{protoName(r.proto)}</div>
                  <div style={{ fontFamily: SANS, fontSize: 12.5, marginTop: 3, fontWeight: 700, color: esc.c }}>{esc.urgente ? '🔥 ' : ''}{esc.txt}<span style={{ color: 'var(--cream-3)', fontWeight: 400 }}> · de {r.total}</span></div>
                </div>
                <div style={{ display: 'flex', gap: 18, fontFamily: SANS, fontSize: 13, color: 'var(--cream-2)', flexWrap: 'wrap' }}>
                  {r.beds && <span>{rng(r.beds[0], r.beds[1])} rec</span>}
                  {r.baths && <span>{rng(r.baths[0], r.baths[1])} baños</span>}
                  {r.m2 && <span>{rng(r.m2[0], r.m2[1])} m²</span>}
                  {r.park && <span>{rng(r.park[0], r.park[1])} estac.</span>}
                </div>
                <div style={{ textAlign: 'right', minWidth: 120 }}>
                  {r.from && <><div style={{ fontFamily: SANS, fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Desde</div>
                    <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 19, color: 'var(--cream)' }}>{money(r.from)}</div></>}
                  <div style={{ fontFamily: SANS, fontSize: 12, color: 'var(--theme)', fontWeight: 700, marginTop: 4 }}>{open ? 'Ocultar ▲' : `Ver ${r.avail} ▾`}</div>
                </div>
              </button>

              {/* CAPA 2 · unidades disponibles del tipo */}
              {open && (
                <div style={{ borderTop: '1px solid var(--card-border, var(--border))', padding: 16, background: 'rgba(99,102,241,0.02)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 10 }}>
                    {r.us.slice().sort((a, b) => (a.status === 'disponible' ? -1 : 1) - (b.status === 'disponible' ? -1 : 1) || (a.price || 0) - (b.price || 0)).map((u) => {
                      const dispo = u.status === 'disponible';
                      const sel = selectedUnit && selectedUnit.id === u.id;
                      const cmp = compare.includes(u.id);
                      const st = STATUS[u.status] || STATUS.disponible;
                      return (
                        <div key={u.id} onClick={() => dispo && onSelectUnit && onSelectUnit(sel ? null : u)}
                          style={{ position: 'relative', padding: '12px 13px', borderRadius: 12, border: `1.5px solid ${sel ? 'var(--theme)' : 'var(--card-border, var(--border))'}`, background: sel ? 'rgba(99,102,241,0.06)' : 'var(--surface-card)', cursor: dispo ? 'pointer' : 'default', opacity: dispo ? 1 : 0.55 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>{u.unit_number}</span>
                            <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, color: st.c, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{st.l}</span>
                          </div>
                          <div style={{ fontFamily: SANS, fontSize: 12, color: 'var(--cream-2)', marginTop: 4 }}>Piso {u.level} · {u.m2_total || u.m2_privative} m²{u.vista ? ` · ${u.vista}` : ''}</div>
                          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: 'var(--cream)', marginTop: 6 }}>{money(u.price)}</div>
                          {dispo && (
                            <label onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, fontFamily: SANS, fontSize: 11, color: cmp ? 'var(--theme)' : 'var(--cream-3)', fontWeight: 600, cursor: 'pointer' }}>
                              <input type="checkbox" checked={cmp} onChange={(e) => toggleCompare(u.id, e)} style={{ accentColor: 'var(--theme)' }} /> Comparar
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* unidad elegida — detalle */}
      {selectedUnit && (
        <Card style={{ marginTop: 14, borderColor: 'var(--theme)', background: 'rgba(99,102,241,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--theme)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tu unidad elegida</div>
            <button onClick={() => onSelectUnit && onSelectUnit(null)} style={{ background: 'transparent', border: 'none', color: 'var(--cream-3)', fontFamily: SANS, fontSize: 12, cursor: 'pointer' }}>Quitar ✕</button>
          </div>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 26, color: 'var(--cream)', margin: '4px 0 2px' }}>{protoName(selectedUnit.prototype)} · {selectedUnit.unit_number}</div>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 24, color: 'var(--cream)' }}>{money(selectedUnit.price)}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
            {attrs(selectedUnit).map((a, i) => (
              <span key={i} style={{ padding: '6px 11px', borderRadius: 9, background: 'var(--surface-card)', border: '1px solid var(--card-border, var(--border))', fontFamily: SANS, fontSize: 12, color: 'var(--cream-2)' }}>{a}</span>
            ))}
          </div>
          <div style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-3)', marginTop: 12 }}>↓ Tu dinero y el riel ya calculan con esta unidad.</div>
        </Card>
      )}

      {/* comparador (upgrade) */}
      {compareUnits.length >= 2 && (
        <Card style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 19, color: 'var(--cream)' }}>Comparar {compareUnits.length} unidades</div>
            <button onClick={() => setCompare([])} style={{ background: 'transparent', border: 'none', color: 'var(--cream-3)', fontFamily: SANS, fontSize: 12, cursor: 'pointer' }}>Limpiar</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SANS, fontSize: 13 }}>
              <thead>
                <tr>
                  <th />
                  {compareUnits.map((u) => <th key={u.id} style={{ textAlign: 'left', padding: '6px 12px', fontFamily: HEAD, fontWeight: 800, fontSize: 14, color: 'var(--cream)' }}>{u.unit_number}</th>)}
                </tr>
              </thead>
              <tbody>
                {[['Precio', (u) => money(u.price)], ['Piso', (u) => u.level], ['m² totales', (u) => u.m2_total || u.m2_privative], ['Recámaras', (u) => u.bedrooms], ['Baños', (u) => u.bathrooms], ['Estac.', (u) => u.parking_spots || '—'], ['Orientación', (u) => u.orientation || '—'], ['Vista', (u) => u.vista || '—'], ['Extras', (u) => [u.terraza && 'Terraza', u.balcon && 'Balcón', u.roof_garden && 'Roof', u.bodega && 'Bodega'].filter(Boolean).join(', ') || '—']].map(([label, fn], i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--card-border, var(--border))' }}>
                    <td style={{ padding: '9px 12px', color: 'var(--cream-3)', fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</td>
                    {compareUnits.map((u) => <td key={u.id} style={{ padding: '9px 12px', color: 'var(--cream)' }}>{fn(u)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
