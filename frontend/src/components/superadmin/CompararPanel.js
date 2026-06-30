// Superadmin · COMPARATIVAS (¿por qué?) — la capa del PORQUÉ, en lenguaje humano.
// Parte los desarrollos por una CARACTERÍSTICA (split) y compara un RESULTADO (outcome) entre grupos
// para ver qué mueve qué ("con amenidades vende más", "sin terraza menos demanda").
//   A) "Qué mueve las ventas": hallazgos automáticos de /compare/insights, como frases + qué hacer.
//   B) "Comparar tú mismo": eliges característica × resultado (+geo opcional) y corre /compare/run.
// Los DATOS no cambian; esta capa solo mejora presentación y lenguaje (sin tocar las llamadas API).
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Badge } from '../advisor/primitives';
import { getCompareCatalog, getCompareRun, getCompareInsights, getLaunchCoverage, setLaunch } from '../../api/superadminDemandIntel';

const card = { padding: '14px 18px' };
// Headers de sección con más contraste (consistencia Ola 3: #a8a8b3 / 12px / 600).
const lbl = { fontSize: 12, color: '#a8a8b3', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 };
const selStyle = {
  background: 'rgba(255,255,255,0.04)', color: '#ddd', fontSize: 12.5,
  border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: '6px 9px', minWidth: 150,
};
const inputStyle = { ...selStyle };
const btnStyle = {
  padding: '7px 16px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
  background: 'var(--theme, #6366f1)', color: '#fff', fontSize: 12.5, fontWeight: 600,
};
const th = {
  textAlign: 'left', fontSize: 10.5, color: '#a8a8b3', fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: 0.4, padding: '6px 10px 8px', borderBottom: '1px solid rgba(255,255,255,0.10)', whiteSpace: 'nowrap',
};
const td = { fontSize: 12, color: '#bbb', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'middle' };

// ── Skeleton de carga (pulso CSS, inyectado una vez · SSR-safe · dedup por id) ─
const SKELETON_STYLE_ID = 'compararpanel-skeleton-keyframes';
function ensureSkeletonStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(SKELETON_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = SKELETON_STYLE_ID;
  el.textContent = '@keyframes cmpPulse { 0%,100% { opacity: 0.35; } 50% { opacity: 0.85; } }';
  document.head.appendChild(el);
}
const skBlock = (w, h = 10, extra = {}) => ({
  width: w, height: h, borderRadius: 4,
  background: 'rgba(255,255,255,0.10)',
  animation: 'cmpPulse 1.2s ease-in-out infinite',
  ...extra,
});
// Texto solo-lector (oculto visualmente) para anunciar la carga a lectores de pantalla.
const srOnly = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0,
};

// Mini-barras fantasma (insinúan grupo → valor) para tarjetas en carga.
function SkeletonBars({ rows = 3 }) {
  const ws = [82, 60, 90, 48, 70];
  return (
    <div style={{ display: 'grid', gap: 7 }} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={skBlock(96, 9)} />
          <div style={skBlock(`${ws[i % ws.length]}%`, 9, { flex: 'none' })} />
          <div style={skBlock(40, 9, { marginLeft: 'auto' })} />
        </div>
      ))}
    </div>
  );
}

// Una tarjeta-hallazgo fantasma (frase + contexto + barras).
function SkeletonInsightCard() {
  return (
    <Card style={card} aria-hidden="true">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <div style={skBlock('70%', 13)} />
        <div style={skBlock(76, 16, { borderRadius: 9999 })} />
      </div>
      <div style={skBlock('55%', 9, { marginBottom: 12 })} />
      <SkeletonBars rows={3} />
    </Card>
  );
}

// Bloque de carga para los hallazgos automáticos (grilla de tarjetas fantasma).
function InsightsSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
      <span style={srOnly}>Buscando los porqués…</span>
      <SkeletonInsightCard />
      <SkeletonInsightCard />
    </div>
  );
}

