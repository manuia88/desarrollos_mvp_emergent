// Huecos de producto en TU zona (cierra ciclo comprador→dev): búsquedas completas de compradores en esta colonia
// que NO encontraron nada que cumpla todo → qué construir / a qué precio. Consume /api/desarrollo/{id}/demanda-zona.
import React, { useEffect, useState } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;
const money = (n) => (n ? `$${(n / 1e6).toFixed(1)}M` : null);

export default function ZoneDemandGapPanel({ projectId }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!projectId) return;
    fetch(`${API}/api/desarrollo/${projectId}/demanda-zona`)
      .then((r) => r.json()).then(setData).catch(() => setData({ huecos: [] }));
  }, [projectId]);

  if (data === null) return null;
  const huecos = data.huecos || [];

  return (
    <div data-testid="zone-demand-gap" style={{ background: 'var(--surface-card, #fff)', border: '1px solid var(--border, #e6e6e6)', borderRadius: 14, padding: 16 }}>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream, #1E2230)', marginBottom: 2 }}>
        Huecos de Producto en tu Zona{data.zona_nombre ? ` · ${data.zona_nombre}` : ''}
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3, #8A8F9E)', marginBottom: 14 }}>
        Lo que compradores buscaron en tu zona y <b>no encontraron</b> — demanda real sin oferta. Tu oportunidad de producto y precio.
      </div>
      {huecos.length === 0 ? (
        <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3, #8A8F9E)' }}>
          Aún sin huecos detectados en tu zona. Aparecerán cuando compradores busquen algo que no exista todavía aquí.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {huecos.map((h, i) => {
            const partes = [
              h.recamaras ? `${h.recamaras} rec` : null,
              money(h.presupuesto_max) ? `≤${money(h.presupuesto_max)}` : null,
              h.m2_min ? `≥${h.m2_min} m²` : null,
            ].filter(Boolean);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 10, background: 'var(--bg-3, #F7F7FB)', border: '1px solid var(--border, #ECECEC)' }}>
                <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--theme, #6D4AFF)', minWidth: 30 }}>{h.personas}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, color: 'var(--cream, #1E2230)' }}>
                    {h.personas === 1 ? 'persona buscó' : 'personas buscaron'} {partes.join(' · ') || 'estas características'}
                  </div>
                  {(h.lo_que_mas_falta || []).length > 0 && (
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3, #8A8F9E)' }}>lo que más faltó: {(h.lo_que_mas_falta || []).join(', ')}</div>
                  )}
                </div>
              </div>
            );
          })}
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3, #8A8F9E)', marginTop: 4 }}>
            Cada fila = demanda que existe en tu zona sin oferta que la cumpla. Si tu próxima fase encaja aquí, ya tienes compradores esperando.
          </div>
        </div>
      )}
    </div>
  );
}
