// CuboBuzonPanel — el LECTOR visible del buzón del cubo (cube_actions). Cierra el flywheel agéntico:
// el superadmin (el cubo) detecta un hueco/oportunidad y la RUTA a este portal; aquí el dev/asesor la ve y la actúa.
// Reusable por dev y asesor (cada uno pasa su fetch + setEstado + textos). Hide-if-empty (no ruido si no hay nada).
import React, { useEffect, useState, useCallback } from 'react';

export default function CuboBuzonPanel({
  fetchActions, setEstado,
  titulo = 'El cubo te manda', subtitulo = '', accent = '#6366f1',
  verbo = 'Hecho', icono = '◆',
}) {
  const [actions, setActions] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    fetchActions().then((d) => setActions(d.acciones || [])).catch(() => setActions([]));
  }, [fetchActions]);
  useEffect(() => { load(); }, [load]);

  const act = async (id, estado) => {
    setBusy(id);
    try { await setEstado(id, estado); setActions((a) => (a || []).filter((x) => x.id !== id)); }
    catch (e) { /* fail-soft: deja la tarjeta */ } finally { setBusy(null); }
  };

  if (!actions || actions.length === 0) return null; // hide-if-empty

  return (
    <div style={{
      border: `1px solid ${accent}40`, borderRadius: 14, padding: '14px 16px',
      background: `linear-gradient(180deg, ${accent}0d, transparent)`, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <span style={{ color: accent, fontSize: 14 }}>{icono}</span>
        <strong style={{ fontSize: 14.5, color: 'var(--cream, #f0ebe0)' }}>{titulo}</strong>
        <span style={{ fontSize: 11, color: '#9aa', background: `${accent}22`, padding: '2px 8px', borderRadius: 9999 }}>
          {actions.length}
        </span>
        {subtitulo && <span style={{ fontSize: 12, color: '#9aa', marginLeft: 'auto' }}>{subtitulo}</span>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {actions.map((a) => (
          <div key={a.id} style={{
            display: 'flex', flexDirection: 'column', gap: 5,
            padding: '11px 13px', borderRadius: 10,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 13.5, color: 'var(--cream, #f0ebe0)' }}>{a.titulo}</strong>
              {a.relevante && <span style={{ fontSize: 10, color: accent, border: `1px solid ${accent}66`, padding: '1px 7px', borderRadius: 9999 }}>tu zona</span>}
              {a.colonia && <span style={{ fontSize: 11, color: '#8a8a96' }}>· {String(a.colonia).replace(/-/g, ' ')}</span>}
            </div>
            {a.detalle && <span style={{ fontSize: 12.5, color: '#b9b9c4', lineHeight: 1.4 }}>{a.detalle}</span>}
            {a.leads_potenciales > 0 && (
              <span style={{ fontSize: 11.5, color: '#22c55e', fontWeight: 600 }}>
                {a.leads_potenciales} {a.leads_potenciales === 1 ? 'lead ya busca' : 'leads ya buscan'} esto
              </span>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
              <button disabled={busy === a.id} onClick={() => act(a.id, 'aplicado')} style={{
                padding: '5px 14px', borderRadius: 9999, border: 'none', cursor: 'pointer',
                background: accent, color: '#fff', fontSize: 12, fontWeight: 600, opacity: busy === a.id ? 0.5 : 1,
              }}>{verbo}</button>
              <button disabled={busy === a.id} onClick={() => act(a.id, 'descartado')} style={{
                padding: '5px 14px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.16)', cursor: 'pointer',
                background: 'transparent', color: '#9aa', fontSize: 12,
              }}>Descartar</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
