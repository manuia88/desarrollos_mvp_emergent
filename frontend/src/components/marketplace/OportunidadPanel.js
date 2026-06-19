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
const m = (n) => `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;

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
  const crecePct = (inv && inv.plusvalia_anual_pct != null) ? inv.plusvalia_anual_pct : (mom != null ? mom : null);

  const card = { background: '#fff', border: '1px solid rgba(16,18,28,0.06)', borderRadius: 22, boxShadow: '0 12px 36px rgba(99,102,241,0.12), 0 2px 8px rgba(16,18,28,0.05)' };
  const grad = { background: 'linear-gradient(90deg,#6D4AFF,#C026D3)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };
  const eyebrow = { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 800, ...grad };
  const sep = { marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(16,18,28,0.08)' };

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
            </div>
          )}

          {/* 2 · DATOS DE VALOR — claros, sin jerga (el detalle vive en /zona/:slug) */}
          <div style={sep}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {/* PARA VIVIR — lo que te CUESTA (concreto, no scores) */}
              <div style={{ padding: '13px 14px', borderRadius: 14, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.13)' }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: 'var(--cream)' }}>🏡 {tc('Para vivir')}</div>
                {(inv && (inv.precio_min > 0 || inv.renta_mensual_neta > 0)) ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 9 }}>
                    {inv.precio_min > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>
                        <span>Comprar un depto</span><b style={{ color: 'var(--cream)', fontSize: 14, whiteSpace: 'nowrap' }}>desde ~{m(inv.precio_min)}</b>
                      </div>
                    )}
                    {inv.renta_mensual_neta > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>
                        <span>O rentar uno</span><b style={{ color: 'var(--cream)', whiteSpace: 'nowrap' }}>~${inv.renta_mensual_neta.toLocaleString('es-MX')}/mes</b>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 6 }}>Calculando precios…</div>
                )}
              </div>
              {/* PARA INVERTIR */}
              <div style={{ padding: '13px 14px', borderRadius: 14, background: 'rgba(22,199,132,0.05)', border: '1px solid rgba(22,199,132,0.14)' }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: 'var(--cream)' }}>📈 {tc('Para invertir')}</div>
                {(crecePct != null || (inv && (inv.renta_mensual_neta || inv.ganancia_5y_abs))) ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 9 }}>
                    {crecePct != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>
                        <span>Sube de precio cada año</span><b style={{ color: '#0E9F6E', fontSize: 14, whiteSpace: 'nowrap' }}>~{crecePct}%</b>
                      </div>
                    )}
                    {inv && inv.renta_mensual_neta > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>
                        <span>Si lo rentas, ganas al mes</span><b style={{ color: 'var(--cream)', whiteSpace: 'nowrap' }}>~${inv.renta_mensual_neta.toLocaleString('es-MX')}</b>
                      </div>
                    )}
                    {inv && inv.ganancia_5y_abs > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>
                        <span>En 5 años podrías ganar</span><b style={{ color: '#0E9F6E', fontSize: 14, whiteSpace: 'nowrap' }}>~{m(inv.ganancia_5y_abs)}</b>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 6 }}>Calculando rendimiento…</div>
                )}
                <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', marginTop: 9 }}>estimado de la zona</div>
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
todo el detalle: precios, rentas, crédito y cuánto va a subir
          </div>
        </div>
      )}
    </div>
  );
}
