/**
 * DesarrollosPanorama (Dev-Master · Fase 2) — home global del portal: concentrado de TODO el catálogo
 * con máxima granularidad (9 áreas) y filtros transversales. Consume /devmaster/home.
 */
import React, { useEffect, useState } from 'react';
import { Building2, DollarSign, Users, ShoppingBag, TrendingUp, Layers, MapPin, ShieldAlert, Compass } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;
const mxn = (n) => (Number(n) ? `$${(Number(n) / 1e6).toFixed(1)}M` : '—');
const cap = (s) => s ? String(s).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : s;
const dim = { color: 'var(--sa-text-dim)' };
const mute = { color: 'var(--sa-text-mute)' };
const card = { background: 'var(--bg-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16 };

function Kpi({ icon: Icon, label, value, sub }) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <Icon size={14} style={{ color: 'var(--theme)' }} />
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', ...mute }}>{label}</span>
      </div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--sa-text)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, marginTop: 4, ...dim }}>{sub}</div>}
    </div>
  );
}
function Panel({ icon: Icon, title, sub, children, accent }) {
  return (
    <div style={{ ...card, ...(accent ? { borderColor: 'rgba(var(--theme-rgb),0.4)' } : {}) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: sub ? 2 : 12 }}>
        {Icon && <Icon size={15} style={{ color: 'var(--theme)' }} />}
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14.5, color: 'var(--sa-text)', margin: 0 }}>{title}</h3>
      </div>
      {sub && <div style={{ fontSize: 11, ...mute, marginBottom: 12 }}>{sub}</div>}
      {children}
    </div>
  );
}
function Bar({ label, value, max, right }) {
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: 'var(--sa-text)' }}>{label}</span><span style={dim}>{right}</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${max ? Math.round(value / max * 100) : 0}%`, background: 'var(--theme)', borderRadius: 999 }} />
      </div>
    </div>
  );
}

export default function DesarrollosPanorama({ filters, onFacetas }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    const qs = new URLSearchParams(Object.entries(filters || {}).filter(([, v]) => v)).toString();
    fetch(`${API}/api/superadmin/devmaster/home${qs ? `?${qs}` : ''}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('error')))
      .then(r => { if (alive) { setD(r); if (onFacetas) onFacetas(r.facetas); } })
      .catch(e => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [filters, onFacetas]);

  if (err) return <div style={{ color: '#FCA5A5' }}>No se pudo cargar el panorama.</div>;
  if (!d) return <div style={mute}>Cargando panorama…</div>;
  const r = d.resumen;
  const maxEtapa = Math.max(...(d.oferta.por_etapa || []).map(e => e.n), 1);
  const maxDev = Math.max(...(d.oferta.concentracion_devs || []).map(x => x.n_proyectos), 1);
  const maxZ = Math.max(...(d.zonas || []).map(z => z.leads), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        <Kpi icon={Building2} label="Desarrollos" value={r.desarrollos} sub={`${r.devs} devs`} />
        <Kpi icon={Layers} label="Unidades" value={r.unidades} />
        <Kpi icon={DollarSign} label="Ticket promedio" value={mxn(r.ticket_promedio)} />
        <Kpi icon={TrendingUp} label="Ficha completa" value={`${r.readiness_promedio}%`} sub={`${r.publicados} publicados`} />
        <Kpi icon={ShoppingBag} label="Leads (demanda)" value={r.leads} sub={r.leads_cotizador ? `${r.leads_cotizador} cotizando` : 'real'} />
      </div>

      {/* Oportunidad ⭐ — dónde construir */}
      {(d.oportunidad || []).length > 0 && (
        <Panel icon={Compass} title="⭐ Dónde construir (demanda vs oferta)" sub="Zonas con alta demanda y poco inventario = oportunidad." accent>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
            {d.oportunidad.map((o, i) => (
              <div key={i} style={{ background: 'var(--bg-card-2)', border: '1px solid var(--sa-border)', borderRadius: 10, padding: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--sa-text)' }}>{o.zona}</div>
                <div style={{ fontSize: 11.5, ...dim, marginTop: 3 }}>{o.leads} buscando · {o.units} unidades</div>
                <div style={{ fontSize: 11, color: 'var(--theme)', fontWeight: 700, marginTop: 3 }}>índice {o.score}</div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 }}>
        {/* Precios */}
        <Panel icon={DollarSign} title="Precios">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[['Promedio', r.ticket_promedio], ['Mediana', d.precios.mediana], ['P25 (barato)', d.precios.p25], ['P75 (caro)', d.precios.p75]].map(([l, v], i) => (
              <div key={i}><div style={{ fontSize: 10.5, ...mute }}>{l}</div><div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--sa-text)' }}>{mxn(v)}</div></div>
            ))}
          </div>
          {d.precios.plusvalia_promedio != null && <div style={{ marginTop: 10, fontSize: 12, ...dim }}>Plusvalía promedio: <b style={{ color: '#34D399' }}>+{d.precios.plusvalia_promedio}%</b></div>}
        </Panel>

        {/* Oferta por etapa */}
        <Panel icon={Layers} title="Inventario por etapa">
          {(d.oferta.por_etapa || []).map((e, i) => <Bar key={i} label={cap(e.etapa)} value={e.n} max={maxEtapa} right={`${e.n}`} />)}
        </Panel>

        {/* Concentración de devs */}
        <Panel icon={Users} title="Concentración de devs" sub="Quién tiene más inventario.">
          {(d.oferta.concentracion_devs || []).map((x, i) => <Bar key={i} label={x.dev} value={x.n_proyectos} max={maxDev} right={`${x.n_proyectos} · ${x.pct}%`} />)}
        </Panel>

        {/* Canales */}
        <Panel icon={Users} title="Canales: In-house vs Brokers">
          {['inhouse', 'broker'].map(k => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--sa-border)' }}>
              <span style={{ fontSize: 12.5, color: 'var(--sa-text)' }}>{k === 'inhouse' ? '🏠 In-house' : '🤝 Brokers'}</span>
              <span style={{ fontSize: 12, ...dim }}>{d.canales[k].leads} leads · {d.canales[k].conversion}% conv</span>
            </div>
          ))}
        </Panel>

        {/* Demanda: qué piden */}
        <Panel icon={ShoppingBag} title="Lo que piden los compradores" sub="Planes elegidos en el cotizador público.">
          {(d.demanda.top_planes || []).length ? d.demanda.top_planes.map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--sa-border)' }}>
              <span style={{ fontSize: 12.5, color: 'var(--sa-text)' }}>{p.plan}</span><span style={dim}>{p.veces}</span>
            </div>
          )) : <div style={{ fontSize: 12, ...dim }}>Se llena cuando los compradores usen el cotizador.</div>}
        </Panel>

        {/* Riesgo */}
        <Panel icon={ShieldAlert} title="Riesgo y control">
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--sa-border)' }}>
            <span style={{ fontSize: 12.5, ...dim }}>Con documentos legales</span><span style={{ fontSize: 12.5, fontWeight: 700, color: d.riesgo.con_docs_legales_pct < 30 ? '#F2635B' : 'var(--sa-text)' }}>{d.riesgo.con_docs_legales_pct}%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0' }}>
            <span style={{ fontSize: 12.5, ...dim }}>Fichas bajo 50%</span><span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)' }}>{d.riesgo.baja_readiness}</span>
          </div>
        </Panel>
      </div>

      {/* Zonas */}
      <Panel icon={MapPin} title="Por zona">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ textAlign: 'left', ...mute, fontSize: 11, textTransform: 'uppercase' }}>
              <th style={{ padding: '5px 8px' }}>Zona</th><th style={{ padding: '5px 8px' }}>Proyectos</th><th style={{ padding: '5px 8px' }}>Unidades</th><th style={{ padding: '5px 8px' }}>Precio prom</th><th style={{ padding: '5px 8px' }}>Demanda</th>
            </tr></thead>
            <tbody>
              {(d.zonas || []).map((z, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--sa-border)' }}>
                  <td style={{ padding: '7px 8px', color: 'var(--sa-text)', fontWeight: 600 }}>{z.zona}</td>
                  <td style={{ padding: '7px 8px', ...dim }}>{z.n_proyectos}</td>
                  <td style={{ padding: '7px 8px', ...dim }}>{z.units}</td>
                  <td style={{ padding: '7px 8px', ...dim }}>{mxn(z.precio_prom)}</td>
                  <td style={{ padding: '7px 8px', color: z.leads ? 'var(--theme)' : 'var(--sa-text-mute)', fontWeight: z.leads ? 700 : 400 }}>{z.leads || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
