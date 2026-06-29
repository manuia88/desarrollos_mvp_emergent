// Superadmin · EXPLORADOR FACETEADO — "¿cuántos [población] cumplen [filtros], agrupados por [facet], en [geo], en [ventana]?"
// Muestra el CONTEO de OFERTA y DEMANDA de forma INDEPENDIENTE (cada lado solo) y RELACIONAL (oferta vs demanda + gap/tensión).
// + sección "Lo que NO existe" (huecos = demanda con 0 oferta) y un cross-tab 2D opcional.
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Badge } from '../advisor/primitives';
import { getFacetCatalog, getFacetQuery, getFacetUnmet, getFacetCrosstab } from '../../api/superadminDemandIntel';

const card = { padding: '14px 18px' };
const lbl = { fontSize: 11, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 };
const selStyle = {
  background: 'rgba(255,255,255,0.04)', color: '#ddd', fontSize: 12.5,
  border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: '6px 9px', minWidth: 130,
};
const inputStyle = { ...selStyle };
const btnStyle = {
  padding: '7px 16px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
  background: 'var(--theme, #6366f1)', color: '#fff', fontSize: 12.5, fontWeight: 600,
};
const btnGhost = {
  padding: '7px 14px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.14)', cursor: 'pointer',
  background: 'transparent', color: '#bbb', fontSize: 12, fontWeight: 600,
};
const th = { fontSize: 11, color: '#888', textAlign: 'left', padding: '5px 8px', borderBottom: '1px solid rgba(255,255,255,0.1)' };
const td = { fontSize: 12.5, padding: '5px 8px', borderTop: '1px solid rgba(255,255,255,0.05)' };

const POB_LABEL = { unidades: 'Unidades', desarrollos: 'Desarrollos', demanda: 'Demanda' };
const GEO_NIVELES = ['colonia', 'alcaldia', 'corredor'];

const tensionTone = (t) => {
  const v = String(t || '').toLowerCase();
  if (v.includes('alta') || v.includes('oportun') || v.includes('caliente') || v.includes('hambr')) return 'ok';
  if (v.includes('media') || v.includes('tibia') || v.includes('equil')) return 'warn';
  if (v.includes('sobreoferta') || v.includes('baja') || v.includes('fría') || v.includes('fria') || v.includes('exceso')) return 'bad';
  return 'neutral';
};
const fmtN = (v) => (v == null ? '—' : (typeof v === 'number' ? v.toLocaleString('es-MX') : String(v)));

