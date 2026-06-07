// Índices DMX (Inteligencia · Bloque 2.3 · I04) — los 5 índices compuestos por zona del dev:
// IPV plusvalía · IAB absorción · IDS demanda · IRE renta · ICO calidad, + maestro IDM ("1 número").
// Mismo motor que el comprador y el producto licenciable del superadmin. Consume /api/desarrollador/indices.
import React, { useEffect, useState } from 'react';
import { getDevIndices } from '../../api/developer';
import { Sparkle } from '../icons';

const BAND_COL = { verde: 'var(--ok, #1FA06A)', ambar: 'var(--warm, #E2982E)', rojo: 'var(--hot, #F2635B)' };
const card = { background: 'var(--surface, #fff)', border: '1px solid var(--border-2, var(--border))', borderRadius: 14, padding: 16, boxShadow: 'var(--asr-shadow, none)' };

function Gauge({ value, color }) {
  // Barra 0-100 simple y legible.
  return (
    <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-2, rgba(var(--cream-rgb),0.07))', overflow: 'hidden', marginTop: 6 }}>
      <div style={{ width: `${Math.max(2, Math.min(100, value))}%`, height: '100%', background: color, borderRadius: 999 }} />
    </div>
  );
}

function IndexChip({ i }) {
  const col = BAND_COL[i.color] || 'var(--theme)';
  return (
    <div title={i.que_mide} style={{ ...card, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--cream-2)' }}>{i.nombre} <span style={{ color: 'var(--cream-3)', fontWeight: 600 }}>· {i.key}</span></span>
        <span style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 800, fontSize: 17, color: col }}>{i.valor}<span style={{ fontSize: 10, color: 'var(--cream-3)', marginLeft: 3 }}>{i.letra}</span></span>
      </div>
      <Gauge value={i.valor} color={col} />
      <div style={{ fontSize: 11, color: 'var(--cream-2)', lineHeight: 1.4, marginTop: 7 }}>{i.lectura}</div>
      {i.fuente === 'estimado' && <span style={{ fontSize: 9, color: 'var(--warm, #E2982E)' }}>estimado</span>}
    </div>
  );
}

export default function DevIndicesDMX() {
  const [d, setD] = useState(null);
  useEffect(() => { getDevIndices().then(setD).catch(() => setD(false)); }, []);
  if (d === null) return <div style={{ padding: 40, color: 'var(--cream-3)', fontSize: 13 }}>Calculando tus índices…</div>;
  if (!d) return <div style={{ padding: 40, color: 'var(--hot)', fontSize: 13 }}>No se pudo cargar.</div>;

  return (
    <div data-testid="dev-indices-dmx" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...card, borderColor: 'rgba(109,74,255,0.4)', background: 'linear-gradient(150deg, rgba(109,74,255,0.07), transparent)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7, fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--theme)' }}>
          <Sparkle size={11} /> Índices DMX de Tus Zonas
        </div>
        <p data-testid="ix-resumen" style={{ margin: 0, fontFamily: 'Outfit,sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--cream)', lineHeight: 1.45 }}>{d.resumen}</p>
        <div style={{ fontSize: 11.5, color: 'var(--cream-3)', marginTop: 8 }}>{d.nota}</div>
      </div>

      {(d.zonas || []).map((z, idx) => (
        <div key={idx} data-testid="ix-zona" style={{ ...card }}>
          {/* Cabecera: zona + maestro IDM */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 800, fontSize: 17, color: 'var(--cream)' }}>{z.zona}</div>
              <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>{z.tier} · ${(z.price_m2 / 1000).toFixed(0)}k/m²</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 700 }}>Índice DMX</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, justifyContent: 'flex-end' }}>
                <span style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 800, fontSize: 30, color: BAND_COL[z.idm.color] || 'var(--theme)' }}>{z.idm.valor}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: BAND_COL[z.idm.color] || 'var(--theme)' }}>{z.idm.letra}</span>
              </div>
            </div>
          </div>

          {/* Los 5 índices */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginTop: 13 }}>
            {(z.indices || []).map((i) => <IndexChip key={i.key} i={i} />)}
          </div>

          {/* Jugada */}
          {z.jugada && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border, rgba(var(--cream-rgb),0.08))', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5 }}>
              <span style={{ color: 'var(--theme)', fontWeight: 700 }}>Jugada: </span>{z.jugada}
            </div>
          )}
        </div>
      ))}
      {(d.zonas || []).length === 0 && <div style={{ fontSize: 12.5, color: 'var(--cream-3)' }}>Aún no hay zonas con proyectos para calcular índices.</div>}
    </div>
  );
}
