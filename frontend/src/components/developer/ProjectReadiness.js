/**
 * ProjectReadiness — "Ficha X% lista para publicar". Consume la capa única (getProjectFull)
 * y muestra qué falta para que la info quede lista para los portales (marketplace/asesor/
 * superadmin). Cada faltante es un chip que lleva a la tab correcta. Cierra el ciclo de B0.1.
 */
import React, { useEffect, useState } from 'react';
import { getProjectFull } from '../../api/developer';

export default function ProjectReadiness({ slug, onGoTab }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    let alive = true;
    getProjectFull(slug).then(r => { if (alive) setD(r); }).catch(() => {});
    return () => { alive = false; };
  }, [slug]);

  const r = d?.readiness;
  if (!r) return null;
  const done = (r.missing || []).length === 0;

  return (
    <div className="dmx-card" data-testid="project-readiness" style={{ background: '#fff', padding: '15px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0 }}>
        <span style={{ fontFamily: 'Outfit,sans-serif', fontSize: 32, fontWeight: 800, letterSpacing: '-.02em', color: done ? '#15803d' : 'var(--theme)' }}>{r.pct}%</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cream-2)' }}>lista para publicar</span>
      </div>

      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ height: 8, borderRadius: 999, background: 'rgba(var(--cream-rgb),0.08)', overflow: 'hidden', marginBottom: 9 }}>
          <div style={{ height: '100%', width: `${r.pct}%`, borderRadius: 999, background: done ? '#1FA06A' : 'var(--grad, linear-gradient(120deg,#6D4AFF,#C63FAE))', transition: 'width .3s' }} />
        </div>
        {done ? (
          <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d' }}>✓ Todo listo · esta info se vincula a marketplace, asesores y superadmin</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, color: 'var(--cream-3)', fontWeight: 600 }}>Falta:</span>
            {r.missing.map((m, i) => (
              <button key={i} type="button" onClick={() => onGoTab && onGoTab(m.tab)}
                style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 11px', borderRadius: 999, cursor: 'pointer',
                  border: '1px solid var(--border)', background: '#fff', color: 'var(--cream-2)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--theme)'; e.currentTarget.style.color = 'var(--theme)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--cream-2)'; }}>
                {m.label} →
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
