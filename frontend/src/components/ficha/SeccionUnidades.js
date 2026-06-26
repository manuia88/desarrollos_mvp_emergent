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

// ════ LISTA DE PRECIOS (diseño de VentasTab · portal dev) — helpers + estados + columnas ════
const fmtFull = (v) => (v || v === 0) ? `$${Number(v).toLocaleString('es-MX')}` : '—';
const fm2 = (v) => (v || v === 0) ? `${v} m²` : '—';
const m2priv = (u) => u.m2_privative ?? u.m2_priv ?? null;
const m2balc = (u) => u.m2_balcony ?? u.m2_balcon ?? null;
const m2terr = (u) => u.m2_terrace ?? null;
const m2roof = (u) => u.m2_roof_garden ?? u.m2_roof ?? null;
const m2tot = (u) => u.m2_total ?? u.area_total ?? null;
const totalBreakdown = (u) => { const p = m2priv(u); if (!p) return null; let s = `${p}`; if (m2balc(u) > 0) s += `+${m2balc(u)}bal`; if (m2terr(u) > 0) s += `+${m2terr(u)}ter`; if (m2roof(u) > 0) s += `+${m2roof(u)}rg`; return s.includes('+') ? s : null; };
const PARKING_TYPE_LABELS = { individual: 'Individual', dependiente: 'Dependiente', bateria: 'Batería propia', tandem: 'Tándem' };
const PARKING_TYPE_COLOR = { individual: '#15803d', bateria: '#c2410c', dependiente: '#b45309', tandem: '#7c3aed' };
// Estados con los colores que pidió el founder: disponible VERDE · reservado/apartado NARANJA · vendido ROJO.
const ESTADO = {
  disponible: { label: 'Disponible', color: '#15803d', bg: 'rgba(34,197,94,0.13)', bd: 'rgba(34,197,94,0.42)' },
  reservado:  { label: 'Reservado',  color: '#c2410c', bg: 'rgba(249,115,22,0.14)', bd: 'rgba(249,115,22,0.42)' },
  apartado:   { label: 'Apartado',   color: '#c2410c', bg: 'rgba(249,115,22,0.14)', bd: 'rgba(249,115,22,0.42)' },
  vendido:    { label: 'Vendido',    color: '#b91c1c', bg: 'rgba(224,70,61,0.12)', bd: 'rgba(224,70,61,0.38)' },
  bloqueado:  { label: 'No disponible', color: '#64748b', bg: 'rgba(100,116,139,0.13)', bd: 'rgba(100,116,139,0.4)' },
};
const EstadoChip = ({ status }) => { const c = ESTADO[status] || ESTADO.disponible; return <span style={{ background: c.bg, color: c.color, border: `1px solid ${c.bd}`, fontFamily: SANS, fontSize: 10.5, fontWeight: 800, padding: '3px 10px', borderRadius: 7, whiteSpace: 'nowrap' }}>{c.label}</span>; };
const tipoCajon = (u) => <span style={{ color: PARKING_TYPE_COLOR[u.parking_type] || 'var(--cream-3)', fontWeight: 700, fontSize: 12 }}>{PARKING_TYPE_LABELS[u.parking_type] || '—'}</span>;
// Bandas de categoría (como la imagen) + columnas con su getter para ordenar.
const CATS = [
  { label: 'Unidad', span: 3, rgb: '100,116,139', fg: '#334155' },
  { label: 'M² desglosados', span: 5, rgb: '56,150,230', fg: '#1e40af' },
  { label: 'Características', span: 3, rgb: '139,92,246', fg: '#5b21b6' },
  { label: 'Adicionales', span: 3, rgb: '99,102,241', fg: '#3730a3' },
  { label: 'Precio', span: 2, rgb: '34,197,94', fg: '#15803d' },
  { label: '', span: 1, rgb: null, fg: 'transparent' },
];
const HEADS = [
  ['ID', 'unit_number', false], ['PROTO.', 'prototype', false], ['NIVEL', 'level', true],
  ['M² PRIV.', 'm2priv', true], ['BALCÓN', 'm2balc', true], ['TERRAZA', 'm2terr', true], ['RG PRIV.', 'm2roof', true], ['M² TOTALES', 'm2tot', true],
  ['REC.', 'bedrooms', true], ['BAÑOS', 'bathrooms', true], ['CAJONES', 'parking_spots', true],
  ['TIPO CAJÓN', 'parking_type', false], ['BODEGA', 'bodega', false], ['VISTA', 'vista', false],
  ['PRECIO', 'price', true], ['ESTADO', 'status', false], ['', '', false],
];
const GET = { unit_number: (u) => u.unit_number || '', prototype: (u) => u.prototype || '', level: (u) => u.level ?? 0, m2priv: (u) => m2priv(u) || 0, m2balc: (u) => m2balc(u) || 0, m2terr: (u) => m2terr(u) || 0, m2roof: (u) => m2roof(u) || 0, m2tot: (u) => m2tot(u) || 0, bedrooms: (u) => u.bedrooms ?? 0, bathrooms: (u) => u.bathrooms ?? 0, parking_spots: (u) => u.parking_spots ?? 0, parking_type: (u) => u.parking_type || '', bodega: (u) => (u.bodega ? 1 : 0), vista: (u) => u.vista || '', price: (u) => u.price ?? 0, status: (u) => u.status || '' };
const LISTA_PAGE = 15;
const muLbl = { fontFamily: SANS, fontSize: 10.5, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.05em' };
const muVal = { fontFamily: SANS, fontSize: 13, color: 'var(--cream)', marginTop: 3 };
const pgBtn = (off) => ({ background: 'var(--surface-card)', color: off ? 'var(--cream-3)' : 'var(--cream)', border: '1px solid var(--card-border, var(--border))', borderRadius: 9, padding: '7px 15px', fontFamily: HEAD, fontSize: 12.5, fontWeight: 700, cursor: off ? 'default' : 'pointer', opacity: off ? 0.5 : 1 });

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
  const [sort, setSort] = useState({ col: 'unit_number', dir: 'asc' });
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState(null); // fila "+ Info" abierta
  useEffect(() => { try { localStorage.setItem('dmx.ficha.unitview', view); } catch (e) { /* noop */ } }, [view]);
  useEffect(() => { setPage(1); }, [sort]); // al reordenar, vuelve a la página 1
  const sortBy = (col) => { if (!col) return; setSort((s) => (s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' })); };
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

  // vista LISTA · lista de precios ordenable + paginada (15)
  const sortedUnits = units.slice().sort((a, b) => {
    const g = GET[sort.col] || GET.unit_number;
    const va = g(a), vb = g(b);
    const c = (typeof va === 'number' && typeof vb === 'number') ? (va - vb) : String(va).localeCompare(String(vb), 'es', { numeric: true });
    return sort.dir === 'asc' ? c : -c;
  });
  const totalPages = Math.max(1, Math.ceil(sortedUnits.length / LISTA_PAGE));
  const pageSafe = Math.min(page, totalPages);
  const paged = sortedUnits.slice((pageSafe - 1) * LISTA_PAGE, pageSafe * LISTA_PAGE);
  const colCats = []; CATS.forEach((c, ci) => { for (let k = 0; k < c.span; k++) colCats.push({ ...c, first: k === 0, ci }); });
  const selId = (u) => (multi ? selectedIds.includes(u.id) : (selectedUnit && selectedUnit.id === u.id));
  const cotizar = (u) => { if (u.status !== 'disponible') return; if (multi) { onToggleUnit && onToggleUnit(u.id); } else { onSelectUnit && onSelectUnit(selId(u) ? null : u); } };

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

      {/* ── VISTA LISTA · lista de precios (diseño VentasTab) — bandas + 16 columnas + Cotizar/+Info + paginación 15 ── */}
      {view === 'lista' && (
        <>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1080 }}>
              <thead>
                {/* fila 1 · bandas de categoría */}
                <tr>
                  {CATS.map((g, i) => (
                    <th key={i} colSpan={g.span} style={{ padding: g.label ? '7px 12px' : 0, textAlign: 'center', fontFamily: SANS, fontSize: 10, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: g.fg, background: g.rgb ? `rgba(${g.rgb},0.34)` : 'transparent', borderBottom: g.rgb ? `2px solid rgba(${g.rgb},0.8)` : '1px solid var(--card-border, var(--border))', borderLeft: (i > 0 && g.rgb) ? '1px solid rgba(16,18,28,0.1)' : 'none' }}>{g.label}</th>
                  ))}
                </tr>
                {/* fila 2 · columnas (ordenables) */}
                <tr>
                  {HEADS.map(([label, key, num], idx) => {
                    const c = colCats[idx] || {};
                    const active = sort.col === key;
                    return (
                      <th key={idx} onClick={() => sortBy(key)} style={{ padding: '8px 9px', textAlign: num ? 'right' : 'left', fontFamily: SANS, fontSize: 10.5, fontWeight: 700, color: active ? 'var(--theme)' : (c.rgb ? c.fg : 'var(--cream-3)'), background: c.rgb ? `rgba(${c.rgb},0.11)` : 'transparent', borderBottom: c.rgb ? `2px solid rgba(${c.rgb},0.45)` : '1px solid var(--card-border, var(--border))', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.04em', cursor: key ? 'pointer' : 'default', userSelect: 'none', borderLeft: (c.first && c.ci > 0 && c.rgb) ? `1px solid rgba(${c.rgb},0.3)` : 'none' }}>
                        {label}{active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {paged.map((u) => {
                  const dispo = u.status === 'disponible';
                  const sel = selId(u);
                  const lj = { padding: '8px 9px', fontFamily: SANS, fontSize: 12, color: 'var(--cream-2)', whiteSpace: 'nowrap' };
                  const bl = { borderLeft: '1px solid rgba(16,18,28,0.06)' };
                  return (
                    <React.Fragment key={u.id}>
                    <tr onClick={() => cotizar(u)} style={{ borderBottom: '1px solid rgba(16,18,28,0.06)', cursor: dispo ? 'pointer' : 'default', background: sel ? 'rgba(99,102,241,0.08)' : 'transparent', boxShadow: sel ? 'inset 3px 0 0 var(--theme)' : 'none', opacity: dispo ? 1 : 0.55 }}>
                      {/* UNIDAD */}
                      <td style={{ ...lj, fontFamily: HEAD, fontSize: 13, fontWeight: 800, color: sel ? 'var(--theme)' : 'var(--cream)' }}>{u.unit_number}</td>
                      <td style={{ ...lj }}><span style={{ display: 'inline-block', padding: '1px 9px', borderRadius: 6, background: 'rgba(16,18,28,0.06)', color: 'var(--cream-2)', fontSize: 11, fontWeight: 700 }}>{u.prototype || '—'}</span></td>
                      <td style={{ ...lj }}>{u.level ?? '—'}</td>
                      {/* M² DESGLOSADOS */}
                      <td style={{ ...lj, ...bl }}>{fm2(m2priv(u))}</td>
                      <td style={{ ...lj }}>{fm2(m2balc(u))}</td>
                      <td style={{ ...lj }}>{fm2(m2terr(u))}</td>
                      <td style={{ ...lj }}>{fm2(m2roof(u))}</td>
                      <td style={{ ...lj }}><div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cream)' }}>{fm2(m2tot(u))}</div>{totalBreakdown(u) && <div style={{ fontSize: 10, color: 'var(--cream-3)' }}>{totalBreakdown(u)}</div>}</td>
                      {/* CARACTERÍSTICAS */}
                      <td style={{ ...lj, ...bl }}>{u.bedrooms ?? '—'}</td>
                      <td style={{ ...lj }}>{u.bathrooms ?? '—'}</td>
                      <td style={{ ...lj }}>{u.parking_spots ?? '—'}</td>
                      {/* ADICIONALES */}
                      <td style={{ ...lj, ...bl }}>{tipoCajon(u)}</td>
                      <td style={{ ...lj }}><span style={{ color: u.bodega ? '#15803d' : 'var(--cream-3)', fontWeight: 700, fontSize: 12 }}>{u.bodega ? '✓ Incl.' : '—'}</span></td>
                      <td style={{ ...lj }}>{u.vista || '—'}</td>
                      {/* PRECIO */}
                      <td style={{ ...lj, ...bl, fontFamily: HEAD, fontSize: 12.5, fontWeight: 800, color: 'var(--cream)' }}>{fmtFull(u.price)}</td>
                      <td style={{ ...lj }}><EstadoChip status={u.status} /></td>
                      {/* ACCIONES */}
                      <td style={{ ...lj }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          {dispo && <button onClick={(e) => { e.stopPropagation(); cotizar(u); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: sel ? 'var(--cream)' : 'var(--grad)', border: 'none', color: '#fff', borderRadius: 9999, padding: '4px 13px', fontFamily: HEAD, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{sel ? '✓ Elegida' : '💲 Cotizar'}</button>}
                          <button onClick={(e) => { e.stopPropagation(); setExpandedId((x) => (x === u.id ? null : u.id)); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'rgba(16,18,28,0.05)', border: '1px solid var(--card-border, var(--border))', color: 'var(--cream-2)', borderRadius: 9999, padding: '4px 11px', fontFamily: HEAD, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{expandedId === u.id ? '− Info' : '+ Info'}</button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === u.id && (
                      <tr style={{ background: 'rgba(16,18,28,0.025)' }}>
                        <td colSpan={17} style={{ padding: '14px 18px', borderBottom: '1px solid rgba(16,18,28,0.06)' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, alignItems: 'flex-start' }}>
                            <div><div style={muLbl}>Superficie</div><div style={muVal}>{m2line(u) || '—'}</div></div>
                            <div><div style={muLbl}>Distribución</div><div style={muVal}>{[u.bedrooms != null && `${u.bedrooms} rec`, u.bathrooms != null && `${u.bathrooms} baños`, u.parking_spots != null && `${u.parking_spots} cajón${u.parking_spots === 1 ? '' : 'es'}`].filter(Boolean).join(' · ') || '—'}</div></div>
                            <div><div style={muLbl}>Cajón · bodega</div><div style={muVal}>{PARKING_TYPE_LABELS[u.parking_type] || '—'}{u.bodega ? ' · bodega incl.' : ''}</div></div>
                            <div><div style={muLbl}>Vista</div><div style={muVal}>{u.vista || '—'}</div></div>
                            {extras(u).length > 0 && <div><div style={muLbl}>Extras</div><div style={muVal}>{extras(u).join(' · ')}</div></div>}
                            <div style={{ marginLeft: 'auto' }}><div style={muLbl}>Precio</div><div style={{ ...muVal, fontFamily: HEAD, fontSize: 18, fontWeight: 800, color: 'var(--cream)' }}>{fmtFull(u.price)}</div></div>
                            {dispo && <button onClick={() => cotizar(u)} style={{ alignSelf: 'center', background: sel ? 'var(--cream)' : 'var(--grad)', border: 'none', color: '#fff', borderRadius: 11, padding: '10px 18px', fontFamily: HEAD, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{sel ? '✓ Elegida — ver números' : '💲 Cotizar esta unidad'}</button>}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        {/* paginación 15 por página */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 14 }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pageSafe === 1} style={pgBtn(pageSafe === 1)}>← Anterior</button>
            <span style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-2)' }}>Página <strong style={{ color: 'var(--cream)' }}>{pageSafe}</strong> de {totalPages} · {sortedUnits.length} unidades</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={pageSafe === totalPages} style={pgBtn(pageSafe === totalPages)}>Siguiente →</button>
          </div>
        )}
        </>
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