// Bloque de carga para el resultado de "comparar tú mismo" (delta + barras fantasma).
function RunSkeleton() {
  return (
    <Card style={{ ...card, marginTop: 16 }} role="status" aria-live="polite" aria-busy="true">
      <span style={srOnly}>Comparando grupos…</span>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 12 }} aria-hidden="true">
        <div style={skBlock(200, 11)} />
        <div style={skBlock(120, 9)} />
      </div>
      <div style={skBlock(120, 30, { marginBottom: 14 })} aria-hidden="true" />
      <SkeletonBars rows={4} />
    </Card>
  );
}

const GEO_NIVELES = ['colonia', 'alcaldia'];

const fmtN = (v) => (v == null ? '—' : (typeof v === 'number' ? v.toLocaleString('es-MX') : String(v)));
// Valor de resultado con su unidad ("83%", "5.2 meses", "$54k/m²", "120").
const fmtVal = (v, unidad) => {
  if (v == null) return '—';
  const u = unidad || '';
  if (u === '%') return `${typeof v === 'number' ? +(+v).toFixed(1) : v}%`;
  if (u === '$/m²' || u === '$') return `$${Math.round(v).toLocaleString('es-MX')}${u === '$/m²' ? '/m²' : ''}`;
  const num = typeof v === 'number' ? +(+v).toFixed(1) : v;
  return u ? `${num} ${u}` : `${num}`;
};

// ── Traducción a lenguaje humano (NO mostramos "split"/"outcome" crudos) ──────
// Característica (split) → etiqueta legible.
const SPLIT_LABELS = {
  amenidades_nivel: 'Nivel de amenidades',
  entrega: 'Tipo de entrega (preventa vs inmediata)',
  'tamaño_edificio': 'Tamaño del edificio',
  altura: 'Altura del edificio',
  tier_precio: 'Rango de precio',
  creditos: 'Créditos aceptados',
  property_type: 'Tipo de propiedad',
  colonia: 'Colonia',
  alcaldia: 'Alcaldía',
  terraza: 'Terraza (sí / no)',
  roof_garden: 'Roof garden (sí / no)',
  bodega: 'Bodega (sí / no)',
  pet_friendly: 'Pet friendly (sí / no)',
};
const splitLabel = (s) => SPLIT_LABELS[s] || (s ? String(s).replace(/_/g, ' ') : '—');

// Resultado (outcome) → cómo decirlo en humano + frase corta de "qué significa más/menos".
const OUTCOME_LABELS = {
  meses_vender: { label: 'Velocidad de venta', sentido: 'tarda en venderse' },
  sell_through: { label: '% vendido', sentido: 'lleva vendido' },
  demanda: { label: 'Interés de compradores', sentido: 'de interés' },
  absorcion: { label: 'Ritmo de venta', sentido: 'de ritmo de venta' },
  precio_m2: { label: 'Precio por m²', sentido: 'de precio por m²' },
};
const outcomeLabel = (o) => OUTCOME_LABELS[o]?.label || (o ? String(o).replace(/_/g, ' ') : '—');

// "mejor es" en lenguaje humano.
const mejorEsHumano = (m) => {
  if (m === 'menos') return 'mientras más bajo, mejor';
  if (m === 'más') return 'mientras más alto, mejor';
  return null; // "—" → neutro
};

// Confianza → etiqueta humana + tono de Badge.
const CONF_MAP = {
  alta: { texto: 'dato sólido', tone: 'ok' },
  media: { texto: 'señal probable', tone: 'warn' },
  baja: { texto: 'indicio, pocos datos', tone: 'neutral' },
};
const confInfo = (c) => CONF_MAP[String(c || '').toLowerCase()] || { texto: 'indicio, pocos datos', tone: 'neutral' };

// "menos" → gana el grupo de MENOR valor · "más" → gana el de MAYOR valor · "—" → neutro.
function bestGrupoValor(grupos, mejorEs) {
  const conDato = (grupos || []).filter((g) => g && g.valor != null);
  if (conDato.length === 0 || mejorEs === '—' || !mejorEs) return null;
  if (mejorEs === 'menos') return conDato.reduce((a, b) => (b.valor < a.valor ? b : a)).valor;
  return conDato.reduce((a, b) => (b.valor > a.valor ? b : a)).valor; // "más"
}

