/**
 * OportunidadPanel — TERMINAL DE INTELIGENCIA DE ZONA (rebuild conceptual 2026-06-18, founder: "no pintes, repiensa
 * la info"). 3 capas de inteligencia que ningún portal da:
 *   1) EL VEREDICTO — conclusión sintetizada de la zona (no stats: una decisión).
 *   2) TU PODER DE COMPRA — qué te alcanza aquí vs otras zonas (personal + accionable).
 *   3) EL PULSO — demanda en vivo (marketplace_searches).
 * Blanco sólido nítido (el vidrio sobre claro se ve lavado). El dato se acopla a la zona buscada.
 */
import React, { useState, useEffect } from 'react';
import { tc } from '../../lib/titleCase';

const API = process.env.REACT_APP_BACKEND_URL;

export function applyOportunidadFilters(devs = [], { budgetMax, stages, onlyTrusted }) {
  return devs.filter((d) => {
    if (budgetMax && Number(d.price_from) > budgetMax) return false;
    if (stages?.length && !stages.includes(d.stage)) return false;
    if (onlyTrusted && !d.verified) return false;
    return true;
  });
}

const pNum = (s) => { const m = String(s ?? '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
const m1 = (n) => `$${(n / 1e6).toFixed(1)}M`;  // money con 1 decimal

export default function OportunidadPanel({ developments = [], colonias = [], selectedColoniaId, onPerfilar }) {
  const [zoneId, setZoneId] = useState(selectedColoniaId || (colonias[0] && colonias[0].id));
  useEffect(() => { if (selectedColoniaId) setZoneId(selectedColoniaId); }, [selectedColoniaId]);
  const zone = colonias.find((c) => c.id === zoneId) || colonias[0] || null;

  const m2Vals = colonias.map((c) => c.price_m2_num).filter(Boolean);
  const cdmxM2 = m2Vals.length ? Math.round(m2Vals.reduce((a, b) => a + b, 0) / m2Vals.length) : null;
  const zoneM2 = zone && zone.price_m2_num;
  const vsCdmx = (zoneM2 && cdmxM2) ? Math.round(((zoneM2 - cdmxM2) / cdmxM2) * 100) : null;
  const lockedToSearch = !!selectedColoniaId;
  const sc = (zone && zone.scores) || {};
  const mom = pNum(zone && zone.momentum);
  const scoreVals = ['seguridad', 'movilidad', 'comercio', 'educacion'].map((x) => sc[x]).filter((v) => v != null);
  const overall = scoreVals.length ? Math.round(scoreVals.reduce((a, b) => a + b, 0) / scoreVals.length) : null;

  // ── 1) EL VEREDICTO ──
  const veredicto = (() => {
    if (!zone || zoneM2 == null) return null;
    const alto = vsCdmx != null && vsCdmx > 12;
    const barato = vsCdmx != null && vsCdmx < -10;
    const sube = mom != null && mom >= 4;
    const buen = overall != null && overall >= 78;
    if (alto && buen) return { e: '🟢', l: 'Para vivir', r: 'Zona cara pero estable: sube de valor parejo y con gran calidad de vida. Ideal para vivir.' };
    if (sube && !alto) return { e: '🟢', l: 'Para invertir', r: `Sube de precio (~${mom}% al año) y todavía está accesible — buen momento para entrar.` };
    if (barato) return { e: '🟡', l: 'Oportunidad', r: 'Precio por debajo de lo normal para la zona: oportunidad si te convence.' };
    if (overall != null && !buen) return { e: '🟡', l: 'Económica', r: 'Precio accesible; revisa bien las calificaciones de la zona antes de decidir.' };
    return { e: '🟢', l: 'Equilibrada', r: 'Buen balance entre precio y calidad para la zona.' };
  })();

  // ── 4) INVERSIÓN (motor real) ── alimenta los datos claros "para invertir"
  const [inv, setInv] = useState(null);
  useEffect(() => {
    if (!zone?.id) { setInv(null); return; }
    let alive = true;
    fetch(`${API}/api/zona/${zone.id}/inversion`).then((r) => r.json()).then((d) => { if (alive) setInv(d); }).catch(() => {});
    return () => { alive = false; };
  }, [zone?.id]);
  // Dato de valor en lenguaje simple — el detalle completo vive en /zona/:slug
  // Veredicto de inversión + filas con glosa simple (el "upgrade": cada métrica de jerga lleva su explicación)
  const VER_INV = { excelente: { e: '🟢', c: '#0E9F6E' }, buena: { e: '🟢', c: '#16C784' }, moderada: { e: '🟡', c: '#E0A33E' }, baja: { e: '🔴', c: '#DC2626' } };
  const ver = (inv && inv.veredicto_inversion) ? (VER_INV[inv.veredicto_inversion] || VER_INV.moderada) : null;
  // Orden por flujo (de menos a más): renta → plusvalía → cap rate → ROI → TIR (la más completa)
  const INVEST_ROWS = inv ? [
    { l: 'Renta mensual', v: inv.renta_prom ? `$${inv.renta_prom.toLocaleString('es-MX')}` : null, c: 'var(--cream)',
      t: 'Lo que cobrarías al mes de renta (bruta, antes de gastos) para un depto al precio promedio de la zona.' },
    { l: 'Plusvalía anual', v: inv.plusvalia_anual_pct != null ? `${inv.plusvalia_anual_pct}%` : null, c: '#0E9F6E',
      t: `Cuánto sube de precio el inmueble cada año por el mercado (la demanda y el desarrollo de la zona), no porque alguien lo decida. Se estima con la tendencia de precios de la zona.${inv.plusvalia_anual_abs && inv.precio_prom ? ` Aquí: ~${inv.plusvalia_anual_pct}% = un depto de ${m1(inv.precio_prom)} sube ~$${Math.round(inv.plusvalia_anual_abs / 1000).toLocaleString('es-MX')}k al año.` : ''} No incluye las rentas.` },
    { l: 'Cap rate anual', v: inv.cap_rate_anual_pct != null ? `${inv.cap_rate_anual_pct}%` : null, c: '#C026D3',
      t: `Lo que rinde al año si lo compras de contado (sin crédito). Se calcula: renta de un año − gastos de operarlo (mantenimiento, predial, seguro, administración) = NOI; y luego NOI ÷ precio.${inv.renta_anual && inv.precio_prom ? ` Aquí: ~$${Math.round(inv.renta_anual / 1000).toLocaleString('es-MX')}k ÷ ${m1(inv.precio_prom)} = ${inv.cap_rate_anual_pct}%.` : ''} No resta el crédito ni impuestos, ni incluye la plusvalía.` },
    { l: 'ROI anual', v: inv.roi_anual_pct != null ? `${inv.roi_anual_pct}%` : null, c: '#0E9F6E',
      t: `Junta las dos formas de ganar: la renta (el cap rate, ${inv.cap_rate_anual_pct}%) + lo que sube de precio (la plusvalía, ${inv.plusvalia_anual_pct}%) = ${inv.roi_anual_pct}%. Ojo: la plusvalía solo la cobras si VENDES ese año; si no, es ganancia en papel. Si solo cuentas la renta, ese ${inv.cap_rate_anual_pct}% es justo el cap rate.` },
    { l: 'TIR anual', v: inv.tir_anual_pct != null ? `${inv.tir_anual_pct}%` : null, c: '#7C5CFF',
      t: `Lleva los mismos ingredientes que el ROI (las rentas + la venta). La diferencia es el TIEMPO: el ROI es la foto de UN año (cuenta simple); la TIR toma los 5 años completos —cuándo entra cada renta y cuándo vendes— y saca el % real por año, restándole valor al dinero que llega tarde (un peso en 5 años vale menos que hoy). Por eso la TIR (${inv.tir_anual_pct}%) sale más baja y más realista que el ROI (${inv.roi_anual_pct}%).` },
  ] : [];
  const kfmt = (n) => `$${Math.round(n / 1000).toLocaleString('es-MX')}k`;
  const cred = (inv && inv.credito) || null;

  const card = { background: '#fff', border: '1px solid rgba(16,18,28,0.06)', borderRadius: 22, boxShadow: '0 12px 36px rgba(99,102,241,0.12), 0 2px 8px rgba(16,18,28,0.05)' };
  const grad = { background: 'linear-gradient(90deg,#6D4AFF,#C026D3)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };
  const eyebrow = { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 800, ...grad };
  const sep = { marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(16,18,28,0.08)' };
  const secTitle = { fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: 'var(--cream)' };
  const cellStyle = { flex: 1, textAlign: 'center', padding: '9px 4px', borderRadius: 12, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.13)' };
  const cellNum = { fontFamily: 'Outfit', fontWeight: 800, fontSize: 12.5, color: 'var(--cream)', letterSpacing: '-0.02em' };
  const cellLbl = { fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', marginTop: 2 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        .opp-card{transition:transform .24s cubic-bezier(.2,.8,.2,1),box-shadow .24s ease}
        .opp-card:hover{transform:translateY(-3px);box-shadow:0 22px 50px rgba(99,102,241,.18),0 3px 10px rgba(16,18,28,.06)}
        .opp-cta:hover{transform:translateY(-2px);box-shadow:0 14px 32px rgba(124,92,255,.5)}
        .opp-zona-link:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(124,92,255,.45)}
        .opp-help{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;background:rgba(99,102,241,.12);color:#6D4AFF;font-size:9px;font-weight:800;margin-left:5px;vertical-align:middle}
        .opp-row:hover .opp-help{background:rgba(99,102,241,.22)}
        .opp-help-box{position:absolute;bottom:100%;left:0;margin-bottom:5px;width:100%;box-sizing:border-box;background:#1E2230;color:#fff;font-weight:500;font-size:10.5px;line-height:1.45;padding:9px 11px;border-radius:10px;box-shadow:0 12px 30px rgba(16,18,28,.32);opacity:0;visibility:hidden;transition:opacity .14s;z-index:60;text-transform:none;letter-spacing:0;text-align:left;pointer-events:none}
        .opp-row:hover .opp-help-box{opacity:1;visibility:visible}
      `}</style>

      {/* CTA */}
      <div className="opp-card" style={{ padding: 22, borderRadius: 22, position: 'relative', overflow: 'hidden', background: 'linear-gradient(150deg,#6D4AFF,#8B5CF6 45%,#C026D3)', boxShadow: '0 14px 36px rgba(124,92,255,0.34)' }}>
        <div style={{ position: 'absolute', top: -50, right: -34, width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,0.16)', filter: 'blur(10px)' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ fontFamily: 'Outfit', fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.025em' }}>{tc('Encuentra TU lugar')}</div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(255,255,255,0.92)', marginTop: 6, marginBottom: 16, lineHeight: 1.5 }}>
            Dinos qué buscas y te decimos cuáles te convienen de verdad — con tu presupuesto, crédito, plazo y zona.
          </div>
          <button type="button" data-testid="panel-perfilar" onClick={() => onPerfilar?.()} className="opp-cta"
            style={{ width: '100%', padding: '13px', borderRadius: 14, border: 'none', background: '#fff', color: '#6D28D9', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 14.5, boxShadow: '0 6px 18px rgba(0,0,0,0.12)', transition: 'transform .18s, box-shadow .18s' }}>
            ✨ Empezar mi búsqueda
          </button>
        </div>
      </div>

      {/* TERMINAL DE ZONA */}
      {zone && (
        <div className="opp-card" data-testid="zona-datos" style={{ ...card, padding: 20 }}>
          {/* Encabezado + selector */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div>
              <div style={eyebrow}>{tc(lockedToSearch ? 'Inteligencia de tu zona' : 'Explora una zona')}</div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 21, color: 'var(--cream)', marginTop: 3, letterSpacing: '-0.025em' }}>{zone.name}</div>
            </div>
            {!lockedToSearch && colonias.length > 1 && (
              <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} data-testid="zona-select"
                style={{ maxWidth: 138, padding: '6px 9px', borderRadius: 10, border: '1px solid rgba(99,102,241,0.25)', background: 'rgba(99,102,241,0.06)', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--theme)', fontWeight: 600, cursor: 'pointer' }}>
                {colonias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>

          {/* 1 · VEREDICTO */}
          {veredicto && (
            <div style={{ marginTop: 13 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: 'var(--cream)' }}>
                <span style={{ fontSize: 14 }}>{veredicto.e}</span> El veredicto: <span style={grad}>{veredicto.l}</span>
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', marginTop: 6, lineHeight: 1.5 }}>{veredicto.r}</div>
            </div>
          )}

          {/* PUENTE — conecta el veredicto con los datos de abajo */}
          {inv && inv.precio_prom && (
            <div style={{ ...sep, paddingBottom: 0, borderTopStyle: 'dashed' }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', lineHeight: 1.5 }}>
                Aquí abajo, los números que respaldan ese veredicto: <b style={{ color: 'var(--cream-2)' }}>cuánto cuesta</b>, <b style={{ color: 'var(--cream-2)' }}>cuánto renta</b>, <b style={{ color: 'var(--cream-2)' }}>qué tan buena inversión es</b> y <b style={{ color: 'var(--cream-2)' }}>cómo financiarla</b>. Pasa el mouse sobre cada concepto (?) para entenderlo.
              </div>
            </div>
          )}

          {inv && inv.precio_prom ? (
            <>
              {/* 2 · PARA VIVIR — precio de compra (menor/promedio/mayor) */}
              <div style={sep}>
                <div style={secTitle}>🏡 {tc('Para vivir')} <span style={{ fontWeight: 600, fontSize: 11, color: 'var(--cream-3)' }}>· {tc('comprar')}</span></div>
                <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
                  {[['menor', inv.precio_min], ['promedio', inv.precio_prom], ['mayor', inv.precio_max]].map(([lbl, val]) => (
                    <div key={lbl} style={cellStyle}><div style={cellNum}>{m1(val)}</div><div style={cellLbl}>{tc(lbl)}</div></div>
                  ))}
                </div>
              </div>

              {/* 3 · PARA RENTAR — renta mensual (menor/promedio/mayor) */}
              {inv.renta_prom > 0 && (
                <div style={sep}>
                  <div style={secTitle}>🔑 {tc('Para rentar')} <span style={{ fontWeight: 600, fontSize: 11, color: 'var(--cream-3)' }}>· {tc('al mes')}</span></div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
                    {[['menor', inv.renta_menor], ['promedio', inv.renta_prom], ['mayor', inv.renta_mayor]].map(([lbl, val]) => (
                      <div key={lbl} style={cellStyle}><div style={cellNum}>${(val || 0).toLocaleString('es-MX')}</div><div style={cellLbl}>{tc(lbl)}</div></div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4 · PARA INVERTIR — métricas con glosa simple (upgrade) */}
              <div style={sep}>
                <div className="opp-row" style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: ver ? 'help' : 'default' }}>
                  <div style={secTitle}>📈 {tc('Para invertir')}</div>
                  {ver && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11, color: ver.c, background: `${ver.c}14`, border: `1px solid ${ver.c}33`, borderRadius: 9999, padding: '3px 10px' }}>{ver.e} {tc(inv.veredicto_inversion)}<span className="opp-help" style={{ color: ver.c, background: `${ver.c}22` }}>?</span></span>}
                  {ver && <span className="opp-help-box" style={{ width: 230 }}>Qué tan buena inversión es, según el rendimiento anual (la TIR): excelente arriba de 12% · buena 8–12% · moderada 5–8% · baja menos de 5%. Aquí sale "{inv.veredicto_inversion}" porque la TIR es {inv.tir_anual_pct}%.</span>}
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 4 }}>
                  calculado sobre un depto al <b style={{ color: 'var(--cream-2)' }}>precio promedio (~{m1(inv.precio_prom)})</b>
                </div>
                <div style={{ marginTop: 6 }}>
                  {INVEST_ROWS.filter((r) => r.v != null).map((r) => (
                    <div key={r.l} className="opp-row" style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '9px 0', borderTop: '1px solid rgba(16,18,28,0.06)', cursor: 'help' }}>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>{tc(r.l)}<span className="opp-help">?</span></div>
                      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: r.c, whiteSpace: 'nowrap' }}>{r.v}</div>
                      <span className="opp-help-box">{r.t}</span>
                    </div>
                  ))}
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 9, color: 'var(--cream-3)', marginTop: 8 }}>estimado · depto típico de la zona · motor DesarrollosMX</div>
              </div>

              {/* 5 · CRÉDITO HIPOTECARIO — valor, plazo, tasa, pago/mes + TOTAL al final + disclaimer (CAT) */}
              {cred && cred.escenarios && (
                <div style={sep}>
                  <div className="opp-row" style={{ position: 'relative', cursor: 'help', display: 'inline-block' }}>
                    <div style={secTitle}>🏦 {tc('Crédito hipotecario')}<span className="opp-help">?</span></div>
                    <span className="opp-help-box" style={{ width: 230 }}>El "% a crédito" (aforo) es cuánto te presta el banco. Mientras más te presta, menos enganche pones pero más pagas en total. Calculado con la tasa, a {cred.plazo_anios} años.</span>
                  </div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 6, lineHeight: 1.45 }}>
                    sobre un inmueble de <b style={{ color: 'var(--cream-2)' }}>~{m1(cred.valor_inmueble)}</b> · a <b style={{ color: 'var(--cream-2)' }}>{cred.plazo_anios} años</b> · tasa prom {cred.tasa_prom_pct}%
                  </div>
                  {/* mini-tabla con encabezados que dicen qué es cada número */}
                  <div style={{ display: 'flex', fontFamily: 'DM Sans', fontSize: 8.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.03em', marginTop: 10, paddingBottom: 5, borderBottom: '1px solid rgba(16,18,28,0.1)' }}>
                    <span style={{ flex: '0 0 40px' }}>crédito</span>
                    <span style={{ flex: 1, textAlign: 'right' }}>te prestan</span>
                    <span style={{ flex: 1, textAlign: 'right' }}>al mes</span>
                    <span style={{ flex: 1, textAlign: 'right' }}>pagas en total</span>
                  </div>
                  {cred.escenarios.map((e) => (
                    <div key={e.aforo} style={{ display: 'flex', alignItems: 'baseline', fontFamily: 'DM Sans', fontSize: 11.5, padding: '7px 0', borderTop: '1px solid rgba(16,18,28,0.05)' }}>
                      <span style={{ flex: '0 0 40px', fontWeight: 800, color: 'var(--cream)' }}>{e.aforo}%</span>
                      <span style={{ flex: 1, textAlign: 'right', color: 'var(--cream-2)' }}>{m1(e.prestamo)}</span>
                      <span style={{ flex: 1, textAlign: 'right', color: 'var(--cream-2)' }}>{kfmt(e.pago)}</span>
                      <span style={{ flex: 1, textAlign: 'right', fontWeight: 800, color: '#C026D3' }}>{m1(e.total)}</span>
                    </div>
                  ))}
                  <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-2)', marginTop: 9, lineHeight: 1.5, background: 'rgba(99,102,241,0.05)', borderRadius: 10, padding: '9px 11px' }}>
                    Ejemplo 80%: el banco te presta <b>{m1(cred.escenarios[2].prestamo)}</b> y tú pones <b>{m1(cred.escenarios[2].enganche)}</b> de enganche. Pagas <b>{kfmt(cred.escenarios[2].pago)}/mes</b> por 20 años → al final le das al banco <b style={{ color: '#C026D3' }}>{m1(cred.escenarios[2].total)}</b> (el préstamo + intereses). El enganche NO se suma a ese total.
                  </div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', marginTop: 9, lineHeight: 1.45, fontStyle: 'italic' }}>
                    Solo informativo. Va con la tasa (el CAT real, con seguros y comisiones, es mayor). Tu pago final lo define el banco según tu perfil.
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={sep}><div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>Calculando datos de la zona…</div></div>
          )}

          {/* 5 · CTA → ¿QUIERES SABER MÁS? */}
          <div style={{ ...sep, textAlign: 'center' }}>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: 'var(--cream)', marginBottom: 10 }}>¿Quieres saber más?</div>
            <a href={`/zona/${zone.id}`} className="opp-zona-link"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 15px', borderRadius: 14, textDecoration: 'none',
                background: 'linear-gradient(135deg,#6D4AFF,#C026D3)', boxShadow: '0 8px 22px rgba(124,92,255,0.32)', transition: 'transform .18s, box-shadow .18s' }}>
              <span style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13, color: '#fff' }}>Ver análisis completo de {zone.name}</span>
              <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: '#fff' }}>→</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