export default function FacetPanel() {
  const [catalog, setCatalog] = useState(null);
  const [catErr, setCatErr] = useState(null);

  // controles
  const [poblacion, setPoblacion] = useState('unidades');
  const [groupBy, setGroupBy] = useState('');
  const [geoNivel, setGeoNivel] = useState('colonia');
  const [geoValor, setGeoValor] = useState('');
  const [ventana, setVentana] = useState('90d');
  const [filtros, setFiltros] = useState([]); // [{k, v}]

  // resultado query
  const [data, setData] = useState(null);
  const [qErr, setQErr] = useState(null);
  const [loading, setLoading] = useState(false);

  // unmet
  const [unmet, setUnmet] = useState(null);

  // crosstab
  const [facetA, setFacetA] = useState('');
  const [facetB, setFacetB] = useState('');
  const [crosstab, setCrosstab] = useState(null);
  const [ctErr, setCtErr] = useState(null);
  const [ctLoading, setCtLoading] = useState(false);

  useEffect(() => {
    getFacetCatalog()
      .then((d) => {
        setCatalog(d);
        const facets = (d?.facets || {})[poblacion] || [];
        if (facets.length > 0) { setGroupBy(facets[0]); setFacetA(facets[0]); setFacetB(facets[1] || facets[0]); }
        if ((d?.ventanas || []).length > 0 && !(d.ventanas || []).includes('90d')) setVentana(d.ventanas[0]);
      })
      .catch((e) => setCatErr(e.message));
    getFacetUnmet(12).then(setUnmet).catch(() => setUnmet({ huecos: [] }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const facetsPob = useMemo(() => (catalog?.facets || {})[poblacion] || [], [catalog, poblacion]);
  const ventanas = catalog?.ventanas || ['live', '7d', '30d', '90d'];

  // al cambiar de población, re-encaja group_by / facets en el set válido
  useEffect(() => {
    if (!catalog) return;
    if (facetsPob.length === 0) return;
    if (!facetsPob.includes(groupBy)) setGroupBy(facetsPob[0]);
    if (!facetsPob.includes(facetA)) setFacetA(facetsPob[0]);
    if (!facetsPob.includes(facetB)) setFacetB(facetsPob[1] || facetsPob[0]);
  }, [poblacion]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtrosObj = useMemo(() => {
    const o = {};
    filtros.forEach(({ k, v }) => { if (k && k.trim() && v && v.trim()) o[k.trim()] = v.trim(); });
    return o;
  }, [filtros]);

  const consultar = () => {
    if (!groupBy) return;
    setLoading(true); setQErr(null);
    getFacetQuery({ poblacion, group_by: groupBy, geo_nivel: geoValor ? geoNivel : undefined, geo_valor: geoValor || undefined, ventana, filtros: filtrosObj })
      .then((d) => setData(d))
      .catch((e) => { setData(null); setQErr(e.message); })
      .finally(() => setLoading(false));
  };

  const consultarCrosstab = () => {
    if (!facetA || !facetB) return;
    setCtLoading(true); setCtErr(null);
    getFacetCrosstab({ poblacion, facet_a: facetA, facet_b: facetB, geo_nivel: geoValor ? geoNivel : undefined, geo_valor: geoValor || undefined })
      .then((d) => setCrosstab(d))
      .catch((e) => { setCrosstab(null); setCtErr(e.message); })
      .finally(() => setCtLoading(false));
  };

  const addFiltro = () => setFiltros((f) => [...f, { k: '', v: '' }]);
  const setFiltro = (i, patch) => setFiltros((f) => f.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const delFiltro = (i) => setFiltros((f) => f.filter((_, j) => j !== i));

  if (catErr) return <Card style={{ ...card, color: '#dc2626' }}>{catErr}</Card>;
  if (!catalog) return <Card style={card}>Cargando catálogo de facetas…</Card>;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* strip */}
      <div style={{ fontSize: 12.5, color: '#aaa', display: 'flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'center' }}>
        <span>Pregunta: <strong style={{ color: '#ddd' }}>¿cuántos</strong> <span style={{ color: 'var(--theme)' }}>{POB_LABEL[poblacion] || poblacion}</span> cumplen los filtros, agrupados por <span style={{ color: 'var(--theme)' }}>{groupBy || '…'}</span>{geoValor ? <> en <span style={{ color: 'var(--theme)' }}>{geoNivel} {geoValor}</span></> : ''} en <span style={{ color: 'var(--theme)' }}>{ventana}</span><strong style={{ color: '#ddd' }}>?</strong></span>
      </div>

      {/* CONTROLES */}
      <Card style={card}>
        <div style={lbl}>Arma la consulta</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <Field label="Población">
            <select style={selStyle} value={poblacion} onChange={(e) => setPoblacion(e.target.value)}>
              {(catalog.poblaciones || []).map((p) => <option key={p} value={p}>{POB_LABEL[p] || p}</option>)}
            </select>
          </Field>
          <Field label="Agrupar por">
            <select style={{ ...selStyle, minWidth: 170 }} value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
              {facetsPob.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Nivel geo">
            <select style={selStyle} value={geoNivel} onChange={(e) => setGeoNivel(e.target.value)}>
              {GEO_NIVELES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
          <Field label="Valor geo (opcional)">
            <input style={inputStyle} value={geoValor} placeholder="p.ej. polanco"
              onChange={(e) => setGeoValor(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') consultar(); }} />
          </Field>
          <Field label="Ventana">
            <select style={selStyle} value={ventana} onChange={(e) => setVentana(e.target.value)}>
              {ventanas.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
          <button style={btnStyle} onClick={consultar} disabled={loading || !groupBy}>
            {loading ? 'Consultando…' : 'Consultar'}
          </button>
        </div>

        {/* FILTROS key=value */}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: filtros.length ? 8 : 0 }}>
            <span style={{ fontSize: 11, color: '#888' }}>Filtros (clave=valor)</span>
            <button style={btnGhost} onClick={addFiltro}>+ filtro</button>
          </div>
          {filtros.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <input style={{ ...inputStyle, minWidth: 130 }} value={f.k} placeholder="clave (p.ej. recamaras)"
                onChange={(e) => setFiltro(i, { k: e.target.value })} />
              <span style={{ color: '#666' }}>=</span>
              <input style={{ ...inputStyle, minWidth: 130 }} value={f.v} placeholder="valor (p.ej. 2rec)"
                onChange={(e) => setFiltro(i, { v: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') consultar(); }} />
              <button style={{ ...btnGhost, padding: '5px 10px' }} onClick={() => delFiltro(i)}>quitar</button>
            </div>
          ))}
        </div>

        {qErr && <div style={{ color: '#dc2626', fontSize: 12.5, marginTop: 12 }}>{qErr}</div>}
      </Card>

      {/* RESULTADO */}
      {loading && <Card style={card}>Contando oferta y demanda…</Card>}
      {data && !qErr && !loading && <FacetResult data={data} />}

      {/* CROSS-TAB (2D) */}
      <Card style={card}>
        <div style={lbl}>Cross-tab · dos facetas a la vez</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <Field label="Filas (facet A)">
            <select style={{ ...selStyle, minWidth: 160 }} value={facetA} onChange={(e) => setFacetA(e.target.value)}>
              {facetsPob.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Columnas (facet B)">
            <select style={{ ...selStyle, minWidth: 160 }} value={facetB} onChange={(e) => setFacetB(e.target.value)}>
              {facetsPob.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <button style={btnStyle} onClick={consultarCrosstab} disabled={ctLoading || !facetA || !facetB}>
            {ctLoading ? 'Cruzando…' : 'Cruzar'}
          </button>
        </div>
        {ctErr && <div style={{ color: '#dc2626', fontSize: 12.5, marginTop: 12 }}>{ctErr}</div>}
        {crosstab && !ctErr && <CrosstabTable ct={crosstab} />}
      </Card>

      {/* LO QUE NO EXISTE */}
      <UnmetSection unmet={unmet} />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10.5, color: '#888' }}>{label}</span>
      {children}
    </div>
  );
}

// ── RESULTADO: independiente + relacional ────────────────────────────────────
function FacetResult({ data }) {
  const ind = data.independiente || {};
  const rel = data.relacional || {};
  const proc = data.procedencia || {};
  const oferta = ind.oferta || {};
  const demanda = ind.demanda || {};
  const porValor = rel.por_valor || [];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* INDEPENDIENTE — dos tarjetas lado a lado */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <SideCard title="Oferta · lo que existe" accent="#22c55e" side={oferta} fuente={oferta.fuente || proc.oferta} />
        <SideCard title="Demanda · lo que se busca" accent="var(--theme)" side={demanda} fuente={demanda.fuente || proc.demanda} />
      </div>

      {/* RELACIONAL — oferta vs demanda + gap/tensión */}
      <Card style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
          <div style={lbl}>Relacional · oferta vs demanda por {data.group_by || 'valor'}</div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 12.5, color: '#aaa' }}>
            <span>Ratio demanda/oferta: <strong style={{ color: 'var(--theme)' }}>{rel.ratio_demanda_oferta != null ? (typeof rel.ratio_demanda_oferta === 'number' ? rel.ratio_demanda_oferta.toFixed(2) : rel.ratio_demanda_oferta) : '—'}</strong></span>
            <span>Gap total: <strong style={{ color: (rel.gap_total || 0) > 0 ? '#22c55e' : (rel.gap_total || 0) < 0 ? '#dc2626' : '#ddd' }}>{rel.gap_total != null ? `${rel.gap_total > 0 ? '+' : ''}${fmtN(rel.gap_total)}` : '—'}</strong></span>
          </div>
        </div>

        {porValor.length === 0 && <div style={{ fontSize: 12.5, color: '#666' }}>Sin cruce por valor todavía.</div>}
        {porValor.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>{data.group_by || 'valor'}</th>
                <th style={{ ...th, textAlign: 'right' }}>oferta</th>
                <th style={{ ...th, textAlign: 'right' }}>demanda</th>
                <th style={{ ...th, textAlign: 'right' }}>gap</th>
                <th style={{ ...th, textAlign: 'right' }}>tensión</th>
              </tr>
            </thead>
            <tbody>
              {porValor.map((r, i) => {
                const gap = r.gap != null ? r.gap : (r.demanda || 0) - (r.oferta || 0);
                const gapColor = gap > 0 ? '#22c55e' : gap < 0 ? '#dc2626' : '#888';
                return (
                  <tr key={r.valor ?? i}>
                    <td style={td}>{r.valor ?? '—'}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#bbb' }}>{fmtN(r.oferta)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#bbb' }}>{fmtN(r.demanda)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: gapColor }}>{gap > 0 ? '+' : ''}{fmtN(gap)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {r.tension != null && r.tension !== '' ? <Badge tone={tensionTone(r.tension)}>{r.tension}</Badge> : <span style={{ color: '#555' }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div style={{ fontSize: 11.5, color: '#777', marginTop: 10 }}>
          <span style={{ color: '#22c55e' }}>verde</span> = demanda &gt; oferta (oportunidad) · <span style={{ color: '#dc2626' }}>rojo</span> = oferta &gt; demanda (sobreoferta)
        </div>
        {rel.lectura && <div style={{ fontSize: 13, color: '#ddd', lineHeight: 1.5, marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)', fontStyle: 'italic' }}>{rel.lectura}</div>}
      </Card>
    </div>
  );
}

function SideCard({ title, accent, side, fuente }) {
  const breakdown = side.breakdown || [];
  const mx = Math.max(1, ...breakdown.map((b) => b.n || 0));
  return (
    <Card style={card}>
      <div style={lbl}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 34, fontWeight: 800, color: accent, letterSpacing: '-0.02em', lineHeight: 1 }}>{fmtN(side.total)}</span>
        <span style={{ fontSize: 12.5, color: '#888' }}>total</span>
      </div>
      {breakdown.length === 0 && <div style={{ fontSize: 12, color: '#666' }}>Sin desglose.</div>}
      <div style={{ display: 'grid', gap: 5 }}>
        {breakdown.map((b, i) => (
          <div key={b.valor ?? i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
            <span style={{ width: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#ddd' }}>{b.valor ?? '—'}</span>
            <span style={{ flex: 1, height: 9, borderRadius: 2, background: accent, opacity: 0.7, width: `${((b.n || 0) / mx) * 100}%` }} />
            <strong style={{ width: 48, textAlign: 'right', color: accent }}>{fmtN(b.n)}</strong>
            <span style={{ width: 44, textAlign: 'right', fontSize: 11, color: '#888' }}>{b.pct != null ? `${b.pct}%` : '—'}</span>
          </div>
        ))}
      </div>
      {fuente && <div style={{ fontSize: 11, color: '#777', marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>fuente: {fuente}</div>}
    </Card>
  );
}

// ── CROSS-TAB 2D ─────────────────────────────────────────────────────────────
function CrosstabTable({ ct }) {
  const cols = ct.columnas || [];
  const rows = ct.filas || [];
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)', overflowX: 'auto' }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>{ct.facet_a} (filas) × {ct.facet_b} (columnas)</div>
      {rows.length === 0 && <div style={{ fontSize: 12.5, color: '#666' }}>Sin datos para este cruce.</div>}
      {rows.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
          <thead>
            <tr>
              <th style={th}>{ct.facet_a} \ {ct.facet_b}</th>
              {cols.map((c) => <th key={c} style={{ ...th, textAlign: 'right' }}>{c}</th>)}
              <th style={{ ...th, textAlign: 'right' }}>total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.fila ?? i}>
                <td style={{ ...td, fontWeight: 600 }}>{row.fila ?? '—'}</td>
                {cols.map((c) => {
                  const v = row[c];
                  return <td key={c} style={{ ...td, textAlign: 'right', color: v ? 'var(--theme)' : '#555' }}>{v ? fmtN(v) : '—'}</td>;
                })}
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#ddd' }}>{fmtN(row.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {ct.lectura && <div style={{ fontSize: 12.5, color: '#bbb', marginTop: 8, fontStyle: 'italic' }}>{ct.lectura}</div>}
    </div>
  );
}

// ── LO QUE NO EXISTE (huecos / unmet demand) ─────────────────────────────────
function UnmetSection({ unmet }) {
  const huecos = unmet?.huecos || [];
  return (
    <Card style={{ ...card, borderColor: 'rgba(34,197,94,0.35)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={lbl}>Lo que NO existe · demanda con 0 oferta</div>
        <Badge tone="ok">oportunidad</Badge>
      </div>
      {unmet == null && <div style={{ fontSize: 12.5, color: '#888' }}>Cargando huecos…</div>}
      {unmet && huecos.length === 0 && <div style={{ fontSize: 12.5, color: '#666' }}>Sin huecos detectados por ahora.</div>}
      {huecos.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>colonia</th>
              <th style={th}>recámaras</th>
              <th style={th}>tier</th>
              <th style={{ ...th, textAlign: 'right' }}>búsquedas (0 oferta)</th>
            </tr>
          </thead>
          <tbody>
            {huecos.map((h, i) => (
              <tr key={i}>
                <td style={{ ...td, color: '#ddd' }}>{h.colonia ?? '—'}</td>
                <td style={td}>{h.recamaras ?? '—'}</td>
                <td style={td}>{h.tier ?? '—'}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#22c55e' }}>{fmtN(h.busquedas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {unmet?.lectura && <div style={{ fontSize: 12.5, color: '#bbb', marginTop: 8, fontStyle: 'italic' }}>{unmet.lectura}</div>}
    </Card>
  );
}
