// Superadmin · TERMINAL DE ZONA — la vista madre del cubo. Pivotea los ejes (atlas · conteos · comparativas ·
// por desarrollo · atributos · financiero · compuestas · grid). Atributos y Financiero usan el estándar INDICADOR.
import React, { useEffect, useState } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card, Badge } from '../../components/advisor/primitives';
import { getTerminal, getIndicadoresAtributos, getIndicadoresFinanciero } from '../../api/superadminDemandIntel';
import HallazgoView from '../../components/superadmin/HallazgoView';
import GridPanel from '../../components/superadmin/GridPanel';
import AtlasPanel from '../../components/superadmin/AtlasPanel';
import FacetPanel from '../../components/superadmin/FacetPanel';
import CompararPanel from '../../components/superadmin/CompararPanel';
import ExploradorPanel from '../../components/superadmin/ExploradorPanel';
import ScreenerPanel from '../../components/superadmin/ScreenerPanel';
import HeatmapPanel from '../../components/superadmin/HeatmapPanel';

const TABS = [
  { key: 'explorador', label: 'Explorador (árbol)' },
  { key: 'screener', label: 'Screener (buscar)' },
  { key: 'heatmap', label: 'Mapa de tensión' },
  { key: 'atlas', label: 'Atlas (explorador)' },
  { key: 'facet', label: 'Conteos (oferta/demanda)' },
  { key: 'comparar', label: 'Comparativas (¿por qué?)' },
  { key: 'desarrollos', label: 'Por desarrollo' },
  { key: 'atributos', label: 'Atributos de unidad' },
  { key: 'financiero', label: 'Financiero' },
  { key: 'compuestas', label: 'Las 120 compuestas' },
  { key: 'grid', label: 'Grid de métricas' },
];

