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

  // ── 4) INVERSIÓN (motor real) ── alimenta la línea resumen "para invertir"
  const [inv, setInv] = useState(null);
  useEffect(() => {
    if (!zone?.id) { setInv(null); return; }
    let alive = true;
    fetch(`${API}/api/zona/${zone.id}/inversion`).then((r) => r.json()).then((d) => { if (alive) setInv(d); }).catch(() => {});
    return () => { alive = false; };
  }, [zone?.id]);
  // Resúmenes de valor — el detalle completo vive en /zona/:slug
  const _cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const vivirLine = overall == null ? 'Calidad de vida en evaluación.'
    : overall >= 85 ? 'Top para vivir: entorno, servicios y seguridad de primer nivel.'
      : overall >= 70 ? 'Muy buena para vivir: buena calidad de vida y servicios cerca.'
        : overall >= 55 ? 'Correcta para vivir: equilibrio entre precio y calidad.'
          : 'En desarrollo: precio de entrada accesible, entorno mejorando.';
  const invertirLine = (inv && inv.veredicto_inversion)
    ? `${_cap(inv.veredicto_inversion)} para invertir: rentabilidad ~${inv.roi_rentas_anual_pct}%/año + plusvalía ${inv.plusvalia_anual_pct}%/año${inv.tir_anual_pct ? ` · TIR ${inv.tir_anual_pct}%` : ''}.`
    : (mom != null ? `Plusvalía ~${mom}%/año en la zona.` : 'Abre el análisis para ROI, TIR y renta estimada.');

  const card = { background: '#fff', border: '1px solid rgba(16,18,28,0.06)', borderRadius: 22, boxShadow: '0 12px 36px rgba(99,102,241,0.12), 0 2px 8px rgba(16,18,28,0.05)' };
  const grad = { background: 'linear-gradient(90deg,#6D4AFF,#C026D3)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };
  const eyebrow = { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 800, ...grad };
  const sep = { marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(16,18,28,0.08)' };
  const Chip = ({ children, c = '99,102,241' }) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11.5, color: `rgb(${c})`, background: `rgba(${c},0.08)`, border: `1px solid rgba(${c},0.2)`, borderRadius: 9999, padding: '3px 10px' }}>{children}</span>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        .opp-card{transition:transform .24s cubic-bezier(.2,.8,.2,1),box-shadow .24s ease}
        .opp-card:hover{transform:translateY(-3px);box-shadow:0 22px 50px rgba(99,102,241,.18),0 3px 10px rgba(16,18,28,.06)}
        .opp-cta:hover{transform:translateY(-2px);box-shadow:0 14px 32px rgba(124,92,255,.5)}
        .opp-zona-link:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(124,92,255,.45)}
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

          {/* 4 · PARA VIVIR / PARA INVERTIR (resumen — el detalle vive en /zona/:slug) */}
          <div style={sep}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ padding: '11px 12px', borderRadius: 13, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.13)' }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 12.5, color: 'var(--cream)' }}>🏡 {tc('Para vivir')}</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)', marginTop: 4, lineHeight: 1.45 }}>{vivirLine}</div>
              </div>
              <div style={{ padding: '11px 12px', borderRadius: 13, background: 'rgba(22,199,132,0.05)', border: '1px solid rgba(22,199,132,0.14)' }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 12.5, color: 'var(--cream)' }}>📈 {tc('Para invertir')}</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)', marginTop: 4, lineHeight: 1.45 }}>{invertirLine}</div>
              </div>
            </div>
          </div>

          {/* 5 · CTA → ANÁLISIS COMPLETO DE LA ZONA */}
          <a href={`/zona/${zone.id}`} className="opp-zona-link"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 16, padding: '13px 15px', borderRadius: 14, textDecoration: 'none',
              background: 'linear-gradient(135deg,#6D4AFF,#C026D3)', boxShadow: '0 8px 22px rgba(124,92,255,0.32)', transition: 'transform .18s, box-shadow .18s' }}>
            <span style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13, color: '#fff', lineHeight: 1.3 }}>Ver análisis completo de {zone.name}</span>
            <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: '#fff' }}>→</span>
          </a>
          <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', marginTop: 9, textAlign: 'center' }}>
            precios, ROI, TIR, renta, crédito y forecast completos
          </div>
        </div>
      )}
    </div>
  );
}
