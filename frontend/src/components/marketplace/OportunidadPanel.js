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

export default function OportunidadPanel({ developments = [], radar = [], budgetMax, setBudgetMax, stages = [], setStages, onlyTrusted, setOnlyTrusted }) {
  const prices = developments.map((d) => Number(d.price_from) || 0).filter(Boolean);
  const min = prices.length ? Math.min(...prices) : 1e6;
  const max = prices.length ? Math.max(...prices) : 5e7;
  const budget = budgetMax || max;
  const toggleStage = (k) => setStages(stages.includes(k) ? stages.filter((s) => s !== k) : [...stages, k]);

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

      {/* ── CAPA 2 · FILTROS HUMANOS ── */}
      <div style={{ ...card, padding: 18 }}>
        <div style={eyebrow}>Afina con lo que importa</div>
        <div style={h}>Tu búsqueda</div>

        {/* ¿Me alcanza? */}
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'var(--cream)' }}>¿Cuánto quieres invertir?</span>
            <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: 'var(--theme)' }}>hasta {money(budget)}</span>
          </div>
          <input type="range" data-testid="filtro-presupuesto" min={min} max={max} step={500000} value={budget}
            onChange={(e) => setBudgetMax(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--theme)', cursor: 'pointer' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 2 }}>
            <span>{money(min)}</span><span>{money(max)}</span>
          </div>
        </div>

        {/* ¿Cuándo entregan? */}
        <div style={{ marginTop: 20 }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'var(--cream)', marginBottom: 9 }}>¿Cuándo lo quieres?</div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {STAGES.map((s) => {
              const on = stages.includes(s.key);
              return (
                <button key={s.key} type="button" data-testid={`filtro-etapa-${s.key}`} onClick={() => toggleStage(s.key)}
                  style={{ padding: '7px 13px', borderRadius: 9999, cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600,
                    background: on ? 'var(--theme)' : '#fff', color: on ? '#fff' : 'var(--cream-2)',
                    border: `1px solid ${on ? 'var(--theme)' : 'var(--border)'}` }}>
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ¿Confío en quién construye? */}
        <button type="button" data-testid="filtro-confianza" onClick={() => setOnlyTrusted(!onlyTrusted)}
          style={{ marginTop: 20, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
            background: onlyTrusted ? 'rgba(31,160,106,0.08)' : '#fff', border: `1px solid ${onlyTrusted ? 'rgba(31,160,106,0.4)' : 'var(--border)'}` }}>
          <span>
            <span style={{ display: 'block', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'var(--cream)' }}>Solo en quién confío</span>
            <span style={{ display: 'block', fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 1 }}>Desarrolladores verificados · entrega en tiempo</span>
          </span>
          <span style={{ flexShrink: 0, width: 38, height: 22, borderRadius: 9999, background: onlyTrusted ? '#1FA06A' : 'var(--border)', position: 'relative', transition: 'background .18s' }}>
            <span style={{ position: 'absolute', top: 2, left: onlyTrusted ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .18s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </span>
        </button>
      </div>
    </div>
  );
}
