// Qué Frena Tus Ventas (Inteligencia · Bloque 1.3) — baja el lente "Comportamiento" del Dev-Master
// scope-ado a los leads de ESTE dev: objeciones (con contra-argumento) + velocidad-respuesta-vs-cierre
// + embudo + DISC. Reusa el MISMO motor del superadmin. Consume /api/desarrollador/comportamiento.
import React, { useEffect, useState } from 'react';
import { getDevComportamiento } from '../../api/developer';
import { Sparkle, Activity } from '../icons';

const SEV = { alta: 'var(--hot, #F2635B)', media: 'var(--warm, #E2982E)', baja: 'var(--cream-3)' };
const card = { background: 'var(--surface, #fff)', border: '1px solid var(--border-2, var(--border))', borderRadius: 14, padding: 16, boxShadow: 'var(--asr-shadow, none)' };
const eyebrow = { fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--theme, #6D4AFF)', marginBottom: 12 };

function Panel({ title, sub, children, accent }) {
  return (
    <div style={{ ...card, ...(accent ? { borderColor: 'rgba(109,74,255,0.4)' } : {}) }}>
      <div style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 800, fontSize: 14.5, color: 'var(--cream)' }}>{title}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--cream-3)', margin: '2px 0 12px' }}>{sub}</div>}
      {!sub && <div style={{ height: 12 }} />}
      {children}
    </div>
  );
}

