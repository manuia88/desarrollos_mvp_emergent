/**
 * SuperadminCatalogPulse (B3.2) — terminal global del catálogo.
 * Cruza TODOS los proyectos: qué tan listas están las fichas (readiness), qué tan completo está el
 * catálogo (cobertura de config del dev) y QUÉ PIDEN LOS COMPRADORES (demanda real del cotizador
 * público · B2). Integra dev + marketplace en la vista del corporativo. Consume /catalog-pulse.
 */
import React, { useEffect, useState } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { TrendingUp, CheckCircle2, Layers, ShoppingBag } from 'lucide-react';
import { fetchCatalogPulse } from '../../api/superadminCatalogPulse';

const mxn = (n) => (Number(n) ? Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }) : '—');
const card = { background: 'var(--bg-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 18 };
const dim = { color: 'var(--sa-text-dim)' };
const mute = { color: 'var(--sa-text-mute)' };

function Kpi({ icon: Icon, label, value, sub }) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icon size={15} style={{ color: 'var(--theme)' }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', ...mute }}>{label}</span>
      </div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 30, color: 'var(--sa-text)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, marginTop: 5, ...dim }}>{sub}</div>}
    </div>
  );
}

function CoverageBar({ label, pct, configurados }) {
  const low = pct < 34;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}>
        <span style={{ color: 'var(--sa-text)', fontWeight: 600 }}>{label}</span>
        <span style={{ ...dim }}>{pct}% · {configurados} proyectos</span>
      </div>
      <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 999, background: low ? '#F2635B' : 'var(--theme)', transition: 'width .3s' }} />
      </div>
    </div>
  );
}

export default function SuperadminCatalogPulse({ user, onLogout }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchCatalogPulse().then(r => { if (alive) setD(r); }).catch(e => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, []);

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--sa-text)', margin: 0, letterSpacing: '-0.02em' }}>Pulso del catálogo</h1>
        <p style={{ fontSize: 13, ...dim, margin: '4px 0 0' }}>Qué tan listo está todo tu catálogo y qué piden los compradores — en una sola vista.</p>
      </div>

      {err && <div style={{ ...card, color: '#FCA5A5' }}>No se pudo cargar: {err}</div>}
      {!d && !err && <div style={mute}>Cargando pulso del catálogo…</div>}

      {d && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
            <Kpi icon={Layers} label="Proyectos en el catálogo" value={d.total_proyectos} sub="seed + creados por devs" />
            <Kpi icon={TrendingUp} label="Ficha completa (promedio)" value={`${d.resumen.readiness_promedio}%`} sub="qué tan llenas están las fichas" />
            <Kpi icon={CheckCircle2} label="Listas para publicar" value={d.resumen.listas_para_publicar} sub="≥ 80% completas" />
            <Kpi icon={ShoppingBag} label="Compradores interesados" value={d.resumen.leads_con_interes} sub="eligieron un plan en el cotizador" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 18 }}>
            {/* Cobertura del catálogo */}
            <div style={card}>
              <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15.5, color: 'var(--sa-text)', margin: '0 0 4px' }}>Qué falta en el catálogo</h3>
              <p style={{ fontSize: 11.5, ...mute, margin: '0 0 16px' }}>% de proyectos con cada dato configurado (lo más vacío arriba).</p>
              {(d.cobertura || []).map(c => <CoverageBar key={c.key} label={c.label} pct={c.pct} configurados={c.configurados} />)}
            </div>

            {/* Demanda del comprador (cross-portal: marketplace → superadmin) */}
            <div style={card}>
              <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15.5, color: 'var(--sa-text)', margin: '0 0 4px' }}>Lo que más piden los compradores</h3>
              <p style={{ fontSize: 11.5, ...mute, margin: '0 0 14px' }}>Planes de pago que los compradores eligieron en el cotizador público.</p>
              {(d.demanda?.top_planes || []).length === 0 ? (
                <div style={{ fontSize: 12.5, ...dim }}>Aún no hay compradores que hayan elegido un plan. Se llena solo cuando usan el cotizador.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {d.demanda.top_planes.map((p, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 13px', borderRadius: 10, background: 'var(--bg-card-2)', border: '1px solid var(--sa-border)' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)' }}>{p.plan}</span>
                      <span style={{ fontSize: 12, ...dim }}>{p.veces} {p.veces === 1 ? 'interesado' : 'interesados'} · {mxn(p.precio_prom)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tabla por proyecto (ordenada por demanda) */}
          <div style={card}>
            <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15.5, color: 'var(--sa-text)', margin: '0 0 14px' }}>Proyecto por proyecto</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ textAlign: 'left', ...mute, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    <th style={{ padding: '6px 10px' }}>Proyecto</th>
                    <th style={{ padding: '6px 10px' }}>Ficha</th>
                    <th style={{ padding: '6px 10px' }}>Interesados</th>
                    <th style={{ padding: '6px 10px' }}>Le falta</th>
                  </tr>
                </thead>
                <tbody>
                  {(d.proyectos || []).map(p => (
                    <tr key={p.project_id} data-testid={`pulse-row-${p.project_id}`} style={{ borderTop: '1px solid var(--sa-border)' }}>
                      <td style={{ padding: '9px 10px' }}>
                        <div style={{ color: 'var(--sa-text)', fontWeight: 600 }}>{p.nombre || p.project_id}</div>
                        <div style={{ fontSize: 11, ...mute }}>{p.colonia || ''}</div>
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        <span style={{ fontWeight: 700, color: p.publishable ? '#34D399' : (p.readiness_pct < 50 ? '#F2635B' : 'var(--theme)') }}>{p.readiness_pct}%</span>
                      </td>
                      <td style={{ padding: '9px 10px', color: p.leads_interes ? 'var(--sa-text)' : 'var(--sa-text-mute)', fontWeight: p.leads_interes ? 700 : 400 }}>{p.leads_interes || '—'}</td>
                      <td style={{ padding: '9px 10px', ...dim }}>{(p.faltan || []).slice(0, 3).join(' · ') || '✓ completa'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </SuperadminLayout>
  );
}
