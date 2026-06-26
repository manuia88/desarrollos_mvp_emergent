// LA GRANULARIDAD POR UNIDAD → superadmin (el moat): qué unidades CONCRETAS mueven más demanda en toda la ciudad.
// Capa 3 del cubo por-unidad. Reusa /api/superadmin/devmaster/demanda-unidades. Hide-if-empty (sin señal → no renderiza).
import React, { useEffect, useState } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;
const money = (n) => (n ? `$${(n / 1e6).toFixed(1)}M` : '—');

export default function UnitDemandPanel() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/superadmin/devmaster/demanda-unidades?limit=15`, { credentials: 'include' })
      .then((r) => r.json()).then((d) => { if (alive) setRows((d && d.unidades) || []); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, []);

  if (rows === null || rows.length === 0) return null;   // hide-if-empty
  const max = rows.reduce((m, r) => Math.max(m, r.score || 0), 0) || 1;

  return (
    <div data-testid="unit-demand" style={{ background: 'var(--sa-card, #14182B)', border: '1px solid var(--sa-border, rgba(255,255,255,0.08))', borderRadius: 14, padding: 18 }}>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15.5, color: 'var(--sa-text, #E8EAF2)' }}>Unidades más deseadas de la ciudad</div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--sa-text-mute, #8A90A8)', marginBottom: 14 }}>
        Demanda por UNIDAD concreta (no solo por desarrollo) cruzando todos los devs — vistas + guardados + leads. El dato granular que nadie más tiene.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r, i) => (
          <div key={`${r.dev_id}-${r.unidad}`} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 22, fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: i === 0 ? 'var(--theme, #6D4AFF)' : 'var(--sa-text-mute, #8A90A8)' }}>{i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, color: 'var(--sa-text, #E8EAF2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  #{r.unidad} · {r.dev_name}{r.colonia ? ` · ${r.colonia}` : ''}{r.precio ? ` · ${money(r.precio)}` : ''}
                </span>
                <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--sa-text-mute, #8A90A8)', whiteSpace: 'nowrap' }}>
                  {r.vistas || 0}v · {r.guardados || 0}g{(r.leads || 0) > 0 ? ` · ` : ''}{(r.leads || 0) > 0 && <b style={{ color: 'var(--theme, #6D4AFF)' }}>{r.leads} lead{r.leads === 1 ? '' : 's'}</b>}
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 9999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden', marginTop: 4 }}>
                <div style={{ width: `${Math.round((r.score / max) * 100)}%`, height: '100%', background: 'linear-gradient(90deg, var(--theme, #6D4AFF), #C63FAE)', borderRadius: 9999 }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
