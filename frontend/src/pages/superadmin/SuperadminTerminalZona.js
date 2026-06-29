// Superadmin · TERMINAL DE ZONA — la vista madre del cubo. Pivotea TODOS los ejes (escalas geo · inteligencia fusión ·
// atributos de unidad · financiero · cruces · las 100 compuestas). Carga perezosa por eje.
import React, { useEffect, useState } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card, Badge } from '../../components/advisor/primitives';
import { getTerminal } from '../../api/superadminDemandIntel';

const TABS = [
  { key: 'escalas', label: 'Escalas geo' },
  { key: 'inteligencia', label: 'Inteligencia de zona' },
  { key: 'atributos', label: 'Atributos de unidad' },
  { key: 'financiero', label: 'Financiero' },
  { key: 'cruces', label: 'Cruces' },
  { key: 'compuestas', label: 'Las 100 compuestas' },
];

const fmtM = (v) => (v == null ? '—' : `$${(v / 1e6).toFixed(1)}M`);
const fmtK = (v) => (v == null ? '—' : `$${Math.round(v / 1000)}k`);
const card = { padding: '14px 18px' };
const th = { fontSize: 11, color: '#888', textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid rgba(255,255,255,0.1)' };
const td = { fontSize: 12.5, padding: '4px 8px', borderTop: '1px solid rgba(255,255,255,0.05)' };

export default function SuperadminTerminalZona({ user, onLogout }) {
  const [tab, setTab] = useState('escalas');
  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [resumen, setResumen] = useState(null);

  useEffect(() => { getTerminal('resumen').then(setResumen).catch(() => {}); }, []);
  useEffect(() => {
    if (cache[tab]) return;
    setLoading(true);
    getTerminal(tab).then((d) => setCache((c) => ({ ...c, [tab]: d }))).catch((e) => setCache((c) => ({ ...c, [tab]: { error: e.message } }))).finally(() => setLoading(false));
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const d = cache[tab];

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

      {loading && <Card style={card}>Cargando eje…</Card>}
      {d?.error && <Card style={{ ...card, color: '#dc2626' }}>{d.error}</Card>}

      {/* ESCALAS */}
      {tab === 'escalas' && d && !d.error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 16 }}>
          {[['macro', 'Macro · alcaldía'], ['grande', 'Grande · corredor'], ['media', 'Media · colonia'], ['micro', 'Micro · CP']].map(([sc, label]) => (
            <Card key={sc} style={card}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{label}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>zona</th><th style={th}>dem</th><th style={th}>absor</th><th style={th}>mov</th></tr></thead>
                <tbody>
                  {(d[sc]?.zonas || []).slice(0, 8).map((z) => (
                    <tr key={z.zona}>
                      <td style={td}>{z.zona}</td><td style={td}>{z.demanda}</td>
                      <td style={{ ...td, color: z.absorcion >= 1.5 ? '#22c55e' : z.absorcion < 0.5 ? '#dc2626' : 'inherit' }}>{z.absorcion}</td>
                      <td style={{ ...td, color: z.movimiento === 'subiendo' ? '#22c55e' : z.movimiento === 'nuevo' ? 'var(--theme)' : '#888' }}>{z.cambio_pct != null ? `${z.cambio_pct > 0 ? '+' : ''}${z.cambio_pct}%` : z.movimiento}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      )}

      {/* INTELIGENCIA (fusión 8 motores) */}
      {tab === 'inteligencia' && d && !d.error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
          {(d.zonas || []).map((z) => (
            <Card key={z.zona} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong>{z.nombre || z.zona} {z.tier && <span style={{ fontSize: 11, color: '#888' }}>· {z.tier}</span>}</strong>
                <span style={{ fontSize: 12, color: '#888' }}>{z.alcaldia}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 14px', fontSize: 12.5 }}>
                <span>Precio/m²: <strong>{fmtK(z.precio_m2)}</strong></span>
                <span>Demanda: <strong>{z.demanda}</strong></span>
                <span>Absorción: <strong>{z.absorcion?.vendido_pct != null ? `${z.absorcion.vendido_pct}%` : '—'}</strong></span>
                <span>Score zona: <strong>{z.score_zona || '—'}</strong></span>
                <span>Riesgo: <strong>{z.riesgo?.letra || '—'}</strong></span>
                <span>Inversión: <strong style={{ color: 'var(--theme)' }}>{z.inversion?.score != null ? `${z.inversion.score} (${z.inversion.tier})` : '—'}</strong></span>
              </div>
              {z.str_airbnb && (
                <div style={{ fontSize: 12, color: '#bbb', marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  🏠 Airbnb (AirROI): cap rate <strong style={{ color: '#22c55e' }}>{z.cap_rate_str}%</strong> · ocupación {z.str_airbnb.ocupacion_pct}% · RevPAR ${z.str_airbnb.revpar} · {z.str_airbnb.listings} listings
                </div>
              )}
              {z.recomendacion && <div style={{ fontSize: 12, color: '#bbb', marginTop: 8, fontStyle: 'italic' }}>{z.ciclo ? `${z.ciclo} — ` : ''}{z.recomendacion}</div>}
            </Card>
          ))}
        </div>
      )}

      {/* ATRIBUTOS DE UNIDAD — los 16 ejes */}
      {tab === 'atributos' && d && !d.error && (
        <>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>{d.ejes?.length || 16} ejes de granularidad dentro del depa y del edificio · {d.lectura}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            <Card style={card}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Demanda que engancha con…</div>
              {(d.booleanos || []).map((b) => (
                <div key={b.atributo} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '3px 0' }}>
                  <span style={{ width: 130 }}>{b.atributo}</span>
                  <span style={{ flex: 1, height: 9, background: 'var(--theme)', opacity: 0.7, width: `${b.pct}%`, borderRadius: 2 }} />
                  <strong>{b.pct}%</strong>
                </div>
              ))}
            </Card>
            <AttrCard title="Tamaño (m²)" dict={d.m2_band} />
            <AttrCard title="Tipología" dict={d.tipologia} />
            <AttrCard title="Piso del depa" dict={d.piso} />
            <AttrCard title="Vista" dict={d.vista} />
            <AttrCard title="Orientación" dict={d.orientacion} />
            <AttrCard title="Altura del edificio" dict={d.altura_edificio} />
            <AttrCard title="Estacionamiento (cajones)" dict={d.estacionamiento_cajones} extra={Object.entries(d.estacionamiento_tipo || {}).map(([k, v]) => `${k} ${v}`).join(' · ')} />
            <AttrCard title="Espacio exterior" dict={d.espacio_exterior} />
            <AttrCard title="Riqueza de amenidades" dict={d.amenidades_riqueza} />
            <AttrCard title="Tamaño del edificio" dict={d.tamano_edificio} />
            <AttrCard title="Entrega / etapa" dict={d.entrega} />
            <AttrCard title="Créditos aceptados" dict={d.creditos_aceptados} />
            <Card style={card}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Amenidades específicas (demanda)</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(d.amenidades_especificas || []).slice(0, 16).map((a) => <Badge key={a.amenidad} tone="neutral">{a.amenidad} {a.n}</Badge>)}
              </div>
            </Card>
            <AttrCard title="Recámaras / baños" dict={{ ...Object.fromEntries(Object.entries(d.recamaras || {}).map(([k, v]) => [`${k} rec`, v])), ...Object.fromEntries(Object.entries(d.banos || {}).map(([k, v]) => [`${k} baño`, v])) }} />
          </div>
        </>
      )}

      {/* FINANCIERO */}
      {tab === 'financiero' && d && !d.error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          <Card style={card}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Presupuesto + intent</div>
            {Object.entries(d.presupuesto || {}).map(([b, n]) => {
              const mx = Math.max(...Object.values(d.presupuesto || { 0: 1 }));
              return <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '2px 0' }}><span style={{ width: 56 }}>{b}</span><span style={{ flex: 1, height: 9, background: 'var(--theme)', opacity: 0.7, width: `${(n / mx) * 100}%`, borderRadius: 2 }} /><strong>{n}</strong></div>;
            })}
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <Badge tone="ok">vivir: {d.intent?.vivir || 0}</Badge><Badge tone="warn">invertir: {d.intent?.invertir || 0}</Badge>
            </div>
          </Card>
          <Card style={card}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Enganche · crédito · plazo · mensualidad</div>
            <div style={{ fontSize: 13, lineHeight: 1.9 }}>
              <div>Enganche mediano: <strong>{fmtM(d.enganche_mediano)}</strong> {d.enganche_pct && Object.keys(d.enganche_pct).length > 0 ? `(${Object.entries(d.enganche_pct).map(([k, v]) => `${k}:${v}`).join(' ')})` : ''}</div>
              <div>Crédito mediano: <strong>{fmtM(d.credito_mediano)}</strong></div>
              <div>Plazo: <strong>{Object.entries(d.plazo_anos || {}).map(([k, v]) => `${k} (${v})`).join(' · ') || '—'}</strong></div>
              <div>Mensualidad mediana: <strong>{fmtK(d.mensualidad_mediana)}</strong> <span style={{ color: '#888' }}>({d.mensualidad_n} datos)</span></div>
            </div>
            {(d.cobertura?.cotizador_con_enganche === 0) && <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>Captura cableada · se llena con uso del cotizador.</div>}
          </Card>
          <Card style={card}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Apetito de retorno + rentabilidad por zona</div>
            <div style={{ fontSize: 12.5, marginBottom: 8 }}>TIR mediana: <strong>{d.tir_mediana != null ? `${d.tir_mediana}%` : '—'}</strong> · Cap rate: <strong>{d.cap_rate_mediano != null ? `${d.cap_rate_mediano}%` : '—'}</strong></div>
            {(d.rentabilidad_por_zona || []).slice(0, 6).map((r) => (
              <div key={r.colonia} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '2px 0' }}><span>{r.colonia}</span><strong style={{ color: 'var(--theme)' }}>{r.score} ({r.tier})</strong></div>
            ))}
          </Card>
          <Card style={card}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Perfil de financiamiento</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.9 }}>
              <div>Perfil: {Object.entries(d.perfil_financiamiento || {}).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}</div>
              <div>LTV (apalancamiento): {Object.entries(d.apalancamiento_ltv || {}).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}</div>
              <div>Esquema: {Object.entries(d.esquema_preferido || {}).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}</div>
              <div>Tipo de crédito: {Object.entries(d.tipo_credito || {}).slice(0, 4).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}</div>
              <div>Capacidad de pago: {d.capacidad_pago_pct_anual != null ? `${d.capacidad_pago_pct_anual}%/año del valor` : '—'}</div>
              <div>Le gana a CETES: {d.le_gana_a_cetes?.['sí'] || 0} sí · {d.le_gana_a_cetes?.no || 0} no</div>
            </div>
            {Object.keys(d.perfil_financiamiento || {}).length === 0 && <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>Captura cableada · se llena con uso del cotizador/calc.</div>}
          </Card>
        </div>
      )}

      {/* CRUCES (compuestas clave) */}
      {tab === 'cruces' && d && !d.error && (
        <Card style={card}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Métricas compuestas net-new <span style={{ fontSize: 11, color: '#888' }}>({(d.composites || []).join(' · ')})</span></div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
            <thead><tr><th style={th}>zona</th><th style={th}>oport. real</th><th style={th}>brecha dem-precio</th><th style={th}>aj. riesgo</th><th style={th}>grado inv.</th><th style={th}>presión absor.</th><th style={th}>estado</th></tr></thead>
            <tbody>
              {(d.zonas || []).map((z) => (
                <tr key={z.zona}>
                  <td style={td}>{z.nombre || z.zona}</td>
                  <td style={{ ...td, fontWeight: 700, color: 'var(--theme)' }}>{z.indice_oportunidad_real ?? '—'}</td>
                  <td style={{ ...td, color: (z.brecha_demanda_precio_pct || 0) > 0 ? '#22c55e' : '#dc2626' }}>{z.brecha_demanda_precio_pct != null ? `${z.brecha_demanda_precio_pct > 0 ? '+' : ''}${z.brecha_demanda_precio_pct}%` : '—'}</td>
                  <td style={td}>{z.demanda_ajustada_riesgo ?? '—'}</td>
                  <td style={td}>{z.demanda_grado_inversion ?? '—'}</td>
                  <td style={td}>{z.presion_absorcion ?? '—'}</td>
                  <td style={{ ...td, color: z.estado_mercado === 'hambrienta' ? '#22c55e' : z.estado_mercado === 'agotándose' ? '#f59e0b' : '#888' }}>{z.estado_mercado || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* LAS 100 COMPUESTAS */}
      {tab === 'compuestas' && d && !d.error && (
        <Compuestas100 data={d} />
      )}
    </SuperadminLayout>
  );
}

function AttrCard({ title, dict, extra }) {
  const entries = Object.entries(dict || {});
  const mx = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <Card style={card}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>
      {entries.length === 0 && <span style={{ color: '#666', fontSize: 12 }}>—</span>}
      {entries.slice(0, 6).map(([k, v]) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '2px 0' }}>
          <span style={{ width: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span>
          <span style={{ flex: 1, height: 9, background: 'var(--theme)', opacity: 0.7, width: `${(v / mx) * 100}%`, borderRadius: 2 }} />
          <strong>{v}</strong>
        </div>
      ))}
      {extra && <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>{extra}</div>}
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
