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

const pPct = (s) => { const m = String(s ?? '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : 0; };
const STAGES = [
  { key: 'preventa', label: 'Preventa' },
  { key: 'en_construccion', label: 'En obra' },
  { key: 'entrega_inmediata', label: 'Listo ya' },
];

export function computeRadar(devs = []) {
  return devs.map((d) => {
    const valor = -(Number(d.precio_vs_zona_pct) || 0);        // bajo el valor de zona = mejor
    const sube = pPct(d.plusvalia_zona) + (Number(d.forecast_12m_pct) || 0);
    const confianza = d.verified ? 6 : 0;
    const enTiempo = /tiempo|calendario/i.test(d.construction_progress?.status || '') ? 3 : 0;
    const score = valor * 0.6 + sube * 1.2 + confianza + enTiempo;
    // Razón honesta: el atributo más fuerte y verdadero de este desarrollo.
    let razon;
    const vz = Number(d.precio_vs_zona_pct) || 0;
    if (vz <= 0) razon = `${Math.abs(vz)}% bajo el valor de zona`;
    else if (pPct(d.plusvalia_zona) > 0) razon = `Plusvalía ${d.plusvalia_zona} en la zona`;
    else if (d.verified) razon = 'Verificado · entrega en tiempo';
    else razon = `${vz}% vs zona`;
    return { d, score, razon };
  }).sort((a, b) => b.score - a.score).slice(0, 3);
}

export function applyOportunidadFilters(devs = [], { budgetMax, stages, onlyTrusted }) {
  return devs.filter((d) => {
    if (budgetMax && Number(d.price_from) > budgetMax) return false;
    if (stages?.length && !stages.includes(d.stage)) return false;
    if (onlyTrusted && !d.verified) return false;
    return true;
  });
}

const money = (n) => '$' + (n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1) + 'M' : Math.round(n / 1e3) + 'k');

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

  const Stat = ({ big, label, color }) => (
    <div style={{ flex: 1 }}>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: color || 'var(--cream)', letterSpacing: '-0.02em' }}>{big}</div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── INVITAR A PERFILAR ── */}
      <div style={{ ...card, padding: 18, background: 'linear-gradient(160deg, rgba(var(--theme-rgb),0.07), #fff)', borderColor: 'rgba(var(--theme-rgb),0.25)' }}>
        <div style={h}>Encuentra TU lugar</div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', marginTop: 5, marginBottom: 14, lineHeight: 1.5 }}>
          Dinos qué buscas y te decimos cuáles te convienen de verdad — con tu presupuesto, crédito, plazo y zona.
        </div>
        <button type="button" data-testid="panel-perfilar" onClick={() => onPerfilar?.()}
          style={{ width: '100%', padding: '12px', borderRadius: 11, border: 'none', background: 'var(--theme)', color: '#fff', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14 }}>
          ✨ Empezar mi búsqueda
        </button>
      </div>

      {/* ── DATOS DE TU ZONA (estilo Monopolio · precio/m² + plusvalía + inventario, datos reales) ── */}
      {zone && (
        <div style={{ ...card, padding: 18 }} data-testid="zona-datos">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={eyebrow}>Datos de tu zona</div>
            {colonias.length > 1 && (
              <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} data-testid="zona-select"
                style={{ maxWidth: 150, padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-3)', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', cursor: 'pointer' }}>
                {colonias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>

          {/* Precio/m² — el dato estrella */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', letterSpacing: '-0.03em', lineHeight: 1 }}>{fmtM2(zoneM2)}</div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 4 }}>
              precio promedio en <b style={{ color: 'var(--cream-2)' }}>{zone.name}</b>
              {vsCdmx != null && <span style={{ color: vsCdmx >= 0 ? 'var(--cream-3)' : '#1FA06A', fontWeight: 600 }}> · {vsCdmx >= 0 ? `+${vsCdmx}%` : `${vsCdmx}%`} vs CDMX</span>}
            </div>
          </div>

          {/* Plusvalía + inventario + tendencia */}
          <div style={{ display: 'flex', gap: 12, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <Stat big={pNum(zone.momentum) != null ? `${pNum(zone.momentum) >= 0 ? '+' : ''}${pNum(zone.momentum)}%` : '—'} label="plusvalía 12m" color={pNum(zone.momentum) > 0 ? '#1FA06A' : 'var(--cream)'} />
            <Stat big={devsZona || zone.inventory || '—'} label="desarrollos" />
            <Stat big={zoneM2 ? (zoneM2 >= 80000 ? 'Premium' : zoneM2 >= 45000 ? 'Alto' : 'Medio') : '—'} label="segmento" />
          </div>

          <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', marginTop: 12 }}>
            Promedios de la zona · datos DesarrollosMX{cdmxM2 ? ` · CDMX ${fmtM2(cdmxM2)}` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
