/**
 * SeccionUnidades — UI NUEVA (de cero) para "Las unidades". Solo dato real de dev.units. Tres capas:
 *  1) Resumen por TIPO (A/B/PH) con escasez honesta (status real).
 *  2) Elegir una unidad → su detalle (nivel, m², orientación, vista, terraza, cajones) + alimenta el riel y Tu dinero.
 *  3) Comparador hasta 3 unidades (upgrade).
 * Sistema visual único (Card/serif/tokens). NO reusa el componente viejo.
 */
import React, { useState, useRef, useEffect } from 'react';
import { Card, SERIF, SANS, HEAD } from './ui';
import { amenInfo } from './amenIcons';

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

export default function SeccionUnidades({ dev, selectedUnit, onSelectUnit, onGoTo, multi = false, selectedIds = [], onToggleUnit }) {
  const units = dev.units || [];
  const [openType, setOpenType] = useState(null);
  const [compare, setCompare] = useState([]);
  const [view, setView] = useState(() => {
    try { const v = localStorage.getItem('dmx.ficha.unitview'); if (v) return v; } catch (e) { /* noop */ }
    return (typeof window !== 'undefined' && window.innerWidth <= 760) ? 'tarjetas' : 'lista';
  });
  const [sort, setSort] = useState({ col: 'price', dir: 'asc' });
  useEffect(() => { try { localStorage.setItem('dmx.ficha.unitview', view); } catch (e) { /* noop */ } }, [view]);
  const sortBy = (col) => setSort((s) => (s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' }));
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

  // vista LISTA · columnas ordenables (lista de precios)
  const COLS = [
    ['unit_number', 'Unidad', (u) => u.unit_number, false],
    ['level', 'Piso', (u) => u.level, true],
    ['m2', 'm²', (u) => u.m2_total || u.m2_privative, true],
    ['bedrooms', 'Rec', (u) => u.bedrooms, true],
    ['bathrooms', 'Baños', (u) => u.bathrooms, true],
    ['vista', 'Vista', (u) => u.vista, false],
    ['pm2', '$/m²', (u) => { const a = u.m2_total || u.m2_privative; return a ? Math.round((u.price || 0) / a) : null; }, true],
    ['price', 'Precio', (u) => u.price, true],
  ];
  const getter = Object.fromEntries(COLS.map(([k, , g]) => [k, g]));
  const sortedUnits = units.slice().sort((a, b) => {
    const g = getter[sort.col] || ((u) => u.price);
    const va = g(a), vb = g(b);
    const c = (typeof va === 'number' && typeof vb === 'number') ? (va - vb) : String(va == null ? '' : va).localeCompare(String(vb == null ? '' : vb));
    return sort.dir === 'asc' ? c : -c;
  });

  return (
    <div>
      {/* resumen + toggle tarjetas/lista */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ fontFamily: SANS, fontSize: 13.5, color: 'var(--cream-2)' }}>
          <strong style={{ color: 'var(--cream)' }}>{totalAvail} de {units.length}</strong> unidades disponibles · {rows.length} tipo{rows.length === 1 ? '' : 's'}
        </div>
        <div style={{ display: 'inline-flex', borderRadius: 10, border: '1px solid var(--card-border, var(--border))', padding: 2, background: 'var(--surface-card)' }}>
          {[['tarjetas', '▦ Tarjetas'], ['lista', '☰ Lista']].map(([v, l]) => {
            const on = view === v;
            return <button key={v} onClick={() => setView(v)} style={{ padding: '7px 13px', borderRadius: 8, border: 'none', cursor: 'pointer', background: on ? 'var(--theme)' : 'transparent', color: on ? '#fff' : 'var(--cream-2)', fontFamily: HEAD, fontWeight: 700, fontSize: 12.5 }}>{l}</button>;
          })}
        </div>
      </div>

      {/* ── VISTA LISTA · lista de precios ordenable ── */}
      {view === 'lista' && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SANS, fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--card-border, var(--border))' }}>
                  <th style={{ width: 30 }} />
                  {COLS.map(([key, label, , num]) => (
                    <th key={key} onClick={() => sortBy(key)} style={{ textAlign: num ? 'right' : 'left', padding: '11px 12px', fontFamily: SANS, fontSize: 11, fontWeight: 700, color: sort.col === key ? 'var(--theme)' : 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
                      {label}{sort.col === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                  ))}
                  <th style={{ textAlign: 'right', padding: '11px 12px', fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {sortedUnits.map((u) => {
                  const dispo = u.status === 'disponible';
                  const sel = multi ? selectedIds.includes(u.id) : (selectedUnit && selectedUnit.id === u.id);
                  const st = STATUS[u.status] || STATUS.disponible;
                  const m2 = u.m2_total || u.m2_privative;
                  const pm2 = m2 ? Math.round((u.price || 0) / m2) : null;
                  const onRow = () => { if (!dispo) return; if (multi) onToggleUnit && onToggleUnit(u.id); else onSelectUnit && onSelectUnit(sel ? null : u); };
                  return (
                    <tr key={u.id} onClick={onRow} style={{ borderBottom: '1px solid var(--card-border, var(--border))', cursor: dispo ? 'pointer' : 'default', background: sel ? 'rgba(99,102,241,0.07)' : 'transparent', opacity: dispo ? 1 : 0.5 }}>
                      <td style={{ textAlign: 'center', color: sel ? 'var(--theme)' : 'var(--cream-3)', fontWeight: 800 }}>{dispo ? (sel ? '✓' : '○') : '·'}</td>
                      <td style={{ padding: '11px 12px', fontFamily: HEAD, fontWeight: 800, color: sel ? 'var(--theme)' : 'var(--cream)' }}>{u.unit_number}</td>
                      <td style={{ padding: '11px 12px', textAlign: 'right', color: 'var(--cream-2)' }}>{u.level}</td>
                      <td style={{ padding: '11px 12px', textAlign: 'right', color: 'var(--cream-2)' }}>{m2}</td>
                      <td style={{ padding: '11px 12px', textAlign: 'right', color: 'var(--cream-2)' }}>{u.bedrooms ?? '—'}</td>
                      <td style={{ padding: '11px 12px', textAlign: 'right', color: 'var(--cream-2)' }}>{u.bathrooms ?? '—'}</td>
                      <td style={{ padding: '11px 12px', color: 'var(--cream-2)', whiteSpace: 'nowrap' }}>{u.vista || '—'}</td>
                      <td style={{ padding: '11px 12px', textAlign: 'right', color: 'var(--cream-3)' }}>{pm2 ? `$${pm2.toLocaleString('es-MX')}` : '—'}</td>
                      <td style={{ padding: '11px 12px', textAlign: 'right', fontFamily: HEAD, fontWeight: 800, color: 'var(--cream)', whiteSpace: 'nowrap' }}>{money(u.price)}</td>
                      <td style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 700, color: st.c, whiteSpace: 'nowrap', fontSize: 12 }}>{st.l}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* CAPA 1 · por tipo (tarjetas) */}
      {view === 'tarjetas' && (
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
                      const sel = multi ? selectedIds.includes(u.id) : (selectedUnit && selectedUnit.id === u.id);
                      const cmp = compare.includes(u.id);
                      const st = STATUS[u.status] || STATUS.disponible;
                      const onCell = () => { if (!dispo) return; if (multi) { onToggleUnit && onToggleUnit(u.id); } else { onSelectUnit && onSelectUnit(sel ? null : u); } };
                      return (
                        <div key={u.id} onClick={onCell}
                          style={{ position: 'relative', padding: '12px 13px', borderRadius: 12, border: `1.5px solid ${sel ? 'var(--theme)' : 'var(--card-border, var(--border))'}`, background: sel ? 'rgba(99,102,241,0.06)' : 'var(--surface-card)', cursor: dispo ? 'pointer' : 'default', opacity: dispo ? 1 : 0.55 }}>
                          {multi && dispo && <span style={{ position: 'absolute', top: 8, right: 8, width: 16, height: 16, borderRadius: '50%', border: `1.5px solid ${sel ? 'var(--theme)' : 'var(--card-border, var(--border))'}`, background: sel ? 'var(--theme)' : 'transparent', color: '#fff', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{sel ? '✓' : ''}</span>}
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
      )}

      {/* institucional: resumen del fondo (multi-selección) */}
      {multi && selectedIds.length > 0 && (() => {
        const sel = units.filter((u) => selectedIds.includes(u.id));
        const total = sel.reduce((s, u) => s + (u.price || 0), 0);
        return (
          <Card style={{ marginTop: 16, borderColor: 'var(--theme)', background: 'rgba(99,102,241,0.04)' }}>
            <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--theme)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>El fondo compra</div>
            <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 24, color: 'var(--cream)', margin: '4px 0 2px' }}>{sel.length} {sel.length === 1 ? 'unidad' : 'unidades'} · {money(total)}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
              {sel.map((u) => <span key={u.id} style={{ padding: '5px 11px', borderRadius: 9, background: 'var(--surface-card)', border: '1px solid var(--card-border, var(--border))', fontFamily: SANS, fontSize: 12, fontWeight: 600, color: 'var(--cream)' }}>{u.unit_number} · {money(u.price)}</span>)}
            </div>
            <div style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-3)', marginTop: 12 }}>↓ Tu análisis de inversión ya corre con este portafolio.</div>
          </Card>
        );
      })()}

      {/* unidad elegida — detalle rico (plano/render + ficha técnica + enlace a calculadoras) · solo selección individual */}
      {!multi && selectedUnit && (() => {
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

            {/* amenidades del edificio (las disfruta esta unidad) */}
            {(() => {
              const am = Array.isArray((dev.config || {}).amenidades) && dev.config.amenidades.length ? dev.config.amenidades : (dev.amenities || []);
              if (!am.length) return null;
              return (
                <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--card-border, var(--border))' }}>
                  <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Amenidades del edificio</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {am.map((a, i) => { const { icon, label } = amenInfo(a); return (
                      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 10, background: 'var(--surface-card)', border: '1px solid var(--card-border, var(--border))', fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: 'var(--cream)' }}><span style={{ fontSize: 15 }}>{icon}</span> {label}</span>
                    ); })}
                  </div>
                </div>
              );
            })()}

            {/* enlace explícito a las calculadoras */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--card-border, var(--border))' }}>
              <button onClick={() => onGoTo && onGoTo('panorama')} style={{ padding: '12px 20px', borderRadius: 12, border: 'none', background: 'var(--grad)', color: '#fff', fontFamily: HEAD, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>Ver mi panorama con esta unidad ↓</button>
              <span style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-3)', alignSelf: 'center' }}>Tu panorama (vivir/invertir) ya usa la {u.unit_number}.</span>
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
