// Superadmin · TERMINAL DE ZONA — la vista madre del cubo. Pivotea los ejes (atlas · conteos · comparativas ·
// por desarrollo · atributos · financiero · compuestas · grid). Atributos y Financiero usan el estándar INDICADOR.
import React, { useEffect, useState } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card, Badge } from '../../components/advisor/primitives';
import { getTerminal, getIndicadoresAtributos, getIndicadoresFinanciero } from '../../api/superadminDemandIntel';
import Indicador from '../../components/superadmin/Indicador';
import GridPanel from '../../components/superadmin/GridPanel';
import AtlasPanel from '../../components/superadmin/AtlasPanel';
import FacetPanel from '../../components/superadmin/FacetPanel';
import CompararPanel from '../../components/superadmin/CompararPanel';

const TABS = [
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

export default function SuperadminTerminalZona({ user, onLogout }) {
  const [tab, setTab] = useState('atlas');
  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [resumen, setResumen] = useState(null);

  // Selector de geo compartido por los tabs Atributos/Financiero (estándar INDICADOR).
  const [geoSel, setGeoSel] = useState({ nivel: 'ciudad', valor: '' });
  const [indData, setIndData] = useState(null);   // respuesta del endpoint de indicadores (atributos/financiero)
  const [indLoading, setIndLoading] = useState(false);
  const [indError, setIndError] = useState(null);

  useEffect(() => { getTerminal('resumen').then(setResumen).catch(() => {}); }, []);
  useEffect(() => {
    if (tab === 'grid') return; // grid se carga solo (GridPanel)
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

      {/* SELECTOR DE GEO compartido (Atributos / Financiero) */}
      {showGeoSel && (
        <Card style={{ ...card, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: '#888' }}>Geografía:</span>
          <select value={geoSel.nivel}
            onChange={(e) => setGeoSel({ nivel: e.target.value, valor: e.target.value === 'ciudad' ? '' : geoSel.valor })}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#ddd', fontSize: 12.5 }}>
            <option value="ciudad">Ciudad (toda CDMX)</option>
            <option value="alcaldia">Alcaldía</option>
            <option value="colonia">Colonia</option>
          </select>
          {geoSel.nivel !== 'ciudad' && (
            <input value={geoSel.valor} onChange={(e) => setGeoSel((g) => ({ ...g, valor: e.target.value }))}
              placeholder={geoSel.nivel === 'colonia' ? 'p.ej. condesa' : 'p.ej. cuauhtemoc'}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#ddd', fontSize: 12.5, minWidth: 200 }} />
          )}
          {geoSel.nivel !== 'ciudad' && !geoSel.valor && <span style={{ fontSize: 11.5, color: '#777' }}>Escribe una {geoSel.nivel} para consultar.</span>}
        </Card>
      )}

      {loading && !showGeoSel && <Card style={card}>Cargando eje…</Card>}
      {d?.error && !showGeoSel && <Card style={{ ...card, color: '#dc2626' }}>{d.error}</Card>}

      {/* INDICADORES (Atributos / Financiero) — estado de carga/error compartido */}
      {showGeoSel && indLoading && <Card style={card}>Cargando indicadores…</Card>}
      {showGeoSel && indError && <Card style={{ ...card, color: '#dc2626' }}>{indError}</Card>}

      {/* ATRIBUTOS DE UNIDAD — estándar INDICADOR */}
      {tab === 'atributos' && !indLoading && !indError && indData && (
        <>
          {indData.lectura && <div style={{ fontSize: 12.5, color: '#9aa', marginBottom: 12 }}>{indData.lectura}</div>}
          <div style={INDGRID}>
            {(indData.indicadores || []).map((i) => <Indicador key={i.nombre + i.dimension} ind={i} />)}
          </div>
          {(indData.indicadores || []).length === 0 && <Card style={card}><span style={{ color: '#888', fontSize: 12.5 }}>Sin indicadores para esta geografía.</span></Card>}
        </>
      )}

      {/* FINANCIERO — estándar INDICADOR */}
      {tab === 'financiero' && !indLoading && !indError && indData && (
        <>
          {indData.lectura && <div style={{ fontSize: 12.5, color: '#9aa', marginBottom: 12 }}>{indData.lectura}</div>}
          <div style={INDGRID}>
            {(indData.indicadores || []).map((i) => <Indicador key={i.nombre + i.dimension} ind={i} />)}
          </div>
          {(indData.indicadores || []).length === 0 && <Card style={card}><span style={{ color: '#888', fontSize: 12.5 }}>Sin indicadores para esta geografía.</span></Card>}
        </>
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
function Sect({ title, children }) {
  return <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
    <div style={{ fontSize: 11, color: '#777', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{title}</div>{children}</div>;
}
const kv = (o) => Object.entries(o || {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—';

function DevCard({ x }) {
  const p = x.producto || {}; const f = x.finanzas || {}; const u = x.ubicacion || {}; const inv = x.inversion || {};
  return (
    <Card style={{ padding: '14px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <strong style={{ fontSize: 15 }}>{x.nombre}</strong>
        <span style={{ fontSize: 12, color: '#888' }}>{x.colonia} · {x.alcaldia}</span>
      </div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>{x.stage || '—'} · entrega {x.entrega || '—'} · {fmtM(x.precio_desde)}–{fmtM(x.precio_hasta)} · {x.precio_m2 ? `$${Math.round(x.precio_m2 / 1000)}k/m²` : ''} {x.premium_vs_zona_pct != null && <span style={{ color: x.premium_vs_zona_pct > 0 ? '#f59e0b' : '#22c55e' }}>({x.premium_vs_zona_pct > 0 ? '+' : ''}{x.premium_vs_zona_pct}% vs zona)</span>}</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 14px', fontSize: 12.5 }}>
        <span>Demanda: <strong>{x.demanda}</strong>{x.cuota_demanda_zona_pct != null ? ` (${x.cuota_demanda_zona_pct}% de zona)` : ''}</span>
        <span>Absorción: <strong>{x.absorcion?.vendido_pct ?? '—'}%</strong> ({x.absorcion?.vendidas}/{x.absorcion?.total})</span>
        <span>P(venta 12m): <strong style={{ color: 'var(--theme)' }}>{x.prob_venta_12m?.pct != null ? `${x.prob_venta_12m.pct}%` : '—'}</strong></span>
        <span>Score: <strong>{x.project_score ?? '—'}</strong> · Margen: <strong>{x.margen?.pct != null ? `${x.margen.pct}%` : '—'}</strong></span>
      </div>

      <Sect title="Producto (sus unidades)">
        <Row label="Tipologías">{kv(p.tipologias)}</Row>
        <Row label="m²">{p.m2 ? `${p.m2.min}–${p.m2.max} (med ${p.m2.mediana}) · exterior ~${p.m2_exterior_prom}m²` : '—'}</Row>
        <Row label="Recámaras / baños">{kv(p.recamaras)} · baños {kv(p.banos)}</Row>
        <Row label="Vista / altura">{kv(p.vista)} · edificio {p.altura_edificio_pisos || '—'} pisos · estac. {kv(p.estacionamiento)}</Row>
        <Row label="Atributos">balcón {p.balcon_pct}% · terraza {p.terraza_pct}% · roof {p.roof_garden_pct}% · bodega {p.bodega_pct}% · pet {p.pet_friendly_pct}%</Row>
      </Sect>

      {x.amenidades?.length > 0 && (
        <Sect title="Amenidades">
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{x.amenidades.map((a) => <Badge key={a} tone="neutral">{a.replace(/_/g, ' ')}</Badge>)}</div>
        </Sect>
      )}

      <Sect title="Finanzas / créditos">
        <Row label="Precio">{fmtM(f.precio_desde)} – {fmtM(f.precio_hasta)}</Row>
        <Row label="Enganche típico (20%)">{fmtM(f.enganche_tipico_20pct)} · crédito {fmtM(f.credito_estimado)}</Row>
        <Row label="Créditos aceptados">{(f.creditos_aceptados || []).join(' · ') || '—'}</Row>
      </Sect>

      <Sect title="Ubicación (su colonia)">
        <Row label="Calidad de vida">{u.subscores ? Object.entries(u.subscores).map(([k, v]) => `${k} ${Math.round(v)}`).join(' · ') : '—'}</Row>
        <Row label="Riesgo">{u.riesgo_natural ? `sísmico ${u.riesgo_natural.sismico_zona} · inundación ${u.riesgo_natural.inundacion_pct}%` : '—'}{u.crimen?.incidentes != null ? ` · ${Math.round(u.crimen.incidentes)} inc. FGJ` : ''}</Row>
      </Sect>

      <Sect title="Inversión">
        <Row label="Score zona">{inv.score_zona ?? '—'} {inv.tier ? `(${inv.tier})` : ''} · cap rate Airbnb <strong style={{ color: '#22c55e' }}>{inv.cap_rate_str_airbnb != null ? `${inv.cap_rate_str_airbnb}%` : '—'}</strong> · estimado {inv.cap_rate_estimado != null ? `${inv.cap_rate_estimado}%` : '—'}</Row>
        <Row label="Valor residual del suelo">{inv.valor_residual_suelo != null ? `$${Math.round(inv.valor_residual_suelo / 1000)}k/m²` : '—'}</Row>
      </Sect>

      <div style={{ fontSize: 11.5, color: '#777', marginTop: 8 }}>
        {x.rivales?.length > 0 ? `Rivales: ${x.rivales.map((r) => r.dev).join(' · ')} · ` : ''}
        Medios: {x.medios?.fotos || 0} fotos{x.medios?.video ? ' · video' : ''}{x.medios?.tour360 ? ' · tour 360' : ''}{x.avance_obra != null ? ` · obra ${x.avance_obra}%` : ''}
      </div>
    </Card>
  );
}

function Compuestas100({ data }) {
  const [pack, setPack] = useState('Pricing');
  const packs = [...new Set((data.catalogo || []).map((c) => c.pack))];
  const inPack = (data.catalogo || []).filter((c) => c.pack === pack);
  const zona = (data.por_zona || [])[0];
  return (
    <div>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>
        Cobertura: <strong style={{ color: 'var(--theme)' }}>{data.cobertura?.reales}/{data.cobertura?.total}</strong> valores reales ({data.cobertura?.pct}%) · {data.cobertura?.nota}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {packs.map((p) => (
          <button key={p} onClick={() => setPack(p)} style={{ padding: '5px 12px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', background: pack === p ? 'var(--theme)' : 'transparent', color: pack === p ? '#fff' : '#aaa', fontSize: 12 }}>{p}</button>
        ))}
      </div>
      <Card style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>#</th><th style={th}>métrica</th><th style={th}>qué descubre</th>{(data.por_zona || []).slice(0, 5).map((z) => <th key={z.zona} style={th}>{z.nombre || z.zona}</th>)}</tr></thead>
          <tbody>
            {inPack.map((c) => (
              <tr key={c.n}>
                <td style={{ ...td, color: '#888' }}>{c.n}</td>
                <td style={{ ...td, fontWeight: 600 }}>{c.nombre}</td>
                <td style={{ ...td, color: '#999', maxWidth: 220 }}>{c.descubre}</td>
                {(data.por_zona || []).slice(0, 5).map((z) => {
                  const v = z.valores?.[c.n];
                  return <td key={z.zona} style={{ ...td, color: v == null || v === '—' ? '#555' : 'var(--theme)' }}>{v == null ? '—' : String(v)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
