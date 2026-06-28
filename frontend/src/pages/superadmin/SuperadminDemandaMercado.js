// Superadmin · DEMANDA DE MERCADO — la inteligencia que convierte interacciones en data accionable.
// Responde: qué busca el mercado (feature/colonia/atributo), cuándo, y qué/dónde construir. + query asesino.
import React, { useEffect, useState } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card, Badge, Empty } from '../../components/advisor/primitives';
import { getOverview, getFeature } from '../../api/superadminDemandIntel';

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

export default function SuperadminDemandaMercado() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [period, setPeriod] = useState('month');
  const [colonia, setColonia] = useState('');
  // query asesino
  const [kf, setKf] = useState('terraza');
  const [kc, setKc] = useState('polanco');
  const [killer, setKiller] = useState(null);

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
    <SuperadminLayout>
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
    </SuperadminLayout>
  );
}
