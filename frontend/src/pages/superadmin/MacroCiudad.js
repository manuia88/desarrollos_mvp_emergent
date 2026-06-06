/**
 * MacroCiudad (Dev-Master · Fase 3) — Macro + Ciudad: qué de la CIUDAD mueve el VALOR.
 * Cruza señales urbanas (transporte/negocios/seguridad/riesgo/educación) con el precio/m² y la demanda,
 * + tasa Banxico real → crédito, + gentrificación (zonas que se calientan) + riesgo de ciudad.
 * Consume /devmaster/macro-ciudad. Integra dato gov (Banxico/scores de zona) → decisión de dev/superadmin.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Landmark, Percent, Flame, ShieldCheck, MapPin, Lightbulb, ArrowUp, ArrowDown, ArrowRight } from 'lucide-react';
import { fetchMacroCiudad } from '../../api/superadminDevmaster';

const dim = { color: 'var(--sa-text-dim)' };
const mute = { color: 'var(--sa-text-mute)' };
const card = { background: 'var(--bg-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16 };
const GREEN = '#34D399'; const RED = '#F2635B'; const AMBER = '#F5C451';
const mm = (n) => (Number(n) ? `$${(Number(n) / 1e6).toFixed(1)}M` : '—');
const money = (n) => (Number(n) ? `$${Math.round(Number(n)).toLocaleString('es-MX')}` : '—');

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

export default function MacroCiudad({ filters }) {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    setD(null); setErr(null);
    fetchMacroCiudad(filters || {})
      .then(r => { if (alive) setD(r); })
      .catch(e => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [filters]);

  if (err) return <div style={{ color: '#FCA5A5' }}>No se pudo cargar macro y ciudad.</div>;
  if (!d) return <div style={mute}>Cruzando las señales de la ciudad con el valor…</div>;

  const c = d.credito || {};
  const maxMom = Math.max(...(d.zonas_calientan || []).map(z => z.momentum_pct), 1);

  return (
    <div data-testid="macro-ciudad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Titular */}
      <div style={{ ...card, borderColor: 'rgba(var(--theme-rgb),0.45)', background: 'linear-gradient(150deg, rgba(var(--theme-rgb),0.10), rgba(var(--theme-rgb),0.02))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Landmark size={16} style={{ color: 'var(--theme)' }} />
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--sa-text)', margin: 0 }}>Macro y Ciudad</h3>
          <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'rgba(var(--theme-rgb),0.18)', color: 'var(--theme)' }}>La Ciudad → el Valor</span>
        </div>
        <p data-testid="mc-resumen" style={{ fontSize: 14, color: 'var(--sa-text)', lineHeight: 1.55, margin: 0, fontWeight: 600 }}>{d.resumen}</p>
        <div style={{ fontSize: 11.5, ...mute, marginTop: 8 }}>{d.fuente?.nota}</div>
      </div>

      {/* Acciones agentic */}
      {(d.acciones || []).length > 0 && (
        <Panel icon={Lightbulb} title="Qué Hacer con Esto" accent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(d.acciones || []).map((a, i) => (
              <button key={i} data-testid="mc-accion" onClick={() => a.link && navigate(a.link)} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--sa-text-dim)', lineHeight: 1.5, background: 'transparent', border: 'none', textAlign: 'left', cursor: a.link ? 'pointer' : 'default', padding: 0 }}>
                <span style={{ color: 'var(--theme)', fontWeight: 800 }}>{i + 1}.</span>{a.texto}{a.link && <ArrowRight size={12} style={{ marginTop: 3, color: 'var(--theme)' }} />}
              </button>
            ))}
          </div>
        </Panel>
      )}

      {/* Qué mueve el valor */}
      <Panel icon={MapPin} title="Qué Mueve el Valor en CDMX" sub="Qué factor de la ciudad se asocia más con el precio por m². Verde sube el precio; rojo es relación inversa.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(d.drivers_valor || []).map((v, i) => {
            const col = v.direccion === 'sube' ? GREEN : (v.direccion === 'inverso' ? RED : 'var(--sa-text-mute)');
            const Arrow = v.direccion === 'sube' ? ArrowUp : (v.direccion === 'inverso' ? ArrowDown : null);
            return (
              <div key={i} data-testid="mc-driver" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderTop: i ? '1px solid var(--sa-border)' : 'none' }}>
                <div style={{ minWidth: 170 }}>
                  <div style={{ fontSize: 13, color: 'var(--sa-text)', fontWeight: 600 }}>{v.label}</div>
                  <div style={{ fontSize: 11, ...mute }}>{v.efecto}</div>
                </div>
                <div style={{ flex: 1, maxWidth: 160, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round(Math.abs(v.corr_precio) * 100)}%`, background: col, borderRadius: 999 }} />
                </div>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 700, color: col, minWidth: 64, justifyContent: 'flex-end' }}>
                  {Arrow && <Arrow size={13} />}{Math.abs(Math.round(v.corr_precio * 100))}%
                </span>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Grid: crédito + gentrificación + riesgo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(290px,1fr))', gap: 16 }}>
        {/* Tasa Banxico → crédito */}
        <Panel icon={Percent} title="Tasa Banxico y Crédito" sub="Cómo la tasa afecta la mensualidad del comprador.">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
            <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 30, color: 'var(--sa-text)' }}>{c.tasa != null ? `${c.tasa}%` : '—'}</span>
            <span style={{ fontSize: 12, color: c.tendencia === 'bajando' ? GREEN : (c.tendencia === 'subiendo' ? RED : 'var(--sa-text-mute)') }}>{c.tendencia || ''}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={mute}>Depto de referencia</span><span style={{ color: 'var(--sa-text)' }}>{mm(c.ticket_referencia)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={mute}>Mensualidad estimada</span><span style={{ color: 'var(--sa-text)', fontWeight: 700 }}>{money(c.pago_mensual)}</span></div>
            {c.ahorro_si_baja_1pt ? (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={mute}>Si la tasa baja 1 punto</span><span style={{ color: GREEN, fontWeight: 700 }}>−{money(c.ahorro_si_baja_1pt)}/mes</span></div>
            ) : null}
          </div>
          <div style={{ fontSize: 10.5, ...mute, marginTop: 9, fontStyle: 'italic' }}>{c.fuente === 'banxico_series' ? 'Tasa real de Banxico.' : 'Tasa estimada — se conecta a Banxico.'} Crédito a 20 años, 80% del valor.</div>
        </Panel>

        {/* Zonas que se calientan */}
        <Panel icon={Flame} title="Zonas que se Están Calentando" sub="Mayor momentum = se aprecian más rápido (entrar temprano).">
          {(d.zonas_calientan || []).slice(0, 6).map((z, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                <span style={{ color: 'var(--sa-text)' }}>{z.zona} {z.proyectos_nuestros === 0 && <span style={{ fontSize: 9.5, color: AMBER }}>· sin proyectos tuyos</span>}</span>
                <span style={{ color: GREEN, fontWeight: 700 }}>+{z.momentum_pct}%</span>
              </div>
              <div style={{ height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(z.momentum_pct / maxMom * 100)}%`, background: GREEN, borderRadius: 999 }} />
              </div>
            </div>
          ))}
        </Panel>

        {/* Riesgo de ciudad */}
        <Panel icon={ShieldCheck} title="Riesgo de Ciudad" sub="Perfil de riesgo sísmico/climático. Menor score = más riesgoso.">
          {(d.riesgo_ciudad || []).slice(0, 7).map((z, i) => {
            const col = z.riesgo_score >= 80 ? GREEN : (z.riesgo_score >= 65 ? AMBER : RED);
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, padding: '5px 0', borderTop: i ? '1px solid var(--sa-border)' : 'none' }}>
                <span style={{ color: 'var(--sa-text)' }}>{z.zona}{z.proyectos_nuestros ? <span style={{ ...mute, fontSize: 10.5 }}> · {z.proyectos_nuestros} tuyo(s)</span> : ''}</span>
                <span style={{ color: col, fontWeight: 700 }}>{z.riesgo_score}</span>
              </div>
            );
          })}
        </Panel>
      </div>

      {/* Perfil de nuestras zonas */}
      {(d.perfil_zonas || []).length > 0 && (
        <Panel icon={MapPin} title="Perfil de tus Zonas" sub="Cómo califica la ciudad donde tienes proyectos.">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--sa-text-mute)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  <th style={{ padding: '6px 8px 6px 0' }}>Zona</th><th>Proyectos</th><th>Leads</th><th>$/m²</th><th>Momentum</th><th>Movilidad</th><th>Comercio</th><th>Seguridad</th>
                </tr>
              </thead>
              <tbody>
                {(d.perfil_zonas || []).map((z, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--sa-border)', color: 'var(--sa-text)' }}>
                    <td style={{ padding: '7px 8px 7px 0', fontWeight: 600 }}>{z.zona}</td>
                    <td>{z.proyectos}</td><td>{z.leads}</td><td>${(z.price_m2 / 1000).toFixed(0)}k</td>
                    <td style={{ color: GREEN }}>{z.momentum}</td>
                    <td>{z.scores?.movilidad}</td><td>{z.scores?.comercio}</td><td>{z.scores?.seguridad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
