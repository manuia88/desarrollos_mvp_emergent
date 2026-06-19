/**
 * OportunidadPanel — TERMINAL DE INTELIGENCIA DE ZONA (rebuild premium 2026-06-18, founder pidió: más impacto + más
 * data + mejor composición + acabado premium/glass). Mismo dato real, otra liga: dato gigante, gráfica grande, ranking
 * vs otras zonas, score general, glassmorphism + sombras finas. El dato se acopla a la zona buscada (lockedToSearch).
 */
import React, { useState, useEffect } from 'react';
import { tc } from '../../lib/titleCase';

export function applyOportunidadFilters(devs = [], { budgetMax, stages, onlyTrusted }) {
  return devs.filter((d) => {
    if (budgetMax && Number(d.price_from) > budgetMax) return false;
    if (stages?.length && !stages.includes(d.stage)) return false;
    if (onlyTrusted && !d.verified) return false;
    return true;
  });
}

const pNum = (s) => { const m = String(s ?? '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
const ordinal = (n) => `${n}º`;

export default function OportunidadPanel({ developments = [], colonias = [], selectedColoniaId, onPerfilar }) {
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

  // Ranking de plusvalía vs TODAS las zonas (densidad de inteligencia · Monopolio).
  const ranked = colonias.filter((c) => pNum(c.momentum) != null).sort((a, b) => pNum(b.momentum) - pNum(a.momentum));
  const rank = zone ? (ranked.findIndex((c) => c.id === zone.id) + 1) : 0;
  const rankTotal = ranked.length;
  // Score GENERAL de la zona (promedio de los reales).
  const scoreVals = ['seguridad', 'movilidad', 'comercio', 'educacion'].map((k) => sc[k]).filter((v) => v != null);
  const overall = scoreVals.length ? Math.round(scoreVals.reduce((a, b) => a + b, 0) / scoreVals.length) : null;
  const segmento = zoneM2 ? (zoneM2 >= 80000 ? 'Premium' : zoneM2 >= 45000 ? 'Alto' : 'Medio') : '—';

  // Blanco SÓLIDO y nítido (no vidrio — el vidrio sobre fondo claro se ve lavado). Premium = sombra fina en capas.
  const glass = {
    background: '#fff', border: '1px solid rgba(16,18,28,0.06)', borderRadius: 22,
    boxShadow: '0 12px 36px rgba(99,102,241,0.12), 0 2px 8px rgba(16,18,28,0.05)',
  };
  const grad = { background: 'linear-gradient(90deg,#6D4AFF,#C026D3)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };

  // Gráfica de ÁREA grande (full-width).
  const BigChart = ({ data, w = 296, hh = 64 }) => {
    if (!Array.isArray(data) || data.length < 2) return null;
    const min = Math.min(...data), max = Math.max(...data), rng = (max - min) || 1;
    const xy = data.map((v, i) => [(i / (data.length - 1)) * w, hh - 6 - ((v - min) / rng) * (hh - 16)]);
    const line = xy.map((p) => p.join(',')).join(' ');
    const up = data[data.length - 1] >= data[0];
    const col = up ? '#16C784' : '#7C5CFF';
    return (
      <svg viewBox={`0 0 ${w} ${hh}`} width="100%" height={hh} preserveAspectRatio="none" style={{ display: 'block' }}>
        <defs><linearGradient id="bigc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.32" /><stop offset="100%" stopColor={col} stopOpacity="0" />
        </linearGradient></defs>
        <polygon points={`0,${hh} ${line} ${w},${hh}`} fill="url(#bigc)" />
        <polyline points={line} fill="none" stroke={col} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r={3.5} fill={col} stroke="#fff" strokeWidth={1.5} />
      </svg>
    );
  };

  const Metric = ({ big, label, tint, sub }) => (
    <div style={{ flex: 1, padding: '11px 9px', borderRadius: 14, background: `rgba(${tint},0.06)`, border: `1px solid rgba(${tint},0.16)` }}>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 19, color: `rgb(${tint})`, letterSpacing: '-0.02em', lineHeight: 1 }}>{big}</div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', marginTop: 1 }}>{sub}</div>}
    </div>
  );

  const ScoreBar = ({ label, v }) => (v == null ? null : (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 9 }}>
      <span style={{ width: 64, fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)' }}>{label}</span>
      <div style={{ flex: 1, height: 7, borderRadius: 9999, background: 'rgba(16,18,28,0.06)', overflow: 'hidden' }}>
        <div style={{ width: `${v}%`, height: '100%', borderRadius: 9999,
          background: v >= 80 ? 'linear-gradient(90deg,#16C784,#0E9F6E)' : v >= 60 ? 'linear-gradient(90deg,#7C5CFF,#A855F7)' : 'linear-gradient(90deg,#F5B301,#E0A33E)',
          boxShadow: `0 0 8px ${v >= 80 ? 'rgba(22,199,132,0.5)' : v >= 60 ? 'rgba(124,92,255,0.5)' : 'rgba(245,179,1,0.5)'}` }} />
      </div>
      <span style={{ width: 22, textAlign: 'right', fontFamily: 'Outfit', fontWeight: 800, fontSize: 12, color: 'var(--cream)' }}>{v}</span>
    </div>
  ));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        .opp-card { transition: transform .24s cubic-bezier(.2,.8,.2,1), box-shadow .24s ease; }
        .opp-card:hover { transform: translateY(-3px); box-shadow: 0 22px 50px rgba(99,102,241,0.18), 0 3px 10px rgba(16,18,28,0.06); }
        .opp-cta:hover { transform: translateY(-2px); box-shadow: 0 14px 32px rgba(124,92,255,0.5); }
      `}</style>

      {/* ── CTA — gradiente premium + glow ── */}
      <div className="opp-card" style={{ padding: 22, borderRadius: 22, position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(150deg,#6D4AFF 0%,#8B5CF6 45%,#C026D3 100%)', boxShadow: '0 14px 36px rgba(124,92,255,0.34)' }}>
        <div style={{ position: 'absolute', top: -50, right: -34, width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,0.16)', filter: 'blur(10px)' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ fontFamily: 'Outfit', fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.025em' }}>{tc('Encuentra TU lugar')}</div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(255,255,255,0.92)', marginTop: 6, marginBottom: 16, lineHeight: 1.5 }}>
            Dinos qué buscas y te decimos cuáles te convienen de verdad — con tu presupuesto, crédito, plazo y zona.
          </div>
          <button type="button" data-testid="panel-perfilar" onClick={() => onPerfilar?.()} className="opp-cta"
            style={{ width: '100%', padding: '13px', borderRadius: 14, border: 'none', background: '#fff', color: '#6D28D9', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 14.5, boxShadow: '0 6px 18px rgba(0,0,0,0.12)', transition: 'transform .18s ease, box-shadow .18s ease' }}>
            ✨ Empezar mi búsqueda
          </button>
        </div>
      </div>

      {/* ── TERMINAL DE ZONA (glass) ── */}
      {zone && (
        <div className="opp-card" data-testid="zona-datos" style={{ ...glass, padding: 20 }}>
          {/* Encabezado */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 800, ...grad }}>
                {tc(lockedToSearch ? 'Datos de tu zona' : 'Explora una zona')}
              </div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)', marginTop: 3, letterSpacing: '-0.025em' }}>{zone.name}</div>
            </div>
            {!lockedToSearch && colonias.length > 1 && (
              <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} data-testid="zona-select"
                style={{ maxWidth: 140, padding: '6px 9px', borderRadius: 10, border: '1px solid rgba(99,102,241,0.25)', background: 'rgba(99,102,241,0.06)', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--theme)', fontWeight: 600, cursor: 'pointer' }}>
                {colonias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>

          {/* Precio/m² GIGANTE + vs CDMX (semáforo) */}
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 38, letterSpacing: '-0.04em', lineHeight: 0.95,
              background: 'linear-gradient(120deg,#1E2230 20%,#6D4AFF 140%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              ${zoneM2 ? Number(zoneM2).toLocaleString('es-MX') : '—'}<span style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'var(--cream-3)', WebkitTextFillColor: 'var(--cream-3)' }}>/m²</span>
            </div>
            {vsCdmx != null && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11.5,
                color: vsCdmx < 0 ? '#0E9F6E' : '#C026D3', background: vsCdmx < 0 ? 'rgba(22,199,132,0.10)' : 'rgba(192,38,211,0.08)',
                border: `1px solid ${vsCdmx < 0 ? 'rgba(22,199,132,0.3)' : 'rgba(192,38,211,0.25)'}`, borderRadius: 9999, padding: '4px 10px' }}>
                {vsCdmx >= 0 ? `+${vsCdmx}%` : `${vsCdmx}%`} vs CDMX
              </span>
            )}
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 3 }}>precio promedio · {segmento}</div>

          {/* Gráfica grande */}
          {Array.isArray(zone.trend) && zone.trend.length > 1 && (
            <div style={{ marginTop: 14 }}>
              <BigChart data={zone.trend} />
              <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', marginTop: 2 }}>tendencia · últimos 24 meses</div>
            </div>
          )}

          {/* Grid de inteligencia: plusvalía · ranking · desarrollos */}
          <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
            <Metric big={mom != null ? `${mom >= 0 ? '+' : ''}${mom}%` : '—'} label="plusvalía 12m" tint={mom > 0 ? '22,199,132' : '99,102,241'} />
            {rank > 0 && <Metric big={ordinal(rank)} label="en plusvalía" tint="124,92,255" sub={`de ${rankTotal} zonas`} />}
            <Metric big={devsZona || zone.inventory || '—'} label="desarrollos" tint="192,38,211" />
          </div>

          {/* Calidad de la zona — score general + barras */}
          {overall != null && (
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(16,18,28,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 800, ...grad }}>{tc('Calidad de la zona')}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                  <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: overall >= 80 ? '#0E9F6E' : overall >= 60 ? 'var(--theme)' : '#E0A33E', letterSpacing: '-0.02em' }}>{overall}</span>
                  <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>/100</span>
                </div>
              </div>
              <div style={{ marginTop: 6 }}>
                <ScoreBar label="Seguridad" v={sc.seguridad} />
                <ScoreBar label="Movilidad" v={sc.movilidad} />
                <ScoreBar label="Comercio" v={sc.comercio} />
                <ScoreBar label="Educación" v={sc.educacion} />
              </div>
            </div>
          )}

          <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', marginTop: 16 }}>
            Inteligencia DesarrollosMX{cdmxM2 ? ` · CDMX $${Number(cdmxM2).toLocaleString('es-MX')}/m²` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
