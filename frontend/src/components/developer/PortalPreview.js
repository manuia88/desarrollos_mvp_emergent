/**
 * PortalPreview — "Cómo te ven los portales" (B0.3).
 * Tres lentes sobre la MISMA fuente unificada (project_full): comprador (marketplace),
 * asesor, corporativo (superadmin). Cierra el ciclo de la publicación: el dev configura →
 * publica (B0.2) → ve exactamente qué dato llega a cada quien (este panel lee los endpoints reales).
 * Front + back: consume GET /api/dev/projects/{id}/portal-preview.
 */
import React, { useEffect, useState } from 'react';
import { getPortalPreview } from '../../api/developer';

const ICON = { comprador: '🏠', asesor: '🤝', corporativo: '📊' };
const ESTADO = {
  activo: { label: 'Activo', color: '#15803d', bg: 'rgba(31,160,106,.10)', dot: '#1FA06A' },
  pendiente: { label: 'Pendiente', color: '#B45309', bg: 'rgba(217,119,6,.10)', dot: '#D97706' },
  vacio: { label: 'Sin datos', color: 'var(--cream-3)', bg: 'rgba(var(--cream-rgb),.06)', dot: 'var(--cream-3)' },
};

export default function PortalPreview({ slug }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    getPortalPreview(slug).then(r => { if (alive) setD(r); }).catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [slug]);

  if (err || !d) return null;
  const lentes = d.lentes || [];

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--cream)' }}>Cómo te ven los portales</h3>
        <span style={{ fontSize: 11.5, color: 'var(--cream-3)', fontWeight: 600 }}>
          Lo que tu ficha entrega a cada quien · una sola fuente
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
        {lentes.map(l => {
          const e = ESTADO[l.estado] || ESTADO.vacio;
          return (
            <div key={l.key} className="dmx-card" data-testid={`portal-lens-${l.key}`}
              style={{ background: '#fff', padding: 15, display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 19 }}>{ICON[l.key] || '•'}</span>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--cream)', lineHeight: 1.15 }}>{l.titulo}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--cream-3)', fontWeight: 600 }}>{l.sub}</div>
                  </div>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, color: e.color, background: e.bg, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: e.dot }} />{e.label}
                </span>
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {(l.items || []).map((it, i) => (
                  <li key={i} style={{ fontSize: 12, color: 'var(--cream-2)', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                    <span style={{ color: e.dot, fontWeight: 800, lineHeight: 1.3 }}>›</span>
                    <span style={{ lineHeight: 1.3 }}>{it}</span>
                  </li>
                ))}
              </ul>
              <div style={{ fontSize: 10.5, color: 'var(--cream-3)', fontWeight: 600, borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 'auto' }}>{l.nota}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