// El grupo que GANA (nombre legible) según mejor_es.
function bestGrupoNombre(grupos, mejorEs) {
  const conDato = (grupos || []).filter((g) => g && g.valor != null);
  if (conDato.length === 0 || mejorEs === '—' || !mejorEs) return null;
  const g = mejorEs === 'menos'
    ? conDato.reduce((a, b) => (b.valor < a.valor ? b : a))
    : conDato.reduce((a, b) => (b.valor > a.valor ? b : a));
  return g.grupo ?? null;
}

// "→ Qué hago con esto": acción derivada del hallazgo/comparación (sin inventar datos nuevos).
function accionDe(split, outcome, grupos, mejorEs) {
  const ganador = bestGrupoNombre(grupos, mejorEs);
  if (!ganador) return null;
  const g = String(ganador).toLowerCase();
  // Sobre demanda / interés → resáltalo en la oferta.
  if (outcome === 'demanda') {
    return `Lo que más atrae compradores aquí es "${ganador}". Resáltalo en tu oferta y en el anuncio.`;
  }
  // Sobre velocidad / % vendido / ritmo → invierte en lo que acelera la venta.
  if (outcome === 'meses_vender' || outcome === 'sell_through' || outcome === 'absorcion') {
    if (g.includes('amenidad')) return `Las amenidades aceleran la venta aquí; vale la pena invertir en ellas.`;
    if (g.startsWith('con ')) return `Tener ${g.replace(/^con /, '')} acelera la venta; conviene incluirlo donde se pueda.`;
    if (g.includes('preventa')) return `La preventa se está moviendo más rápido; arrancar antes te conviene.`;
    if (g.includes('inmediata') || g.includes('entrega')) return `La entrega inmediata vende más rápido aquí; prioriza inventario terminado.`;
    return `Los proyectos tipo "${ganador}" se venden más rápido; replica esa fórmula en tu pipeline.`;
  }
  // Precio por m² es neutro (no hay "mejor"), no forzamos acción.
  return null;
}

