// Embudo POR UNIDAD para el dev (superficie de D): cuántos VIERON y GUARDARON cada unidad — qué mueve y qué no.
import React, { useEffect, useState } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function UnitFunnelPanel({ projectId }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!projectId) return;
    fetch(`${API}/api/desarrollo/${projectId}/embudo-unidades`)
      .then((r) => r.json()).then((d) => setRows(d?.unidades || [])).catch(() => setRows([]));
  }, [projectId]);

  if (rows === null) return null;
  const max = Math.max(1, ...rows.map((r) => r.vistas || 0));

  return (
    <div data-testid="unit-funnel" style={{ background: 'var(--surface-card, #fff)', border: '1px solid var(--border, #e6e6e6)', borderRadius: 14, padding: 16 }}>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream, #1E2230)', marginBottom: 2 }}>Embudo por unidad</div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3, #8A8F9E)', marginBottom: 14 }}>
        Qué unidad mueve y cuál se estanca — vistas, guardados y <b>leads</b> reales de los compradores, por unidad.
      </div>
      {rows.length === 0 ? (
        <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3, #8A8F9E)' }}>Aún sin interacción por unidad. Aparecerá cuando los compradores exploren tu lista de precios.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {rows.slice(0, 12).map((r, i) => {
            const estancada = (r.vistas || 0) >= 4 && (r.guardados || 0) === 0;
            return (
              <div key={r.unidad} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 56, fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream, #1E2230)' }}>#{r.unidad}</span>
                <div style={{ flex: 1, height: 8, borderRadius: 9999, background: 'var(--border, #ECECEC)', overflow: 'hidden' }}>
                  <div style={{ width: `${((r.vistas || 0) / max) * 100}%`, height: '100%', background: i === 0 ? 'var(--theme, #6D4AFF)' : 'rgba(109,74,255,0.5)' }} />
                </div>
                <span style={{ width: 180, textAlign: 'right', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2, #4A4F5E)' }}>
                  {r.vistas || 0} vistas · <b style={{ color: (r.guardados || 0) > 0 ? '#1FA06A' : 'var(--cream-3, #8A8F9E)' }}>{r.guardados || 0} guard.</b>
                  {(r.leads || 0) > 0 && <> · <b style={{ color: 'var(--theme, #6D4AFF)' }}>{r.leads} lead{r.leads === 1 ? '' : 's'}</b></>}
                </span>
                {estancada && <span title="Muchas vistas, 0 guardados — revisa precio/fotos" style={{ fontSize: 14 }}>⚠️</span>}
              </div>
            );
          })}
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3, #8A8F9E)', marginTop: 4 }}>
            ⚠️ = vista pero no guardada (revisa precio o fotos) · la #1 es la más deseada (no la sueltes barata).
          </div>
        </div>
      )}
    </div>
  );
}
