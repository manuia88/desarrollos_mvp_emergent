// Resumen Ejecutivo del Mes (Reportes · Bloque 1.7) — junta dinero + ventas/sold-out + demanda +
// red + las 3 prioridades en un reporte compartible. Síntesis cross-feature que amarra los upgrades.
// Consume /api/desarrollador/reporte-ejecutivo. Cierra el ciclo: leer → compartir.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDevReporteEjecutivo } from '../../api/developer';
import { Sparkle, ArrowRight } from '../icons';

const card = { background: 'var(--surface, #fff)', border: '1px solid var(--border-2, var(--border))', borderRadius: 14, padding: 16, boxShadow: 'var(--asr-shadow, none)' };

export default function DevReporteEjecutivo() {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { getDevReporteEjecutivo().then(setD).catch(() => setD(false)); }, []);
  if (!d) return null;

  const copiar = () => {
    const lines = [d.titulo, '', d.headline, ''];
    (d.secciones || []).forEach(s => {
      lines.push(`• ${s.titulo}: ${(s.kpis || []).map(k => `${k.label} ${k.valor}`).join(' · ')}`);
      lines.push(`  ${s.lectura}`);
    });
    lines.push('', 'Prioridades:');
    (d.prioridades || []).forEach((p, i) => lines.push(`${i + 1}. ${p.texto}`));
    try { navigator.clipboard.writeText(lines.join('\n')); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (_) {}
  };

  return (
    <div data-testid="dev-reporte-ejecutivo" style={{ marginBottom: 20 }}>
      <div style={{ ...card, borderColor: 'rgba(109,74,255,0.4)', background: 'linear-gradient(150deg, rgba(109,74,255,0.07), transparent)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--theme)' }}>
            <Sparkle size={11} /> {d.titulo}
          </div>
          <button onClick={copiar} data-testid="re-copiar" style={{ cursor: 'pointer', background: copied ? 'var(--ok, #1FA06A)' : 'var(--surface, #fff)', color: copied ? '#fff' : 'var(--theme)', border: copied ? 'none' : '1px solid rgba(109,74,255,0.4)', borderRadius: 9, padding: '6px 12px', fontSize: 12, fontWeight: 700 }}>
            {copied ? '¡Copiado!' : 'Copiar para compartir'}
          </button>
        </div>
        <p data-testid="re-headline" style={{ margin: 0, fontFamily: 'Outfit,sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--cream)', lineHeight: 1.5 }}>{d.headline}</p>
        <div style={{ fontSize: 11.5, color: 'var(--cream-3)', marginTop: 8 }}>{d.nota}</div>
      </div>

      {/* Secciones */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 12, marginTop: 12 }}>
        {(d.secciones || []).map((s, i) => (
          <div key={i} data-testid="re-seccion" style={{ ...card, padding: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--theme)', marginBottom: 9 }}>{s.titulo}</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 9 }}>
              {(s.kpis || []).map((k, ki) => (
                <div key={ki}>
                  <div style={{ fontSize: 10, color: 'var(--cream-3)' }}>{k.label}</div>
                  <div style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 800, fontSize: 17, color: 'var(--cream)' }}>{k.valor}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.5 }}>{s.lectura}</div>
          </div>
        ))}
      </div>

      {/* Prioridades del mes */}
      <div style={{ ...card, marginTop: 12, borderColor: 'rgba(109,74,255,0.3)' }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--theme)', marginBottom: 10 }}>Las 3 Prioridades del Mes</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(d.prioridades || []).map((p, i) => (
            <button key={i} data-testid="re-prioridad" onClick={() => p.link && navigate(p.link)} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', textAlign: 'left', background: 'transparent', border: 'none', cursor: p.link ? 'pointer' : 'default', padding: 0, fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5 }}>
              <span style={{ color: 'var(--theme)', fontWeight: 800 }}>{i + 1}.</span>{p.texto}{p.link && <ArrowRight size={12} style={{ marginTop: 3, color: 'var(--theme)', flexShrink: 0 }} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
