/**
 * SeccionUnidades — UI NUEVA (de cero) para "Las unidades". Solo dato real de dev.units. Tres capas:
 *  1) Resumen por TIPO (A/B/PH) con escasez honesta (status real).
 *  2) Elegir una unidad → su detalle (nivel, m², orientación, vista, terraza, cajones) + alimenta el riel y Tu dinero.
 *  3) Comparador hasta 3 unidades (upgrade).
 * Sistema visual único (Card/serif/tokens). NO reusa el componente viejo.
 */
import React, { useState, useRef, useEffect } from 'react';
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

// Vista: clasifica interior/exterior (como en lista de precios) y conserva el matiz real.
const vistaLabel = (v) => (!v ? null : (String(v).toLowerCase() === 'interior' ? 'Interior' : `Exterior · ${v}`));
const m2line = (u) => {
  const t = u.m2_total || u.m2_privative;
  if (!t) return null;
  const partes = [u.m2_privative && `${u.m2_privative} int`, u.m2_balcony && `${u.m2_balcony} balcón`, u.m2_terrace && `${u.m2_terrace} terraza`, u.m2_roof_garden && `${u.m2_roof_garden} roof`].filter(Boolean);
  return partes.length > 1 ? `${t} m² · ${partes.join(' + ')}` : `${t} m²`;
};
// Ficha técnica de la unidad — conceptos reales tipo lista de precios del dev.
function specRows(u) {
  const estac = u.parking_spots ? `${u.parking_spots} cajón${u.parking_spots === 1 ? '' : 'es'}${u.estacionamiento_independiente ? ' · independiente' : ''}${u.parking_type && u.parking_type !== 'individual' ? ` · ${u.parking_type}` : ''}` : null;
  return [
    ['Nivel', u.level != null ? `Piso ${u.level}` : null],
    ['Superficie', m2line(u)],
    ['Distribución', [u.bedrooms != null && `${u.bedrooms} recámaras`, u.bathrooms != null && `${u.bathrooms} baños`].filter(Boolean).join(' · ') || null],
    ['Vista', vistaLabel(u.vista)],
    ['Orientación', u.orientation || null],
    ['Estacionamiento', estac],
    ['Bodega', u.bodega ? 'Sí, incluida' : 'No incluida'],
  ].filter(([, v]) => v != null);
}
const extras = (u) => [u.terraza && 'Terraza', u.balcon && 'Balcón', u.roof_garden && 'Roof garden', u.pet_friendly && 'Pet friendly'].filter(Boolean);

export default function SeccionUnidades({ dev, selectedUnit, onSelectUnit, onGoTo }) {
  const units = dev.units || [];
  const [openType, setOpenType] = useState(null);
  const [compare, setCompare] = useState([]);
  const detailRef = useRef(null);
  // al elegir unidad → llevar el detalle a la vista (para que SÍ se note la selección)
  useEffect(() => {
    if (selectedUnit && detailRef.current) detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedUnit && selectedUnit.id]);
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

      {/* unidad elegida — detalle rico (plano/render + ficha técnica + enlace a calculadoras) */}
      {selectedUnit && (() => {
        const u = selectedUnit;
        const plano = u.plano_url || u.render_url || ((dev.config || {}).planos || {})[u.prototype];
        const fallbackImg = (dev.photos || [])[0];
        return (
          <Card ref={detailRef} style={{ marginTop: 16, borderColor: 'var(--theme)', boxShadow: '0 0 0 3px rgba(99,102,241,0.12), 0 14px 34px rgba(16,18,28,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--theme)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>✓ Tu unidad elegida</div>
              <button onClick={() => onSelectUnit && onSelectUnit(null)} style={{ background: 'transparent', border: 'none', color: 'var(--cream-3)', fontFamily: SANS, fontSize: 12, cursor: 'pointer' }}>Quitar ✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr)', gap: 22, alignItems: 'start' }}>
              {/* plano / render */}
              <div>
                <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--card-border, var(--border))', aspectRatio: '4 / 3', background: 'var(--surface-card)' }}>
                  {plano || fallbackImg ? (
                    <img src={plano || fallbackImg} alt={`Vista ${protoName(u.prototype)}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SERIF, fontWeight: 700, fontSize: 40, color: 'var(--cream-3)' }}>{protoName(u.prototype)}</div>
                  )}
                  <span style={{ position: 'absolute', left: 10, bottom: 10, padding: '4px 10px', borderRadius: 9999, background: 'rgba(16,18,28,0.62)', color: '#fff', fontFamily: SANS, fontSize: 11, fontWeight: 700 }}>{plano ? `Plano ${protoName(u.prototype)}` : `Render · ${dev.name}`}</span>
                </div>
                {!plano && (
                  <button onClick={() => window.dispatchEvent(new CustomEvent('dmx:ask-atlax', { detail: { devId: dev.id, intent: 'plano', unit: u.unit_number, prototype: u.prototype } }))} style={{ marginTop: 10, width: '100%', padding: '10px 14px', borderRadius: 11, border: '1px solid var(--card-border, var(--border))', background: 'transparent', color: 'var(--theme)', fontFamily: HEAD, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>📐 Pedir plano y ficha técnica del {protoName(u.prototype)}</button>
                )}
              </div>

              {/* ficha técnica */}
              <div>
                <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 26, color: 'var(--cream)', lineHeight: 1.05 }}>{protoName(u.prototype)} · {u.unit_number}</div>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: '2px 0 14px' }}>{money(u.price)}</div>
                <div>
                  {specRows(u).map(([k, v], i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '8px 0', borderTop: i ? '1px solid var(--card-border, var(--border))' : 'none', fontFamily: SANS, fontSize: 13.5 }}>
                      <span style={{ color: 'var(--cream-3)' }}>{k}</span>
                      <span style={{ color: 'var(--cream)', fontWeight: 600, textAlign: 'right' }}>{v}</span>
                    </div>
                  ))}
                </div>
                {extras(u).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
                    {extras(u).map((e, i) => <span key={i} style={{ padding: '5px 11px', borderRadius: 9, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.22)', fontFamily: SANS, fontSize: 12, fontWeight: 700, color: '#059669' }}>✓ {e}</span>)}
                  </div>
                )}
              </div>
            </div>

            {/* enlace explícito a las calculadoras */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--card-border, var(--border))' }}>
              <button onClick={() => onGoTo && onGoTo('dinero')} style={{ padding: '12px 20px', borderRadius: 12, border: 'none', background: 'var(--grad)', color: '#fff', fontFamily: HEAD, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>Calcular mi pago con esta unidad ↓</button>
              <span style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-3)', alignSelf: 'center' }}>Todas las cuentas (crédito, plan, inversión) ya usan la {u.unit_number}.</span>
            </div>
          </Card>
        );
      })()}

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
