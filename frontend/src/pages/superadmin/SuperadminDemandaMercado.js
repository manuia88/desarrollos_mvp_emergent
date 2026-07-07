// Superadmin · DEMANDA DE MERCADO — la inteligencia que convierte interacciones en data accionable.
// Responde: qué busca el mercado (feature/colonia/atributo), cuándo, y qué/dónde construir. + query asesino.
import React, { useEffect, useState } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card, Badge, Empty } from '../../components/advisor/primitives';
import { getOverview, getFeature, getDeep, getGranularAdvanced, getZonas } from '../../api/superadminDemandIntel';

function Spark({ serie }) {
  const entries = Object.entries(serie || {});
  if (!entries.length) return <span style={{ color: '#888' }}>—</span>;
  const max = Math.max(...entries.map(([, v]) => v));
  return (
    <span style={{ display: 'inline-flex', gap: 2, alignItems: 'flex-end', height: 22 }}>
      {entries.map(([k, v]) => (
        <span key={k} title={`${k}: ${v}`} style={{ width: 7, height: Math.max(3, (v / max) * 22), background: 'var(--theme)', borderRadius: 1, opacity: 0.8 }} />
      ))}
    </span>
  );
}

const PERIODS = [['day', 'Día'], ['week', 'Semana'], ['month', 'Mes'], ['quarter', 'Trimestre'], ['year', 'Año']];

