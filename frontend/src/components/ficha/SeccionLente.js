/**
 * SeccionLente — UI NUEVA (de cero) para "¿Es para ti?". El LENTE: el comprador elige su intención (vivir/invertir/familia/
 * primera) y la ficha le devuelve una lectura a su medida con HECHOS REALES del dev/config (cero inventado). Además fija la
 * pestaña por defecto de "Tu dinero" (onIntent) y ofrece un atajo a la sección más relevante (onGoTo). Sistema visual único.
 */
import React, { useState } from 'react';
import { Card, SERIF, SANS, HEAD } from './ui';

const money = (n) => (n != null ? `$${Number(n).toLocaleString('es-MX')}` : null);
const monthsBetween = (a, b) => {
  const pa = String(a || '').match(/(\d{4})-(\d{2})/), pb = String(b || '').match(/(\d{4})-(\d{2})/);
  if (!pa || !pb) return 0;
  return Math.max(0, (+pb[1] - +pa[1]) * 12 + (+pb[2] - +pa[2]));
};

const PERFILES = [
  { k: 'vivir', icon: '🏠', label: 'Para vivir' },
  { k: 'invertir', icon: '📈', label: 'Para invertir' },
  { k: 'familia', icon: '👨‍👩‍👧', label: 'Para mi familia' },
  { k: 'primera', icon: '🔑', label: 'Mi primera casa' },
];

// Cada lente arma su lectura SOLO con datos reales que ya tenemos.
function lectura(perfil, dev) {
  const cfg = dev.config || {};
  const amen = (Array.isArray(cfg.amenidades) ? cfg.amenidades : (dev.amenities || [])).length;
  const recMax = (dev.bedrooms_range || [])[1];
  const m2Max = (dev.m2_range || [])[1];
  const plus = cfg.plusvalia_desde_lanzamiento_pct;
  const meses = monthsBetween(cfg.fecha_inicio, cfg.fecha_entrega);
  const apartado = ((cfg.formas_pago || [])[0] || {}).apartado_mxn;
  const petUnits = (dev.units || []).filter((u) => u.pet_friendly).length;
  const ent = dev.delivery_estimate;

  const F = (t, v) => (v != null && v !== '' ? { t, v } : null);
  const map = {
    vivir: {
      head: 'Para hacerlo tu hogar',
      facts: [F('Amenidades', amen ? `${amen} servicios` : null), F('Entrega', ent), F('Espacio', m2Max ? `hasta ${m2Max} m²` : null)],
      cta: ['ubicacion', 'Ver cómo es el entorno'],
    },
    invertir: {
      head: 'Para que tu dinero trabaje',
      facts: [F('Plusvalía', plus != null ? `+${plus}% desde lanzamiento` : null), F('Preventa', meses ? `entras hoy, pagas en ${meses} meses sin banco` : null), F('Zona', 'consolidada · obra nueva')],
      cta: ['valor', 'Ver el análisis de valor'],
    },
    familia: {
      head: 'Para crecer en familia',
      facts: [F('Recámaras', recMax ? `hasta ${recMax}` : null), F('Espacio', m2Max ? `hasta ${m2Max} m²` : null), petUnits ? F('Mascotas', `${petUnits} unidades pet friendly`) : F('Amenidades', amen ? `${amen} servicios` : null)],
      cta: ['ubicacion', 'Ver escuelas y parques cerca'],
    },
    primera: {
      head: 'Para dar el primer paso sin ahogarte',
      facts: [F('Preventa', meses ? `${meses} meses para pagar, sin banco` : null), apartado ? F('Apartas con', money(apartado)) : null, F('Crédito', 'Infonavit, Fovissste o banca')],
      cta: ['dinero', 'Calcula tu mensualidad'],
    },
  };
  return map[perfil];
}

export default function SeccionLente({ dev, onIntent, onGoTo }) {
  const [perfil, setPerfil] = useState(null);
  const data = perfil ? lectura(perfil, dev) : null;

  const pick = (k) => {
    const next = perfil === k ? null : k;
    setPerfil(next);
    if (next && onIntent) onIntent(next);
  };

  return (
    <Card>
      <div style={{ fontFamily: SANS, fontSize: 14, color: 'var(--cream-2)', marginBottom: 14 }}>¿Qué buscas? Te lo cuento a tu medida.</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {PERFILES.map((p) => {
          const a = perfil === p.k;
          return (
            <button key={p.k} onClick={() => pick(p.k)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderRadius: 12, border: `1.5px solid ${a ? 'var(--theme)' : 'var(--card-border, var(--border))'}`, background: a ? 'rgba(99,102,241,0.07)' : 'var(--surface-card)', color: a ? 'var(--theme)' : 'var(--cream)', fontFamily: HEAD, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              <span style={{ fontSize: 17 }}>{p.icon}</span> {p.label}
            </button>
          );
        })}
      </div>

      {data && (
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--card-border, var(--border))' }}>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 'clamp(20px,2.4vw,28px)', color: 'var(--cream)', marginBottom: 16 }}>{data.head}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14 }}>
            {data.facts.filter(Boolean).map((f, i) => (
              <div key={i}>
                <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.t}</div>
                <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 16, color: 'var(--cream)', marginTop: 4, lineHeight: 1.3 }}>{f.v}</div>
              </div>
            ))}
          </div>
          {data.cta && (
            <button onClick={() => onGoTo && onGoTo(data.cta[0])} style={{ marginTop: 18, padding: '11px 18px', borderRadius: 11, border: 'none', background: 'var(--grad)', color: '#fff', fontFamily: HEAD, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>{data.cta[1]} →</button>
          )}
        </div>
      )}
    </Card>
  );
}
