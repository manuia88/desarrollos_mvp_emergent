/**
 * SeccionDinero — MÓDULO "TU DINERO" UNIFICADO (de cero). UNA sola entrada de contexto (unidad elegida + enganche + plazo)
 * que alimenta TODO. Reusa los motores reales por unidad:
 *   · ownership  /api/public/ownership/{id}?price&m2&enganche_pct&years  → mensualidad, renta comparable, rentar-vs-comprar, TCO
 *   · mortgage   POST /api/public/mortgage/calculate                     → crédito multi-banco + "¿califico?"
 *   · plan dev   dev.config.formas_pago (firma/mensualidades/escritura)  → plan de preventa, calculado por unidad
 * Capas: ① Contexto compartido · ② Respuesta de un vistazo · ③ Detalle (la vía elegida). Sistema visual único.
 */
import React, { useState, useEffect } from 'react';
import { Card, Stat, SERIF, SANS, HEAD } from './ui';

const API = process.env.REACT_APP_BACKEND_URL;
const money = (n) => (n != null && !isNaN(n) ? `$${Math.round(n).toLocaleString('es-MX')}` : '—');
const monthsBetween = (a, b) => {
  const pa = String(a || '').match(/(\d{4})-(\d{2})/), pb = String(b || '').match(/(\d{4})-(\d{2})/);
  if (!pa || !pb) return 0;
  return Math.max(0, (+pb[1] - +pa[1]) * 12 + (+pb[2] - +pa[2]));
};

const TABS = [
  ['rentobuy', '¿Rento o compro?'],
  ['credito', 'Con crédito'],
  ['plan', 'Plan del desarrollador'],
  ['inversion', 'Como inversión'],
];

