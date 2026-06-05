/**
 * ProjectReadiness — "Ficha X% lista para publicar" + acción "Publicar a portales".
 * Consume la capa única (getProjectFull) y publica (publishProject → db.developments) para que
 * la info quede visible en marketplace/asesor/superadmin. Cada faltante es un chip que lleva a su tab.
 * Cierra el ciclo de B0.1/B0.2 (front + back).
 */
import React, { useEffect, useState } from 'react';
import { getProjectFull, publishProject } from '../../api/developer';

const fmtDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export default function ProjectReadiness({ slug, onGoTab }) {
  const [d, setD] = useState(null);
  const [pubAt, setPubAt] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    let alive = true;
    getProjectFull(slug).then(r => { if (alive) { setD(r); setPubAt(r?.published?.at || null); } }).catch(() => {});
    return () => { alive = false; };
  }, [slug]);

  const publish = async () => {
    setPublishing(true);
    try {
      const res = await publishProject(slug);
      setPubAt(res.published_at);
      setFlash('✓ Publicado · visible en marketplace, asesores y superadmin');
      setTimeout(() => setFlash(null), 3200);
    } catch (e) { setFlash('No se pudo publicar ahora.'); setTimeout(() => setFlash(null), 3200); }
    finally { setPublishing(false); }
  };

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
          <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d' }}>✓ Todo listo para publicar</div>
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

      {/* Publicar a portales */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <button type="button" onClick={publish} disabled={publishing} data-testid="publish-portales-btn"
          style={{ background: 'var(--grad, linear-gradient(120deg,#6D4AFF,#C63FAE))', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 12.5, fontWeight: 700, cursor: publishing ? 'wait' : 'pointer', opacity: publishing ? 0.7 : 1, whiteSpace: 'nowrap' }}>
          {publishing ? 'Publicando…' : pubAt ? '↻ Actualizar portales' : 'Publicar a portales'}
        </button>
        <span style={{ fontSize: 10.5, color: pubAt ? '#15803d' : 'var(--cream-3)', fontWeight: 600 }}>
          {flash || (pubAt ? `✓ Publicado · ${fmtDate(pubAt)}` : 'aún no publicado')}
        </span>
      </div>
    </div>
  );
}
