/**
 * OportunidadPanel — el copiloto de decisión del marketplace (rediseño 2026-06-18, founder).
 * Reemplaza los sliders de scores subjetivos (Seguridad/Lifestyle…) que no sumaban valor.
 *
 * DOS CAPAS:
 *  1) RADAR de oportunidades — el sistema elige los 3 mejores HOY (bien valuado + sube + verificado).
 *     Señales REALES del desarrollo: precio_vs_zona_pct (valor), plusvalia_zona/forecast (sube), verified (confianza).
 *  2) 3 filtros HUMANOS — ¿me alcanza? (presupuesto) · ¿cuándo entregan? (etapa) · ¿confío? (verificados).
 *
 * Filtra del lado cliente sobre la lista ya cargada (sin tocar el fetch del servidor).
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
  const card = { background: '#fff', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 1px 2px rgba(16,18,28,0.05)' };
  const eyebrow = { fontSize: 10.5, color: 'var(--theme)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 };
  const h = { fontFamily: 'Outfit', fontSize: 17, fontWeight: 800, color: 'var(--cream)', letterSpacing: '-0.02em', marginTop: 3 };

  // Datos de zona (estilo Monopolio): la zona del filtro manda; si no, la primera. El usuario puede cambiarla.
  const [zoneId, setZoneId] = useState(selectedColoniaId || (colonias[0] && colonias[0].id));
  useEffect(() => { if (selectedColoniaId) setZoneId(selectedColoniaId); }, [selectedColoniaId]);
  const zone = colonias.find((c) => c.id === zoneId) || colonias[0] || null;

  // Promedio CDMX (para comparar la zona contra el conjunto).
  const m2Vals = colonias.map((c) => c.price_m2_num).filter(Boolean);
  const cdmxM2 = m2Vals.length ? Math.round(m2Vals.reduce((a, b) => a + b, 0) / m2Vals.length) : null;
  const zoneM2 = zone && zone.price_m2_num;
  const vsCdmx = (zoneM2 && cdmxM2) ? Math.round(((zoneM2 - cdmxM2) / cdmxM2) * 100) : null;
  const devsZona = zone ? developments.filter((d) => d.colonia_id === zone.id || d.colonia === zone.name).length : 0;

  const lockedToSearch = !!selectedColoniaId;   // 2.1 · si el cliente busca una zona, los datos se ACOPLAN a ella
  const sc = (zone && zone.scores) || {};

  const Stat = ({ big, label, color }) => (
    <div style={{ flex: 1 }}>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: color || 'var(--cream)', letterSpacing: '-0.02em' }}>{big}</div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 2 }}>{label}</div>
    </div>
  );
  // Tendencia real de la zona (24 puntos) → mini sparkline.
  const SparkLine = ({ data, w = 110, h = 38 }) => {
    if (!Array.isArray(data) || data.length < 2) return null;
    const min = Math.min(...data), max = Math.max(...data), rng = (max - min) || 1;
    const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - 4 - ((v - min) / rng) * (h - 8)}`).join(' ');
    const up = data[data.length - 1] >= data[0];
    return <svg width={w} height={h}><polyline points={pts} fill="none" stroke={up ? '#1FA06A' : 'var(--theme)'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>;
  };
  // Score real de la colonia (0-100) → barra.
  const ScoreBar = ({ label, v }) => (v == null ? null : (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 9 }}>
      <span style={{ width: 70, fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)' }}>{label}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 9999, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ width: `${v}%`, height: '100%', background: v >= 80 ? '#1FA06A' : v >= 60 ? 'var(--theme)' : '#E0A33E', borderRadius: 9999 }} />
      </div>
      <span style={{ width: 22, textAlign: 'right', fontFamily: 'Outfit', fontWeight: 700, fontSize: 12, color: 'var(--cream)' }}>{v}</span>
    </div>
  ));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── INVITAR A PERFILAR ── */}
      <div style={{ ...card, padding: 18, background: 'linear-gradient(160deg, rgba(var(--theme-rgb),0.07), #fff)', borderColor: 'rgba(var(--theme-rgb),0.25)' }}>
        <div style={h}>{tc('Encuentra TU lugar')}</div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', marginTop: 5, marginBottom: 14, lineHeight: 1.5 }}>
          Dinos qué buscas y te decimos cuáles te convienen de verdad — con tu presupuesto, crédito, plazo y zona.
        </div>
        <button type="button" data-testid="panel-perfilar" onClick={() => onPerfilar?.()}
          style={{ width: '100%', padding: '12px', borderRadius: 11, border: 'none', background: 'var(--theme)', color: '#fff', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14 }}>
          ✨ Empezar mi búsqueda
        </button>
      </div>

      {/* ── DATOS DE TU ZONA · acoplado a la búsqueda (2.1) + rico: precio/m² + tendencia + scores reales ── */}
      {zone && (
        <div style={{ ...card, padding: 18 }} data-testid="zona-datos">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
            <div>
              <div style={eyebrow}>{tc(lockedToSearch ? 'Datos de tu zona' : 'Explora una zona')}</div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', marginTop: 2, letterSpacing: '-0.02em' }}>{zone.name}</div>
            </div>
            {/* El selector SOLO aparece cuando NO hay zona de búsqueda (si busca Del Valle, no puede elegir Condesa). */}
            {!lockedToSearch && colonias.length > 1 && (
              <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} data-testid="zona-select"
                style={{ maxWidth: 140, padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-3)', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', cursor: 'pointer' }}>
                {colonias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>

          {/* Precio/m² (estrella) + sparkline de la tendencia real */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, marginTop: 8 }}>
            <div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 25, color: 'var(--cream)', letterSpacing: '-0.03em', lineHeight: 1 }}>{fmtM2(zoneM2)}</div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 4 }}>
                precio promedio
                {vsCdmx != null && <span style={{ color: vsCdmx < 0 ? '#1FA06A' : 'var(--cream-3)', fontWeight: 600 }}> · {vsCdmx >= 0 ? `+${vsCdmx}%` : `${vsCdmx}%`} vs CDMX</span>}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <SparkLine data={zone.trend} />
              <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', marginTop: -2 }}>últimos 24 meses</div>
            </div>
          </div>

          {/* Plusvalía + desarrollos + segmento */}
          <div style={{ display: 'flex', gap: 12, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <Stat big={pNum(zone.momentum) != null ? `${pNum(zone.momentum) >= 0 ? '+' : ''}${pNum(zone.momentum)}%` : '—'} label="plusvalía 12m" color={pNum(zone.momentum) > 0 ? '#1FA06A' : 'var(--cream)'} />
            <Stat big={devsZona || zone.inventory || '—'} label="desarrollos" />
            <Stat big={zoneM2 ? (zoneM2 >= 80000 ? 'Premium' : zoneM2 >= 45000 ? 'Alto' : 'Medio') : '—'} label="segmento" />
          </div>

          {/* Calidad de la zona (scores REALES de la colonia) */}
          {(sc.seguridad != null || sc.movilidad != null || sc.comercio != null) && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <div style={eyebrow}>{tc('Calidad de la zona')}</div>
              <div style={{ marginTop: 4 }}>
                <ScoreBar label="Seguridad" v={sc.seguridad} />
                <ScoreBar label="Movilidad" v={sc.movilidad} />
                <ScoreBar label="Comercio" v={sc.comercio} />
                <ScoreBar label="Educación" v={sc.educacion} />
              </div>
            </div>
          )}

          <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', marginTop: 14 }}>
            Promedios de la zona · datos DesarrollosMX{cdmxM2 ? ` · CDMX ${fmtM2(cdmxM2)}` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
