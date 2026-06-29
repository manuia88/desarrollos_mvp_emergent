// Superadmin · EXPLORADOR (árbol) — abres un nodo (ciudad ▸ alcaldía ▸ colonia ▸ desarrollo ▸ unidad) y ves
// TODOS sus datos, CADA SEGMENTO INDEPENDIENTE (2rec es un dato, 3rec es otro), nunca un blob. Navegar = clic
// (abrir carpetas). Lo dominante: el GAP coloreado (verde = oportunidad / ámbar = sobreoferta). Cero dato inventado.
import React, { useEffect, useState, useCallback } from 'react';
import { Card, Badge } from '../advisor/primitives';
import { getExplorar, postExplorarSegmento, getExplorarOportunidades } from '../../api/superadminDemandIntel';

const card = { padding: '14px 18px' };
const lbl = { fontSize: 11, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 };

const TIPO_LABEL = {
  ciudad: 'Ciudad', alcaldia: 'Alcaldía', colonia: 'Colonia', desarrollo: 'Desarrollo', unidad: 'Unidad',
};

const fmtN = (n) => (n == null ? '—' : Number(n).toLocaleString('es-MX'));
const fmtMX = (n) => (n == null ? '—' : `$${Math.round(n).toLocaleString('es-MX')}`);

// estado del dato (registro canónico): real=verde · derivado=azul · latente=gris · por_crear=gris
function estadoTone(estado) {
  if (estado === 'real') return 'ok';
  if (estado === 'derivado') return 'brand';
  return 'neutral';
}
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
              {i > 0 && <span style={{ color: '#555' }}>/</span>}
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

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--cream, #eee)', letterSpacing: '-0.02em' }}>{actual.nombre || actual.id}</span>
            <Badge tone="neutral">{TIPO_LABEL[actual.tipo] || actual.tipo}</Badge>
          </div>
          {resumenPartes.length > 0 && <span style={{ fontSize: 12.5, color: '#aaa' }}>{resumenPartes.join(' · ')}</span>}
        </div>

        {data?.lectura && <div style={{ fontSize: 11.5, color: '#777', marginTop: 8, fontStyle: 'italic', lineHeight: 1.4 }}>{data.lectura}</div>}

        {/* ── controles: modo de lectura + modo automático ── */}
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#777', marginRight: 2 }}>Ver:</span>
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
              style={{ fontSize: 12, color: '#888', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              ↑ Volver a la cima (CDMX)
            </button>
          </div>
        )}
      </Card>

      {/* ── FILTROS ACUMULADOS (el analista compone) ── */}
      {Object.keys(filtrosActivos).length > 0 && (
        <Card style={card}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#777', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Filtros</span>
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
                      border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: '#ddd',
                      display: 'flex', flexDirection: 'column', gap: 3 }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--theme, #6366f1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}>
                    <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre || c.id}</span>
                    <span style={{ fontSize: 11, color: '#888' }}>
                      {c.tipo === 'unidad'
                        ? [c.precio != null ? fmtMX(c.precio) : null, c.m2 != null ? `${c.m2} m²` : null, c.recamaras != null ? `${c.recamaras} rec` : null, c.status]
                            .filter(Boolean).join(' · ') || (TIPO_LABEL[c.tipo] || c.tipo)
                        : [c.n_unidades != null ? `${fmtN(c.n_unidades)} unidades` : null, c.n_devs != null ? `${c.n_devs} desarrollos` : null, c.desarrollador]
                            .filter(Boolean).join(' · ') || (TIPO_LABEL[c.tipo] || c.tipo)}
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          {/* ── SEGMENTOS: cada item es un dato INDEPENDIENTE — clic = abrir (oferta+demanda) ── */}
          {segmentos.map((g) => <SegmentoGrupo key={g.dimension} g={g} modo={modo} onOpen={abrirSegmento} activos={filtrosActivos} />)}

          {/* ── FICHAS TÉCNICAS (combinaciones) ── */}
          {combinaciones.length > 0 && <FichasTecnicas fichas={combinaciones} />}

          {/* ── CARACTERÍSTICAS (nivel unidad) ── */}
          {caracteristicas.length > 0 && <Caracteristicas items={caracteristicas} />}

          {/* vacío total */}
          {hijos.length === 0 && segmentos.length === 0 && combinaciones.length === 0 && caracteristicas.length === 0 && (
            <Card style={card}><span style={{ fontSize: 12.5, color: '#888' }}>Este nodo aún no tiene datos para mostrar.</span></Card>
          )}
        </>
      )}
    </div>
  );
}