export default function DevComportamiento() {
  const [d, setD] = useState(null);
  useEffect(() => { getDevComportamiento().then(setD).catch(() => setD(false)); }, []);
  if (d === null) return <div style={{ padding: 40, color: 'var(--cream-3)', fontSize: 13 }}>Leyendo el comportamiento de tus compradores…</div>;
  if (!d) return <div style={{ padding: 40, color: 'var(--hot)', fontSize: 13 }}>No se pudo cargar.</div>;

  const m = d.maduracion || {};
  const maxFunnel = Math.max(...(m.embudo || []).map(e => e.n), 1);
  const maxWin = Math.max(...(m.respuesta_vs_cierre || []).map(b => b.win_rate), 1);

  return (
    <div data-testid="dev-comportamiento" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Titular */}
      <div style={{ ...card, borderColor: 'rgba(109,74,255,0.4)', background: 'linear-gradient(150deg, rgba(109,74,255,0.07), transparent)' }}>
        <div style={{ ...eyebrow, marginBottom: 7, display: 'flex', alignItems: 'center', gap: 6 }}><Sparkle size={11} /> Qué Frena Tus Ventas</div>
        <p data-testid="dc-resumen" style={{ margin: 0, fontFamily: 'Outfit,sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--cream)', lineHeight: 1.45 }}>{d.resumen}</p>
        <div style={{ fontSize: 11.5, color: 'var(--cream-3)', marginTop: 8 }}>Sobre tus {d.fuente?.leads || 0} leads. {d.fuente?.nota}</div>
      </div>

      {/* Acciones */}
      {(d.acciones || []).length > 0 && (
        <Panel title="Qué Hacer con Esto" accent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(d.acciones || []).map((a, i) => (
              <div key={i} data-testid="dc-accion" style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--theme)', fontWeight: 800 }}>{i + 1}.</span>{a.texto}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Objeciones */}
      <Panel title="Objeciones que Más Frenan" sub="Lo que detiene la compra — con el contra-argumento para cada una.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(d.objeciones || []).map((o, i) => (
            <div key={i} data-testid="dc-objecion" style={{ background: 'var(--surface-2, rgba(var(--cream-rgb),0.03))', border: '1px solid var(--border-2, var(--border))', borderRadius: 12, padding: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: SEV[o.severidad] || SEV.baja }} />
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--cream)' }}>{o.label}</span>
                </span>
                <span style={{ fontSize: 12, color: 'var(--cream-3)' }}>{o.n} leads · <b style={{ color: SEV[o.severidad] }}>{o.pct}%</b>{o.perdidos ? ` · ${o.perdidos} perdidos` : ''}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.5, marginTop: 8, paddingLeft: 16 }}>
                <span style={{ color: 'var(--theme)', fontWeight: 700 }}>Contra: </span>{o.rebuttal}
              </div>
            </div>
          ))}
        </div>
        {(d.objeciones_pendientes || []).length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border, rgba(var(--cream-rgb),0.08))' }}>
            <div style={{ fontSize: 11, color: 'var(--cream-3)', marginBottom: 6 }}>Se detectan automáticamente cuando entren conversaciones del comprador:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {(d.objeciones_pendientes || []).map((p, i) => (
                <span key={i} style={{ fontSize: 11, padding: '4px 9px', borderRadius: 999, background: 'rgba(var(--cream-rgb),0.04)', border: '1px dashed var(--border-2, var(--border))', color: 'var(--cream-3)' }}>{p.label}</span>
              ))}
            </div>
          </div>
        )}
      </Panel>

      {/* Grid: velocidad + embudo + DISC */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
        {/* Velocidad de respuesta vs cierre */}
        <Panel title="Qué Tan Rápido Contestas vs si Cierras" sub="El cierre cambia muchísimo con la velocidad de respuesta.">
          {(m.respuesta_vs_cierre || []).map((b, i) => (
            <div key={i} style={{ marginBottom: 11 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: 'var(--cream)' }}>{b.rango}</span>
                <span style={{ color: 'var(--cream-3)' }}>{b.cierres}/{b.leads} · <b style={{ color: b.win_rate >= maxWin ? 'var(--ok, #1FA06A)' : 'var(--cream)' }}>{b.win_rate}% cierre</b></span>
              </div>
              <div style={{ height: 7, borderRadius: 999, background: 'rgba(var(--cream-rgb),0.08)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(b.win_rate / maxWin * 100)}%`, background: b.win_rate >= maxWin ? 'var(--ok, #1FA06A)' : 'var(--theme, #6D4AFF)', borderRadius: 999 }} />
              </div>
            </div>
          ))}
        </Panel>

        {/* Embudo */}
        <Panel title="Embudo del Comprador" sub={`Cierre típico en ${m.dias_cierre ?? '—'} días · ${m.interacciones_promedio ?? '—'} toques en promedio.`}>
          {(m.embudo || []).map((e, i) => (
            <div key={i} style={{ marginBottom: 9 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: 'var(--cream)' }}>{e.etapa}</span><span style={{ color: 'var(--cream-3)' }}>{e.n}</span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: 'rgba(var(--cream-rgb),0.08)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(e.n / maxFunnel * 100)}%`, background: e.key === 'perdido' ? 'var(--hot, #F2635B)' : (e.key === 'vendido' ? 'var(--ok, #1FA06A)' : 'var(--theme, #6D4AFF)'), borderRadius: 999 }} />
              </div>
            </div>
          ))}
        </Panel>

        {/* DISC / cómo decide */}
        <Panel title="Cómo Decide Tu Comprador" sub="Perfil de personalidad (DISC) — se infiere de las conversaciones.">
          {(d.disc?.distribucion || []).length > 0 ? (
            (d.disc.distribucion).map((p, i) => (
              <div key={i} style={{ padding: '7px 0', borderTop: i ? '1px solid var(--border, rgba(var(--cream-rgb),0.08))' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span style={{ color: 'var(--cream)', fontWeight: 600 }}>{p.label}</span><span style={{ color: 'var(--cream-3)' }}>{p.pct}%</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--cream-3)', marginTop: 2 }}>{p.como_venderle}</div>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 12, color: 'var(--cream-3)', lineHeight: 1.5 }}>
              Aún no hay perfil. El DISC (cómo decide cada comprador) se infiere de sus conversaciones — conéctalas para activarlo. <Activity size={12} style={{ verticalAlign: 'middle', opacity: 0.6 }} />
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
