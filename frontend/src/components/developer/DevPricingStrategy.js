// Precio Inteligente (Pricing · Bloque 1.4) — capa ESTRATÉGICA por proyecto: dónde tienes espacio
// para subir precio y dónde estás caro/lento para tu demanda. Reusa el motor de Stock/Sold-Out del
// Dev-Master scope-ado al dev. Cierra el ciclo con las Sugerencias por unidad + el Lab de experimentos.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDevPricingInteligente } from '../../api/developer';
import { Sparkle, ArrowRight } from '../icons';

const COL = { verde: 'var(--ok, #1FA06A)', rojo: 'var(--hot, #F2635B)', ambar: 'var(--warm, #E2982E)', neutro: 'var(--cream-3)' };
const MOVER = { subir: 'Subir', bajar: 'Bajar', promo: 'Promoción', sostener: 'Sostener' };
const mm = (n) => (Number(n) ? `$${(Number(n) / 1e6).toFixed(1)}M` : '—');
const card = { background: 'var(--surface, #fff)', border: '1px solid var(--border-2, var(--border))', borderRadius: 14, padding: 16, boxShadow: 'var(--asr-shadow, none)' };

export default function DevPricingStrategy({ onVerSugerencias }) {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  useEffect(() => { getDevPricingInteligente().then(setD).catch(() => setD(false)); }, []);
  if (d === null) return <div style={{ padding: 30, color: 'var(--cream-3)', fontSize: 13 }}>Leyendo tu estrategia de precio…</div>;
  if (!d) return <div style={{ padding: 30, color: 'var(--hot)', fontSize: 13 }}>No se pudo cargar.</div>;

  const el = d.elasticidad || {};

  return (
    <div data-testid="dev-pricing-strategy" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Titular + elasticidad */}
      <div style={{ ...card, borderColor: 'rgba(109,74,255,0.4)', background: 'linear-gradient(150deg, rgba(109,74,255,0.07), transparent)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7, fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--theme)' }}>
          <Sparkle size={11} /> Precio Inteligente
        </div>
        <p data-testid="ps-resumen" style={{ margin: 0, fontFamily: 'Outfit,sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--cream)', lineHeight: 1.45 }}>{d.resumen}</p>
        {el.texto && <div style={{ fontSize: 12.5, color: 'var(--cream-2)', marginTop: 8 }}><b style={{ color: 'var(--theme)' }}>Elasticidad:</b> {el.texto}</div>}
        <div style={{ fontSize: 11.5, color: 'var(--cream-3)', marginTop: 6 }}>{d.nota}</div>
      </div>

      {/* Recomendación por proyecto */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(d.proyectos || []).map((p, i) => (
          <div key={i} data-testid="ps-proyecto" style={{ ...card, padding: 14, borderColor: p.color === 'verde' ? 'rgba(31,160,106,0.35)' : (p.color === 'rojo' ? 'rgba(242,99,91,0.3)' : 'var(--border-2, var(--border))') }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: COL[p.color], flexShrink: 0 }} />
                <div>
                  <div style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>{p.nombre}</div>
                  <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>{p.zona} · desde {mm(p.precio)}{p.vs_mediana_zona ? ` · ${p.vs_mediana_zona > 0 ? '+' : ''}${p.vs_mediana_zona}% vs zona` : ''}</div>
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, color: COL[p.color], padding: '4px 10px', borderRadius: 999, background: 'var(--surface-2, rgba(var(--cream-rgb),0.04))', border: `1px solid ${COL[p.color]}55` }}>{MOVER[p.mover] || p.mover}</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5, marginTop: 9, paddingLeft: 19 }}>{p.recomendacion}</div>
            <div style={{ display: 'flex', gap: 14, marginTop: 9, paddingLeft: 19, flexWrap: 'wrap' }}>
              <button onClick={() => onVerSugerencias && onVerSugerencias()} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', color: 'var(--theme)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Ver sugerencias por unidad <ArrowRight size={11} /></button>
              <button onClick={() => navigate(`/desarrollador/desarrollos/${p.project_id}/pricing-lab`)} data-testid="ps-lab-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', color: 'var(--theme)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Experimenta el precio (Lab) <ArrowRight size={11} /></button>
            </div>
          </div>
        ))}
        {(d.proyectos || []).length === 0 && <div style={{ fontSize: 12.5, color: 'var(--cream-3)' }}>Aún no hay proyectos para analizar el precio.</div>}
      </div>
    </div>
  );
}
