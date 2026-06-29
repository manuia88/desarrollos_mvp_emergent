// Superadmin · EXPLORADOR FACETEADO — "¿cuántos [población] cumplen [filtros], agrupados por [facet], en [geo], en [ventana]?"
// Muestra el CONTEO de OFERTA y DEMANDA de forma INDEPENDIENTE (cada lado solo) y RELACIONAL (oferta vs demanda + gap/tensión).
// + sección "Lo que NO existe" (huecos = demanda con 0 oferta) y un cross-tab 2D opcional.
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Badge } from '../advisor/primitives';
import { getFacetCatalog, getFacetQuery, getFacetUnmet, getFacetCrosstab, getFacetList } from '../../api/superadminDemandIntel';

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
  // contexto exacto con que se corrió la última consulta (para el drill-down "cuáles")
  const [queryCtx, setQueryCtx] = useState(null);

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
    // congela el contexto con que se corrió esta consulta — el drill-down "cuáles" lo usa tal cual
    setQueryCtx({ poblacion, groupBy, geoNivel, geoValor, ventana, filtros: filtrosObj });
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
      {data && !qErr && !loading && <FacetResult data={data} ctx={queryCtx} />}

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

// El drill de ENTIDADES siempre lista OFERTA real. Si la población es 'demanda',
// el drill cae a 'unidades' (la oferta que cumple) — se aclara en la UI.
const drillPob = (pob) => (pob === 'desarrollos' ? 'desarrollos' : pob === 'zonas' ? 'zonas' : 'unidades');