export default function SeccionDinero({ dev, unit }) {
  const cfg = dev.config || {};
  const base = unit
    ? { price: unit.price, m2: unit.m2_total || unit.m2_privative || 80, label: `Unidad ${unit.unit_number}` }
    : { price: dev.price_from, m2: (dev.m2_range || [])[0] || 80, label: 'Precio desde' };

  const [eng, setEng] = useState(20);     // enganche %
  const [years, setYears] = useState(20); // plazo crédito
  const [tab, setTab] = useState('rentobuy');
  const [own, setOwn] = useState(null);
  const [ownLoading, setOwnLoading] = useState(true);
  const [ingreso, setIngreso] = useState('');   // "¿califico?"
  const [mort, setMort] = useState(null);
  const [mortLoading, setMortLoading] = useState(false);

  // ① contexto → ownership (debounced, por unidad)
  useEffect(() => {
    let alive = true; setOwnLoading(true);
    const t = setTimeout(() => {
      fetch(`${API}/api/public/ownership/${dev.id}?price=${base.price}&m2=${base.m2}&enganche_pct=${(eng / 100).toFixed(2)}&years=${years}`)
        .then((r) => r.json()).then((d) => { if (alive) { setOwn(d); setOwnLoading(false); } })
        .catch(() => { if (alive) setOwnLoading(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [dev.id, base.price, base.m2, eng, years]);

  // crédito multi-banco (lazy: al abrir la pestaña o cambiar ingreso/enganche/plazo)
  useEffect(() => {
    if (tab !== 'credito') return undefined;
    let alive = true; setMortLoading(true);
    const t = setTimeout(() => {
      fetch(`${API}/api/public/mortgage/calculate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ precio: base.price, enganche_pct: eng / 100, plazo_anos: years, ingreso_mensual: Number(ingreso) || 60000, edad: 35 }),
      }).then((r) => r.json()).then((d) => { if (alive) { setMort(d); setMortLoading(false); } })
        .catch(() => { if (alive) setMortLoading(false); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [tab, base.price, eng, years, ingreso]);

  const s = own && own.supuestos, rb = own && own.rent_vs_buy, tco = own && own.tco;
  const enganche = base.price * eng / 100;
  const mensual = s && s.pago_mensual;
  const renta = rb && rb.renta_mensual_estimada;

  // plan del dev por unidad (de config.formas_pago)
  const planMonths = monthsBetween(cfg.fecha_inicio, cfg.fecha_entrega);
  const planes = (Array.isArray(cfg.formas_pago) ? cfg.formas_pago : []).map((p) => {
    const precio = base.price * (1 - (p.descuento_pct || 0) / 100);
    const firma = precio * (p.firma_pct || 0) / 100;
    const mensTotal = precio * (p.mensualidades_pct || 0) / 100;
    return { ...p, precio, firma, mensTotal, mensual: planMonths > 0 ? mensTotal / planMonths : 0, escritura: precio * (p.escritura_pct || 0) / 100 };
  });

  const Th = ({ children, right }) => <th style={{ textAlign: right ? 'right' : 'left', padding: '8px 12px', fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{children}</th>;
  const Td = ({ children, right, strong }) => <td style={{ textAlign: right ? 'right' : 'left', padding: '11px 12px', fontFamily: strong ? HEAD : SANS, fontSize: strong ? 15 : 13.5, fontWeight: strong ? 800 : 500, color: 'var(--cream)', whiteSpace: 'nowrap' }}>{children}</td>;

  return (
    <Card>
      {/* ① CONTEXTO COMPARTIDO */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingBottom: 18, borderBottom: '1px solid var(--card-border, var(--border))' }}>
        <div>
          <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: unit ? 'var(--theme)' : 'var(--cream-3)' }}>{unit ? '✓ Calculando con tu unidad' : 'Calculando con'}</div>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 20, color: 'var(--cream)', marginTop: 2 }}>{base.label} · {money(base.price)}</div>
          {!unit && <div style={{ fontFamily: SANS, fontSize: 12, color: 'var(--cream-3)', marginTop: 2 }}>Elige una unidad arriba para tu número exacto.</div>}
        </div>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 160 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: SANS, fontSize: 12, fontWeight: 700, color: 'var(--cream-2)', marginBottom: 4 }}><span>Enganche</span><span style={{ color: 'var(--theme)' }}>{eng}%</span></div>
            <input type="range" min={10} max={40} step={5} value={eng} onChange={(e) => setEng(+e.target.value)} style={{ width: '100%', accentColor: 'var(--theme)' }} />
          </div>
          <div>
            <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: 'var(--cream-2)', marginBottom: 6 }}>Plazo</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[15, 20, 25].map((y) => (
                <button key={y} onClick={() => setYears(y)} style={{ padding: '6px 12px', borderRadius: 9, border: `1px solid ${years === y ? 'var(--theme)' : 'var(--card-border, var(--border))'}`, background: years === y ? 'rgba(99,102,241,0.08)' : 'transparent', color: years === y ? 'var(--theme)' : 'var(--cream-2)', fontFamily: HEAD, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>{y} años</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ② RESPUESTA DE UN VISTAZO */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 'clamp(14px,2vw,28px)', padding: '20px 0', opacity: ownLoading ? 0.5 : 1, transition: 'opacity .2s' }}>
        <Stat value={money(enganche)} label={`Enganche (${eng}%)`} />
        <Stat value={mensual ? `${money(mensual)}` : '—'} label="Mensualidad del crédito" sub={s ? `tasa ${s.tasa_anual_pct}% · ${years} años` : null} accent="var(--theme)" />
        <Stat value={renta ? `${money(renta)}` : '—'} label="Rentar algo así" sub={rb && rb.renta_fuente === 'estimado' ? 'estimado de zona' : null} />
        <Stat value={cfg.plusvalia_desde_lanzamiento_pct != null ? `+${cfg.plusvalia_desde_lanzamiento_pct}%` : (rb ? `+${rb.plusvalia_anual_pct}%/año` : '—')} label="Plusvalía" accent="#059669" />
      </div>

      {/* ③ DETALLE — tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--card-border, var(--border))', margin: '4px 0 20px', overflowX: 'auto' }}>
        {TABS.map(([k, l]) => {
          const a = tab === k;
          return (
            <button key={k} onClick={() => setTab(k)} style={{ position: 'relative', padding: '11px 14px', background: 'transparent', border: 'none', color: a ? 'var(--cream)' : 'var(--cream-3)', fontFamily: HEAD, fontWeight: a ? 800 : 600, fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {l}{a && <span style={{ position: 'absolute', left: 8, right: 8, bottom: -1, height: 3, borderRadius: 3, background: 'var(--grad)' }} />}
            </button>
          );
        })}
      </div>

      {/* ── ¿Rento o compro? ── */}
      {tab === 'rentobuy' && (
        <div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 16 }}>
            <Stat value={renta ? `${money(renta)}/mes` : '—'} label="Si rentas" />
            <Stat value={mensual ? `${money(mensual)}/mes` : '—'} label="Si compras (crédito)" accent="var(--theme)" />
          </div>
          {rb && (
            <p style={{ fontFamily: SANS, fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.6, margin: '0 0 14px', maxWidth: 680 }}>
              {rb.break_even_anio
                ? <>Comprar le gana a rentar a partir del <strong style={{ color: 'var(--cream)' }}>año {rb.break_even_anio}</strong>. A {rb.horizonte} años, comprando conservas <strong style={{ color: '#059669' }}>{money(rb.comprar_patrimonio)}</strong> de patrimonio.</>
                : <>A {rb.horizonte} años, rentar e invertir la diferencia rinde más en este caso (<strong>{money(rb.rentar_patrimonio)}</strong> vs <strong>{money(rb.comprar_patrimonio)}</strong> comprando). Comprar conviene si priorizas estabilidad y uso propio, no solo el número.</>}
            </p>
          )}
          {tco && Array.isArray(tco.desglose) && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Costo total de ser dueño · {tco.anios} años</div>
              {tco.desglose.map((it, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: i ? '1px solid var(--card-border, var(--border))' : 'none', fontFamily: SANS, fontSize: 13.5 }}>
                  <span style={{ color: 'var(--cream-2)' }}>{it.concepto}{it.nota ? <span style={{ color: 'var(--cream-3)', fontSize: 12 }}> · {it.nota}</span> : ''}</span>
                  <span style={{ color: 'var(--cream)', fontWeight: 700, whiteSpace: 'nowrap', marginLeft: 12 }}>{money(it.monto)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Con crédito (multi-banco + ¿califico?) ── */}
      {tab === 'credito' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: 'var(--cream-2)', marginBottom: 5 }}>Tu ingreso mensual <span style={{ color: 'var(--cream-3)', fontWeight: 400 }}>(para ver si calificas)</span></div>
              <input type="number" value={ingreso} onChange={(e) => setIngreso(e.target.value)} placeholder="$ 80,000" style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--card-border, var(--border))', background: 'var(--surface-card)', fontFamily: HEAD, fontSize: 15, color: 'var(--cream)', width: 160 }} />
            </div>
          </div>
          {mortLoading && <div style={{ fontFamily: SANS, color: 'var(--cream-3)', fontSize: 13 }}>Calculando bancos…</div>}
          {mort && Array.isArray(mort.banca) && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: '1px solid var(--card-border, var(--border))' }}><Th>Banco</Th><Th right>Mensualidad</Th><Th right>Tasa</Th><Th right>CAT</Th>{ingreso && <Th right>¿Calificas?</Th>}</tr></thead>
                <tbody>
                  {mort.banca.map((b, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--card-border, var(--border))' }}>
                      <Td strong>{b.banco}</Td>
                      <Td right>{money(b.pago_mensual)}</Td>
                      <Td right>{b.tasa_anual_pct}%</Td>
                      <Td right>{b.cat_pct}%</Td>
                      {ingreso && <td style={{ textAlign: 'right', padding: '11px 12px', fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: b.viable ? '#059669' : '#B45309', whiteSpace: 'nowrap' }}>{b.viable ? '✓ Sí' : 'Ajusta enganche'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-3)', marginTop: 10 }}>Referencial · no es oferta. Infonavit/Fovissste se pueden combinar con banca.</div>
            </div>
          )}
        </div>
      )}

      {/* ── Plan del desarrollador (preventa, por unidad) ── */}
      {tab === 'plan' && (
        <div>
          {planMonths > 0 && <div style={{ fontFamily: SANS, fontSize: 13, color: 'var(--cream-2)', marginBottom: 14 }}>Preventa de <strong style={{ color: 'var(--cream)' }}>{planMonths} meses</strong> (de {cfg.fecha_inicio} a {cfg.fecha_entrega}) — sin banco hasta la entrega.</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
            {planes.map((p, i) => (
              <div key={i} style={{ padding: 16, borderRadius: 14, border: `1px solid ${p.descuento_pct ? 'rgba(16,185,129,0.35)' : 'var(--card-border, var(--border))'}`, background: 'var(--surface-card)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>{p.nombre}</span>
                  {p.descuento_pct > 0 && <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: '#059669' }}>−{p.descuento_pct}%</span>}
                </div>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 20, color: 'var(--cream)', margin: '6px 0 10px' }}>{money(p.precio)}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-2)' }}>
                  <span>Apartado: <strong style={{ color: 'var(--cream)' }}>{money(p.apartado_mxn)}</strong></span>
                  <span>Firma ({p.firma_pct}%): <strong style={{ color: 'var(--cream)' }}>{money(p.firma)}</strong></span>
                  {p.mensualidades_pct > 0
                    ? <span>{p.mensualidades_pct}% en {planMonths} meses: <strong style={{ color: 'var(--theme)' }}>{money(p.mensual)}/mes</strong></span>
                    : <span style={{ color: 'var(--cream-3)' }}>Sin mensualidades</span>}
                  <span>Escritura ({p.escritura_pct}%): <strong style={{ color: 'var(--cream)' }}>{money(p.escritura)}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Como inversión ── */}
      {tab === 'inversion' && (
        <div>
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginBottom: 14 }}>
            <Stat value={renta && base.price ? `${(renta * 12 / base.price * 100).toFixed(1)}%` : '—'} label="Renta bruta anual (yield)" accent="#059669" />
            <Stat value={rb ? `+${rb.plusvalia_anual_pct}%/año` : '—'} label="Plusvalía estimada" />
            <Stat value={renta ? `${money(renta)}/mes` : '—'} label="Renta mensual estimada" />
          </div>
          <p style={{ fontFamily: SANS, fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.6, maxWidth: 660 }}>
            Retorno = renta ({renta && base.price ? `${(renta * 12 / base.price * 100).toFixed(1)}%` : '—'} anual) + plusvalía ({rb ? `${rb.plusvalia_anual_pct}%` : '—'}). Para TIR apalancada, escenarios y Monte Carlo, abre el análisis completo de inversión.
          </p>
          <button onClick={() => window.dispatchEvent(new CustomEvent('dmx:ask-atlax', { detail: { devId: dev.id, intent: 'inversion', unit: unit && unit.unit_number } }))} style={{ marginTop: 6, padding: '11px 18px', borderRadius: 11, border: '1px solid var(--card-border, var(--border))', background: 'transparent', color: 'var(--theme)', fontFamily: HEAD, fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>✨ Análisis de inversión completo</button>
        </div>
      )}
    </Card>
  );
}
