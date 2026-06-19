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
const k = (n) => `$${Math.round(n / 1000)}k`;
const m = (n) => `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;

export default function OportunidadPanel({ developments = [], colonias = [], selectedColoniaId, onPerfilar, budget = 0 }) {
  const [zoneId, setZoneId] = useState(selectedColoniaId || (colonias[0] && colonias[0].id));
  useEffect(() => { if (selectedColoniaId) setZoneId(selectedColoniaId); }, [selectedColoniaId]);
  const zone = colonias.find((c) => c.id === zoneId) || colonias[0] || null;

  const m2Vals = colonias.map((c) => c.price_m2_num).filter(Boolean);
  const cdmxM2 = m2Vals.length ? Math.round(m2Vals.reduce((a, b) => a + b, 0) / m2Vals.length) : null;
  const zoneM2 = zone && zone.price_m2_num;
  const vsCdmx = (zoneM2 && cdmxM2) ? Math.round(((zoneM2 - cdmxM2) / cdmxM2) * 100) : null;
  const devsZona = zone ? developments.filter((d) => d.colonia_id === zone.id || d.colonia === zone.name).length : 0;
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
    if (alto && buen) return { e: '🟢', l: 'Para vivir', r: 'Zona premium estable: precio alto, pero plusvalía sólida y alta calidad. Ideal para vivir, no para especular.' };
    if (sube && !alto) return { e: '🟢', l: 'Para invertir', r: `En alza (+${mom}% plusvalía) con precio aún accesible — buen momento de entrada.` };
    if (barato) return { e: '🟡', l: 'Oportunidad', r: 'Precio por debajo de su nivel: oportunidad si la zona te convence.' };
    if (overall != null && !buen) return { e: '🟡', l: 'Económica', r: 'Precio accesible; revisa bien los scores de la zona antes de decidir.' };
    return { e: '🟢', l: 'Equilibrada', r: 'Relación precio/calidad balanceada para la zona.' };
  })();

  // ── 2) PODER DE COMPRA ──
  const budgetN = Number(budget) || 0;
  const m2Here = (budgetN && zoneM2) ? Math.round(budgetN / zoneM2) : null;
  const alts = colonias
    .filter((c) => zone && c.id !== zone.id && c.price_m2_num && developments.some((d) => d.colonia_id === c.id))
    .map((c) => ({ name: c.name, m2: budgetN ? Math.round(budgetN / c.price_m2_num) : null, pm2: c.price_m2_num }))
    .filter((c) => c.m2 && c.m2 > (m2Here || 0))
    .sort((a, b) => b.m2 - a.m2).slice(0, 2);

  // ── 3) EL PULSO ──
  const [pulso, setPulso] = useState(null);
  useEffect(() => {
    if (!zone?.id) { setPulso(null); return; }
    let alive = true;
    fetch(`${API}/api/zona/${zone.id}/pulso`).then((r) => r.json()).then((d) => { if (alive) setPulso(d); }).catch(() => {});
    return () => { alive = false; };
  }, [zone?.id]);
  // ── 4) INVERSIÓN (motor real) ── precios + renta anual + ROI + TIR + veredicto
  const [inv, setInv] = useState(null);
  useEffect(() => {
    if (!zone?.id) { setInv(null); return; }
    let alive = true;
    fetch(`${API}/api/zona/${zone.id}/inversion`).then((r) => r.json()).then((d) => { if (alive) setInv(d); }).catch(() => {});
    return () => { alive = false; };
  }, [zone?.id]);
  const VER_INV = { excelente: { e: '🟢', c: '14,159,110' }, buena: { e: '🟢', c: '22,199,132' }, moderada: { e: '🟡', c: '224,163,62' }, baja: { e: '🔴', c: '220,38,38' } };
  const rentaAirbnb = inv && inv.renta_mensual ? Math.round(inv.renta_mensual * 1.6) : null;

  const card = { background: '#fff', border: '1px solid rgba(16,18,28,0.06)', borderRadius: 22, boxShadow: '0 12px 36px rgba(99,102,241,0.12), 0 2px 8px rgba(16,18,28,0.05)' };
  const grad = { background: 'linear-gradient(90deg,#6D4AFF,#C026D3)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };
  const eyebrow = { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 800, ...grad };
  const sep = { marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(16,18,28,0.08)' };
  const Chip = ({ children, c = '99,102,241' }) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11.5, color: `rgb(${c})`, background: `rgba(${c},0.08)`, border: `1px solid rgba(${c},0.2)`, borderRadius: 9999, padding: '3px 10px' }}>{children}</span>
  );
  const Row = ({ l, v, g, strong, top }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginTop: top ? 8 : 5, fontFamily: 'DM Sans', fontSize: strong ? 12.5 : 12, color: 'var(--cream-2)' }}>
      <span>{l}</span>
      <span style={{ fontWeight: strong ? 800 : 700, color: g ? '#0E9F6E' : 'var(--cream)', whiteSpace: 'nowrap' }}>{v}</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        .opp-card{transition:transform .24s cubic-bezier(.2,.8,.2,1),box-shadow .24s ease}
        .opp-card:hover{transform:translateY(-3px);box-shadow:0 22px 50px rgba(99,102,241,.18),0 3px 10px rgba(16,18,28,.06)}
        .opp-cta:hover{transform:translateY(-2px);box-shadow:0 14px 32px rgba(124,92,255,.5)}
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
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                {zoneM2 != null && <Chip c="99,102,241">{k(zoneM2)}/m²{vsCdmx != null ? ` · ${vsCdmx >= 0 ? '+' : ''}${vsCdmx}% vs CDMX` : ''}</Chip>}
                {mom != null && <Chip c={mom > 0 ? '22,199,132' : '120,92,255'}>{mom >= 0 ? '+' : ''}{mom}% plusvalía</Chip>}
                {overall != null && <Chip c="192,38,211">{overall}/100 calidad</Chip>}
              </div>
            </div>
          )}

          {/* 2 · PODER DE COMPRA */}
          <div style={sep}>
            <div style={eyebrow}>{tc('Tu poder de compra')}</div>
            {budgetN > 0 && zoneM2 ? (
              <>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', marginTop: 6 }}>
                  con <b style={{ color: 'var(--cream)' }}>{m(budgetN)}</b> aquí alcanzas
                </div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 30, letterSpacing: '-0.03em', lineHeight: 1, marginTop: 2,
                  background: 'linear-gradient(120deg,#1E2230 20%,#6D4AFF 140%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>~{m2Here} m²</div>
                {alts.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)' }}>con lo mismo, en otras zonas alcanzas más:</div>
                    {alts.map((a) => (
                      <div key={a.name} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)' }}>
                        <span>{a.name}</span><span><b style={{ color: '#0E9F6E' }}>~{a.m2} m²</b> · {k(a.pm2)}/m²</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 6, lineHeight: 1.5 }}>
                Dinos tu presupuesto (con <b style={{ color: 'var(--theme)' }}>Empezar mi búsqueda</b>) y te decimos cuántos m² te alcanzan aquí vs otras zonas.
              </div>
            )}
          </div>

          {/* 4 · PRECIOS (venta + renta) */}
          {inv && inv.precio_prom && (
            <div style={sep}>
              <div style={eyebrow}>{tc('Precios de venta')}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {[['mínimo', inv.precio_min], ['promedio', inv.precio_prom], ['máximo', inv.precio_max]].map(([lbl, val]) => (
                  <div key={lbl} style={{ flex: 1, textAlign: 'center', padding: '9px 5px', borderRadius: 12, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.14)' }}>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: 'var(--cream)', letterSpacing: '-0.02em' }}>{m(val)}</div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', marginTop: 2 }}>{lbl}</div>
                  </div>
                ))}
              </div>
              {inv.precio_m2 && <Row l="Precio por m²" v={`$${Math.round(inv.precio_m2 / 1000)}k/m²`} top />}
            </div>
          )}

          {/* 5 · ¿BUENA INVERSIÓN? — retornos + ganancias + exit + crédito (motor real) */}
          {inv && inv.veredicto_inversion && (
            <div style={sep}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={eyebrow}>{tc('¿Buena inversión?')}</div>
                <Chip c={(VER_INV[inv.veredicto_inversion] || {}).c || '99,102,241'}>{(VER_INV[inv.veredicto_inversion] || {}).e} {inv.veredicto_inversion}</Chip>
              </div>
              {/* Retornos anuales (3 métricas) */}
              <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
                {[[inv.roi_rentas_anual_pct, 'ROI rentas/año', '22,199,132', '#0E9F6E'], [inv.tir_anual_pct, 'TIR anual', '124,92,255', '#7C5CFF'], [inv.plusvalia_anual_pct, 'plusvalía/año', '192,38,211', '#C026D3']].map(([val, lbl, bg, fg]) => val == null ? null : (
                  <div key={lbl} style={{ flex: 1, padding: '9px 6px', borderRadius: 12, background: `rgba(${bg},0.07)`, border: `1px solid rgba(${bg},0.18)` }}>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: fg, letterSpacing: '-0.02em' }}>{val}%</div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 9, color: 'var(--cream-3)', marginTop: 3 }}>{lbl}</div>
                  </div>
                ))}
              </div>
              {/* Ganancias en $ */}
              <div style={{ marginTop: 10 }}>
                {inv.plusvalia_anual_abs && <Row l="💸 Ganas/año en plusvalía" v={`~${m(inv.plusvalia_anual_abs)}`} g />}
                {inv.renta_anual && <Row l="💰 Ganas/año en renta" v={`~${m(inv.renta_anual)}`} g />}
                {inv.ganancia_5y_abs && <Row l={`📈 A 5 años si vendes`} v={`~${m(inv.ganancia_5y_abs)} (+${inv.ganancia_5y_pct}%)`} g strong />}
                {inv.exit_year && <Row l="🎯 Exit recomendado" v={`año ${inv.exit_year}`} />}
              </div>
              {/* Renta mensual */}
              <div style={{ marginTop: 9, paddingTop: 9, borderTop: '1px dashed rgba(16,18,28,0.08)' }}>
                {inv.renta_mensual_neta && <Row l="🏠 Renta larga (neta/mes)" v={`$${inv.renta_mensual_neta.toLocaleString('es-MX')}`} />}
                {rentaAirbnb && <Row l="🔑 Airbnb (corto/mes)" v={`~$${rentaAirbnb.toLocaleString('es-MX')}`} />}
              </div>
              {/* Crédito */}
              {inv.tasa_credito && (
                <div style={{ marginTop: 9, paddingTop: 9, borderTop: '1px dashed rgba(16,18,28,0.08)' }}>
                  <Row l="🏦 Tasa de crédito" v={`${inv.tasa_credito.baja}–${inv.tasa_credito.alta}% (prom ${inv.tasa_credito.promedio}%)`} />
                  {inv.mensualidad_credito_80 > 0 && <Row l="Mensualidad (80% crédito)" v={`$${inv.mensualidad_credito_80.toLocaleString('es-MX')}/mes`} />}
                  {inv.enganche_20 > 0 && <Row l="Enganche (20%)" v={`${m(inv.enganche_20)}`} />}
                </div>
              )}
              <div style={{ fontFamily: 'DM Sans', fontSize: 9, color: 'var(--cream-3)', marginTop: 9 }}>estimado · depto típico 80m² · motor DesarrollosMX</div>
            </div>
          )}

          {/* 3 · PULSO */}
          <div style={sep}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={eyebrow}>{tc('Pulso de la zona')}</div>
              {pulso && <Chip c={pulso.nivel === 'alta' ? '239,68,68' : pulso.nivel === 'media' ? '245,179,1' : '139,146,168'}>{pulso.nivel === 'alta' ? '🔥 alta' : pulso.nivel === 'media' ? 'media' : 'baja'} demanda</Chip>}
            </div>
            {pulso && (pulso.busquedas_7d > 0 ? (
              <div style={{ marginTop: 7 }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>
                  <b style={{ color: 'var(--cream)' }}>{pulso.busquedas_7d}</b> personas buscan aquí esta semana
                  {pulso.trend_pct ? <span style={{ color: pulso.trend_pct >= 0 ? '#0E9F6E' : '#DC2626', fontWeight: 700 }}> · {pulso.trend_pct >= 0 ? '↑' : '↓'}{Math.abs(pulso.trend_pct)}%</span> : ''}
                </div>
                {(pulso.rec_moda || pulso.precio_buscado_prom) && (
                  <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 4 }}>
                    lo más pedido: {pulso.rec_moda ? `${pulso.rec_moda} rec` : ''}{pulso.rec_moda && pulso.precio_buscado_prom ? ' · ' : ''}{pulso.precio_buscado_prom ? `~${m(pulso.precio_buscado_prom)}` : ''}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 6 }}>Aún sin búsquedas recientes en esta zona.</div>
            ))}
          </div>

          <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', marginTop: 16 }}>
            Inteligencia DesarrollosMX · {devsZona || 0} desarrollos{cdmxM2 ? ` · CDMX ${k(cdmxM2)}/m²` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
