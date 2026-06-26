// En qué TRANSIGE el comprador (cierra ciclo comprador→dev): cuando no encuentra todo, qué relaja primero (amenidad antes
// que zona, m² antes que precio…). Oro para producto/precio del dev — antes solo lo veía el superadmin.
// Consume /api/desarrollador/elasticidad (tendencia de mercado CDMX; buyer_elasticidad no guarda colonia).
import React, { useEffect, useState } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function ZoneElasticityPanel() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch(`${API}/api/desarrollador/elasticidad`, { credentials: 'include' })
      .then((r) => r.json()).then(setData).catch(() => setData({ concesiones: [] }));
  }, []);

  if (data === null) return null;
  const items = data.concesiones || [];
  const max = items.reduce((m, c) => Math.max(m, c.n || 0), 0) || 1;

  return (
    <div data-testid="zone-elasticity" style={{ background: 'var(--surface-card, #fff)', border: '1px solid var(--border, #e6e6e6)', borderRadius: 14, padding: 16 }}>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream, #1E2230)', marginBottom: 2 }}>
        En qué transige el comprador
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3, #8A8F9E)', marginBottom: 14 }}>
        Cuando no encuentra todo lo que busca, esto es lo que <b>cede primero</b>. Te dice qué puedes ajustar sin perder al comprador — y qué <b>no</b>. <span style={{ opacity: 0.8 }}>Tendencia de mercado (CDMX).</span>
      </div>
      {items.length === 0 ? (
        <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3, #8A8F9E)' }}>
          Aún sin datos. Aparecerá cuando los compradores relajen criterios al no encontrar match.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, color: 'var(--cream, #1E2230)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</span>
                  <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: 'var(--theme, #6D4AFF)' }}>{c.n}</span>
                </div>
                <div style={{ height: 6, borderRadius: 9999, background: 'var(--bg-3, #F0F0F5)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round((c.n / max) * 100)}%`, background: 'linear-gradient(90deg, var(--theme, #6D4AFF), var(--theme-3, #C63FAE))', borderRadius: 9999 }} />
                </div>
              </div>
            </div>
          ))}
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3, #8A8F9E)', marginTop: 4 }}>
            Lo de arriba = lo más negociable. Lo de abajo = en lo que el comprador NO cede (tu ventaja si lo tienes).
          </div>
        </div>
      )}
    </div>
  );
}