// ── RESULTADO: independiente + relacional ────────────────────────────────────
function FacetResult({ data, ctx }) {
  const ind = data.independiente || {};
  const rel = data.relacional || {};
  const proc = data.procedencia || {};
  const oferta = ind.oferta || {};
  const demanda = ind.demanda || {};
  const porValor = rel.por_valor || [];
  const groupBy = data.group_by || ctx?.groupBy || 'valor';

  // drill-down general (todas las N de la oferta del filtro actual)
  const [allList, setAllList] = useState(null);
  const [allLoading, setAllLoading] = useState(false);
  const [allErr, setAllErr] = useState(null);
  const [allOpen, setAllOpen] = useState(false);

  // drill-down por fila (clave = valor de la fila)
  const [rowKey, setRowKey] = useState(null);       // valor de la fila abierta
  const [rowList, setRowList] = useState(null);
  const [rowLoading, setRowLoading] = useState(false);
  const [rowErr, setRowErr] = useState(null);

  const pobDrill = drillPob(ctx?.poblacion);
  const demandaDrill = ctx?.poblacion === 'demanda';

  const fetchList = (extraFiltros) => getFacetList({
    poblacion: pobDrill,
    geo_nivel: ctx?.geoValor ? ctx?.geoNivel : undefined,
    geo_valor: ctx?.geoValor || undefined,
    ventana: ctx?.ventana,
    filtros: { ...(ctx?.filtros || {}), ...(extraFiltros || {}) },
    limit: 300,
  });

  const verLasN = () => {
    if (allOpen) { setAllOpen(false); return; }
    if (allList) { setAllOpen(true); return; }
    setAllLoading(true); setAllErr(null);
    fetchList()
      .then((d) => { setAllList(d); setAllOpen(true); })
      .catch((e) => setAllErr(e.message))
      .finally(() => setAllLoading(false));
  };

  const verCuales = (valor) => {
    if (rowKey === valor) { setRowKey(null); return; } // toggle cerrar
    setRowKey(valor); setRowList(null); setRowErr(null); setRowLoading(true);
    fetchList({ [groupBy]: valor })
      .then((d) => setRowList(d))
      .catch((e) => setRowErr(e.message))
      .finally(() => setRowLoading(false));
  };

  const colSpan = 6; // group_by + oferta + demanda + gap + tensión + acción

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* INDEPENDIENTE — dos tarjetas lado a lado */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <SideCard
          title="Oferta · lo que existe" accent="#22c55e" side={oferta} fuente={oferta.fuente || proc.oferta}
          action={ctx ? (
            <button style={{ ...btnGhost, padding: '5px 12px', fontSize: 11.5 }} onClick={verLasN} disabled={allLoading}>
              {allLoading ? 'Listando…' : allOpen ? 'ocultar lista' : `ver las ${fmtN(oferta.total)} →`}
            </button>
          ) : null}
        />
        <SideCard title="Demanda · lo que se busca" accent="var(--theme)" side={demanda} fuente={demanda.fuente || proc.demanda} />
      </div>

      {/* LISTA GENERAL (todas las N de la oferta del filtro) */}
      {allErr && <Card style={{ ...card, color: '#dc2626', fontSize: 12.5 }}>{allErr}</Card>}
      {allOpen && allList && (
        <EntityList list={allList} pob={pobDrill}
          title={demandaDrill ? 'Oferta que cumple el filtro actual' : 'Todas las que cumplen el filtro actual'}
          note={demandaDrill ? 'La población es demanda; abajo se lista la OFERTA real que cumple.' : null} />
      )}

      {/* RELACIONAL — oferta vs demanda + gap/tensión */}
      <Card style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
          <div style={lbl}>Relacional · oferta vs demanda por {groupBy}</div>
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
                <th style={th}>{groupBy}</th>
                <th style={{ ...th, textAlign: 'right' }}>oferta</th>
                <th style={{ ...th, textAlign: 'right' }}>demanda</th>
                <th style={{ ...th, textAlign: 'right' }}>gap</th>
                <th style={{ ...th, textAlign: 'right' }}>tensión</th>
                <th style={{ ...th, textAlign: 'right' }}>cuáles</th>
              </tr>
            </thead>
            <tbody>
              {porValor.map((r, i) => {
                const gap = r.gap != null ? r.gap : (r.demanda || 0) - (r.oferta || 0);
                const gapColor = gap > 0 ? '#22c55e' : gap < 0 ? '#dc2626' : '#888';
                const valor = r.valor;
                const open = rowKey === valor;
                return (
                  <React.Fragment key={valor ?? i}>
                    <tr>
                      <td style={td}>{valor ?? '—'}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#bbb' }}>{fmtN(r.oferta)}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#bbb' }}>{fmtN(r.demanda)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: gapColor }}>{gap > 0 ? '+' : ''}{fmtN(gap)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {r.tension != null && r.tension !== '' ? <Badge tone={tensionTone(r.tension)}>{r.tension}</Badge> : <span style={{ color: '#555' }}>—</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {ctx && valor != null && valor !== '' ? (
                          <button style={{ ...btnGhost, padding: '4px 10px', fontSize: 11 }} onClick={() => verCuales(valor)}>
                            {open ? 'ocultar' : 'ver cuáles'}
                          </button>
                        ) : <span style={{ color: '#555' }}>—</span>}
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td style={{ padding: 0 }} colSpan={colSpan}>
                          <div style={{ padding: '4px 8px 10px' }}>
                            {rowLoading && <div style={{ fontSize: 12, color: '#888', padding: '6px 0' }}>Listando entidades…</div>}
                            {rowErr && <div style={{ fontSize: 12, color: '#dc2626', padding: '6px 0' }}>{rowErr}</div>}
                            {rowList && !rowLoading && !rowErr && (
                              <EntityList list={rowList} pob={pobDrill} embedded
                                title={`${demandaDrill ? 'Oferta' : 'Entidades'} con ${groupBy} = ${valor}`}
                                note={demandaDrill ? 'Lista la OFERTA real que cumple este valor.' : null} />
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
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

// ── LISTA DE ENTIDADES (drill-down "cuáles") ─────────────────────────────────
function EntityList({ list, pob, title, note, embedded }) {
  const entidades = list?.entidades || [];
  const total = list?.total;
  const mostrados = list?.mostrados != null ? list.mostrados : entidades.length;
  const lectura = list?.lectura;

  const header = (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ ...lbl, marginBottom: 0 }}>{title || 'Entidades'}</div>
        <span style={{ fontSize: 11.5, color: '#888' }}>
          {total != null ? <>mostrando <strong style={{ color: '#ddd' }}>{fmtN(mostrados)}</strong> de <strong style={{ color: '#ddd' }}>{fmtN(total)}</strong></> : <>{fmtN(mostrados)} entidades</>}
        </span>
      </div>
      {note && <div style={{ fontSize: 11.5, color: '#b08968', marginTop: 4, fontStyle: 'italic' }}>{note}</div>}
    </div>
  );

  const body = (
    <>
      {header}
      {entidades.length === 0 ? (
        <div style={{ fontSize: 12.5, color: '#666' }}>Sin entidades que cumplan.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <EntityTable entidades={entidades} pob={pob} />
        </div>
      )}
      {lectura && <div style={{ fontSize: 12.5, color: '#bbb', marginTop: 8, fontStyle: 'italic' }}>{lectura}</div>}
    </>
  );

  if (embedded) return <div>{body}</div>;
  return <Card style={card}>{body}</Card>;
}

function EntityTable({ entidades, pob }) {
  if (pob === 'desarrollos') {
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
        <thead>
          <tr>
            <th style={th}>desarrollo</th><th style={th}>colonia</th><th style={th}>entrega</th>
            <th style={{ ...th, textAlign: 'right' }}>unidades</th><th style={{ ...th, textAlign: 'right' }}>altura</th>
            <th style={{ ...th, textAlign: 'right' }}>precio desde</th><th style={th}>tier</th>
          </tr>
        </thead>
        <tbody>
          {entidades.map((e, i) => (
            <tr key={e.dev_id ?? e.desarrollo ?? i}>
              <td style={{ ...td, color: '#ddd', fontWeight: 600 }}>{e.desarrollo ?? '—'}</td>
              <td style={td}>{e.colonia ?? '—'}</td>
              <td style={td}>{e.entrega ?? '—'}</td>
              <td style={{ ...td, textAlign: 'right', color: '#bbb' }}>{fmtN(e.unidades_total)}</td>
              <td style={{ ...td, textAlign: 'right', color: '#bbb' }}>{fmtN(e.altura)}</td>
              <td style={{ ...td, textAlign: 'right', color: '#bbb' }}>{e.precio_desde != null ? fmtN(e.precio_desde) : '—'}</td>
              <td style={td}>{e.tier != null && e.tier !== '' ? <Badge tone="neutral">{e.tier}</Badge> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (pob === 'zonas') {
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
        <thead>
          <tr>
            <th style={th}>colonia</th><th style={th}>alcaldía</th>
            <th style={{ ...th, textAlign: 'right' }}>desarrollos</th><th style={{ ...th, textAlign: 'right' }}>unidades</th>
            <th style={{ ...th, textAlign: 'right' }}>precio desde</th>
          </tr>
        </thead>
        <tbody>
          {entidades.map((e, i) => (
            <tr key={e.colonia ?? i}>
              <td style={{ ...td, color: '#ddd', fontWeight: 600 }}>{e.colonia ?? '—'}</td>
              <td style={td}>{e.alcaldia ?? '—'}</td>
              <td style={{ ...td, textAlign: 'right', color: '#bbb' }}>{fmtN(e.desarrollos)}</td>
              <td style={{ ...td, textAlign: 'right', color: '#bbb' }}>{fmtN(e.unidades)}</td>
              <td style={{ ...td, textAlign: 'right', color: '#bbb' }}>{e.precio_desde != null ? fmtN(e.precio_desde) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  // unidades (default)
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
      <thead>
        <tr>
          <th style={th}>desarrollo</th><th style={th}>unidad</th><th style={th}>colonia</th>
          <th style={{ ...th, textAlign: 'right' }}>m²</th><th style={{ ...th, textAlign: 'right' }}>rec</th>
          <th style={{ ...th, textAlign: 'right' }}>precio</th><th style={th}>status</th><th style={th}>atributos</th>
        </tr>
      </thead>
      <tbody>
        {entidades.map((e, i) => (
          <tr key={`${e.dev_id ?? ''}-${e.unidad ?? i}`}>
            <td style={{ ...td, color: '#ddd', fontWeight: 600 }}>{e.desarrollo ?? '—'}</td>
            <td style={td}>{e.unidad ?? e.prototipo ?? '—'}</td>
            <td style={td}>{e.colonia ?? '—'}</td>
            <td style={{ ...td, textAlign: 'right', color: '#bbb' }}>{fmtN(e.m2)}</td>
            <td style={{ ...td, textAlign: 'right', color: '#bbb' }}>{fmtN(e.recamaras)}</td>
            <td style={{ ...td, textAlign: 'right', color: '#bbb' }}>{e.precio != null ? fmtN(e.precio) : '—'}</td>
            <td style={td}>{e.status != null && e.status !== '' ? <Badge tone="neutral">{e.status}</Badge> : '—'}</td>
            <td style={td}>
              {Array.isArray(e.atributos) && e.atributos.length > 0
                ? <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>{e.atributos.map((a, j) => <Badge key={j} tone="neutral">{a}</Badge>)}</span>
                : <span style={{ color: '#555' }}>—</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SideCard({ title, accent, side, fuente, action }) {
  const breakdown = side.breakdown || [];
  const mx = Math.max(1, ...breakdown.map((b) => b.n || 0));
  return (
    <Card style={card}>
      <div style={lbl}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 34, fontWeight: 800, color: accent, letterSpacing: '-0.02em', lineHeight: 1 }}>{fmtN(side.total)}</span>
        <span style={{ fontSize: 12.5, color: '#888' }}>total</span>
        {action && <span style={{ marginLeft: 'auto' }}>{action}</span>}
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
