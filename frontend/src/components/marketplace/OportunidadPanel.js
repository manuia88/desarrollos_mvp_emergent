/**
 * OportunidadPanel — menú izquierdo de DATOS DE ZONA, estilo Monopolio++ (rebuild visual 2026-06-18, founder).
 * Mismo dato (precio/m² + tendencia + plusvalía + scores reales), nueva cara: claro + vivo, profundidad, glow, color
 * dopamínico. El dato se acopla a la zona buscada (lockedToSearch).
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

const fmtM2 = (n) => (n ? '$' + Number(n).toLocaleString('es-MX') + '/m²' : '—');
const pNum = (s) => { const m = String(s ?? '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };

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

  // Píldora de estadística — número grande + glow suave de color.
  const Stat = ({ big, label, tint }) => (
    <div style={{ flex: 1, padding: '10px 8px', borderRadius: 13, background: tint ? `rgba(${tint},0.07)` : 'rgba(99,102,241,0.05)', border: `1px solid rgba(${tint || '99,102,241'},0.16)`, textAlign: 'center' }}>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: tint ? `rgb(${tint})` : 'var(--cream)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>{big}</div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', marginTop: 3 }}>{label}</div>
    </div>
  );

  // Sparkline con ÁREA degradada (data viva) + línea redondeada.
  const SparkLine = ({ data, w = 132, hh = 48 }) => {
    if (!Array.isArray(data) || data.length < 2) return null;
    const min = Math.min(...data), max = Math.max(...data), rng = (max - min) || 1;
    const xy = data.map((v, i) => [(i / (data.length - 1)) * w, hh - 5 - ((v - min) / rng) * (hh - 12)]);
    const line = xy.map((p) => p.join(',')).join(' ');
    const area = `0,${hh} ${line} ${w},${hh}`;
    const up = data[data.length - 1] >= data[0];
    const col = up ? '#1FA06A' : '#7C5CFF';
    const gid = `sg-${up ? 'u' : 'd'}`;
    return (
      <svg width={w} height={hh} style={{ display: 'block' }}>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.28" /><stop offset="100%" stopColor={col} stopOpacity="0" />
        </linearGradient></defs>
        <polygon points={area} fill={`url(#${gid})`} />
        <polyline points={line} fill="none" stroke={col} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r={3} fill={col} />
      </svg>
    );
  };

  // Barra de score con relleno DEGRADADO + glow.
  const ScoreBar = ({ label, v }) => (v == null ? null : (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 10 }}>
      <span style={{ width: 68, fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)' }}>{label}</span>
      <div style={{ flex: 1, height: 7, borderRadius: 9999, background: 'rgba(16,18,28,0.06)', overflow: 'hidden' }}>
        <div style={{ width: `${v}%`, height: '100%', borderRadius: 9999,
          background: v >= 80 ? 'linear-gradient(90deg,#13B981,#1FA06A)' : v >= 60 ? 'linear-gradient(90deg,#7C5CFF,#A855F7)' : 'linear-gradient(90deg,#F59E0B,#E0A33E)',
          boxShadow: `0 0 8px ${v >= 80 ? 'rgba(31,160,106,0.5)' : v >= 60 ? 'rgba(124,92,255,0.5)' : 'rgba(224,163,62,0.5)'}` }} />
      </div>
      <span style={{ width: 22, textAlign: 'right', fontFamily: 'Outfit', fontWeight: 800, fontSize: 12, color: 'var(--cream)' }}>{v}</span>
    </div>
  ));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        .opp-card { transition: transform .22s cubic-bezier(.2,.8,.2,1), box-shadow .22s ease; }
        .opp-card:hover { transform: translateY(-3px); box-shadow: 0 18px 40px rgba(99,102,241,0.16), 0 2px 8px rgba(16,18,28,0.06); }
        .opp-cta { transition: transform .18s ease, box-shadow .18s ease; }
        .opp-cta:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(124,92,255,0.45); }
      `}</style>

      {/* ── Invitar a perfilar — gradiente vivo + CTA con glow ── */}
      <div className="opp-card" style={{ padding: 20, borderRadius: 20, position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(150deg,#6D4AFF 0%,#8B5CF6 45%,#C026D3 100%)',
        boxShadow: '0 12px 32px rgba(124,92,255,0.32)' }}>
        <div style={{ position: 'absolute', top: -40, right: -30, width: 130, height: 130, borderRadius: '50%', background: 'rgba(255,255,255,0.16)', filter: 'blur(8px)' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ fontFamily: 'Outfit', fontSize: 19, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{tc('Encuentra TU lugar')}</div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(255,255,255,0.92)', marginTop: 6, marginBottom: 16, lineHeight: 1.5 }}>
            Dinos qué buscas y te decimos cuáles te convienen de verdad — con tu presupuesto, crédito, plazo y zona.
          </div>
          <button type="button" data-testid="panel-perfilar" onClick={() => onPerfilar?.()} className="opp-cta"
            style={{ width: '100%', padding: '13px', borderRadius: 13, border: 'none', background: '#fff', color: '#6D28D9', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 14.5, boxShadow: '0 6px 18px rgba(0,0,0,0.12)' }}>
            ✨ Empezar mi búsqueda
          </button>
        </div>
      </div>

      {/* ── Datos de tu zona — Monopolio++ ── */}
      {zone && (
        <div className="opp-card" data-testid="zona-datos" style={{ padding: 20, borderRadius: 20, background: '#fff', border: '1px solid rgba(16,18,28,0.07)', boxShadow: '0 6px 22px rgba(99,102,241,0.08), 0 1px 3px rgba(16,18,28,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 800,
                background: 'linear-gradient(90deg,#6D4AFF,#C026D3)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                {tc(lockedToSearch ? 'Datos de tu zona' : 'Explora una zona')}
              </div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)', marginTop: 3, letterSpacing: '-0.02em' }}>{zone.name}</div>
            </div>
            {!lockedToSearch && colonias.length > 1 && (
              <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} data-testid="zona-select"
                style={{ maxWidth: 140, padding: '6px 9px', borderRadius: 10, border: '1px solid rgba(99,102,241,0.25)', background: 'rgba(99,102,241,0.05)', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--theme)', fontWeight: 600, cursor: 'pointer' }}>
                {colonias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>

          {/* Precio/m² gigante con texto degradado + sparkline de área */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10 }}>
            <div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 32, letterSpacing: '-0.035em', lineHeight: 1,
                background: 'linear-gradient(120deg,#1E2230 30%,#6D4AFF 130%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                {fmtM2(zoneM2)}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 5 }}>
                precio promedio
                {vsCdmx != null && <span style={{ color: vsCdmx < 0 ? '#13B981' : '#C026D3', fontWeight: 700 }}> · {vsCdmx >= 0 ? `+${vsCdmx}%` : `${vsCdmx}%`} vs CDMX</span>}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <SparkLine data={zone.trend} />
              <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', marginTop: 1 }}>últimos 24 meses</div>
            </div>
          </div>

          {/* Plusvalía + desarrollos + segmento como píldoras de color */}
          <div style={{ display: 'flex', gap: 9, marginTop: 18 }}>
            <Stat big={mom != null ? `${mom >= 0 ? '+' : ''}${mom}%` : '—'} label="plusvalía 12m" tint={mom > 0 ? '19,185,129' : '99,102,241'} />
            <Stat big={devsZona || zone.inventory || '—'} label="desarrollos" tint="99,102,241" />
            <Stat big={zoneM2 ? (zoneM2 >= 80000 ? 'Premium' : zoneM2 >= 45000 ? 'Alto' : 'Medio') : '—'} label="segmento" tint="192,38,211" />
          </div>

          {/* Calidad de la zona — barras degradadas con glow */}
          {(sc.seguridad != null || sc.movilidad != null || sc.comercio != null) && (
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(16,18,28,0.07)' }}>
              <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 800,
                background: 'linear-gradient(90deg,#6D4AFF,#C026D3)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                {tc('Calidad de la zona')}
              </div>
              <div style={{ marginTop: 5 }}>
                <ScoreBar label="Seguridad" v={sc.seguridad} />
                <ScoreBar label="Movilidad" v={sc.movilidad} />
                <ScoreBar label="Comercio" v={sc.comercio} />
                <ScoreBar label="Educación" v={sc.educacion} />
              </div>
            </div>
          )}

          <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', marginTop: 16 }}>
            Promedios de la zona · datos DesarrollosMX{cdmxM2 ? ` · CDMX ${fmtM2(cdmxM2)}` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
