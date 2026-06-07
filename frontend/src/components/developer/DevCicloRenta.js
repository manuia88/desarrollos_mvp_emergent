// Ciclo y Renta (Inteligencia · Bloque 2.2 · B05+D05+D07) — por cada zona del dev: en qué fase del
// ciclo está + qué tan rápido gentrifica + ROI de renta corta (Airbnb) vs larga, con una jugada.
// Motor reusable (dev/comprador). Consume /api/desarrollador/ciclo-renta. Cierra ciclo con pricing/timing.
import React, { useEffect, useState } from 'react';
import { getDevCicloRenta } from '../../api/developer';
import { Sparkle } from '../icons';

const FASE_COL = { azul: 'var(--theme, #6D4AFF)', verde: 'var(--ok, #1FA06A)', ambar: 'var(--warm, #E2982E)', rojo: 'var(--hot, #F2635B)' };
const GENT_COL = { alta: 'var(--ok, #1FA06A)', media: 'var(--warm, #E2982E)', baja: 'var(--cream-3)' };
const card = { background: 'var(--surface, #fff)', border: '1px solid var(--border-2, var(--border))', borderRadius: 14, padding: 16, boxShadow: 'var(--asr-shadow, none)' };

export default function DevCicloRenta() {
  const [d, setD] = useState(null);
  useEffect(() => { getDevCicloRenta().then(setD).catch(() => setD(false)); }, []);
  if (d === null) return <div style={{ padding: 40, color: 'var(--cream-3)', fontSize: 13 }}>Leyendo el ciclo de tus zonas…</div>;
  if (!d) return <div style={{ padding: 40, color: 'var(--hot)', fontSize: 13 }}>No se pudo cargar.</div>;

  return (
    <div data-testid="dev-ciclo-renta" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...card, borderColor: 'rgba(109,74,255,0.4)', background: 'linear-gradient(150deg, rgba(109,74,255,0.07), transparent)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7, fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--theme)' }}>
          <Sparkle size={11} /> Ciclo y Renta de Tus Zonas
        </div>
        <p data-testid="cr-resumen" style={{ margin: 0, fontFamily: 'Outfit,sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--cream)', lineHeight: 1.45 }}>{d.resumen}</p>
        <div style={{ fontSize: 11.5, color: 'var(--cream-3)', marginTop: 8 }}>{d.nota}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 12 }}>
        {(d.zonas || []).map((z, i) => {
          const fc = FASE_COL[z.ciclo.color] || 'var(--theme)';
          return (
            <div key={i} data-testid="cr-zona" style={{ ...card, padding: 15, borderLeft: `4px solid ${fc}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>{z.zona}</span>
                <span style={{ fontSize: 11, color: 'var(--cream-3)' }}>{z.tier} · ${(z.price_m2 / 1000).toFixed(0)}k/m²</span>
              </div>

              {/* Ciclo */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: fc, padding: '3px 10px', borderRadius: 999, background: 'var(--surface-2, rgba(var(--cream-rgb),0.04))', border: `1px solid ${fc}55` }}>{z.ciclo.label}</span>
                <span style={{ fontSize: 11, color: 'var(--cream-3)' }}>momentum {z.ciclo.momentum_pct >= 0 ? '+' : ''}{z.ciclo.momentum_pct}%</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.45, marginTop: 6 }}>{z.ciclo.lectura}</div>

              {/* Gentrificación + Renta */}
              <div style={{ display: 'flex', gap: 20, marginTop: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 700 }}>Gentrificación</div>
                  <div style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 800, fontSize: 15, color: GENT_COL[z.gentrificacion.nivel] || 'var(--cream)', textTransform: 'capitalize' }}>{z.gentrificacion.nivel} <span style={{ fontSize: 11, color: 'var(--cream-3)' }}>({z.gentrificacion.score})</span></div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 700 }}>Renta (ROI anual)</div>
                  <div style={{ fontSize: 13, color: 'var(--cream)' }}>
                    <b style={{ color: z.renta.mejor === 'corta' ? 'var(--ok, #1FA06A)' : 'var(--cream)' }}>Corta {z.renta.corta_pct}%</b>
                    <span style={{ color: 'var(--cream-3)' }}> · Larga {z.renta.larga_pct}%</span>
                    {z.renta.fuente === 'estimado' && <span style={{ fontSize: 9.5, marginLeft: 5, color: 'var(--warm, #E2982E)' }}>estimado</span>}
                  </div>
                </div>
              </div>

              {/* Jugada */}
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border, rgba(var(--cream-rgb),0.08))', fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--theme)', fontWeight: 700 }}>Jugada: </span>{z.recomendacion}
              </div>
            </div>
          );
        })}
        {(d.zonas || []).length === 0 && <div style={{ fontSize: 12.5, color: 'var(--cream-3)' }}>Aún no hay zonas con proyectos para analizar.</div>}
      </div>
    </div>
  );
}
