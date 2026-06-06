// La Lectura de tu Portafolio (Inicio · upgrade) — el asistente INTERPRETA los números:
// cada número con su lectura + veredicto · salud explicada (qué la arrastra) · Live Pulse accionable.
// Consume /api/desarrollador/portfolio-reading. No reescribe el cockpit; lo precede leyéndolo.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPortfolioReading } from '../../api/developer';
import { Sparkle, ArrowRight, Activity } from '../icons';

const V = { bien: 'var(--ok, #1FA06A)', ojo: 'var(--warm, #E2982E)', mal: 'var(--hot, #F2635B)' };

export default function PortfolioReading() {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  useEffect(() => { getPortfolioReading().then(setD).catch(() => setD(false)); }, []);
  if (!d) return null;

  const salud = d.salud || {};
  const pulso = d.pulso || {};
  const sColor = V[salud.color] || 'var(--theme, #6D4AFF)';

  return (
    <div data-testid="portfolio-reading" style={{
      marginBottom: 18, borderRadius: 16, overflow: 'hidden',
      background: 'var(--surface, #fff)', border: '1px solid var(--border-2, var(--border))',
      boxShadow: 'var(--asr-shadow, none)',
    }}>
      {/* franja IA */}
      <div style={{ padding: '15px 18px 14px', borderBottom: '1px solid var(--border, rgba(var(--cream-rgb),0.08))' }}>
        <div className="eyebrow" style={{ marginBottom: 7, color: 'var(--theme)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkle size={11} /> LA LECTURA DE TU PORTAFOLIO
        </div>
        <p data-testid="pr-resumen" style={{ margin: 0, fontFamily: 'Outfit,sans-serif', fontWeight: 700, fontSize: 16.5, color: 'var(--cream)', lineHeight: 1.4 }}>
          {d.resumen}
        </p>
      </div>

      {/* lecturas: cada número con su lectura + veredicto */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 1, background: 'var(--border, rgba(var(--cream-rgb),0.08))' }}>
        {(d.lecturas || []).map((l, i) => (
          <div key={i} data-testid="pr-lectura" style={{ background: 'var(--surface, #fff)', padding: '13px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: V[l.veredicto] || 'var(--cream-3)', flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--cream-3)' }}>{l.metrica}</span>
              <span style={{ marginLeft: 'auto', fontFamily: 'Outfit,sans-serif', fontWeight: 800, fontSize: 16, color: V[l.veredicto] || 'var(--cream)' }}>{l.valor}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.45 }}>{l.lectura}</div>
          </div>
        ))}
      </div>

      {/* salud explicada + pulso */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--border, rgba(var(--cream-rgb),0.08))' }} className="pr-bottom">
        {/* salud explicada */}
        <div style={{ background: 'var(--surface, #fff)', padding: '13px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: sColor }} />
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--cream-3)' }}>Salud</span>
            <span style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 800, fontSize: 13.5, color: sColor }}>{salud.veredicto}</span>
          </div>
          {(salud.drivers || []).length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {(salud.drivers || []).map((dr, i) => (
                <button key={i} data-testid="pr-driver" onClick={() => navigate(dr.link)} style={{
                  display: 'flex', alignItems: 'baseline', gap: 6, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                  fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.4,
                }}>
                  <span style={{ fontWeight: 700, color: 'var(--cream)' }}>{dr.proyecto}:</span> {dr.por_que}
                  <ArrowRight size={11} color="var(--theme)" style={{ flexShrink: 0 }} />
                </button>
              ))}
            </div>
          ) : <div style={{ fontSize: 12, color: 'var(--cream-2)' }}>{salud.resumen}</div>}
        </div>

        {/* Live Pulse accionable */}
        <div style={{ background: 'var(--surface, #fff)', padding: '13px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
            <Activity size={12} color="var(--theme)" />
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--cream-3)' }}>Pulso del Mercado</span>
            {pulso.fuente === 'real' && pulso.bucket && <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, color: 'var(--theme)' }}>{pulso.bucket}</span>}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--cream)', fontWeight: 600, lineHeight: 1.4 }}>{pulso.texto}</div>
          {pulso.accion && (
            <button data-testid="pr-pulso-cta" onClick={() => pulso.link && navigate(pulso.link)} style={{
              marginTop: 7, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
              background: 'transparent', border: 'none', color: 'var(--theme)', fontSize: 12, fontWeight: 700, padding: 0,
            }}>{pulso.accion} <ArrowRight size={11} /></button>
          )}
        </div>
      </div>

      <style>{`@media (max-width: 760px) { .pr-bottom { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
