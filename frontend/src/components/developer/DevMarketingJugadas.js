// Qué Promocionar Hoy (Marketing · Bloque 1.6) — el asistente conecta la salud del portafolio
// (estancados · baja demanda · interés caliente) con el contenido que conviene crear en el Studio.
// Reusa el motor de Stock/Sold-Out + leads, scope-ado al dev. Cierra el ciclo señal → contenido.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDevMarketingJugadas } from '../../api/developer';
import { Sparkle, ArrowRight } from '../icons';

const card = { background: 'var(--surface, #fff)', border: '1px solid var(--border-2, var(--border))', borderRadius: 14, padding: 16, boxShadow: 'var(--asr-shadow, none)' };
const TONE = { Landing: 'var(--hot, #F2635B)', Carruseles: 'var(--warm, #E2982E)', Video: 'var(--ok, #1FA06A)', 'Auto-Content': 'var(--theme, #6D4AFF)' };

export default function DevMarketingJugadas() {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  useEffect(() => { getDevMarketingJugadas().then(setD).catch(() => setD(false)); }, []);
  if (!d) return null;

  return (
    <div data-testid="dev-marketing-jugadas" style={{ marginBottom: 18 }}>
      <div style={{ ...card, borderColor: 'rgba(109,74,255,0.4)', background: 'linear-gradient(150deg, rgba(109,74,255,0.07), transparent)', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7, fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--theme)' }}>
          <Sparkle size={11} /> Qué Promocionar Hoy
        </div>
        <p data-testid="mj-resumen" style={{ margin: 0, fontFamily: 'Outfit,sans-serif', fontWeight: 700, fontSize: 15.5, color: 'var(--cream)', lineHeight: 1.45 }}>{d.resumen}</p>
        <div style={{ fontSize: 11.5, color: 'var(--cream-3)', marginTop: 6 }}>{d.nota}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(290px,1fr))', gap: 10 }}>
        {(d.jugadas || []).map((j, i) => {
          const tone = TONE[j.contenido] || 'var(--theme)';
          return (
            <div key={i} data-testid="mj-jugada" style={{ ...card, padding: 14, borderLeft: `4px solid ${tone}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <button onClick={() => navigate(j.link_proyecto)} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>{j.nombre}</div>
                  <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>{j.zona} · {j.leads} leads · {j.disponibles} libres</div>
                </button>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: tone, padding: '3px 9px', borderRadius: 999, background: 'var(--surface-2, rgba(var(--cream-rgb),0.04))', border: `1px solid ${tone}55` }}>{j.contenido}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.5, marginTop: 9 }}>{j.motivo}</div>
              <button onClick={() => navigate(j.link_studio)} data-testid="mj-cta" style={{
                marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                background: 'var(--grad, linear-gradient(120deg,#6366F1,#EC4899))', color: '#fff', border: 'none',
                borderRadius: 9, padding: '7px 13px', fontSize: 12, fontWeight: 800,
              }}>{j.accion} <ArrowRight size={12} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