const fmtM = (v) => (v == null ? '—' : `$${(v / 1e6).toFixed(1)}M`);
const card = { padding: '14px 18px' };
const th = { fontSize: 11, color: '#888', textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid rgba(255,255,255,0.1)' };
const td = { fontSize: 12.5, padding: '4px 8px', borderTop: '1px solid rgba(255,255,255,0.05)' };
const INDGRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 14 };
// Barra de filtros guiados (Atributos / Financiero): etiqueta chiquita arriba de cada control.
const fLabel = { fontSize: 11, color: '#888', fontWeight: 600 };
const fSelect = { padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#ddd', fontSize: 12.5 };
const fInput = { padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#ddd', fontSize: 12.5 };

export default function SuperadminTerminalZona({ user, onLogout }) {
  const [tab, setTab] = useState('atlas');
  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [resumen, setResumen] = useState(null);

  // Selector de geo compartido por los tabs Atributos/Financiero (estándar INDICADOR).
  const [geoSel, setGeoSel] = useState({ nivel: 'ciudad', valor: '' });
  const [busqueda, setBusqueda] = useState('');   // buscador de texto client-side (filtra los hallazgos)
  const [indData, setIndData] = useState(null);   // respuesta del endpoint de indicadores (atributos/financiero)
  const [indLoading, setIndLoading] = useState(false);
  const [indError, setIndError] = useState(null);

  useEffect(() => { getTerminal('resumen').then(setResumen).catch(() => {}); }, []);
  useEffect(() => {
    if (tab === 'grid') return; // grid se carga solo (GridPanel)
    if (tab === 'explorador') return; // explorador (árbol) se carga solo (ExploradorPanel)
    if (tab === 'screener') return; // screener se carga solo (ScreenerPanel)
    if (tab === 'heatmap') return; // mapa de tensión se carga solo (HeatmapPanel)
    if (tab === 'atlas') return; // atlas se carga solo (AtlasPanel)
    if (tab === 'facet') return; // explorador faceteado se carga solo (FacetPanel)
    if (tab === 'comparar') return; // comparativas se carga solo (CompararPanel)
    if (tab === 'atributos') return; // atributos carga vía endpoint de indicadores
    if (tab === 'financiero') return; // financiero carga vía endpoint de indicadores
    if (cache[tab]) return;
    setLoading(true);
    getTerminal(tab).then((d) => setCache((c) => ({ ...c, [tab]: d }))).catch((e) => setCache((c) => ({ ...c, [tab]: { error: e.message } }))).finally(() => setLoading(false));
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Carga de INDICADORES (atributos/financiero) — se dispara al entrar al tab o cambiar el geo.
  useEffect(() => {
    if (tab !== 'atributos' && tab !== 'financiero') return;
    const geoArgs = geoSel.nivel === 'ciudad' ? {} : { geo_nivel: geoSel.nivel, geo_valor: geoSel.valor };
    if (geoSel.nivel !== 'ciudad' && !geoSel.valor) { setIndData(null); setIndError(null); return; }
    const fn = tab === 'atributos' ? getIndicadoresAtributos : getIndicadoresFinanciero;
    setIndLoading(true); setIndError(null);
    fn(geoArgs).then((r) => setIndData(r)).catch((e) => { setIndData(null); setIndError(e.message); }).finally(() => setIndLoading(false));
  }, [tab, geoSel]); // eslint-disable-line react-hooks/exhaustive-deps

  const d = cache[tab];
  const showGeoSel = tab === 'atributos' || tab === 'financiero';

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <PageHeader title="Terminal de Zona" subtitle={resumen?.lectura || 'El cubo de inteligencia: pivotea medida × escala × atributo × financiero × cruces.'} />

      {/* tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 16px' }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '7px 14px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
              background: tab === t.key ? 'var(--theme, #6366f1)' : 'transparent', color: tab === t.key ? '#fff' : '#aaa', fontSize: 13, fontWeight: 600 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* BARRA DE FILTROS GUIADOS (Atributos / Financiero) — lenguaje humano: ¿qué zona? + buscador de un dato */}
      {showGeoSel && (
        <Card style={{ ...card, display: 'flex', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
          {/* ¿Qué zona? — nivel + valor */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={fLabel}>¿Qué zona?</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={geoSel.nivel}
                onChange={(e) => setGeoSel({ nivel: e.target.value, valor: e.target.value === 'ciudad' ? '' : geoSel.valor })}
                style={fSelect}>
                <option value="ciudad">Toda la ciudad (CDMX)</option>
                <option value="alcaldia">Una alcaldía</option>
                <option value="colonia">Una colonia</option>
              </select>
              {geoSel.nivel !== 'ciudad' && (
                <input value={geoSel.valor} onChange={(e) => setGeoSel((g) => ({ ...g, valor: e.target.value }))}
                  placeholder={geoSel.nivel === 'colonia' ? 'ej. polanco' : 'ej. cuauhtemoc'}
                  style={{ ...fInput, minWidth: 200 }} />
              )}
            </div>
          </div>

          {/* Buscador de un dato */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 220px' }}>
            <span style={fLabel}>Busca un dato</span>
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder="🔎 ej. terraza, enganche"
              style={{ ...fInput, width: '100%' }} />
          </div>

          {geoSel.nivel !== 'ciudad' && !geoSel.valor && <span style={{ fontSize: 11.5, color: '#777', alignSelf: 'center' }}>Escribe una {geoSel.nivel === 'colonia' ? 'colonia' : 'alcaldía'} para consultar.</span>}
        </Card>
      )}

      {loading && !showGeoSel && <Card style={card}>Cargando eje…</Card>}
      {d?.error && !showGeoSel && <Card style={{ ...card, color: '#dc2626' }}>{d.error}</Card>}

      {/* INDICADORES (Atributos / Financiero) — estado de carga/error compartido */}
      {showGeoSel && indLoading && <Card style={card}>Cargando indicadores…</Card>}
      {showGeoSel && indError && <Card style={{ ...card, color: '#dc2626' }}>{indError}</Card>}

      {/* ATRIBUTOS DE UNIDAD — historia legible (HallazgoView) */}
      {tab === 'atributos' && !indLoading && !indError && indData && (
        <HallazgoView data={indData} busqueda={busqueda} />
      )}

      {/* FINANCIERO — historia legible (HallazgoView) */}
      {tab === 'financiero' && !indLoading && !indError && indData && (
        <HallazgoView data={indData} busqueda={busqueda} />
      )}

      {/* POR DESARROLLO (universo completo per-dev) */}
      {tab === 'desarrollos' && d && !d.error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 14 }}>
          {(d.desarrollos || []).map((x) => <DevCard key={x.dev_id} x={x} />)}
        </div>
      )}

      {/* LAS 100 COMPUESTAS */}
      {tab === 'compuestas' && d && !d.error && (
        <Compuestas100 data={d} />
      )}

      {/* GRID DE MÉTRICAS */}
      {tab === 'grid' && <GridPanel />}

      {/* EXPLORADOR (árbol navegable — abrir = clic, cada segmento independiente) */}
      {tab === 'explorador' && <ExploradorPanel />}

      {/* SCREENER (buscar por criterios — el buscador del analista) */}
      {tab === 'screener' && <ScreenerPanel />}

      {/* MAPA DE TENSIÓN (heatmap repivotable de CDMX) */}
      {tab === 'heatmap' && <HeatmapPanel />}

      {/* ATLAS (explorador de entidades) */}
      {tab === 'atlas' && <AtlasPanel />}

      {/* EXPLORADOR FACETEADO (conteos oferta/demanda) */}
      {tab === 'facet' && <FacetPanel />}

      {/* COMPARATIVAS (¿por qué?) — la capa del porqué */}
      {tab === 'comparar' && <CompararPanel />}
    </SuperadminLayout>
  );
}

function Row({ label, children }) {
  return <div style={{ fontSize: 12, marginBottom: 6 }}><span style={{ color: '#888' }}>{label}: </span><span style={{ color: '#ccc' }}>{children}</span></div>;
}
function Sect({ title, children, fuente }) {
  return <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
    <div style={{ fontSize: 11, color: '#777', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{title}</div>
    {children}
    {fuente && <div style={{ fontSize: 10.5, color: '#666', marginTop: 6 }}>fuente: {fuente}</div>}
  </div>;
}
const kv = (o) => Object.entries(o || {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—';

// Etiquetas humanas para las llaves de calidad de vida (cubre set ES y EN; cae a humanizar la llave cruda).
const SUB_LABELS = {
  seguridad: 'seguridad', safety: 'seguridad', transporte: 'transporte', transit: 'transporte',
  educacion: 'educación', schools: 'escuelas', amenidades: 'amenidades', lifestyle: 'estilo de vida',
  precio: 'precio', vibe: 'ambiente', vibrant: 'ambiente', walkability: 'caminabilidad', quiet: 'tranquilidad',
  dining: 'restaurantes', parks: 'parques', cultural: 'cultura', family_friendly: 'familiar',
};
const humanSub = (k) => SUB_LABELS[k] || String(k).replace(/_/g, ' ');

// Comparativo "vs zona/ciudad" en lenguaje humano (premium de precio · cuota de demanda). Color por señal.
function VsZona({ pct, etiqueta, invertir }) {
  if (pct == null) return null;
  const positivo = invertir ? pct < 0 : pct > 0;   // p.ej. precio por encima de zona se pinta como "premium" (ámbar)
  const color = pct === 0 ? '#888' : positivo ? '#f59e0b' : '#22c55e';
  return <span style={{ color, fontWeight: 600 }}> ({pct > 0 ? '+' : ''}{pct}% {etiqueta})</span>;
}

function DevCard({ x }) {
  const p = x.producto || {}; const f = x.finanzas || {}; const u = x.ubicacion || {}; const inv = x.inversion || {};
  return (
    <Card style={{ padding: '14px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <strong style={{ fontSize: 15 }}>{x.nombre}</strong>
        <span style={{ fontSize: 12, color: '#888' }}>{x.colonia} · {x.alcaldia}</span>
      </div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>{x.stage || '—'} · entrega {x.entrega || '—'} · {fmtM(x.precio_desde)}–{fmtM(x.precio_hasta)} · {x.precio_m2 ? `$${Math.round(x.precio_m2 / 1000)}k/m²` : ''} <VsZona pct={x.premium_vs_zona_pct} etiqueta="vs precio de la zona" /></div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 14px', fontSize: 12.5 }}>
        <span>Demanda: <strong>{x.demanda}</strong>{x.cuota_demanda_zona_pct != null && <span style={{ color: '#a78bfa', fontWeight: 600 }}> ({x.cuota_demanda_zona_pct}% de la zona)</span>}</span>
        <span>Vendido: <strong>{x.absorcion?.vendido_pct ?? '—'}%</strong> ({x.absorcion?.vendidas}/{x.absorcion?.total} unidades)</span>
        <span>Prob. de venta (12 meses): <strong style={{ color: 'var(--theme)' }}>{x.prob_venta_12m?.pct != null ? `${x.prob_venta_12m.pct}%` : '—'}</strong></span>
        <span>Calificación: <strong>{x.project_score ?? '—'}</strong> · Margen: <strong>{x.margen?.pct != null ? `${x.margen.pct}%` : '—'}</strong></span>
      </div>
      <div style={{ fontSize: 10.5, color: '#666', marginTop: 6 }}>fuente: demanda y absorción del comportamiento real de compradores; precio/m² y prob. de venta de los motores de mercado DMX (comparados contra su colonia)</div>

      <Sect title="Producto (sus unidades)" fuente="ficha del desarrollo (mezcla real de unidades cargadas)">
        <Row label="Tipologías">{kv(p.tipologias)}</Row>
        <Row label="m²">{p.m2 ? `${p.m2.min}–${p.m2.max} (med ${p.m2.mediana}) · exterior ~${p.m2_exterior_prom}m²` : '—'}</Row>
        <Row label="Recámaras / baños">{kv(p.recamaras)} · baños {kv(p.banos)}</Row>
        <Row label="Vista / altura">{kv(p.vista)} · edificio {p.altura_edificio_pisos || '—'} pisos · estac. {kv(p.estacionamiento)}</Row>
        <Row label="Atributos">balcón {p.balcon_pct}% · terraza {p.terraza_pct}% · roof garden {p.roof_garden_pct}% · bodega {p.bodega_pct}% · pet friendly {p.pet_friendly_pct}%</Row>
      </Sect>

      {x.amenidades?.length > 0 && (
        <Sect title="Amenidades">
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{x.amenidades.map((a) => <Badge key={a} tone="neutral">{a.replace(/_/g, ' ')}</Badge>)}</div>
        </Sect>
      )}

      <Sect title="Finanzas / créditos" fuente="esquemas de pago del desarrollo + estimadores de enganche y crédito DMX">
        <Row label="Precio">{fmtM(f.precio_desde)} – {fmtM(f.precio_hasta)}</Row>
        <Row label="Enganche típico (20%)">{fmtM(f.enganche_tipico_20pct)} · crédito {fmtM(f.credito_estimado)}</Row>
        <Row label="Créditos aceptados">{(f.creditos_aceptados || []).join(' · ') || '—'}</Row>
      </Sect>

      <Sect title="Ubicación (su colonia)" fuente="índices de calidad de vida, riesgo natural y seguridad de la colonia (fuentes oficiales: sísmico, inundación, incidencia delictiva)">
        <Row label="Calidad de vida">{u.subscores ? Object.entries(u.subscores).map(([k, v]) => `${humanSub(k)} ${Math.round(v)}`).join(' · ') : '—'}</Row>
        <Row label="Riesgo">{u.riesgo_natural ? `sísmico ${u.riesgo_natural.sismico_zona} · inundación ${u.riesgo_natural.inundacion_pct}%` : '—'}{u.crimen?.incidentes != null ? ` · ${Math.round(u.crimen.incidentes)} incidentes delictivos reportados` : ''}</Row>
      </Sect>

      <Sect title="Inversión" fuente="motores de inversión DMX: renta corta (Airbnb), cap rate y valor residual del suelo por colonia">
        <Row label="Score de la zona">{inv.score_zona ?? '—'} {inv.tier ? `(${inv.tier})` : ''} · cap rate renta corta (Airbnb) <strong style={{ color: '#22c55e' }}>{inv.cap_rate_str_airbnb != null ? `${inv.cap_rate_str_airbnb}%` : '—'}</strong> · estimado {inv.cap_rate_estimado != null ? `${inv.cap_rate_estimado}%` : '—'}</Row>
        <Row label="Valor residual del suelo">{inv.valor_residual_suelo != null ? `$${Math.round(inv.valor_residual_suelo / 1000)}k/m²` : '—'}</Row>
      </Sect>

      <div style={{ fontSize: 11.5, color: '#777', marginTop: 8 }}>
        {x.rivales?.length > 0 ? `Rivales: ${x.rivales.map((r) => r.dev).join(' · ')} · ` : ''}
        Medios: {x.medios?.fotos || 0} fotos{x.medios?.video ? ' · video' : ''}{x.medios?.tour360 ? ' · tour 360' : ''}{x.avance_obra != null ? ` · obra ${x.avance_obra}%` : ''}
      </div>
    </Card>
  );
}

// Comparativo entre zonas para una compuesta: la zona con MAYOR valor vs la mediana de las zonas.
// Devuelve un objeto estilo `ind.comparativo` ({texto, señal}) más datos para el cuerpo.
function comparativoZonas(porZona, n) {
  const pares = (porZona || [])
    .map((z) => ({ zona: z.nombre || z.zona, v: z.valores?.[n] }))
    .filter((p) => p.v != null && p.v !== '—' && typeof p.v === 'number' && isFinite(p.v));
  if (pares.length < 2) return null;
  const ordenados = [...pares].sort((a, b) => b.v - a.v);
  const top = ordenados[0];
  const vals = pares.map((p) => p.v).sort((a, b) => a - b);
  const mid = vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2;
  if (mid === 0 || top.v === mid) {
    return { top, mediana: mid, n: pares.length, comparativo: { señal: 'media', texto: `lidera ${top.zona}` } };
  }
  const pct = Math.round(((top.v - mid) / Math.abs(mid)) * 100);
  return {
    top, mediana: mid, n: pares.length, pct,
    comparativo: { señal: pct > 0 ? 'alta' : 'baja', texto: `${top.zona} ${pct > 0 ? '+' : ''}${pct}% vs mediana` },
  };
}

const fmtVal = (v) => (v == null ? '—' : typeof v === 'number' ? (Number.isInteger(v) ? v.toLocaleString('es-MX') : v.toLocaleString('es-MX', { maximumFractionDigits: 1 })) : String(v));

// Una tarjeta por COMPUESTA — se LEE: nombre + para qué sirve + dónde pega más fuerte (comparativo entre zonas).
function CompuestaCard({ c, porZona }) {
  const [verFuente, setVerFuente] = useState(false);
  const cz = comparativoZonas(porZona, c.n);
  const senalColor = cz ? (cz.comparativo.señal === 'alta' ? '#22c55e' : cz.comparativo.señal === 'baja' ? '#f59e0b' : '#888') : '#888';
  // muestra de valores por zona (las primeras con dato) para que la fila no quede vacía aun sin comparativo numérico
  const muestra = (porZona || [])
    .map((z) => ({ zona: z.nombre || z.zona, v: z.valores?.[c.n] }))
    .filter((p) => p.v != null && p.v !== '—')
    .slice(0, 4);
  return (
    <Card style={{ padding: '13px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <strong style={{ fontSize: 13.5 }}>{c.nombre}</strong>
        <Badge tone="neutral">{c.pack}</Badge>
      </div>

      {/* comparativo: dónde pega más fuerte */}
      {cz ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 22, fontWeight: 700 }}>{fmtVal(cz.top.v)}</span>
          <span style={{ fontSize: 12, color: senalColor, fontWeight: 600 }}>
            {cz.comparativo.señal === 'alta' ? '▲' : cz.comparativo.señal === 'baja' ? '▼' : ''} {cz.comparativo.texto}
          </span>
        </div>
      ) : muestra.length > 0 ? (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12.5 }}>
          {muestra.map((m) => (
            <span key={m.zona}><span style={{ color: '#888' }}>{m.zona}: </span><span style={{ color: 'var(--theme)', fontWeight: 600 }}>{fmtVal(m.v)}</span></span>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: '#f59e0b' }}>Latente — <span style={{ color: '#999' }}>feeder de mercado aún apagado (fórmula ya cableada)</span></div>
      )}

      {/* uso: ¿para qué sirve? — VISIBLE, no solo tooltip */}
      {c.uso && <div style={{ fontSize: 11.5, color: '#9aa', fontStyle: 'italic', lineHeight: 1.4 }}>{c.uso}</div>}

      {/* dimensión + fuente (procedencia) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#777', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 5 }}>
        <span>{c.dimension}{cz ? ` · ${cz.n} zonas` : ''}</span>
        {c.fuente && (
          <button onClick={() => setVerFuente((v) => !v)} style={{ background: 'none', border: 'none', color: '#777', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}>
            {verFuente ? 'ocultar fuente' : 'fuente'}
          </button>
        )}
      </div>
      {verFuente && c.fuente && <div style={{ fontSize: 10.5, color: '#888', background: 'rgba(255,255,255,0.03)', padding: '5px 7px', borderRadius: 5 }}>de dónde sale: {c.fuente}</div>}
    </Card>
  );
}

function Compuestas100({ data }) {
  const catalogo = data.catalogo || [];
  const porZona = data.por_zona || [];
  const packs = [...new Set(catalogo.map((c) => c.pack))];
  const [pack, setPack] = useState(packs[0] || '');
  const activo = packs.includes(pack) ? pack : (packs[0] || '');
  const inPack = catalogo.filter((c) => c.pack === activo);
  return (
    <div>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>
        Cada compuesta dice <em>para qué sirve</em> y <em>dónde pega más fuerte</em> (la zona líder vs la mediana).{' '}
        Cobertura: <strong style={{ color: 'var(--theme)' }}>{data.cobertura?.reales}/{data.cobertura?.total}</strong> valores reales ({data.cobertura?.pct}%) · {data.cobertura?.nota}
      </div>
      {/* navegación por pack (dimensión) */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {packs.map((p) => (
          <button key={p} onClick={() => setPack(p)} style={{ padding: '5px 12px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', background: activo === p ? 'var(--theme)' : 'transparent', color: activo === p ? '#fff' : '#aaa', fontSize: 12 }}>{p}</button>
        ))}
      </div>
      {/* encabezado del pack + sus compuestas */}
      <div style={{ fontSize: 11, color: '#777', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        {activo} · {inPack.length} {inPack.length === 1 ? 'compuesta' : 'compuestas'}
      </div>
      <div style={INDGRID}>
        {inPack.map((c) => <CompuestaCard key={c.n} c={c} porZona={porZona} />)}
      </div>
      {inPack.length === 0 && <Card style={card}><span style={{ color: '#888', fontSize: 12.5 }}>Sin compuestas en este paquete.</span></Card>}
    </div>
  );
}