export default function SuperadminDemandaMercado({ embedded }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [period, setPeriod] = useState('month');
  const [colonia, setColonia] = useState('');
  // query asesino
  const [kf, setKf] = useState('terraza');
  const [kc, setKc] = useState('polanco');
  const [killer, setKiller] = useState(null);
  const [deep, setDeep] = useState(null);   // dimensiones profundas (lazy)
  const [adv, setAdv] = useState(null);     // 20 granularidades avanzadas (lazy)
  const [zonas, setZonas] = useState(null); // dinámica de zona 3 escalas (lazy)

  useEffect(() => {
    getOverview({ period, colonia }).then(setData).catch((e) => setErr(e.message));
  }, [period, colonia]);

  const ask = async () => {
    try { setKiller(await getFeature(kf, kc, period)); } catch (e) { setKiller({ error: e.message }); }
  };

  const feats = data?.by_feature?.top_features || [];
  const cols = data?.by_colonia?.top_colonias || [];
  const attr = data?.by_attribute || {};
  const build = data?.what_to_build?.oportunidades || [];

  return (
    <SuperadminLayout bare={embedded}>
      <PageHeader title="Demanda de mercado"
        sub="Las interacciones de los compradores convertidas en data: qué se busca, dónde, cuándo y qué construir." />

      {/* periodo */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#888' }}>Granularidad temporal:</span>
        {PERIODS.map(([v, l]) => (
          <button key={v} onClick={() => setPeriod(v)} style={{ padding: '4px 12px', borderRadius: 9999, fontSize: 12, cursor: 'pointer',
            border: period === v ? '1px solid var(--theme)' : '1px solid rgba(255,255,255,0.12)', background: period === v ? 'rgba(var(--theme-rgb),0.12)' : 'transparent', color: period === v ? 'var(--theme)' : '#999' }}>{l}</button>
        ))}
        <input value={colonia} onChange={(e) => setColonia(e.target.value)} placeholder="filtrar colonia (ej. polanco)"
          style={{ marginLeft: 8, padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#ddd', fontSize: 12 }} />
      </div>

      {err && <Card style={{ padding: 20, color: '#dc2626' }}>Error: {err}</Card>}

      {/* JUGADAS PROACTIVAS: qué construir YA */}
      {data?.alertas && (data.alertas.jugadas || []).length > 0 && (
        <Card style={{ padding: '14px 18px', marginBottom: 18, border: '1px solid rgba(34,197,94,0.35)' }}>
          <div style={{ fontWeight: 600, marginBottom: 8, color: '#22c55e' }}>🔥 Qué construir YA — el mercado lo pide</div>
          {(data.alertas.jugadas || []).slice(0, 5).map((j) => (
            <div key={j.feature} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <Badge tone={j.accion === 'construir' ? 'bad' : 'warn'}>{j.accion}</Badge>
              <span style={{ fontSize: 13 }}>{j.mensaje}</span>
            </div>
          ))}
        </Card>
      )}

      {/* QUERY ASESINO */}
      <Card style={{ padding: '14px 18px', marginBottom: 18, border: '1px solid rgba(var(--theme-rgb),0.3)' }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Pregunta directa al mercado</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
          ¿Cuántos clientes buscan
          <input value={kf} onChange={(e) => setKf(e.target.value)} style={{ width: 120, padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'var(--theme)' }} />
          en
          <input value={kc} onChange={(e) => setKc(e.target.value)} style={{ width: 120, padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'var(--theme)' }} />
          ?
          <button onClick={ask} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: 'var(--theme)', color: '#0b1021', fontWeight: 600, cursor: 'pointer' }}>Responder</button>
        </div>
        {killer && !killer.error && (
          <div style={{ marginTop: 12, display: 'flex', gap: 20, alignItems: 'center' }}>
            <div><span style={{ fontSize: 28, fontWeight: 700, color: 'var(--theme)' }}>{killer.demanda_total}</span> <span style={{ color: '#999' }}>interacciones</span></div>
            <Spark serie={killer.serie_tiempo} />
            <span style={{ fontSize: 12, color: '#888' }}>{killer.respondible ? 'serie de tiempo →' : 'sin datos para ese feature/colonia'}</span>
          </div>
        )}
        {killer?.error && <div style={{ marginTop: 8, color: '#dc2626' }}>{killer.error}</div>}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
        {/* FEATURES */}
        <Card style={{ padding: 0 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600 }}>
            Features más buscados <span style={{ fontSize: 11, color: '#888' }}>({data?.by_feature?.senales_precisas_unidad || 0} señales precisas)</span>
          </div>
          {feats.length === 0 ? <Empty title="Sin datos." /> : (
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <tbody>{feats.slice(0, 12).map((f) => (
                <tr key={f.feature} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '7px 16px', fontWeight: 500 }}>{f.feature}</td>
                  <td style={{ padding: '7px 12px', textAlign: 'right', color: 'var(--theme)', fontWeight: 600 }}>{f.demanda}</td>
                  <td style={{ padding: '7px 16px', textAlign: 'right' }}><Spark serie={f.serie} /></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Card>

        {/* COLONIAS */}
        <Card style={{ padding: 0 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600 }}>Colonias más solicitadas</div>
          {cols.length === 0 ? <Empty title="Sin datos." /> : (
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <tbody>{cols.slice(0, 12).map((c) => (
                <tr key={c.colonia} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '7px 16px', fontWeight: 500 }}>{c.colonia}</td>
                  <td style={{ padding: '7px 12px', textAlign: 'right', color: 'var(--theme)', fontWeight: 600 }}>{c.demanda}</td>
                  <td style={{ padding: '7px 16px', textAlign: 'right' }}><Spark serie={c.serie} /></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Card>

        {/* QUÉ CONSTRUIR */}
        <Card style={{ padding: 0 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600 }}>Qué construir <span style={{ fontSize: 11, color: '#888' }}>(demanda vs oferta)</span></div>
          {build.length === 0 ? <Empty title="Sin datos." /> : (
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead><tr style={{ color: '#888', fontSize: 11 }}><th style={{ padding: '6px 16px', textAlign: 'left' }}>Feature</th><th style={{ padding: '6px', textAlign: 'right' }}>Demanda</th><th style={{ padding: '6px', textAlign: 'right' }}>Oferta</th><th style={{ padding: '6px 16px', textAlign: 'right' }}>Presión</th></tr></thead>
              <tbody>{build.slice(0, 12).map((o) => (
                <tr key={o.feature} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '7px 16px' }}>{o.feature}</td>
                  <td style={{ padding: '7px', textAlign: 'right' }}>{o.demanda}</td>
                  <td style={{ padding: '7px', textAlign: 'right', color: '#888' }}>{o.oferta_unidades}</td>
                  <td style={{ padding: '7px 16px', textAlign: 'right' }}><Badge tone={o.presion >= 0.7 ? 'bad' : o.presion >= 0.4 ? 'warn' : 'neutral'}>{o.presion}</Badge></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Card>

        {/* ATRIBUTOS EXPLÍCITOS */}
        <Card style={{ padding: '12px 16px' }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>Atributos buscados <span style={{ fontSize: 11, color: '#888' }}>({attr.busquedas || 0} búsquedas)</span></div>
          {['recamaras', 'bandas_precio', 'estacionamiento'].map((key) => (
            <div key={key} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 3, textTransform: 'capitalize' }}>{key.replace('_', ' ')}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {Object.entries(attr[key] || {}).map(([k, v]) => <Badge key={k} tone="neutral">{k}: {v}</Badge>)}
                {Object.keys(attr[key] || {}).length === 0 && <span style={{ color: '#666', fontSize: 12 }}>—</span>}
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* ENGAGEMENT DE CONTENIDO (señales antes muertas: section_time/section_view/module_open) */}
      <Card style={{ padding: '14px 18px', marginTop: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Qué contenido engancha
          <span style={{ fontSize: 11, color: '#888' }}> ({data?.engagement_contenido?.['señales_de_contenido'] || 0} señales de sección/módulo)</span>
        </div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>Qué secciones y módulos de la ficha capturan la atención del comprador — le dice al dev qué destacar.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {[['secciones_por_tiempo', 'Secciones por tiempo', 'seccion', 'segundos_total', 's'],
            ['secciones_por_vistas', 'Secciones por vistas', 'seccion', 'vistas', ''],
            ['modulos_abiertos', 'Módulos abiertos', 'modulo', 'aperturas', '']].map(([key, title, kf, vf, suf]) => (
            <div key={key}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>{title}</div>
              {(data?.engagement_contenido?.[key] || []).slice(0, 6).map((r) => (
                <div key={r[kf]} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                  <span>{r[kf]}</span><strong style={{ color: 'var(--theme)' }}>{r[vf]}{suf}</strong>
                </div>
              ))}
              {(data?.engagement_contenido?.[key] || []).length === 0 && <span style={{ color: '#666', fontSize: 12 }}>—</span>}
            </div>
          ))}
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, marginTop: 16 }}>
        {/* DEMANDA NO SATISFECHA */}
        <Card style={{ padding: '14px 18px' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Demanda no satisfecha
            <span style={{ fontSize: 11, color: '#888' }}> ({data?.no_satisfecha?.busquedas_insatisfechas || 0} búsquedas sin buen match)</span>
          </div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>Lo que la gente busca y casi no encuentra = qué construir que no existe.</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {(data?.no_satisfecha?.por_colonia || []).slice(0, 8).map((c) => <Badge key={c.colonia} tone="warn">{c.colonia}: {c.n}</Badge>)}
            {(data?.no_satisfecha?.por_colonia || []).length === 0 && <span style={{ color: '#666', fontSize: 12 }}>—</span>}
          </div>
          <div style={{ fontSize: 12, color: '#888' }}>Recámaras: {Object.entries(data?.no_satisfecha?.por_recamaras || {}).map(([k, v]) => `${k} (${v})`).join(' · ') || '—'}</div>
          <div style={{ fontSize: 12, color: '#888' }}>Precio: {Object.entries(data?.no_satisfecha?.por_precio || {}).map(([k, v]) => `${k} (${v})`).join(' · ') || '—'}</div>
          {data?.intencion_financiera && (
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 12, color: '#888' }}>
              <strong style={{ color: 'var(--theme)' }}>Intención financiera (alto intento):</strong> {data.intencion_financiera.exploraron_pago} exploraron pago{data.intencion_financiera.enganche_promedio_pct != null ? ` (enganche prom ${data.intencion_financiera.enganche_promedio_pct}%)` : ''} · {data.intencion_financiera.exploraron_roi} exploraron ROI{data.intencion_financiera.tir_buscado_promedio_pct != null ? ` (TIR prom ${data.intencion_financiera.tir_buscado_promedio_pct}%)` : ''}
            </div>
          )}
        </Card>

        {/* TENDENCIAS */}
        <Card style={{ padding: '14px 18px' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Tendencias <span style={{ fontSize: 11, color: '#888' }}>(ventana {data?.tendencias?.ventana_dias || 30}d vs anterior)</span></div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>Qué feature sube rápido = muévete antes que la competencia.</div>
          {(data?.tendencias?.tendencias || []).length === 0 ? <span style={{ color: '#666', fontSize: 12 }}>Sin movimiento aún (se necesitan 2 ventanas con datos).</span> : (
            (data?.tendencias?.tendencias || []).slice(0, 8).map((t) => (
              <div key={t.feature} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <span>{t.feature}</span>
                <span><strong style={{ color: '#16a34a' }}>{t.nuevo ? 'nuevo' : `${t.crecimiento_pct > 0 ? '+' : ''}${t.crecimiento_pct}%`}</strong> <span style={{ color: '#888', fontSize: 11 }}>({t.anterior}→{t.reciente})</span></span>
              </div>
            ))
          )}
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, marginTop: 16 }}>
        {/* GEO FINO: calle / CP / alcaldía */}
        <Card style={{ padding: '14px 18px' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Demanda por geo fino</div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>Hasta nivel calle y CP (la unidad hereda la dirección del desarrollo).</div>
          {[['calle', 'Calle'], ['cp', 'CP (≈manzana)'], ['alcaldia', 'Alcaldía']].map(([key, label]) => (
            <div key={key} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 3 }}>{label}</div>
              {(data?.por_geo?.[key] || []).slice(0, 4).map((g) => (
                <div key={g.geo} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}>
                  <span>{g.geo}</span><strong style={{ color: 'var(--theme)' }}>{g.demanda}</strong></div>
              ))}
              {(data?.por_geo?.[key] || []).length === 0 && <span style={{ color: '#666', fontSize: 12 }}>—</span>}
            </div>
          ))}
        </Card>

        {/* CONVERSACIÓN ATLAX (turno-por-turno) */}
        <Card style={{ padding: '14px 18px' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Qué dice el comprador con Atlax
            <span style={{ fontSize: 11, color: '#888' }}> ({data?.conversacion?.mensajes_analizados || 0} mensajes)</span>
          </div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>Analizado turno por turno: lo que pide y lo que le preocupa, más allá de los filtros.</div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 3 }}>Features que menciona</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {(data?.conversacion?.features_mencionados || []).slice(0, 8).map((f) => <Badge key={f.k} tone="ok">{f.k}: {f.n}</Badge>)}
            {(data?.conversacion?.features_mencionados || []).length === 0 && <span style={{ color: '#666', fontSize: 12 }}>—</span>}
          </div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 3 }}>Objeciones / preocupaciones</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(data?.conversacion?.objeciones || []).slice(0, 8).map((o) => <Badge key={o.k} tone="bad">{o.k}: {o.n}</Badge>)}
            {(data?.conversacion?.objeciones || []).length === 0 && <span style={{ color: '#666', fontSize: 12 }}>—</span>}
          </div>
        </Card>
      </div>

      {/* SEÑALES PROFUNDAS (lazy) */}
      <div style={{ marginTop: 16 }}>
        {!deep ? (
          <button onClick={() => getDeep().then(setDeep).catch((e) => setDeep({ error: e.message }))}
            style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#aaa', cursor: 'pointer' }}>
            Ver señales profundas (por qué NO · intent · qué compite · cuándo · journey)
          </button>
        ) : deep.error ? <Card style={{ padding: 16, color: '#dc2626' }}>{deep.error}</Card> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            <Card style={{ padding: '14px 18px' }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Por qué dicen NO <span style={{ fontSize: 11, color: '#888' }}>({deep.por_que_no?.total_rechazos || 0})</span></div>
              {(deep.por_que_no?.razones || []).map((r) => <div key={r.razon} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}><span>{r.razon}</span><strong style={{ color: '#dc2626' }}>{r.n}</strong></div>)}
              {(deep.por_que_no?.razones || []).length === 0 && <span style={{ color: '#666', fontSize: 12 }}>—</span>}
            </Card>
            <Card style={{ padding: '14px 18px' }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Intent: vivir vs invertir</div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                {Object.entries(deep.intent?.global || {}).map(([k, v]) => <Badge key={k} tone={k === 'invertir' ? 'warn' : 'ok'}>{k}: {v}</Badge>)}
              </div>
              {(deep.intent?.por_colonia || []).slice(0, 5).map((c) => <div key={c.colonia} style={{ fontSize: 12, color: '#888', padding: '2px 0' }}>{c.colonia}: {c.invertir || 0} inv · {c.vivir || 0} vivir</div>)}
            </Card>
            <Card style={{ padding: '14px 18px' }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Qué compite (se ven juntos)</div>
              {(deep.que_compite?.pares_comparados || []).slice(0, 6).map((p, i) => <div key={i} style={{ fontSize: 12, padding: '3px 0' }}>{p.a} <span style={{ color: '#888' }}>vs</span> {p.b} <strong style={{ color: 'var(--theme)' }}>×{p.juntos}</strong></div>)}
              {(deep.que_compite?.pares_comparados || []).length === 0 && <span style={{ color: '#666', fontSize: 12 }}>—</span>}
            </Card>
            <Card style={{ padding: '14px 18px' }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Profundidad del journey</div>
              <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                <div>Visitantes: <strong>{deep.journey?.visitantes}</strong></div>
                <div>Toques promedio: <strong>{deep.journey?.toques_promedio}</strong></div>
                <div>Regresan: <strong>{deep.journey?.regresan_pct}%</strong></div>
                <div>Convierten a lead: <strong style={{ color: 'var(--theme)' }}>{deep.journey?.convierten_a_lead_pct}%</strong></div>
              </div>
            </Card>
            <Card style={{ padding: '14px 18px' }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Cuándo buscan</div>
              <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 40 }}>
                {Object.entries(deep.cuando?.por_hora || {}).map(([hh, v]) => {
                  const mx = Math.max(...Object.values(deep.cuando?.por_hora || { 0: 1 }));
                  return <span key={hh} title={`${hh}h: ${v}`} style={{ flex: 1, height: Math.max(2, (v / mx) * 40), background: 'var(--theme)', opacity: 0.7, borderRadius: 1 }} />;
                })}
              </div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>por hora (0–23h) · {Object.entries(deep.cuando?.por_dia || {}).map(([d, v]) => `${d} ${v}`).join(' · ')}</div>
            </Card>
            <Card style={{ padding: '14px 18px' }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Comportamiento</div>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 3 }}>Dispositivo</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {Object.entries(deep.comportamiento?.device || {}).map(([k, v]) => <Badge key={k} tone="neutral">{k}: {v}</Badge>)}
                {Object.keys(deep.comportamiento?.device || {}).length === 0 && <span style={{ color: '#666', fontSize: 12 }}>— (señales nuevas, se llenan con uso)</span>}
              </div>
              <div style={{ fontSize: 12, color: '#888' }}>Tour/video abierto: <strong>{deep.comportamiento?.abrieron_tour_video || 0}</strong> · Scroll prom: <strong>{deep.comportamiento?.scroll_profundo_promedio_pct != null ? `${deep.comportamiento.scroll_profundo_promedio_pct}%` : '—'}</strong></div>
              {Object.keys(deep.comportamiento?.estilo_disc || {}).length > 0 && (
                <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>DISC: {Object.entries(deep.comportamiento.estilo_disc).map(([k, v]) => `${k} (${v})`).join(' · ')}</div>
              )}
            </Card>

            {/* SENSIBILIDAD AL PRECIO */}
            <Card style={{ padding: '14px 18px' }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Sensibilidad al precio <span style={{ fontSize: 11, color: '#888' }}>(techo buscado)</span></div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Global: mediana <strong style={{ color: 'var(--theme)' }}>${((deep.sensibilidad_precio?.global?.mediana || 0) / 1e6).toFixed(1)}M</strong> (p25 ${((deep.sensibilidad_precio?.global?.p25 || 0) / 1e6).toFixed(1)}M – p75 ${((deep.sensibilidad_precio?.global?.p75 || 0) / 1e6).toFixed(1)}M)</div>
              {(deep.sensibilidad_precio?.por_colonia || []).slice(0, 5).map((c) => (
                <div key={c.colonia} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}>
                  <span>{c.colonia}</span><strong>${((c.mediana || 0) / 1e6).toFixed(1)}M</strong></div>
              ))}
            </Card>

            {/* VELOCIDAD DEL EMBUDO */}
            <Card style={{ padding: '14px 18px' }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Velocidad del embudo</div>
              <div style={{ fontSize: 13, lineHeight: 1.9 }}>
                <div>Consideración (1ª señal → lead): <strong style={{ color: 'var(--theme)' }}>{deep.velocidad_embudo?.consideracion_dias?.mediana ?? '—'} días</strong></div>
                <div>Lead → cierre: <strong style={{ color: 'var(--theme)' }}>{deep.velocidad_embudo?.lead_a_cierre_dias?.mediana ?? '—'} días</strong></div>
              </div>
            </Card>

            {/* VISITANTES CALIENTES (lo más accionable) */}
            <Card style={{ padding: '14px 18px', border: '1px solid rgba(34,197,94,0.35)' }}>
              <div style={{ fontWeight: 600, marginBottom: 4, color: '#22c55e' }}>🔥 Visitantes calientes (lead anónimo por convertir)</div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Quién se está calentando + qué le interesa → el asesor podría adelantarse.</div>
              {(deep.visitantes_calientes?.visitantes_calientes || []).slice(0, 6).map((v) => (
                <div key={v.visitor_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <span>{(v.features || []).join(', ') || '—'} {(v.colonias || []).length > 0 ? `· ${v.colonias.join('/')}` : ''}</span>
                  <strong style={{ color: '#22c55e' }}>{v.calor}</strong>
                </div>
              ))}
              {(deep.visitantes_calientes?.visitantes_calientes || []).length === 0 && <span style={{ color: '#666', fontSize: 12 }}>—</span>}
            </Card>
          </div>
        )}
      </div>

      {/* DINÁMICA DE ZONA · 3 ESCALAS (lazy) */}
      <div style={{ marginTop: 16 }}>
        {!zonas ? (
          <button onClick={() => getZonas().then(setZonas).catch((e) => setZonas({ error: e.message }))}
            style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#aaa', cursor: 'pointer' }}>
            Ver dinámica de zona · macro (alcaldía) → media (colonia) → micro (CP) · demanda · absorción · movimiento
          </button>
        ) : zonas.error ? <Card style={{ padding: 16, color: '#dc2626' }}>{zonas.error}</Card> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 16 }}>
            {[['macro', 'Macro · alcaldía'], ['media', 'Media · colonia'], ['micro', 'Micro · CP']].map(([sc, label]) => (
              <Card key={sc} style={{ padding: '14px 18px' }}>
                <div style={{ fontWeight: 600, marginBottom: 10 }}>{label}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr repeat(4, 0.7fr)', gap: 4, fontSize: 11, color: '#888', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 4, marginBottom: 4 }}>
                  <span>zona</span><span style={{ textAlign: 'right' }}>dem</span><span style={{ textAlign: 'right' }}>busq</span><span style={{ textAlign: 'right' }}>absor</span><span style={{ textAlign: 'right' }}>mov</span>
                </div>
                {(zonas[sc]?.zonas || []).slice(0, 8).map((z) => {
                  const mvColor = z.movimiento === 'subiendo' ? '#22c55e' : z.movimiento === 'enfriando' ? '#dc2626' : z.movimiento === 'nuevo' ? 'var(--theme)' : '#888';
                  const mvTxt = z.cambio_pct != null ? `${z.cambio_pct > 0 ? '+' : ''}${z.cambio_pct}%` : z.movimiento === 'nuevo' ? 'nuevo' : '—';
                  return (
                    <div key={z.zona} style={{ display: 'grid', gridTemplateColumns: '1.4fr repeat(4, 0.7fr)', gap: 4, fontSize: 12, padding: '2px 0' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{z.zona}</span>
                      <span style={{ textAlign: 'right' }}>{z.demanda}</span>
                      <span style={{ textAlign: 'right', color: '#888' }}>{z.busquedas}</span>
                      <span style={{ textAlign: 'right', color: z.absorcion >= 1.5 ? '#22c55e' : z.absorcion < 0.5 ? '#dc2626' : 'inherit', fontWeight: 600 }}>{z.absorcion}</span>
                      <span style={{ textAlign: 'right', color: mvColor }}>{mvTxt}</span>
                    </div>
                  );
                })}
              </Card>
            ))}
          </div>
        )}

        {/* ÍNDICE DE INTELIGENCIA DE ZONA — fusión de 8 motores por colonia */}
        {zonas && !zonas.error && (zonas.inteligencia?.zonas || []).length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Índice de Inteligencia de Zona</div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>La foto institucional por colonia: demanda · absorción real · precio/m² · calidad de vida · riesgo · inversión · ciclo. Fusión de 8 motores que vivían en silos.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
              {(zonas.inteligencia.zonas).map((z) => (
                <Card key={z.zona} style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{z.nombre || z.zona} {z.tier && <span style={{ fontSize: 11, color: '#888', fontWeight: 400 }}>· {z.tier}</span>}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>{z.alcaldia}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 14px', fontSize: 12.5 }}>
                    <span>Precio/m²: <strong>{z.precio_m2 ? `$${(z.precio_m2 / 1000).toFixed(0)}k` : '—'}</strong></span>
                    <span>Demanda: <strong>{z.demanda}</strong> · {z.movimiento}</span>
                    <span>Absorción: <strong>{z.absorcion?.vendido_pct != null ? `${z.absorcion.vendido_pct}%` : '—'}</strong> {z.absorcion?.velocidad_mensual != null && <span style={{ color: '#888' }}>({z.absorcion.velocidad_mensual}/mes)</span>}</span>
                    <span>Agotar: <strong>{z.absorcion?.meses_agotar != null ? `${z.absorcion.meses_agotar} m` : '—'}</strong></span>
                    <span>Score zona: <strong>{z.score_zona || '—'}</strong></span>
                    <span>Riesgo: <strong>{z.riesgo?.letra || '—'}</strong> {z.riesgo?.num != null && <span style={{ color: '#888' }}>({z.riesgo.num})</span>}</span>
                    <span>Inversión: <strong style={{ color: 'var(--theme)' }}>{z.inversion?.score != null ? `${z.inversion.score} (${z.inversion.tier})` : '—'}</strong></span>
                    <span>Oportunidad: <strong>{z.oportunidad != null ? Math.round(z.oportunidad) : '—'}</strong></span>
                  </div>
                  {z.spec_pedida && (
                    <div style={{ fontSize: 11.5, color: '#888', marginTop: 8 }}>La demanda pide: ${(((z.spec_pedida.precio_max_prom) || 0) / 1e6).toFixed(1)}M · {z.spec_pedida.recamaras?.toFixed?.(1) || z.spec_pedida.recamaras} rec · {z.spec_pedida.m2} m²</div>
                  )}
                  {z.subscores && Object.keys(z.subscores).length > 0 && (
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
                      {Object.entries(z.subscores).map(([k, v]) => <span key={k} style={{ fontSize: 10.5, padding: '1px 7px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', color: '#aaa' }}>{k} {Math.round(v)}</span>)}
                    </div>
                  )}
                  {z.recomendacion && <div style={{ fontSize: 12, color: 'var(--cream-2, #bbb)', marginTop: 8, fontStyle: 'italic' }}>{z.ciclo ? `${z.ciclo} — ` : ''}{z.recomendacion}</div>}
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 20 GRANULARIDADES AVANZADAS (lazy) */}
      <div style={{ marginTop: 16 }}>
        {!adv ? (
          <button onClick={() => getGranularAdvanced().then(setAdv).catch((e) => setAdv({ error: e.message }))}
            style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#aaa', cursor: 'pointer' }}>
            Ver 20 granularidades avanzadas (estacionalidad · balance oferta-demanda · absorción · RFM · elasticidad · fugas · atribución · …)
          </button>
        ) : adv.error ? <Card style={{ padding: 16, color: '#dc2626' }}>{adv.error}</Card> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            <Card style={{ padding: '14px 18px' }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Elasticidad precio (la curva)</div>
              {Object.entries(adv.elasticidad_precio?.curva || {}).map(([b, n]) => {
                const mx = Math.max(...Object.values(adv.elasticidad_precio?.curva || { 0: 1 }));
                return <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '2px 0' }}><span style={{ width: 56 }}>{b}</span><span style={{ flex: 1, height: 10, background: 'var(--theme)', opacity: 0.7, width: `${(n / mx) * 100}%`, borderRadius: 2 }} /><strong>{n}</strong></div>;
              })}
            </Card>
            <Card style={{ padding: '14px 18px' }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Fugas del embudo</div>
              {Object.entries(adv.fugas_embudo?.conversion_pct || {}).map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}><span>{k}</span><strong style={{ color: v < 30 ? '#dc2626' : '#22c55e' }}>{v}%</strong></div>)}
            </Card>
            <Card style={{ padding: '14px 18px' }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Balance oferta-demanda</div>
              {(adv.balance_oferta_demanda?.colonias || []).slice(0, 6).map((c) => <div key={c.colonia} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}><span>{c.colonia}</span><span style={{ color: '#888' }}>{c.demanda}d / {c.oferta_unidades}o</span><strong style={{ color: 'var(--theme)' }}>{c.balance}</strong></div>)}
            </Card>
            <Card style={{ padding: '14px 18px' }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Segmentos RFM</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.entries(adv.segmentos_rfm?.segmentos || {}).map(([k, v]) => <Badge key={k} tone={k === 'campeones' ? 'ok' : k === 'dormidos' ? 'warn' : 'neutral'}>{k}: {v}</Badge>)}
              </div>
            </Card>
            <Card style={{ padding: '14px 18px' }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Criterios de decisión</div>
              {(adv.criterios_decision?.criterios || []).slice(0, 6).map((c) => <div key={c.criterio} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}><span>{c.criterio}</span><strong>{c.n}</strong></div>)}
            </Card>
            <Card style={{ padding: '14px 18px' }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Willingness-to-pay por feature</div>
              {(adv.willingness_to_pay?.features || []).slice(0, 6).map((f) => <div key={f.feature} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}><span>{f.feature}</span><strong>${(f.precio_medio_visto / 1e6).toFixed(1)}M</strong></div>)}
            </Card>
            <Card style={{ padding: '14px 18px' }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Atribución por canal</div>
              {(adv.atribucion?.por_fuente || []).slice(0, 6).map((s) => <div key={s.fuente} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}><span>{s.fuente}</span><span style={{ color: '#888' }}>{s.sesiones} ses · {s.conversion_pct}%</span></div>)}
            </Card>
            <Card style={{ padding: '14px 18px' }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Estacionalidad (por mes)</div>
              <Spark serie={adv.estacionalidad?.por_mes} />
            </Card>
            <Card style={{ padding: '14px 18px' }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Timeline predicho + Urgencia</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {Object.entries(adv.timeline_predicho?.segmentos_timeline || {}).map(([k, v]) => <Badge key={k} tone={k === 'compra_pronto' ? 'ok' : 'neutral'}>{k}: {v}</Badge>)}
              </div>
              <div style={{ fontSize: 12, color: '#888' }}>Urgencia en conversación: <strong>{adv.urgencia?.urgencia_pct || 0}%</strong></div>
            </Card>
          </div>
        )}
      </div>
    </SuperadminLayout>
  );
}
