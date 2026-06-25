/**
 * SeccionValor — UI NUEVA (de cero) para "El valor". Lee el MISMO dato de los motores (buy-signal + pulso-zona) pero se
 * presenta con el sistema visual único (Card/Stat/serif) — sin la caja verde ni gradientes del componente viejo.
 */
import React, { useState, useEffect } from 'react';
import { Card, Stat, SERIF, SANS } from './ui';
import { fetchBuySignal } from '../../api/marketplace';

const API = process.env.REACT_APP_BACKEND_URL;
const k = (n) => (n != null ? `$${Math.round(n / 1000).toLocaleString('es-MX')}k/m²` : null);

// Tono del veredicto en color de tinta (no fondo gritón) — coherente con el sistema.
const TONE = { verde: '#059669', ambar: '#B45309', rojo: '#DC2626' };

export default function SeccionValor({ dev }) {
  const [bs, setBs] = useState(null);
  const [dem, setDem] = useState(null);

  useEffect(() => {
    if (!dev.id) return undefined;
    let alive = true;
    fetchBuySignal(dev.id).then((d) => { if (alive) setBs(d || null); }).catch(() => {});
    const col = dev.colonia_id || dev.colonia;
    if (col) fetch(`${API}/api/public/pulso-zona?colonia=${encodeURIComponent(col)}&rol=asesor`).then((r) => r.json()).then((d) => { if (alive) setDem(d); }).catch(() => {});
    return () => { alive = false; };
  }, [dev.id, dev.colonia_id, dev.colonia]);

  const pc = bs && bs.precio_contexto, vz = bs && bs.valuacion_zona, v = bs && bs.veredicto;
  const demanda = dem && (dem.visible || [])[0] && (dem.visible || [])[0].v;
  const plus = dev.config && dev.config.plusvalia_desde_lanzamiento_pct;
  const tono = TONE[(v && v.color)] || '#059669';
  const veredictoTxt = v && (v.titulo || v.etiqueta);
  const veredictoDetalle = v && (v.lectura || v.detalle || v.explicacion);

  const stats = [
    pc && pc.este_pm2 != null ? { v: k(pc.este_pm2), l: 'Precio por m²' } : null,
    vz && vz.pm2 != null ? { v: k(vz.pm2), l: 'Valor de la zona', s: vz.confianza ? `confianza ${vz.confianza}` : null } : null,
    plus != null ? { v: `+${plus}%`, l: 'Plusvalía desde lanzamiento', accent: '#059669' } : null,
    demanda ? { v: Number(demanda).toLocaleString('es-MX'), l: 'Personas buscando aquí (30 días)' } : null,
  ].filter(Boolean);

  return (
    <Card>
      {veredictoTxt && (
        <div style={{ paddingBottom: 20, marginBottom: 20, borderBottom: '1px solid var(--card-border, var(--border))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ width: 9, height: 9, borderRadius: 9999, background: tono, flexShrink: 0 }} />
            <span style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cream-3)' }}>El veredicto</span>
          </div>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 'clamp(22px,2.8vw,32px)', letterSpacing: '-0.01em', color: tono, margin: '8px 0 0', lineHeight: 1.1 }}>{veredictoTxt}</div>
          {veredictoDetalle && <p style={{ fontFamily: SANS, fontSize: 14, color: 'var(--cream-2)', margin: '10px 0 0', maxWidth: 640, lineHeight: 1.6 }}>{veredictoDetalle}</p>}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 'clamp(16px,2.5vw,32px)' }}>
        {stats.map((s, i) => <Stat key={i} value={s.v} label={s.l} sub={s.s} accent={s.accent} />)}
      </div>
    </Card>
  );
}