export default function CompararPanel() {
  const [catalog, setCatalog] = useState(null);
  const [catErr, setCatErr] = useState(null);

  // feed de hallazgos automáticos
  const [insights, setInsights] = useState(null);
  const [insErr, setInsErr] = useState(null);

  // controles "comparar tú mismo"
  const [split, setSplit] = useState('');
  const [outcome, setOutcome] = useState('');
  const [geoNivel, setGeoNivel] = useState('colonia');
  const [geoValor, setGeoValor] = useState('');

  // resultado run
  const [data, setData] = useState(null);
  const [runErr, setRunErr] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    ensureSkeletonStyle();
    getCompareCatalog()
      .then((d) => {
        setCatalog(d);
        if ((d?.splits || []).length > 0) setSplit(d.splits[0]);
        if ((d?.outcomes || []).length > 0) setOutcome(d.outcomes[0].id);
      })
      .catch((e) => setCatErr(e.message));
    getCompareInsights(15)
      .then(setInsights)
      .catch((e) => setInsErr(e.message));
  }, []);

  const outcomes = catalog?.outcomes || [];
  const outcomeById = useMemo(() => Object.fromEntries(outcomes.map((o) => [o.id, o])), [outcomes]);

  const comparar = () => {
    if (!split || !outcome) return;
    setLoading(true); setRunErr(null);
    getCompareRun({ split, outcome, geo_nivel: geoValor ? geoNivel : undefined, geo_valor: geoValor || undefined })
      .then((d) => setData(d))
      .catch((e) => { setData(null); setRunErr(e.message); })
      .finally(() => setLoading(false));
  };

  if (catErr) return <Card style={{ ...card, color: '#dc2626' }}>{catErr}</Card>;
  if (!catalog) {
    return (
      <div style={{ display: 'grid', gap: 20 }} role="status" aria-live="polite" aria-busy="true">
        <span style={srOnly}>Cargando comparativas…</span>
        <Card style={{ ...card, borderLeft: '3px solid var(--theme, #6366f1)' }} aria-hidden="true">
          <div style={skBlock('45%', 14, { marginBottom: 10 })} />
          <div style={skBlock('80%', 9, { marginBottom: 6 })} />
          <div style={skBlock('65%', 9 )} />
        </Card>
        <InsightsSkeleton />
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* ── INTRO en lenguaje simple ──────────────────────────────────────── */}
      <Card style={{ ...card, borderLeft: '3px solid var(--theme, #6366f1)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#eee', marginBottom: 6 }}>
          ¿Qué hace que un proyecto se venda más?
        </div>
        <div style={{ fontSize: 12.5, color: '#bbb', lineHeight: 1.55 }}>
          Aquí descubres <strong style={{ color: '#ddd' }}>qué características</strong> hacen que un desarrollo
          se venda más rápido o atraiga más compradores. Comparamos grupos de proyectos
          (<em>con vs sin amenidades</em>, <em>preventa vs entrega inmediata</em>, etc.) y te decimos
          la diferencia y <span style={{ color: 'var(--theme)' }}>qué conviene hacer</span> con ese dato.
        </div>
      </Card>

      {/* ── A · QUÉ MUEVE LAS VENTAS (hallazgos automáticos) ───────────────── */}
      <InsightsSection insights={insights} insErr={insErr} />

      {/* ── B · COMPARAR TÚ MISMO ─────────────────────────────────────────── */}
      <div>
        <div style={{ ...lbl, fontSize: 12, marginBottom: 4 }}>Comparar tú mismo</div>
        <div style={{ fontSize: 12, color: '#a8a8b3', marginBottom: 10, lineHeight: 1.5 }}>
          Elige una <strong style={{ color: '#aaa' }}>característica</strong> y un <strong style={{ color: '#aaa' }}>resultado</strong> para comparar entre tus desarrollos.
        </div>
        <Card style={card}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <Field label="Característica a comparar">
              <select style={{ ...selStyle, minWidth: 210 }} value={split} onChange={(e) => setSplit(e.target.value)}>
                {(catalog.splits || []).map((s) => <option key={s} value={s}>{splitLabel(s)}</option>)}
              </select>
            </Field>
            <Field label="Resultado a medir">
              <select style={{ ...selStyle, minWidth: 190 }} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                {outcomes.map((o) => <option key={o.id} value={o.id}>{outcomeLabel(o.id)}</option>)}
              </select>
            </Field>
            <Field label="Zona (opcional)">
              <select style={selStyle} value={geoNivel} onChange={(e) => setGeoNivel(e.target.value)}>
                {GEO_NIVELES.map((g) => <option key={g} value={g}>{g === 'colonia' ? 'Colonia' : 'Alcaldía'}</option>)}
              </select>
            </Field>
            <Field label="Nombre de la zona (opcional)">
              <input style={inputStyle} value={geoValor} placeholder="p.ej. polanco"
                onChange={(e) => setGeoValor(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') comparar(); }} />
            </Field>
            <button style={btnStyle} onClick={comparar} disabled={loading || !split || !outcome}>
              {loading ? 'Comparando…' : 'Comparar'}
            </button>
          </div>
          {outcome && mejorEsHumano(outcomeById[outcome]?.mejor_es) && (
            <div style={{ fontSize: 11, color: '#777', marginTop: 8 }}>
              En este resultado, <strong style={{ color: '#aaa' }}>{mejorEsHumano(outcomeById[outcome].mejor_es)}</strong>.
            </div>
          )}
          {runErr && <div style={{ color: '#dc2626', fontSize: 12.5, marginTop: 12 }}>{runErr}</div>}
        </Card>

        {loading && <RunSkeleton />}
        {data && !runErr && !loading && <RunResult data={data} />}
      </div>

      {/* ── FECHAS DE LANZAMIENTO (base de la velocidad) · colapsada ───────── */}
      <LaunchDatesSection />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10.5, color: '#a8a8b3', fontWeight: 600 }}>{label}</span>
      {children}
    </div>
  );
}

