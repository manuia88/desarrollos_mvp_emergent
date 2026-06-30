// Superadmin · EXPLORADOR (árbol) — abres un nodo (ciudad ▸ alcaldía ▸ colonia ▸ desarrollo ▸ unidad) y ves
// TODOS sus datos, CADA SEGMENTO INDEPENDIENTE (2rec es un dato, 3rec es otro), nunca un blob. Navegar = clic
// (abrir carpetas). Lo dominante: el GAP coloreado (verde = oportunidad / ámbar = sobreoferta). Cero dato inventado.
import React, { useEffect, useState, useCallback } from 'react';
import { Card, Badge } from '../advisor/primitives';
import { getExplorar, postExplorarSegmento, getExplorarOportunidades, getDisenar, postActivar } from '../../api/superadminDemandIntel';

const card = { padding: '14px 18px' };
// encabezado de sección (organizador de la pantalla) — legible, jerárquico, contraste alto
const lbl = { fontSize: 12, color: '#b4b4c0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 };
// encabezado de columnas dentro de una tabla — más tenue que lbl pero aún legible
const colHead = { fontSize: 10.5, color: '#9a9aa6', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 };

const TIPO_LABEL = {
  ciudad: 'Ciudad', alcaldia: 'Alcaldía', colonia: 'Colonia', desarrollo: 'Desarrollo', unidad: 'Unidad',
};

const fmtN = (n) => (n == null ? '—' : Number(n).toLocaleString('es-MX'));
const fmtMX = (n) => (n == null ? '—' : `$${Math.round(n).toLocaleString('es-MX')}`);

// estado del dato (registro canónico): real=verde · derivado=azul · latente=gris · por_crear=gris
function estadoColor(estado) {
  if (estado === 'real') return '#1FA06A';
  if (estado === 'derivado') return '#6D4AFF';
  return '#888';
}

// pares chip → etiqueta legible del facet (para los chips de filtros acumulados)
const FACET_LABEL = {
  recamaras: 'Recámaras', tier_precio: 'Precio', rango_m2: 'm²', vista: 'Vista', piso: 'Piso',
  terraza: 'Terraza', balcon: 'Balcón', roof_garden: 'Roof garden', bodega: 'Bodega', pet_friendly: 'Pet friendly',
};
const facetLabel = (k) => FACET_LABEL[k] || k;

export default function ExploradorPanel() {
  const [nodo, setNodo] = useState({ tipo: 'ciudad', id: 'CDMX' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ── modo de lectura: mixto (oferta+demanda+gap) · oferta · demanda ──
  const [modo, setModo] = useState('mixto');

  // ── filtros acumulados (el analista compone) — objeto {facet:valor} ──
  const [filtrosActivos, setFiltrosActivos] = useState({});

  // ── panel de DRILL (resultado de abrir un segmento) ──
  const [drill, setDrill] = useState(null);          // respuesta de postExplorarSegmento
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillError, setDrillError] = useState(null);

  // ── modo automático: el cubo encuentra oportunidades/sobreofertas ──
  const [auto, setAuto] = useState(false);
  const [oport, setOport] = useState(null);
  const [oportLoading, setOportLoading] = useState(false);
  const [oportError, setOportError] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    getExplorar({ tipo: nodo.tipo, id: nodo.id, combinaciones: true })
      .then((d) => { if (alive) { if (d?.error) setError(d.error); setData(d); } })
      .catch((e) => { if (alive) { setError(e.message); setData(null); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [nodo.tipo, nodo.id]);

  // geo del nodo actual para el modo auto (solo colonia tiene sentido como filtro de zona)
  const geoAuto = nodo.tipo === 'colonia' ? { geo_nivel: 'colonia', geo_valor: nodo.id } : {};

  // cargar oportunidades cuando se activa el modo auto (o cambia el nodo estando activo)
  useEffect(() => {
    if (!auto) return;
    let alive = true;
    setOportLoading(true); setOportError(null);
    getExplorarOportunidades({ ...geoAuto, top: 15 })
      .then((d) => { if (alive) setOport(d); })
      .catch((e) => { if (alive) { setOportError(e.message); setOport(null); } })
      .finally(() => { if (alive) setOportLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, nodo.tipo, nodo.id]);

  const go = (tipo, id) => { if (tipo && id != null) { setData(null); setError(null); setDrill(null); setDrillError(null); setNodo({ tipo, id }); } };

  // abrir un segmento → drill (oferta+demanda) + acumular su filtro. extraFiltros permite componer sobre los activos.
  const abrirSegmento = useCallback((filtro, extra) => {
    if (!filtro) return;
    const baseExtra = extra || filtrosActivos;
    setDrillLoading(true); setDrillError(null);
    postExplorarSegmento({ tipo: nodo.tipo, id: nodo.id }, { filtros: filtro, extra: baseExtra })
      .then((d) => { setDrill(d); setFiltrosActivos((prev) => ({ ...prev, ...filtro })); })
      .catch((e) => { setDrillError(e.message); setDrill(null); })
      .finally(() => setDrillLoading(false));
  }, [nodo.tipo, nodo.id, filtrosActivos]);

  // ir a una colonia y aplicar el filtro de una oportunidad (drill desde modo auto)
  const irAOportunidad = useCallback((o) => {
    if (!o) return;
    const destino = (o.colonia_id != null) ? { tipo: 'colonia', id: o.colonia_id } : { tipo: nodo.tipo, id: nodo.id };
    setData(null); setError(null); setNodo(destino);
    setDrillLoading(true); setDrillError(null);
    postExplorarSegmento({ tipo: destino.tipo, id: destino.id }, { filtros: o.filtro || {}, extra: {} })
      .then((d) => { setDrill(d); setFiltrosActivos({ ...(o.filtro || {}) }); })
      .catch((e) => { setDrillError(e.message); setDrill(null); })
      .finally(() => setDrillLoading(false));
  }, [nodo.tipo, nodo.id]);

  const quitarFiltro = (k) => setFiltrosActivos((prev) => { const n = { ...prev }; delete n[k]; return n; });
  const limpiarFiltros = () => setFiltrosActivos({});
  const cerrarDrill = () => { setDrill(null); setDrillError(null); };

  const ruta = data?.ruta || [{ tipo: 'ciudad', id: 'CDMX', nombre: 'CDMX' }];
  const actual = data?.nodo || { tipo: nodo.tipo, id: nodo.id, nombre: nodo.id };
  const hijos = data?.hijos || [];
  const segmentos = data?.segmentos || [];
  const combinaciones = data?.combinaciones || [];
  const caracteristicas = data?.caracteristicas || [];
  const biografia = data?.biografia || null;   // solo viene en nodo UNIDAD
  const r = data?.resumen || {};

  // resumen legible — solo piezas con dato (>0)
  const resumenPartes = [];
  if (r.hijos != null) resumenPartes.push(`${r.hijos} ${r.hijos === 1 ? 'hijo' : 'hijos'}`);
  if (r.datos_independientes != null) resumenPartes.push(`${r.datos_independientes} datos independientes`);
  if (r.fichas_tecnicas) resumenPartes.push(`${r.fichas_tecnicas} fichas técnicas`);

  return (
    <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
      {/* ── ENCABEZADO: breadcrumb + nodo actual + resumen ── */}
      <Card style={card}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 10 }}>
          {ruta.map((c, i) => (
            <React.Fragment key={`${c.tipo}:${c.id}:${i}`}>
              {i > 0 && <span style={{ color: '#6a6a76' }}>/</span>}
              <button onClick={() => go(c.tipo, c.id)}
                style={{ padding: '3px 9px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: i === ruta.length - 1 ? 'var(--theme, #6366f1)' : 'transparent',
                  color: i === ruta.length - 1 ? '#fff' : '#bbb', fontWeight: i === ruta.length - 1 ? 700 : 500 }}>
                {c.nombre || c.id}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ fontSize: 11, color: '#9a9aa6', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>{TIPO_LABEL[actual.tipo] || actual.tipo}</span>
            <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--cream, #f4f4f6)', letterSpacing: '-0.02em', lineHeight: 1.05 }}>{actual.nombre || actual.id}</span>
          </div>
          {resumenPartes.length > 0 && <span style={{ fontSize: 12.5, color: '#b4b4c0' }}>{resumenPartes.join(' · ')}</span>}
        </div>

        {data?.lectura && <div style={{ fontSize: 12, color: '#9a9aa6', marginTop: 8, fontStyle: 'italic', lineHeight: 1.45 }}>{data.lectura}</div>}

        {/* ── controles: modo de lectura + modo automático ── */}
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11.5, color: '#9a9aa6', fontWeight: 600, marginRight: 2 }}>Ver:</span>
            {[['mixto', 'Mixto'], ['oferta', 'Oferta'], ['demanda', 'Demanda']].map(([val, lab]) => (
              <button key={val} onClick={() => setModo(val)}
                style={{ padding: '4px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: modo === val ? 700 : 500,
                  border: '1px solid ' + (modo === val ? 'var(--theme, #6366f1)' : 'rgba(255,255,255,0.1)'),
                  background: modo === val ? 'var(--theme, #6366f1)' : 'transparent', color: modo === val ? '#fff' : '#bbb' }}>
                {lab}
              </button>
            ))}
          </div>
          <button onClick={() => setAuto((a) => !a)}
            style={{ padding: '5px 13px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700,
              border: '1px solid ' + (auto ? '#1FA06A' : 'rgba(255,255,255,0.12)'),
              background: auto ? 'rgba(31,160,106,0.16)' : 'transparent', color: auto ? '#34d399' : '#bbb' }}>
            {auto ? '● Modo automático activo' : 'Modo automático'}
          </button>
        </div>

        {actual.id != null && actual.tipo !== 'ciudad' && (
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button onClick={() => go('ciudad', 'CDMX')}
              style={{ fontSize: 12, color: '#a8a8b3', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.12s ease' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--theme, #6366f1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#a8a8b3'; }}>
              ↑ Volver a la cima (CDMX)
            </button>
          </div>
        )}
      </Card>

      {/* ── FILTROS ACUMULADOS (el analista compone) ── */}
      {Object.keys(filtrosActivos).length > 0 && (
        <Card style={card}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span style={{ ...lbl, marginBottom: 0 }}>Filtros</span>
            {Object.entries(filtrosActivos).map(([k, v]) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 6px 3px 10px', borderRadius: 14,
                background: 'rgba(99,102,241,0.16)', border: '1px solid var(--theme, #6366f1)', fontSize: 12, color: '#ddd' }}>
                {facetLabel(k)}: <strong style={{ color: '#fff' }}>{String(v)}</strong>
                <button onClick={() => quitarFiltro(k)} aria-label={`quitar ${k}`}
                  style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px' }}>×</button>
              </span>
            ))}
            <button onClick={limpiarFiltros}
              style={{ fontSize: 11.5, color: '#888', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
              Limpiar todo
            </button>
          </div>
        </Card>
      )}

      {/* ── MODO AUTOMÁTICO: el cubo encontró ── */}
      {auto && (
        <OportunidadesPanel oport={oport} loading={oportLoading} error={oportError} onPick={irAOportunidad} />
      )}

      {/* ── DRILL: abrí un segmento, veo qué hay y quién lo busca ── */}
      {drillLoading && <Card style={card}><span style={{ fontSize: 12.5, color: '#aaa' }}>Abriendo el segmento…</span></Card>}
      {drillError && <Card style={{ ...card, color: '#dc2626', fontSize: 12.5 }}>{drillError}</Card>}
      {drill && !drillLoading && <DrillPanel drill={drill} modo={modo} onClose={cerrarDrill} />}

      {loading && <Card style={card}>Abriendo el nodo…</Card>}
      {error && <Card style={{ ...card, color: '#dc2626' }}>{error}</Card>}

      {data && !error && (
        <>
          {/* ── BAJAR A: los hijos (abrir = clic) ── */}
          {hijos.length > 0 && (
            <Card style={card}>
              <div style={lbl}>Bajar a · {hijos.length} {hijos.length === 1 ? 'nodo' : 'nodos'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                {hijos.map((c) => (
                  <button key={`${c.tipo}:${c.id}`} onClick={() => go(c.tipo, c.id)}
                    style={{ textAlign: 'left', padding: '9px 11px', borderRadius: 10, cursor: 'pointer',
                      border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)', color: '#e4e4ea',
                      display: 'flex', alignItems: 'center', gap: 8, transition: 'transform 0.12s ease, border-color 0.12s ease, background 0.12s ease' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--theme, #6366f1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.transform = 'translateY(-1px)'; const ch = e.currentTarget.querySelector('[data-chev]'); if (ch) { ch.style.color = 'var(--theme, #6366f1)'; ch.style.transform = 'translateX(2px)'; } }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.transform = 'translateY(0)'; const ch = e.currentTarget.querySelector('[data-chev]'); if (ch) { ch.style.color = '#777'; ch.style.transform = 'translateX(0)'; } }}>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre || c.id}</span>
                      <span style={{ fontSize: 11, color: '#9a9aa6' }}>
                        {c.tipo === 'unidad'
                          ? [c.precio != null ? fmtMX(c.precio) : null, c.m2 != null ? `${c.m2} m²` : null, c.recamaras != null ? `${c.recamaras} rec` : null, c.status]
                              .filter(Boolean).join(' · ') || (TIPO_LABEL[c.tipo] || c.tipo)
                          : [c.n_unidades != null ? `${fmtN(c.n_unidades)} unidades` : null, c.n_devs != null ? `${c.n_devs} desarrollos` : null, c.desarrollador]
                              .filter(Boolean).join(' · ') || (TIPO_LABEL[c.tipo] || c.tipo)}
                      </span>
                    </span>
                    <span data-chev style={{ fontSize: 17, color: '#777', lineHeight: 1, flexShrink: 0, transition: 'color 0.12s ease, transform 0.12s ease' }}>›</span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          {/* ── SEGMENTOS: cada item es un dato INDEPENDIENTE — clic = abrir (oferta+demanda) ── */}
          {segmentos.map((g) => <SegmentoGrupo key={g.dimension} g={g} modo={modo} onOpen={abrirSegmento} activos={filtrosActivos} />)}

          {/* ── FICHAS TÉCNICAS (combinaciones) ── */}
          {combinaciones.length > 0 && <FichasTecnicas fichas={combinaciones} />}

          {/* ── BIOGRAFÍA DE MERCADO (nivel unidad) — el expediente de la unidad ── */}
          {biografia && <BiografiaUnidad bio={biografia} />}

          {/* ── CARACTERÍSTICAS (nivel unidad) ── */}
          {caracteristicas.length > 0 && <Caracteristicas items={caracteristicas} />}

          {/* vacío total */}
          {hijos.length === 0 && segmentos.length === 0 && combinaciones.length === 0 && caracteristicas.length === 0 && !biografia && (
            <Card style={card}><span style={{ fontSize: 12.5, color: '#888' }}>Este nodo aún no tiene datos para mostrar.</span></Card>
          )}
        </>
      )}
    </div>
  );
}

// columnas por modo: mixto = oferta+demanda+barra+gap · oferta = solo oferta · demanda = solo demanda
// (+ una columna final fija para el hint "ver cuáles ›" que insinúa que la fila es navegable)
const HINT_COL = '88px';
function gridCols(modo) {
  if (modo === 'oferta') return `minmax(120px, 1.6fr) 80px minmax(150px, 1fr) ${HINT_COL}`;
  if (modo === 'demanda') return `minmax(120px, 1.6fr) 80px minmax(150px, 1fr) ${HINT_COL}`;
  return `minmax(120px, 1.4fr) 64px 64px minmax(150px, 1fr) minmax(170px, 1.2fr) ${HINT_COL}`;
}

// ── Un grupo de segmentos (una dimensión) — cada item en su PROPIA fila, clic = abrir (oferta+demanda) ──
function SegmentoGrupo({ g, modo, onOpen, activos }) {
  const items = g.items || [];
  if (items.length === 0) return null;
  // escala de la mini-barra: el mayor entre oferta y demanda de todo el grupo
  const max = Math.max(1, ...items.flatMap((it) => [it.oferta || 0, it.demanda || 0]));
  const cols = gridCols(modo);
  return (
    <Card style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
        <div style={{ ...lbl, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
          <span title={`Estado del dato: ${g.estado}`} aria-label={`Estado del dato: ${g.estado}`}
            style={{ width: 7, height: 7, borderRadius: '50%', background: estadoColor(g.estado), flexShrink: 0, boxShadow: `0 0 0 2px ${estadoColor(g.estado)}22` }} />
          {g.label}
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: '#9a9aa6', marginBottom: 10 }}>
        {items.length} {items.length === 1 ? 'dato independiente' : 'datos independientes'} — clic en una fila para abrir qué hay y quién lo busca
      </div>
      <div style={{ display: 'grid', gap: 7 }}>
        {/* encabezado de columnas */}
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, alignItems: 'center', ...colHead, paddingBottom: 2 }}>
          <span>Segmento</span>
          {modo !== 'demanda' && <span style={{ textAlign: 'right' }}>Oferta</span>}
          {modo !== 'oferta' && <span style={{ textAlign: 'right' }}>Demanda</span>}
          <span></span>
          {modo === 'mixto' && <span>Gap</span>}
          <span></span>
        </div>
        {items.map((it, i) => <SegmentoFila key={`${it.segmento}:${i}`} it={it} max={max} modo={modo} cols={cols} onOpen={onOpen} activos={activos} />)}
      </div>
    </Card>
  );
}

// Una fila = UN dato independiente. Clic = abrir el segmento (drill). En modo oferta/demanda muestra solo esa columna.
function SegmentoFila({ it, max, modo, cols, onOpen, activos }) {
  const oferta = it.oferta || 0;
  const demanda = it.demanda || 0;
  const gap = it.gap != null ? it.gap : (demanda - oferta);
  // gap>0 = falta oferta → oportunidad (verde) · gap<0 = sobra oferta (ámbar) · 0 = equilibrio (gris)
  const gapColor = gap > 0 ? '#1FA06A' : gap < 0 ? '#f59e0b' : '#888';
  const gapTexto = gap > 0 ? `falta ${fmtN(gap)} — oportunidad` : gap < 0 ? `sobra ${fmtN(-gap)} — sobreoferta` : 'en equilibrio';
  const filtro = it.filtro || null;
  const yaActivo = filtro && activos && Object.entries(filtro).every(([k, v]) => String(activos[k]) === String(v));
  const clickable = !!filtro && !!onOpen;
  const idleBorder = yaActivo ? 'var(--theme, #6366f1)' : 'rgba(255,255,255,0.06)';
  const idleBg = yaActivo ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.025)';
  return (
    <div
      onClick={clickable ? () => onOpen(filtro) : undefined}
      title={clickable ? 'Abrir este segmento (qué hay · quién lo busca)' : undefined}
      style={{
        display: 'grid', gridTemplateColumns: cols,
        gap: 10, alignItems: 'center', fontSize: 12.5,
        padding: '7px 10px', borderRadius: 9, cursor: clickable ? 'pointer' : 'default',
        background: idleBg,
        borderTop: '1px solid ' + idleBorder,
        borderRight: '1px solid ' + idleBorder,
        borderBottom: '1px solid ' + idleBorder,
        borderLeft: `3px solid ${gapColor}`,
        transition: 'background 0.12s ease, border-color 0.12s ease',
      }}
      onMouseEnter={clickable ? (e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
        if (!yaActivo) { e.currentTarget.style.borderTopColor = 'rgba(255,255,255,0.18)'; e.currentTarget.style.borderRightColor = 'rgba(255,255,255,0.18)'; e.currentTarget.style.borderBottomColor = 'rgba(255,255,255,0.18)'; }
        const h = e.currentTarget.querySelector('[data-hint]'); if (h) { h.style.color = 'var(--theme, #6366f1)'; h.style.opacity = '1'; }
      } : undefined}
      onMouseLeave={clickable ? (e) => {
        e.currentTarget.style.background = idleBg;
        e.currentTarget.style.borderTopColor = idleBorder; e.currentTarget.style.borderRightColor = idleBorder; e.currentTarget.style.borderBottomColor = idleBorder;
        const h = e.currentTarget.querySelector('[data-hint]'); if (h) { h.style.color = '#666'; h.style.opacity = '0.65'; }
      } : undefined}>
      <span style={{ color: '#e4e4ea', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(it.segmento)}</span>
      {modo !== 'demanda' && <span style={{ textAlign: 'right', color: '#22c55e', fontWeight: 700 }}>{fmtN(oferta)}</span>}
      {modo !== 'oferta' && <span style={{ textAlign: 'right', color: '#a78bfa', fontWeight: 700 }}>{fmtN(demanda)}</span>}
      {/* mini-barra: según modo */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {modo !== 'demanda' && <div style={{ height: 6, borderRadius: 3, background: '#22c55e', opacity: 0.85, width: `${(oferta / max) * 100}%`, minWidth: oferta > 0 ? 2 : 0 }} />}
        {modo !== 'oferta' && <div style={{ height: 6, borderRadius: 3, background: '#a78bfa', opacity: 0.85, width: `${(demanda / max) * 100}%`, minWidth: demanda > 0 ? 2 : 0 }} />}
      </div>
      {modo === 'mixto' && <span style={{ color: gapColor, fontWeight: 700, fontSize: 12 }}>{gapTexto}</span>}
      {/* hint de navegabilidad — discreto, se intensifica en hover */}
      <span data-hint style={{ textAlign: 'right', fontSize: 11, color: '#666', opacity: clickable ? 0.65 : 0, whiteSpace: 'nowrap', transition: 'color 0.12s ease, opacity 0.12s ease' }}>
        {clickable ? 'ver cuáles ›' : ''}
      </span>
    </div>
  );
}

// ── MODO AUTOMÁTICO — "El cubo encontró:" oportunidades (verde) + sobreofertas (ámbar), clic = ir+drill ──
function OportunidadesPanel({ oport, loading, error, onPick }) {
  if (loading) return <Card style={card}><span style={{ fontSize: 12.5, color: '#aaa' }}>El cubo está barriendo los segmentos…</span></Card>;
  if (error) return <Card style={{ ...card, color: '#dc2626', fontSize: 12.5 }}>{error}</Card>;
  if (!oport) return null;
  const oportunidades = oport.oportunidades || [];
  const sobreofertas = oport.sobreofertas || [];
  // sobreofertas (ámbar): siguen siendo filas simples — solo el clic que va al drill (sin acciones inline)
  const filaSobreoferta = (o, color, emoji) => (
    <button key={`${o.colonia_id}:${o.segmento}:${o.dimension}`} onClick={() => onPick(o)}
      style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer', width: '100%',
        borderTop: '1px solid rgba(255,255,255,0.08)', borderRight: '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.025)', color: '#e4e4ea',
        borderLeft: `3px solid ${color}`, display: 'flex', alignItems: 'center', gap: 10, transition: 'transform 0.12s ease, background 0.12s ease, border-color 0.12s ease' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.borderTopColor = color; e.currentTarget.style.borderRightColor = color; e.currentTarget.style.borderBottomColor = color; const ch = e.currentTarget.querySelector('[data-chev]'); if (ch) { ch.style.color = color; ch.style.transform = 'translateX(2px)'; } }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderTopColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderRightColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderBottomColor = 'rgba(255,255,255,0.08)'; const ch = e.currentTarget.querySelector('[data-chev]'); if (ch) { ch.style.color = '#777'; ch.style.transform = 'translateX(0)'; } }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 13.5, color: '#f0f0f3', fontWeight: 600, lineHeight: 1.35 }}>{emoji} {o.lectura}</span>
        <span style={{ fontSize: 11, color: '#9a9aa6' }}>
          {[o.colonia, o.dimension, o.segmento, `oferta ${fmtN(o.oferta)} · demanda ${fmtN(o.demanda)}`].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span data-chev style={{ fontSize: 17, color: '#777', lineHeight: 1, flexShrink: 0, transition: 'color 0.12s ease, transform 0.12s ease' }}>›</span>
    </button>
  );
  return (
    <Card style={card}>
      <div style={lbl}>El cubo encontró:</div>
      {oport.lectura && <div style={{ fontSize: 12, color: '#9a9aa6', marginBottom: 12, fontStyle: 'italic' }}>{oport.lectura}</div>}
      {oportunidades.length === 0 && sobreofertas.length === 0 && (
        <span style={{ fontSize: 12.5, color: '#888' }}>No hay hallazgos con suficiente señal en este alcance.</span>
      )}
      {oportunidades.length > 0 && (
        <div style={{ marginBottom: sobreofertas.length > 0 ? 14 : 0 }}>
          <div style={{ fontSize: 11.5, color: '#34d399', fontWeight: 700, marginBottom: 8 }}>🟢 Oportunidades — se busca más de lo que hay</div>
          <div style={{ display: 'grid', gap: 7 }}>
            {oportunidades.map((o) => (
              <OportunidadFila key={`${o.colonia_id}:${o.segmento}:${o.dimension}`} o={o} onPick={onPick} />
            ))}
          </div>
        </div>
      )}
      {sobreofertas.length > 0 && (
        <div>
          <div style={{ fontSize: 11.5, color: '#fbbf24', fontWeight: 700, marginBottom: 8 }}>🟡 Sobreofertas — hay más de lo que se busca</div>
          <div style={{ display: 'grid', gap: 7 }}>{sobreofertas.map((o) => filaSobreoferta(o, '#f59e0b', '🟡'))}</div>
        </div>
      )}
    </Card>
  );
}

// destinos disponibles para "Activar →" (cerrar el ciclo encontrar→actuar)
const ACTIVAR_DESTINOS = [['dev', 'Desarrollador'], ['asesor', 'Asesor'], ['marketplace', 'Marketplace']];

// ── Una fila de OPORTUNIDAD (verde) con su PROPIO estado: clic = ir+drill (igual que antes) +
//    acciones inline ADICIONALES (Diseñar producto · Activar →) que cierran el ciclo sin cambiar de tab ──
function OportunidadFila({ o, onPick }) {
  const color = '#1FA06A';
  // estado del "Diseñar producto" (por fila)
  const [disenoOpen, setDisenoOpen] = useState(false);
  const [disenoLoading, setDisenoLoading] = useState(false);
  const [disenoError, setDisenoError] = useState(null);
  const [diseno, setDiseno] = useState(null);
  // estado del "Activar →" (por fila)
  const [destinoPicker, setDestinoPicker] = useState(false);
  const [activarLoading, setActivarLoading] = useState(false);
  const [activarError, setActivarError] = useState(null);
  const [activarResult, setActivarResult] = useState(null);

  const onDisenar = () => {
    if (disenoOpen) { setDisenoOpen(false); return; }
    setDisenoOpen(true);
    if (diseno || disenoLoading) return;   // ya cargado / cargando → solo expandir
    setDisenoLoading(true); setDisenoError(null);
    getDisenar({ colonia: o.colonia_id, top: 1 })
      .then((d) => { setDiseno(d); })
      .catch((e) => { setDisenoError(e.message); setDiseno(null); })
      .finally(() => setDisenoLoading(false));
  };

  const onElegirDestino = (destino) => {
    setDestinoPicker(false);
    setActivarLoading(true); setActivarError(null); setActivarResult(null);
    postActivar({ destino, titulo: `${o.segmento} en ${o.colonia}`, detalle: o.lectura, colonia: o.colonia_id, filtro: o.filtro || {} })
      .then((d) => { setActivarResult(d); })
      .catch((e) => { setActivarError(e.message); setActivarResult(null); })
      .finally(() => setActivarLoading(false));
  };

  const fichas = diseno?.fichas || [];
  const ficha = fichas[0] || null;

  const btnStyle = {
    fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.14)', color: '#cfcfd6',
    transition: 'background 0.12s ease, border-color 0.12s ease, color 0.12s ease',
  };

  return (
    <div
      style={{ borderRadius: 10, borderTop: '1px solid rgba(255,255,255,0.08)', borderRight: '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.025)', borderLeft: `3px solid ${color}` }}>
      {/* la fila navegable (el clic que ya existía: ir+drill) */}
      <button onClick={() => onPick(o)}
        style={{ textAlign: 'left', padding: '10px 12px', cursor: 'pointer', width: '100%', background: 'none', border: 'none', color: '#e4e4ea',
          display: 'flex', alignItems: 'center', gap: 10, transition: 'background 0.12s ease', borderRadius: '7px 7px 0 0' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; const ch = e.currentTarget.querySelector('[data-chev]'); if (ch) { ch.style.color = color; ch.style.transform = 'translateX(2px)'; } }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; const ch = e.currentTarget.querySelector('[data-chev]'); if (ch) { ch.style.color = '#777'; ch.style.transform = 'translateX(0)'; } }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 13.5, color: '#f0f0f3', fontWeight: 600, lineHeight: 1.35 }}>🟢 {o.lectura}</span>
          <span style={{ fontSize: 11, color: '#9a9aa6' }}>
            {[o.colonia, o.dimension, o.segmento, `oferta ${fmtN(o.oferta)} · demanda ${fmtN(o.demanda)}`].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span data-chev style={{ fontSize: 17, color: '#777', lineHeight: 1, flexShrink: 0, transition: 'color 0.12s ease, transform 0.12s ease' }}>›</span>
      </button>

      {/* ── ACCIONES INLINE — discretas, al pie de la fila. Cierran el ciclo encontrar→actuar sin cambiar de tab ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '0 12px 10px 12px' }}>
        <button type="button" onClick={onDisenar}
          aria-label={`Diseñar producto para ${o.segmento} en ${o.colonia}`} aria-expanded={disenoOpen}
          style={{ ...btnStyle, borderColor: disenoOpen ? color : 'rgba(255,255,255,0.14)', color: disenoOpen ? '#34d399' : '#cfcfd6' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(31,160,106,0.12)'; e.currentTarget.style.borderColor = color; e.currentTarget.style.color = '#34d399'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = disenoOpen ? color : 'rgba(255,255,255,0.14)'; e.currentTarget.style.color = disenoOpen ? '#34d399' : '#cfcfd6'; }}>
          {disenoLoading ? 'Diseñando…' : (disenoOpen ? 'Ocultar diseño' : 'Diseñar producto')}
        </button>

        {/* Activar → : abre un mini-selector de destino inline */}
        {!activarResult && (
          <button type="button" onClick={() => setDestinoPicker((v) => !v)}
            aria-label={`Activar oportunidad: ${o.segmento} en ${o.colonia}`} aria-expanded={destinoPicker} disabled={activarLoading}
            style={{ ...btnStyle, borderColor: destinoPicker ? color : 'rgba(255,255,255,0.14)', color: destinoPicker ? '#34d399' : '#cfcfd6', opacity: activarLoading ? 0.6 : 1, cursor: activarLoading ? 'wait' : 'pointer' }}
            onMouseEnter={(e) => { if (activarLoading) return; e.currentTarget.style.background = 'rgba(31,160,106,0.12)'; e.currentTarget.style.borderColor = color; e.currentTarget.style.color = '#34d399'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = destinoPicker ? color : 'rgba(255,255,255,0.14)'; e.currentTarget.style.color = destinoPicker ? '#34d399' : '#cfcfd6'; }}>
            {activarLoading ? 'Activando…' : 'Activar →'}
          </button>
        )}

        {/* mini-selector de destino (dev / asesor / marketplace) */}
        {destinoPicker && !activarResult && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#9a9aa6' }}>enviar a:</span>
            {ACTIVAR_DESTINOS.map(([val, lab]) => (
              <button key={val} type="button" onClick={() => onElegirDestino(val)}
                aria-label={`Enviar a ${lab}`}
                style={{ ...btnStyle, padding: '3px 9px', fontSize: 11 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(31,160,106,0.12)'; e.currentTarget.style.borderColor = color; e.currentTarget.style.color = '#34d399'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.color = '#cfcfd6'; }}>
                {lab}
              </button>
            ))}
          </span>
        )}

        {activarError && (
          <span role="status" style={{ fontSize: 11.5, color: '#dc2626' }}>No se pudo activar: {activarError}</span>
        )}

        {/* resultado de la activación — en la misma fila, con check verde */}
        {activarResult && (
          <span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#34d399', fontWeight: 600 }}>
            <span aria-hidden="true">✓</span>
            <span>{activarResult.lectura || (activarResult.accion?.titulo ? `Activada · ${activarResult.accion.titulo}` : 'Activada')}</span>
          </span>
        )}
      </div>

      {/* ── DISEÑO DE PRODUCTO — expandible debajo de la fila (recomendación de la 1ª ficha + métricas) ── */}
      {disenoOpen && (
        <div style={{ margin: '0 12px 10px 12px', padding: '9px 11px', borderRadius: 9, background: 'rgba(31,160,106,0.07)', border: '1px solid rgba(31,160,106,0.28)' }}>
          {disenoLoading && <span style={{ fontSize: 12, color: '#aaa' }}>Diseñando el producto óptimo…</span>}
          {disenoError && <span style={{ fontSize: 12, color: '#dc2626' }}>No se pudo diseñar: {disenoError}</span>}
          {!disenoLoading && !disenoError && diseno && (
            ficha ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ficha.recomendacion && (
                  <div style={{ fontSize: 13, color: '#eafff5', fontWeight: 600, lineHeight: 1.4 }}>{ficha.recomendacion}</div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 11.5, color: '#bbb' }}>
                  {ficha.demanda != null && <span>Demanda: <strong style={{ color: '#a78bfa' }}>{fmtN(ficha.demanda)}</strong></span>}
                  {(ficha.gap != null) && <span>Gap: <strong style={{ color: '#34d399' }}>{ficha.gap > 0 ? '+' : ''}{fmtN(ficha.gap)}</strong></span>}
                  {ficha.oferta_actual != null && <span>Oferta hoy: <strong style={{ color: '#eee' }}>{fmtN(ficha.oferta_actual)}</strong></span>}
                  {ficha.premium_atributo_pct != null && <span>Premium atributo: <strong style={{ color: '#34d399' }}>+{ficha.premium_atributo_pct}%</strong></span>}
                </div>
                {(diseno.lectura || ficha.lectura) && (
                  <div style={{ fontSize: 11, color: '#9a9aa6', fontStyle: 'italic', lineHeight: 1.4 }}>{ficha.lectura || diseno.lectura}</div>
                )}
                {diseno.nota && <div style={{ fontSize: 10.5, color: '#666', fontStyle: 'italic' }}>{diseno.nota}</div>}
              </div>
            ) : (
              <span style={{ fontSize: 12, color: '#888' }}>{diseno.lectura || diseno.nota || 'Sin recomendación de producto para esta colonia todavía.'}</span>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ── DRILL — abrí un segmento: TENSIÓN + OFERTA (cuáles) + DEMANDA (perfil) ──
function DrillPanel({ drill, modo, onClose }) {
  const t = drill.tension || {};
  const oferta = drill.oferta || {};
  const demanda = drill.demanda || {};
  const entidades = oferta.entidades || [];
  const acum = drill.filtros_acumulados || {};
  const gap = t.gap != null ? t.gap : ((t.buscan || 0) - (t.hay || 0));
  const gapColor = gap > 0 ? '#1FA06A' : gap < 0 ? '#f59e0b' : '#888';
  const intent = demanda.intencion;
  return (
    <Card style={{ ...card, border: '1px solid var(--theme, #6366f1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
        <div style={lbl}>Segmento abierto{Object.keys(acum).length > 0 ? ` · ${Object.entries(acum).map(([k, v]) => `${facetLabel(k)} ${v}`).join(' + ')}` : ''}</div>
        <button onClick={onClose}
          style={{ fontSize: 11.5, color: '#aaa', background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, cursor: 'pointer', padding: '3px 9px' }}>
          cerrar drill
        </button>
      </div>

      {/* TENSIÓN — el titular */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 10,
        background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderLeft: `3px solid ${gapColor}`, marginBottom: 14 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: '#22c55e' }}>{fmtN(t.hay)} <span style={{ fontSize: 12, fontWeight: 600, color: '#888' }}>hay</span></span>
        <span style={{ color: '#555' }}>·</span>
        <span style={{ fontSize: 20, fontWeight: 800, color: '#a78bfa' }}>{fmtN(t.buscan)} <span style={{ fontSize: 12, fontWeight: 600, color: '#888' }}>buscan</span></span>
        <span style={{ color: '#555' }}>·</span>
        <span style={{ fontSize: 20, fontWeight: 800, color: gapColor }}>
          gap {gap > 0 ? '+' : ''}{fmtN(gap)}
          <span style={{ fontSize: 12, fontWeight: 600, color: gapColor, marginLeft: 6 }}>{gap > 0 ? 'oportunidad' : gap < 0 ? 'sobreoferta' : 'equilibrio'}</span>
        </span>
      </div>

      {/* OFERTA (cuáles) — tabla de entidades reales */}
      {modo !== 'demanda' && (
        <div style={{ marginBottom: modo === 'oferta' ? 0 : 14 }}>
          <div style={{ fontSize: 11.5, color: '#34d399', fontWeight: 700, marginBottom: 4 }}>Oferta — qué hay</div>
          <div style={{ fontSize: 11.5, color: '#9a9aa6', marginBottom: 8 }}>{fmtN(oferta.total)} unidades cumplen{entidades.length < (oferta.total || 0) ? ` · mostrando ${entidades.length}` : ''}</div>
          {entidades.length === 0 ? (
            <span style={{ fontSize: 12.5, color: '#9a9aa6' }}>Ninguna unidad cumple este filtro en la zona.</span>
          ) : (
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,1.6fr) 70px 56px 44px minmax(90px,1fr) 90px', gap: 8, ...colHead }}>
                <span>Desarrollo</span><span>Unidad</span><span style={{ textAlign: 'right' }}>m²</span><span style={{ textAlign: 'right' }}>Rec</span><span style={{ textAlign: 'right' }}>Precio</span><span>Status</span>
              </div>
              {entidades.map((u, i) => (
                <div key={`${u.dev_id}:${u.unidad}:${i}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,1.6fr) 70px 56px 44px minmax(90px,1fr) 90px', gap: 8, fontSize: 12, alignItems: 'center', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.desarrollo}</span>
                  <span style={{ color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.unidad != null ? String(u.unidad) : '—'}</span>
                  <span style={{ textAlign: 'right', color: '#bbb' }}>{u.m2 != null ? u.m2 : '—'}</span>
                  <span style={{ textAlign: 'right', color: '#bbb' }}>{u.recamaras != null ? u.recamaras : '—'}</span>
                  <span style={{ textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{fmtMX(u.precio)}</span>
                  <span style={{ color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.status || '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DEMANDA (perfil) — quién lo busca */}
      {modo !== 'oferta' && (
        <div>
          <div style={{ fontSize: 11.5, color: '#c4b5fd', fontWeight: 700, marginBottom: 4 }}>Demanda — quién lo busca</div>
          <div style={{ fontSize: 11.5, color: '#9a9aa6', marginBottom: 8 }}>{fmtN(demanda.n_buscan)} lo buscan en la zona</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 12.5 }}>
            {intent && (
              <span style={{ color: '#bbb' }}>Intención: <strong style={{ color: '#a78bfa' }}>{intent.invertir}% invertir</strong> · <strong style={{ color: '#a78bfa' }}>{intent.vivir}% vivir</strong></span>
            )}
            {demanda.presupuesto_mediano != null && (
              <span style={{ color: '#bbb' }}>Presupuesto mediano: <strong style={{ color: '#eee' }}>{fmtMX(demanda.presupuesto_mediano)}</strong></span>
            )}
          </div>
          {(demanda.tambien_buscan || []).length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11.5, color: '#888' }}>También buscan:</span>
              {demanda.tambien_buscan.map((a, i) => (
                <span key={`${a}:${i}`} style={{ fontSize: 11.5, padding: '2px 8px', borderRadius: 12, background: 'rgba(167,139,250,0.14)', border: '1px solid rgba(167,139,250,0.4)', color: '#ddd' }}>{String(a)}</span>
              ))}
            </div>
          )}
          {demanda.nota && <div style={{ fontSize: 10.5, color: '#666', marginTop: 8, fontStyle: 'italic' }}>{demanda.nota}</div>}
        </div>
      )}
    </Card>
  );
}

// ── FICHAS TÉCNICAS — cada combinación = un dato (barra por n) ──
function FichasTecnicas({ fichas }) {
  const max = Math.max(1, ...fichas.map((f) => f.n || 0));
  return (
    <Card style={card}>
      <div style={lbl}>Fichas técnicas · cada combinación = un dato</div>
      <div style={{ fontSize: 11.5, color: '#9a9aa6', marginBottom: 10 }}>{fichas.length} combinaciones distintas (rec · baños · cajón · m² · extras)</div>
      <div style={{ display: 'grid', gap: 6 }}>
        {fichas.map((f, i) => (
          <div key={`${f.ficha}:${i}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 110px 48px', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
            <span style={{ color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.ficha}</span>
            <div style={{ height: 8, borderRadius: 3, background: 'var(--theme, #6366f1)', opacity: 0.7, width: `${(f.n / max) * 100}%`, minWidth: 2 }} />
            <strong style={{ textAlign: 'right', color: 'var(--theme, #6366f1)' }}>{fmtN(f.n)}</strong>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── CARACTERÍSTICAS (nivel unidad) — tabla simple característica → valor ──
function Caracteristicas({ items }) {
  return (
    <Card style={card}>
      <div style={lbl}>Características de la unidad · cada una un dato</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '6px 18px' }}>
        {items.map((c, i) => (
          <div key={`${c.caracteristica}:${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ color: '#a8a8b3' }}>{c.caracteristica}</span>
            <strong style={{ color: '#e4e4ea', textAlign: 'right' }}>{String(c.valor)}</strong>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// BIOGRAFÍA DE LA UNIDAD — el expediente de mercado: no es sus specs, es su historia.
// Solo en nodo UNIDAD. Todo sale de `biografia` (cero dato inventado). Lo latente queda gris con su razón.
// ════════════════════════════════════════════════════════════════════════════

// tarjeta interna del expediente (título + contenido)
function BioCard({ titulo, hint, children, style }) {
  return (
    <div style={{ padding: '12px 14px', borderRadius: 11, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, ...style }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11.5, color: '#a8a8b3', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>{titulo}</span>
        {hint && <span style={{ fontSize: 10.5, color: '#666' }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// número grande con su etiqueta debajo
function BioStat({ valor, label, color = '#eee' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 56 }}>
      <span style={{ fontSize: 21, fontWeight: 800, color, lineHeight: 1, letterSpacing: '-0.02em' }}>{valor}</span>
      <span style={{ fontSize: 10.5, color: '#888' }}>{label}</span>
    </div>
  );
}

function BiografiaUnidad({ bio }) {
  if (!bio) return null;
  const huella = bio.huella_demanda || {};
  const embudo = bio.embudo || {};
  const pos = bio.posicion_precio || {};
  const premium = bio.premium_atributos || [];
  const competidoras = bio.competidoras || [];
  const avm = bio.avm || {};
  const pron = bio.pronostico || {};
  const cuando = huella.cuando_la_miran || {};
  const curva = huella.curva_calor || [];
  const maxCurva = Math.max(1, ...curva.map((c) => c['señales'] || 0));

  return (
    <Card style={{ ...card, border: '1px solid var(--theme, #6366f1)' }}>
      {/* título del expediente + lectura grande */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={lbl}>Biografía de mercado de la unidad</div>
        <Badge tone="brand">expediente</Badge>
      </div>
      {bio.lectura && (
        <div style={{ fontSize: 15, color: 'var(--cream, #eee)', fontWeight: 600, lineHeight: 1.4, marginBottom: 14 }}>{bio.lectura}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>

        {/* 1) HUELLA DE DEMANDA */}
        <BioCard titulo="Huella de demanda" hint="comportamiento real">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 18px' }}>
            <BioStat valor={fmtN(huella.vistas)} label="vistas" color="#22c55e" />
            <BioStat valor={fmtN(huella.guardados)} label="guardados" color="#a78bfa" />
            <BioStat valor={fmtN(huella.interes_alto)} label="interés alto" color="#fbbf24" />
            <BioStat valor={fmtN(huella.visitantes_unicos)} label="personas" color="#eee" />
          </div>
          {(cuando.dia_pico || cuando.hora_pico != null) && (
            <div style={{ fontSize: 12, color: '#bbb' }}>
              La miran sobre todo: <strong style={{ color: '#eee' }}>{cuando.dia_pico || '—'}</strong>
              {cuando.hora_pico != null && <> a las <strong style={{ color: '#eee' }}>{cuando.hora_pico}h</strong></>}
            </div>
          )}
          {/* mini-gráfica de barras: señales por semana (0 = esta semana) */}
          {curva.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 46 }}>
                {curva.map((c) => {
                  const v = c['señales'] || 0;
                  return (
                    <div key={c.semanas_atras} title={`${c.semanas_atras === 0 ? 'esta semana' : `hace ${c.semanas_atras} sem`}: ${v} señales`}
                      style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', height: '100%' }}>
                      <div style={{ width: '100%', borderRadius: '3px 3px 0 0', background: c.semanas_atras === 0 ? 'var(--theme, #6366f1)' : 'rgba(167,139,250,0.55)',
                        height: `${Math.max(v > 0 ? 8 : 2, (v / maxCurva) * 100)}%`, minHeight: 2 }} />
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: '#666', marginTop: 3 }}>
                <span>ahora</span><span>hace 7 sem</span>
              </div>
            </div>
          )}
        </BioCard>

        {/* 2) EMBUDO */}
        <BioCard titulo="Embudo" hint="vista → guardado → interés">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#22c55e', lineHeight: 1 }}>{fmtN(embudo.vistas)}</span>
              <span style={{ fontSize: 10, color: '#888' }}>vistas</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 36 }}>
              <span style={{ fontSize: 13, color: '#666' }}>→</span>
              <span style={{ fontSize: 10.5, color: '#a78bfa', fontWeight: 700 }}>{embudo.conv_vista_guardado != null ? `${embudo.conv_vista_guardado}%` : '—'}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#a78bfa', lineHeight: 1 }}>{fmtN(embudo.guardados)}</span>
              <span style={{ fontSize: 10, color: '#888' }}>guardados</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 36 }}>
              <span style={{ fontSize: 13, color: '#666' }}>→</span>
              <span style={{ fontSize: 10.5, color: '#fbbf24', fontWeight: 700 }}>{embudo.conv_guardado_interes != null ? `${embudo.conv_guardado_interes}%` : '—'}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#fbbf24', lineHeight: 1 }}>{fmtN(embudo.interes_alto)}</span>
              <span style={{ fontSize: 10, color: '#888' }}>interés</span>
            </div>
          </div>
        </BioCard>

        {/* 3) POSICIÓN DE PRECIO */}
        <BioCard titulo="Posición de precio" hint="percentil 0–100">
          <PercentilBarra label="en su desarrollo" pct={pos.percentil_en_dev} />
          <PercentilBarra label="en su colonia" pct={pos.percentil_en_colonia} />
          {pos.percentil_en_colonia != null && (
            <div style={{ fontSize: 12, color: '#bbb' }}>
              Más {pos.percentil_en_colonia >= 50 ? 'cara' : 'barata'} que el <strong style={{ color: '#eee' }}>{pos.percentil_en_colonia}%</strong> de su colonia
            </div>
          )}
          {(pos.precio_m2 != null || pos.mediana_m2_colonia != null) && (
            <div style={{ fontSize: 12, color: '#bbb', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6 }}>
              Precio/m²: <strong style={{ color: '#eee' }}>{pos.precio_m2 != null ? fmtMX(pos.precio_m2) : '—'}</strong>
              {pos.mediana_m2_colonia != null && <span style={{ color: '#888' }}> · mediana colonia {fmtMX(pos.mediana_m2_colonia)}</span>}
            </div>
          )}
        </BioCard>

        {/* 4) PREMIUM POR ATRIBUTO */}
        <BioCard titulo="Premium por atributo" hint="cuánto suma cada uno">
          {premium.length === 0 ? (
            <span style={{ fontSize: 12, color: '#777' }}>Sin atributos premium.</span>
          ) : (
            <div style={{ display: 'grid', gap: 5 }}>
              {premium.map((p, i) => (
                <div key={`${p.atributo}:${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, fontSize: 12.5 }}>
                  <span style={{ color: '#ddd' }}>{p.atributo}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
                    <strong style={{ color: p.lift_pct >= 0 ? '#34d399' : '#f59e0b' }}>{p.lift_pct >= 0 ? '+' : ''}{p.lift_pct}%</strong>
                    {p.n != null && <span style={{ fontSize: 10, color: '#666' }}>n={p.n}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </BioCard>

        {/* 5) UNIDADES COMPETIDORAS */}
        <BioCard titulo="Unidades competidoras" hint="qué más vieron">
          {competidoras.length === 0 ? (
            <span style={{ fontSize: 12, color: '#777' }}>Sin co-vistas suficientes todavía.</span>
          ) : (
            <div style={{ display: 'grid', gap: 4 }}>
              {competidoras.map((c, i) => (
                <div key={`${c.desarrollo}:${c.unidad}:${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, alignItems: 'center', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.desarrollo}{c.unidad != null ? <span style={{ color: '#888' }}> · {String(c.unidad)}</span> : null}
                  </span>
                  <span style={{ color: '#a78bfa', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtN(c.co_vistas)} co-vistas</span>
                </div>
              ))}
            </div>
          )}
        </BioCard>

        {/* 6) AVM — ¿bien puesto el precio? */}
        <BioCard titulo="¿Bien puesto el precio?" hint="AVM"
          style={avm && !avm.latente ? { borderColor: ((avm.dif_pct ?? 0) <= 0 ? 'rgba(31,160,106,0.5)' : 'rgba(245,158,11,0.5)') } : undefined}>
          {avm.latente ? (
            <span style={{ fontSize: 12, color: '#777', fontStyle: 'italic' }}>{avm.razon || 'AVM no disponible'}</span>
          ) : (
            <>
              <div style={{ fontSize: 13.5, color: ((avm.dif_pct ?? 0) <= 0 ? '#34d399' : '#fbbf24'), fontWeight: 600, lineHeight: 1.4 }}>{avm.lectura}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12, color: '#bbb' }}>
                <span>Estimado: <strong style={{ color: '#eee' }}>{fmtMX(avm.estimado)}</strong></span>
                {Array.isArray(avm.rango) && avm.rango[0] != null && (
                  <span>Rango: <strong style={{ color: '#eee' }}>{fmtMX(avm.rango[0])}–{fmtMX(avm.rango[1])}</strong></span>
                )}
                {avm.confianza != null && <span>Confianza: <strong style={{ color: '#eee' }}>{String(avm.confianza)}</strong></span>}
              </div>
              {avm.drivers && <div style={{ fontSize: 11, color: '#888' }}>{avm.drivers}</div>}
            </>
          )}
        </BioCard>

        {/* 7) PRONÓSTICO */}
        <BioCard titulo="Pronóstico" hint="P(venta) del proyecto · 12m">
          {pron.latente ? (
            <span style={{ fontSize: 12, color: '#777', fontStyle: 'italic' }}>{pron.razon || 'pronóstico no disponible'}</span>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 24, fontWeight: 800, color: '#34d399', lineHeight: 1 }}>
                  {pron.p_venta_proyecto_12m != null ? `${Math.round(pron.p_venta_proyecto_12m)}%` : '—'}
                </span>
                <span style={{ fontSize: 11, color: '#888' }}>prob. de venta del proyecto a 12 meses</span>
              </div>
              {pron.confianza != null && <div style={{ fontSize: 11.5, color: '#bbb' }}>Confianza: <strong style={{ color: '#eee' }}>{String(pron.confianza)}</strong></div>}
              {pron.explicacion && <div style={{ fontSize: 12, color: '#aaa', lineHeight: 1.4 }}>{pron.explicacion}</div>}
              {pron.nota && <div style={{ fontSize: 10.5, color: '#666', fontStyle: 'italic' }}>{pron.nota}</div>}
            </>
          )}
        </BioCard>

      </div>

      {/* de dónde sale */}
      {bio.fuente && (
        <div style={{ fontSize: 10.5, color: '#666', marginTop: 12, fontStyle: 'italic' }}>De dónde sale: {bio.fuente}</div>
      )}
    </Card>
  );
}

// barra de percentil 0–100 con marcador en la posición
function PercentilBarra({ label, pct }) {
  const has = pct != null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
        <span style={{ color: '#999' }}>{label}</span>
        <strong style={{ color: has ? '#eee' : '#666' }}>{has ? `P${pct}` : '—'}</strong>
      </div>
      <div style={{ position: 'relative', height: 7, borderRadius: 4, background: 'linear-gradient(90deg, rgba(34,197,94,0.35), rgba(245,158,11,0.35))' }}>
        {has && (
          <div style={{ position: 'absolute', top: -1.5, left: `calc(${Math.max(0, Math.min(100, pct))}% - 5px)`, width: 10, height: 10, borderRadius: '50%',
            background: 'var(--cream, #eee)', border: '2px solid var(--theme, #6366f1)' }} />
        )}
      </div>
    </div>
  );
}
