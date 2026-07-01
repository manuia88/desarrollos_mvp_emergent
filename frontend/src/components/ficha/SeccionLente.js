/**
 * SeccionLente — lectura a la medida del LENTE elegido (vivir | invertir). YA NO trae el selector (vive en FichaDesarrollo,
 * arriba). 'vivir' junta vivir+familia+primera. Solo HECHOS reales del dev/config (cero inventado). Sistema visual único.
 */
import React from 'react';
import { SERIF, SANS, HEAD } from './ui';

const monthsBetween = (a, b) => {
  const pa = String(a || '').match(/(\d{4})-(\d{2})/), pb = String(b || '').match(/(\d{4})-(\d{2})/);
  if (!pa || !pb) return 0;
  return Math.max(0, (+pb[1] - +pa[1]) * 12 + (+pb[2] - +pa[2]));
};

function lectura(lens, dev) {
  const cfg = dev.config || {};
  const amen = (Array.isArray(cfg.amenidades) ? cfg.amenidades : (dev.amenities || [])).length;
  const recMax = (dev.bedrooms_range || [])[1];
  const m2Max = (dev.m2_range || [])[1];
  const plus = cfg.plusvalia_desde_lanzamiento_pct;
  const meses = monthsBetween(cfg.fecha_inicio, cfg.fecha_entrega);
  const petUnits = (dev.units || []).filter((u) => u.pet_friendly).length;
  const F = (t, v) => (v != null && v !== '' ? { t, v } : null);

  if (lens === 'invertir') {
    // 'Zona' derivada de dato real de ubicación (colonia · alcaldía), NO hardcodeado. hide-if-empty si no hay dato.
    const zona = [dev.colonia, dev.alcaldia].filter(Boolean).join(' · ') || null;
    return {
      head: 'Para que tu dinero trabaje',
      facts: [F('Plusvalía', plus != null ? `+${plus}% desde lanzamiento` : null), F('Preventa', meses ? `entras hoy, pagas en ${meses} meses sin banco` : null), F('Zona', zona)].filter(Boolean),
    };
  }
  return {
    head: 'Para hacerlo tu hogar',
    facts: [F('Espacio', m2Max ? `hasta ${m2Max} m²` : null), F('Recámaras', recMax ? `hasta ${recMax}` : null), F('Amenidades', amen ? `${amen} servicios` : null), petUnits ? F('Mascotas', `${petUnits} unidades pet friendly`) : F('Entrega', dev.delivery_estimate)].filter(Boolean),
  };
}

export default function SeccionLente({ dev, lens }) {
  const data = lectura(lens, dev);
  if (!data || !data.facts.length) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 'clamp(20px,2.4vw,28px)', color: 'var(--cream)', marginBottom: 16 }}>{data.head}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 14 }}>
        {data.facts.map((f, i) => (
          <div key={i}>
            <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.t}</div>
            <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 16, color: 'var(--cream)', marginTop: 4, lineHeight: 1.3 }}>{f.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
