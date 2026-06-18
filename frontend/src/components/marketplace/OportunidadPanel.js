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
import React from 'react';
import { Link } from 'react-router-dom';

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

export default function OportunidadPanel({ developments = [], radar = [], onPerfilar }) {
  // Pulso de mercado (inteligencia que ningún portal da) — del catálogo cargado, real.
  const nDevs = developments.length;
  const nColonias = new Set(developments.map((d) => d.colonia).filter(Boolean)).size;
  const plusvVals = developments.map((d) => { const m = String(d.plusvalia_zona || '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; }).filter((v) => v != null);
  const plusvProm = plusvVals.length ? (plusvVals.reduce((a, b) => a + b, 0) / plusvVals.length).toFixed(1) : null;

  const card = { background: '#fff', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 1px 2px rgba(16,18,28,0.05)' };
  const eyebrow = { fontSize: 10.5, color: 'var(--theme)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 };
  const h = { fontFamily: 'Outfit', fontSize: 17, fontWeight: 800, color: 'var(--cream)', letterSpacing: '-0.02em', marginTop: 3 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── CAPA 1 · RADAR ── */}
      <div style={{ ...card, padding: 18 }}>
        <div style={eyebrow}>Lo elegimos por ti</div>
        <div style={h}>🎯 Oportunidades de hoy</div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 4, marginBottom: 14 }}>
          Lo mejor valuado, que más sube y de quién sí entrega.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {radar.length === 0 && <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)' }}>Ajusta los filtros para ver oportunidades.</div>}
          {radar.map(({ d, razon }, i) => (
            <Link key={d.id} to={`/desarrollo/${d.id}`} data-testid={`radar-pick-${d.id}`}
              style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 10, borderRadius: 12, border: '1px solid var(--border)', textDecoration: 'none', background: 'var(--surface-card)' }}>
              <div style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 8, background: 'var(--theme)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Outfit', fontWeight: 800, fontSize: 13 }}>{i + 1}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13.5, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: '#1FA06A', fontWeight: 600, marginTop: 1 }}>{razon}</div>
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', whiteSpace: 'nowrap' }}>{d.price_m2_dev ? `$${Math.round(d.price_m2_dev / 1000)}k/m²` : ''}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── INVITAR A PERFILAR (NO duplica filtros: la búsqueda vive en el Perfilador) ── */}
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

      {/* ── PULSO DE MERCADO (inteligencia que ningún portal da · no es filtro) ── */}
      <div style={{ ...card, padding: 18 }}>
        <div style={eyebrow}>El mercado hoy</div>
        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          {[[nDevs, 'desarrollos'], [nColonias, 'colonias'], [plusvProm != null ? `+${plusvProm}%` : '—', 'plusvalía prom.']].map(([n, l], i) => (
            <div key={i} style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)', letterSpacing: '-0.02em' }}>{n}</div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 1 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