// columnas por modo: mixto = oferta+demanda+barra+gap · oferta = solo oferta · demanda = solo demanda
function gridCols(modo) {
  if (modo === 'oferta') return 'minmax(120px, 1.6fr) 80px minmax(150px, 1fr)';
  if (modo === 'demanda') return 'minmax(120px, 1.6fr) 80px minmax(150px, 1fr)';
  return 'minmax(120px, 1.4fr) 64px 64px minmax(150px, 1fr) minmax(170px, 1.2fr)';
}

// ── Un grupo de segmentos (una dimensión) — cada item en su PROPIA fila, clic = abrir (oferta+demanda) ──
function SegmentoGrupo({ g, modo, onOpen, activos }) {
  const items = g.items || [];
  if (items.length === 0) return null;
  const tone = estadoTone(g.estado);
  // escala de la mini-barra: el mayor entre oferta y demanda de todo el grupo
  const max = Math.max(1, ...items.flatMap((it) => [it.oferta || 0, it.demanda || 0]));
  const cols = gridCols(modo);
  return (
    <Card style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
        <div style={lbl}>{g.label}</div>
        <Badge tone={tone}>{g.estado}</Badge>
      </div>
      <div style={{ fontSize: 11, color: '#777', marginBottom: 10 }}>
        {items.length} {items.length === 1 ? 'dato independiente' : 'datos independientes'} — clic en una fila para abrir qué hay y quién lo busca
      </div>
      <div style={{ display: 'grid', gap: 7 }}>
        {/* encabezado de columnas */}
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, alignItems: 'center', fontSize: 10, color: '#777', textTransform: 'uppercase', letterSpacing: 0.4, paddingBottom: 2 }}>
          <span>Segmento</span>
          {modo !== 'demanda' && <span style={{ textAlign: 'right' }}>Oferta</span>}
          {modo !== 'oferta' && <span style={{ textAlign: 'right' }}>Demanda</span>}
          <span></span>
          {modo === 'mixto' && <span>Gap</span>}
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
  return (
    <div
      onClick={clickable ? () => onOpen(filtro) : undefined}
      title={clickable ? 'Abrir este segmento (qué hay · quién lo busca)' : undefined}
      style={{
        display: 'grid', gridTemplateColumns: cols,
        gap: 10, alignItems: 'center', fontSize: 12.5,
        padding: '7px 10px', borderRadius: 9, cursor: clickable ? 'pointer' : 'default',
        background: yaActivo ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.025)',
        border: '1px solid ' + (yaActivo ? 'var(--theme, #6366f1)' : 'rgba(255,255,255,0.06)'),
        borderLeft: `3px solid ${gapColor}`,
      }}
      onMouseEnter={clickable ? (e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; } : undefined}
      onMouseLeave={clickable ? (e) => { e.currentTarget.style.background = yaActivo ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.025)'; } : undefined}>
      <span style={{ color: '#ddd', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(it.segmento)}</span>
      {modo !== 'demanda' && <span style={{ textAlign: 'right', color: '#22c55e', fontWeight: 700 }}>{fmtN(oferta)}</span>}
      {modo !== 'oferta' && <span style={{ textAlign: 'right', color: '#a78bfa', fontWeight: 700 }}>{fmtN(demanda)}</span>}
      {/* mini-barra: según modo */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {modo !== 'demanda' && <div style={{ height: 6, borderRadius: 3, background: '#22c55e', opacity: 0.85, width: `${(oferta / max) * 100}%`, minWidth: oferta > 0 ? 2 : 0 }} />}
        {modo !== 'oferta' && <div style={{ height: 6, borderRadius: 3, background: '#a78bfa', opacity: 0.85, width: `${(demanda / max) * 100}%`, minWidth: demanda > 0 ? 2 : 0 }} />}
      </div>
      {modo === 'mixto' && <span style={{ color: gapColor, fontWeight: 700, fontSize: 12 }}>{gapTexto}</span>}
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
  const fila = (o, color, emoji) => (
    <button key={`${o.colonia_id}:${o.segmento}:${o.dimension}`} onClick={() => onPick(o)}
      style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer', width: '100%',
        border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.025)', color: '#ddd',
        borderLeft: `3px solid ${color}`, display: 'flex', flexDirection: 'column', gap: 4 }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = color; e.currentTarget.style.borderLeftColor = color; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderLeftColor = color; }}>
      <span style={{ fontSize: 13.5, color: '#eee', fontWeight: 600, lineHeight: 1.35 }}>{emoji} {o.lectura}</span>
      <span style={{ fontSize: 11, color: '#888' }}>
        {[o.colonia, o.dimension, o.segmento, `oferta ${fmtN(o.oferta)} · demanda ${fmtN(o.demanda)}`].filter(Boolean).join(' · ')}
      </span>
    </button>
  );
  return (
    <Card style={card}>
      <div style={lbl}>El cubo encontró:</div>
      {oport.lectura && <div style={{ fontSize: 11.5, color: '#777', marginBottom: 12, fontStyle: 'italic' }}>{oport.lectura}</div>}
      {oportunidades.length === 0 && sobreofertas.length === 0 && (
        <span style={{ fontSize: 12.5, color: '#888' }}>No hay hallazgos con suficiente señal en este alcance.</span>
      )}
      {oportunidades.length > 0 && (
        <div style={{ marginBottom: sobreofertas.length > 0 ? 14 : 0 }}>
          <div style={{ fontSize: 11.5, color: '#34d399', fontWeight: 700, marginBottom: 8 }}>🟢 Oportunidades — se busca más de lo que hay</div>
          <div style={{ display: 'grid', gap: 7 }}>{oportunidades.map((o) => fila(o, '#1FA06A', '🟢'))}</div>
        </div>
      )}
      {sobreofertas.length > 0 && (
        <div>
          <div style={{ fontSize: 11.5, color: '#fbbf24', fontWeight: 700, marginBottom: 8 }}>🟡 Sobreofertas — hay más de lo que se busca</div>
          <div style={{ display: 'grid', gap: 7 }}>{sobreofertas.map((o) => fila(o, '#f59e0b', '🟡'))}</div>
        </div>
      )}
    </Card>
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
          <div style={{ fontSize: 11, color: '#777', marginBottom: 8 }}>{fmtN(oferta.total)} unidades cumplen{entidades.length < (oferta.total || 0) ? ` · mostrando ${entidades.length}` : ''}</div>
          {entidades.length === 0 ? (
            <span style={{ fontSize: 12.5, color: '#888' }}>Ninguna unidad cumple este filtro en la zona.</span>
          ) : (
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,1.6fr) 70px 56px 44px minmax(90px,1fr) 90px', gap: 8, fontSize: 10, color: '#777', textTransform: 'uppercase', letterSpacing: 0.3 }}>
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
          <div style={{ fontSize: 11, color: '#777', marginBottom: 8 }}>{fmtN(demanda.n_buscan)} lo buscan en la zona</div>
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
      <div style={{ fontSize: 11, color: '#777', marginBottom: 10 }}>{fichas.length} combinaciones distintas (rec · baños · cajón · m² · extras)</div>
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
            <span style={{ color: '#888' }}>{c.caracteristica}</span>
            <strong style={{ color: '#ddd', textAlign: 'right' }}>{String(c.valor)}</strong>
          </div>
        ))}
      </div>
    </Card>
  );
}
