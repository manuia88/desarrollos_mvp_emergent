/**
 * CompetenciaRed (Dev-Master · Fase 3) — Competencia y Red (knowledge graph del mercado).
 * Mapa de relaciones: qué proyectos pelean por el mismo comprador (zona × banda), qué asesores/brokers
 * manejan qué proyectos (red + concentración), e inventario zombie. Consume /devmaster/competencia-red.
 * Integra dev (vs quién compite) + asesor (red de venta) + marketplace (compradores) + superadmin.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Swords, Network, Users, Ghost, Lightbulb, Crosshair, ArrowRight } from 'lucide-react';
import { fetchCompetenciaRed } from '../../api/superadminDevmaster';

const dim = { color: 'var(--sa-text-dim)' };
const mute = { color: 'var(--sa-text-mute)' };
const card = { background: 'var(--bg-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16 };
const RED = '#F2635B'; const AMBER = '#F5C451'; const GREEN = '#34D399';
const mm = (n) => (Number(n) ? `$${(Number(n) / 1e6).toFixed(1)}M` : '—');

function Panel({ icon: Icon, title, sub, children, accent, right }) {
  return (
    <div style={{ ...card, ...(accent ? { borderColor: 'rgba(var(--theme-rgb),0.4)' } : {}) }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: sub ? 2 : 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {Icon && <Icon size={15} style={{ color: 'var(--theme)' }} />}
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14.5, color: 'var(--sa-text)', margin: 0 }}>{title}</h3>
        </div>
        {right}
      </div>
      {sub && <div style={{ fontSize: 11, ...mute, marginBottom: 12 }}>{sub}</div>}
      {children}
    </div>
  );
}

export default function CompetenciaRed({ filters }) {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    setD(null); setErr(null);
    fetchCompetenciaRed(filters || {})
      .then(r => { if (alive) setD(r); })
      .catch(e => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [filters]);

  if (err) return <div style={{ color: '#FCA5A5' }}>No se pudo cargar competencia y red.</div>;
  if (!d) return <div style={mute}>Mapeando competencia y red del mercado…</div>;

  const maxProy = Math.max(...(d.celdas_disputadas || []).map(c => c.proyectos), 1);
  const maxLeads = Math.max(...(d.red_asesores || []).map(a => a.leads), 1);
  const split = d.canal_split || {};
  const splitTotal = (split.inhouse || 0) + (split.broker || 0) || 1;

  return (
    <div data-testid="competencia-red" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Titular */}
      <div style={{ ...card, borderColor: 'rgba(var(--theme-rgb),0.45)', background: 'linear-gradient(150deg, rgba(var(--theme-rgb),0.10), rgba(var(--theme-rgb),0.02))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <Network size={16} style={{ color: 'var(--theme)' }} />
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--sa-text)', margin: 0 }}>Competencia y Red</h3>
          <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'rgba(var(--theme-rgb),0.18)', color: 'var(--theme)' }}>El Mapa del Mercado</span>
          <span style={{ fontSize: 9.5, padding: '2px 7px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', color: d.grafo?.conectado ? GREEN : 'var(--sa-text-mute)', border: '1px solid var(--sa-border)' }}>
            {d.grafo?.conectado ? `Grafo Neo4j · ${d.grafo.nodos || 0} nodos` : 'Grafo en vivo'}
          </span>
        </div>
        <p data-testid="cr-resumen" style={{ fontSize: 14, color: 'var(--sa-text)', lineHeight: 1.55, margin: 0, fontWeight: 600 }}>{d.resumen}</p>
        <div style={{ fontSize: 11.5, ...mute, marginTop: 8 }}>{d.fuente?.nota}</div>
      </div>

      {/* Acciones agentic */}
      {(d.acciones || []).length > 0 && (
        <Panel icon={Lightbulb} title="Qué Hacer con Esto" accent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(d.acciones || []).map((a, i) => (
              <button key={i} data-testid="cr-accion" onClick={() => a.link && navigate(a.link)} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--sa-text-dim)', lineHeight: 1.5, background: 'transparent', border: 'none', textAlign: 'left', cursor: a.link ? 'pointer' : 'default', padding: 0 }}>
                <span style={{ color: 'var(--theme)', fontWeight: 800 }}>{i + 1}.</span>{a.texto}{a.link && <ArrowRight size={12} style={{ marginTop: 3, color: 'var(--theme)' }} />}
              </button>
            ))}
          </div>
        </Panel>
      )}

      {/* Celdas más disputadas */}
      <Panel icon={Crosshair} title="Dónde Está la Pelea" sub="Zona × banda de precio donde más proyectos compiten por el mismo comprador.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {(d.celdas_disputadas || []).map((c, i) => (
            <div key={i} data-testid="cr-celda" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 12.5, color: 'var(--sa-text)', minWidth: 200 }}>{c.zona} · {c.banda}</span>
              <div style={{ flex: 1, maxWidth: 180, height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(c.proyectos / maxProy * 100)}%`, background: c.proyectos >= 3 ? RED : AMBER, borderRadius: 999 }} />
              </div>
              <span style={{ fontSize: 11.5, ...dim, minWidth: 150, textAlign: 'right' }}>{c.proyectos} proyectos · {c.unidades} unid · {c.leads} leads</span>
            </div>
          ))}
          {(d.celdas_disputadas || []).length === 0 && <div style={{ fontSize: 12, ...mute }}>No hay zonas saturadas en el set actual.</div>}
        </div>
      </Panel>

      {/* Grid: quién compite + red de asesores + zombies */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 }}>
        {/* Quién compite con quién */}
        <Panel icon={Swords} title="Quién Compite con Quién" sub="Los rivales directos de cada proyecto (misma zona y precio).">
          {(d.competidores || []).slice(0, 6).map((c, i) => (
            <div key={i} style={{ padding: '8px 0', borderTop: i ? '1px solid var(--sa-border)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)' }}>{c.nombre}</span>
                <span style={{ fontSize: 11, ...mute }}>{c.zona} · {mm(c.precio)}</span>
              </div>
              <div style={{ fontSize: 11.5, ...dim, marginTop: 3 }}>vs {c.rivales.map(r => r.nombre).join(', ')}</div>
            </div>
          ))}
          {(d.competidores || []).length === 0 && <div style={{ fontSize: 12, ...mute }}>Sin competencia directa detectada.</div>}
        </Panel>

        {/* Red de asesores */}
        <Panel icon={Users} title="Red de Asesores" sub="Quién mueve los leads — y qué tan concentrado está."
          right={<span style={{ fontSize: 10.5, color: d.concentracion_top >= 30 ? AMBER : 'var(--sa-text-mute)' }}>Top: {d.concentracion_top}%</span>}>
          {/* split canal */}
          <div style={{ display: 'flex', height: 7, borderRadius: 999, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ width: `${(split.inhouse || 0) / splitTotal * 100}%`, background: 'var(--theme)' }} />
            <div style={{ width: `${(split.broker || 0) / splitTotal * 100}%`, background: AMBER }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, ...mute, marginBottom: 10 }}>
            <span>In-house {split.inhouse || 0}</span><span>Brokers {split.broker || 0}</span>
          </div>
          {(d.red_asesores || []).slice(0, 6).map((a, i) => (
            <div key={i} data-testid="cr-asesor" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderTop: '1px solid var(--sa-border)' }}>
              <div style={{ minWidth: 130 }}>
                <span style={{ fontSize: 12.5, color: 'var(--sa-text)' }}>{a.asesor}</span>
                <span style={{ fontSize: 9.5, marginLeft: 6, color: a.canal === 'broker' ? AMBER : 'var(--theme)' }}>{a.canal === 'broker' ? 'broker' : 'in-house'}</span>
              </div>
              <div style={{ flex: 1, maxWidth: 90, height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(a.leads / maxLeads * 100)}%`, background: 'var(--theme)', borderRadius: 999 }} />
              </div>
              <span style={{ fontSize: 11, ...dim, minWidth: 96, textAlign: 'right' }}>{a.leads} leads · {a.conversion}%</span>
            </div>
          ))}
        </Panel>

        {/* Inventario zombie */}
        <Panel icon={Ghost} title="Inventario Zombie" sub="Mucho stock y cero tracción — hay que reactivarlo.">
          {(d.zombies || []).length === 0 && <div style={{ fontSize: 12, ...mute }}>Sin inventario zombie. 👌</div>}
          {(d.zombies || []).map((z, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, padding: '6px 0', borderTop: i ? '1px solid var(--sa-border)' : 'none', cursor: 'pointer' }} onClick={() => navigate(`/superadmin/desarrollos/${z.project_id}`)}>
              <span style={{ color: 'var(--sa-text)' }}>{z.nombre} <span style={{ ...mute, fontSize: 10.5 }}>· {z.zona}</span></span>
              <span style={{ color: RED, fontWeight: 700 }}>{z.disponibles} libres · {z.sellthrough}%</span>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