// ── FECHAS DE LANZAMIENTO (cobertura + captura) · colapsada por defecto ───────
const YYYYMM_RE = /^\d{4}-(0[1-9]|1[0-2])$/; // AAAA-MM válido (mes 01-12)

// tono del chip por categoría de cobertura: capturado=verde · estimado=ámbar · sin dato=rojo.
function coverageTone(key) {
  const k = String(key || '').toLowerCase();
  if (k.includes('capturado')) return { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.40)', fg: '#22c55e' };
  if (k.includes('sin dato')) return { bg: 'rgba(220,38,38,0.12)', border: 'rgba(220,38,38,0.40)', fg: '#f87171' };
  return { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.35)', fg: '#f59e0b' }; // estimado
}

// badge de método por fila (mismo criterio de color que los chips de cobertura).
function metodoTone(metodo) {
  const m = String(metodo || '').toLowerCase();
  if (m.includes('capturado')) return 'ok';
  if (m.includes('sin dato') || m === '') return 'bad';
  return 'warn';
}

function LaunchDatesSection() {
  const [cov, setCov] = useState(null);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState({});   // dev_id → valor AAAA-MM en edición
  const [rowErr, setRowErr] = useState({});    // dev_id → mensaje de error
  const [saving, setSaving] = useState({});    // dev_id → bool

  const load = () => {
    getLaunchCoverage().then((d) => { setCov(d); setErr(null); }).catch((e) => setErr(e.message));
  };
  useEffect(() => { load(); }, []);

  const guardar = (dev_id) => {
    const val = (drafts[dev_id] || '').trim();
    if (!YYYYMM_RE.test(val)) {
      setRowErr((p) => ({ ...p, [dev_id]: 'Formato AAAA-MM (p.ej. 2024-09)' }));
      return;
    }
    setRowErr((p) => ({ ...p, [dev_id]: null }));
    setSaving((p) => ({ ...p, [dev_id]: true }));
    setLaunch(dev_id, val)
      .then((d) => {
        if (d && d.ok === false) { setRowErr((p) => ({ ...p, [dev_id]: d.error || 'No se pudo guardar.' })); return; }
        setDrafts((p) => { const n = { ...p }; delete n[dev_id]; return n; });
        load();
      })
      .catch((e) => setRowErr((p) => ({ ...p, [dev_id]: e.message })))
      .finally(() => setSaving((p) => ({ ...p, [dev_id]: false })));
  };

  const cobertura = cov?.cobertura || {};
  const detalle = cov?.detalle || [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ ...lbl, fontSize: 12, marginBottom: 0 }}>Fechas de lanzamiento</div>
        <button
          style={{ ...btnStyle, padding: '5px 13px', fontSize: 11.5, background: 'rgba(255,255,255,0.05)', color: '#bbb' }}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Ocultar' : 'Ver / capturar'}
        </button>
      </div>
      <div style={{ fontSize: 12, color: '#a8a8b3', marginBottom: 10, lineHeight: 1.5 }}>
        Define desde cuándo se vende cada proyecto — es la base para medir la velocidad de venta.
      </div>

      {err && <Card style={{ ...card, color: '#dc2626', fontSize: 12.5 }}>{err}</Card>}
      {!err && cov == null && open && (
        <Card style={card} role="status" aria-live="polite" aria-busy="true">
          <span style={srOnly}>Cargando cobertura de fechas…</span>
          {/* chips fantasma */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }} aria-hidden="true">
            {[90, 110, 80].map((w, i) => <div key={i} style={skBlock(w, 22, { borderRadius: 9999 })} />)}
          </div>
          {/* filas fantasma de la tabla */}
          <div style={{ display: 'grid', gap: 9 }} aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={skBlock(150, 9)} />
                <div style={skBlock(70, 9)} />
                <div style={skBlock(64, 14, { borderRadius: 9999 })} />
                <div style={skBlock(110, 22, { marginLeft: 'auto', borderRadius: 6 })} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {!err && cov && open && (
        <Card style={card}>
          {/* chips de cobertura */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {Object.entries(cobertura).map(([k, n]) => {
              const t = coverageTone(k);
              return (
                <span key={k} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
                  background: t.bg, border: `1px solid ${t.border}`, color: t.fg,
                  borderRadius: 9999, padding: '4px 11px', fontWeight: 600,
                }}>
                  <strong style={{ color: t.fg }}>{fmtN(n)}</strong>
                  <span style={{ color: '#aaa', fontWeight: 400 }}>{k}</span>
                </span>
              );
            })}
            {cov.total != null && (
              <span style={{ fontSize: 11.5, color: '#777', alignSelf: 'center' }}>· {fmtN(cov.total)} desarrollos</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#777', lineHeight: 1.5 }}>
            La velocidad usa la fecha capturada o estimada por avance de obra — nunca inventada.
          </div>

          {/* tabla detalle */}
          {detalle.length === 0 ? (
            <div style={{ fontSize: 12.5, color: '#888', marginTop: 12 }}>
              Aún no hay desarrollos para capturar fecha. Se llenan al dar de alta proyectos.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Desarrollo', 'Fecha', 'Método', 'Capturar (AAAA-MM)'].map((h) => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detalle.map((row) => {
                    const id = row.dev_id;
                    const e = rowErr[id];
                    return (
                      <tr key={id}>
                        <td style={{ ...td, color: '#ddd', whiteSpace: 'nowrap' }}>{id}</td>
                        <td style={{ ...td, color: row.fecha ? '#ddd' : '#666' }}>{row.fecha || '—'}</td>
                        <td style={td}>
                          <Badge tone={metodoTone(row.metodo)}>{row.metodo || 'sin dato'}</Badge>
                        </td>
                        <td style={td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input
                              style={{ ...inputStyle, minWidth: 0, width: 100, padding: '5px 8px' }}
                              value={drafts[id] ?? ''}
                              placeholder={row.fecha || 'AAAA-MM'}
                              onChange={(ev) => setDrafts((p) => ({ ...p, [id]: ev.target.value }))}
                              onKeyDown={(ev) => { if (ev.key === 'Enter') guardar(id); }}
                            />
                            <button
                              style={{ ...btnStyle, padding: '5px 12px', fontSize: 11.5 }}
                              onClick={() => guardar(id)}
                              disabled={!!saving[id]}
                            >
                              {saving[id] ? '…' : 'guardar'}
                            </button>
                          </div>
                          {e && <div style={{ color: '#dc2626', fontSize: 10.5, marginTop: 3 }}>{e}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ── A: hallazgos automáticos (cada uno como FRASE + qué hago con esto) ────────
function InsightsSection({ insights, insErr }) {
  const hallazgos = insights?.hallazgos || [];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ ...lbl, fontSize: 12, marginBottom: 0 }}>Qué mueve las ventas (hallazgos automáticos)</div>
        <Badge tone="brand">ordenado por impacto</Badge>
      </div>
      <div style={{ fontSize: 12, color: '#a8a8b3', marginBottom: 10, lineHeight: 1.5 }}>
        El sistema revisó tus desarrollos solo y encontró estos patrones. Los más fuertes van primero.
      </div>
      {insErr && <Card style={{ ...card, color: '#dc2626', fontSize: 12.5 }}>{insErr}</Card>}
      {!insErr && insights == null && <InsightsSkeleton />}
      {!insErr && insights && hallazgos.length === 0 && (
        <Card style={card}><span style={{ fontSize: 12.5, color: '#888' }}>Todavía no hay suficientes datos para detectar patrones. Se van llenando con más desarrollos y más comportamiento de compradores.</span></Card>
      )}
      {hallazgos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
          {hallazgos.map((h, i) => <InsightCard key={i} h={h} />)}
        </div>
      )}
    </div>
  );
}

function InsightCard({ h }) {
  const unidad = h.unidad;
  // mejor_es no viene en el hallazgo → lo derivamos del resultado (mismo catálogo del backend).
  const mejorEs = OUTCOME_LABELS[h.outcome] ? (h.outcome === 'meses_vender' ? 'menos' : h.outcome === 'precio_m2' ? '—' : 'más') : '—';
  const best = bestGrupoValor(h.grupos, mejorEs);
  const conf = confInfo(h.confianza);
  const accion = accionDe(h.split, h.outcome, h.grupos, mejorEs);
  return (
    <Card style={card}>
      {/* frase legible grande (la lectura que viene del backend) */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#eee', lineHeight: 1.35 }}>
          {h.lectura || `${splitLabel(h.split)} → ${outcomeLabel(h.outcome)}`}
        </div>
        <Badge tone={conf.tone}>{conf.texto}</Badge>
      </div>

      {/* contexto traducido (NO mostramos split/outcome crudos) */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, color: '#888', marginBottom: 10 }}>
        <span>característica: <strong style={{ color: '#aaa' }}>{splitLabel(h.split)}</strong></span>
        <span>·</span>
        <span>resultado: <strong style={{ color: '#aaa' }}>{outcomeLabel(h.outcome)}</strong></span>
        {h.delta != null && (
          <>
            <span>·</span>
            <span style={{ color: 'var(--theme)' }}>diferencia: {fmtVal(h.delta, unidad)}</span>
          </>
        )}
      </div>

      {/* mini-barras por grupo (ya existían) */}
      <GruposBars grupos={h.grupos} unidad={unidad} best={best} compact />

      {/* → qué hago con esto */}
      {accion && (
        <div style={{
          fontSize: 12.5, color: '#a7f3d0', marginTop: 10, paddingTop: 9,
          borderTop: '1px solid rgba(255,255,255,0.06)', lineHeight: 1.45,
        }}>
          <span style={{ color: '#22c55e', fontWeight: 700 }}>→ Qué hago con esto: </span>{accion}
        </div>
      )}
    </Card>
  );
}

// ── Mini-barras por grupo (grupo → valor); el "mejor" resaltado verde + texto ──
function GruposBars({ grupos, unidad, best, compact }) {
  const list = (grupos || []);
  if (list.length === 0) {
    return (
      <div style={{ fontSize: 12.5, color: '#888' }}>
        Esta comparación no devolvió grupos para graficar. Prueba otra característica, otro resultado, o quita el filtro de zona.
      </div>
    );
  }
  const mx = Math.max(1, ...list.map((g) => Math.abs(g.valor || 0)));
  const sorted = [...list].sort((a, b) => (b.valor || 0) - (a.valor || 0));
  return (
    <div style={{ display: 'grid', gap: compact ? 6 : 8 }}>
      {sorted.map((g, i) => {
        const isBest = best != null && g.valor === best;
        const accent = isBest ? '#22c55e' : 'var(--theme)';
        const nombre = g.grupo ?? '—';
        const valTxt = fmtVal(g.valor, unidad);
        // Etiqueta accesible: el lector de pantalla oye grupo + valor (+ "mejor" si gana).
        const ariaLabel = `${nombre}: ${valTxt}${isBest ? ' — el mejor de este resultado' : ''}`;
        return (
          <div key={g.grupo ?? i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: compact ? 12 : 12.5 }}>
            <span style={{ width: compact ? 110 : 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isBest ? '#22c55e' : '#ddd', fontWeight: isBest ? 700 : 400 }}>
              {nombre}
            </span>
            <span
              role="img" aria-label={ariaLabel}
              style={{ flex: 1, height: compact ? 9 : 11, borderRadius: 2, background: accent, opacity: isBest ? 0.9 : 0.6, width: `${(Math.abs(g.valor || 0) / mx) * 100}%`, minWidth: 2 }}
            />
            <strong style={{ width: 86, textAlign: 'right', color: isBest ? '#22c55e' : '#ddd' }}>{valTxt}</strong>
            {/* "mejor" como TEXTO (no solo color) para que el ganador no dependa del verde */}
            {isBest && (
              <span style={{
                fontSize: 9.5, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase',
                color: '#22c55e', border: '1px solid rgba(34,197,94,0.5)', borderRadius: 9999, padding: '1px 7px', whiteSpace: 'nowrap',
              }}>mejor</span>
            )}
            {!compact && (
              <span style={{ width: 92, textAlign: 'right', fontSize: 11, color: '#888' }}>
                {g.n_desarrollos != null ? `${fmtN(g.n_desarrollos)} desarr.` : ''}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── B: resultado de /compare/run ─────────────────────────────────────────────
function RunResult({ data }) {
  const proc = data.procedencia || {};
  const grupos = data.grupos || [];
  const best = bestGrupoValor(grupos, data.mejor_es);
  const accion = accionDe(data.split, data.outcome, grupos, data.mejor_es);

  return (
    <Card style={{ ...card, marginTop: 16 }}>
      {/* encabezado traducido: característica → resultado (+zona) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <div style={lbl}>
          {splitLabel(data.split)} → {outcomeLabel(data.outcome)}
          {data.geo && (data.geo.valor || data.geo.geo_valor) ? <span style={{ color: '#888', fontWeight: 400 }}> · {data.geo.nivel || data.geo.geo_nivel || ''} {data.geo.valor || data.geo.geo_valor}</span> : ''}
        </div>
        {mejorEsHumano(data.mejor_es) && (
          <span style={{ fontSize: 11, color: '#777' }}>{mejorEsHumano(data.mejor_es)}</span>
        )}
      </div>

      {/* delta grande */}
      {data.delta != null && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 34, fontWeight: 800, color: 'var(--theme)', letterSpacing: '-0.02em', lineHeight: 1 }}>
            {fmtVal(data.delta, data.unidad)}
          </span>
          <span style={{ fontSize: 12.5, color: '#888' }}>de diferencia entre el mejor y el peor grupo</span>
        </div>
      )}

      {/* LATENTE → aviso ámbar, NO error */}
      {data.latente === true ? (
        <div style={{
          fontSize: 12.5, color: '#fcd34d', background: 'rgba(245,158,11,0.10)',
          border: '1px solid rgba(245,158,11,0.35)', borderRadius: 10, padding: '11px 14px', lineHeight: 1.5,
        }}>
          <strong style={{ color: '#f59e0b' }}>Aún no hay datos suficientes para esta comparación.</strong>{' '}
          {data.razon_latente || 'Faltan desarrollos en estos grupos para comparar con confianza. Se llena con más proyectos y comportamiento.'}
        </div>
      ) : (
        <>
          {grupos.length === 0 ? (
            <div style={{ fontSize: 12.5, color: '#888' }}>
              Esta comparación no devolvió grupos. Prueba otra característica, otro resultado, o quita el filtro de zona.
            </div>
          ) : (
            <GruposBars grupos={grupos} unidad={data.unidad} best={best} />
          )}
          {best != null && data.mejor_es && data.mejor_es !== '—' && (
            <div style={{ fontSize: 11, color: '#777', marginTop: 8 }}>
              <span style={{ color: '#22c55e' }}>En verde</span>, el grupo que sale mejor en este resultado.
            </div>
          )}
        </>
      )}

      {/* frase que resume (lectura del endpoint) */}
      {!data.latente && data.lectura && (
        <div style={{ fontSize: 13, color: '#ddd', lineHeight: 1.5, marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {data.lectura}
        </div>
      )}

      {/* → qué hago con esto */}
      {!data.latente && accion && (
        <div style={{ fontSize: 12.5, color: '#a7f3d0', marginTop: 10, lineHeight: 1.45 }}>
          <span style={{ color: '#22c55e', fontWeight: 700 }}>→ Qué hago con esto: </span>{accion}
        </div>
      )}

      {/* procedencia (de dónde sale el número), técnico y discreto abajo */}
      {(proc.fuente || proc.metodo || proc.cautela) && (
        <div style={{ fontSize: 11, color: '#777', marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)', lineHeight: 1.6 }}>
          {proc.fuente && <div>de dónde sale: {proc.fuente}</div>}
          {proc.metodo && <div>cómo se calcula: {proc.metodo}</div>}
          {proc.cautela && <div style={{ color: '#b08968' }}>ojo: {proc.cautela}</div>}
        </div>
      )}
    </Card>
  );
}
