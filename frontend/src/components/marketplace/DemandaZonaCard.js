/**
 * DemandaZonaCard — social proof HONESTO en la ficha del desarrollo: cuánta gente está buscando en esta zona AHORA.
 * Dato real de db.marketplace_searches (vía /api/public/pulso-zona, el mismo motor del "radar de demanda"). Sin urgencia
 * falsa: si la zona no tiene búsquedas registradas, NO se muestra (cero "0 personas buscando"). Conecta la ficha con la
 * inteligencia de demanda que ya construimos.
 */
import React, { useEffect, useState } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;
const money = (n) => (n ? `$${Number(n).toLocaleString('es-MX')}` : null);

export default function DemandaZonaCard({ colonia, coloniaNombre }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    if (!colonia) return;
    let alive = true;
    fetch(`${API}/api/public/pulso-zona?colonia=${encodeURIComponent(colonia)}&rol=asesor`)
      .then((r) => r.json()).then((j) => { if (alive) setD(j); }).catch(() => {});
    return () => { alive = false; };
  }, [colonia]);

  if (!d || !d.ok) return null;
  const demanda = (d.visible || [])[0]?.v || 0;
  if (!demanda) return null;   // honesto: sin búsquedas → no mostramos nada
  const pres = (d.visible || [])[1]?.v;
  const rec = (d.visible || [])[2]?.v;
  const nombre = coloniaNombre || d.colonia;

  return (
    <div data-testid="demanda-zona" style={{
      marginTop: 20, padding: '16px 20px', borderRadius: 16,
      background: 'linear-gradient(135deg, rgba(16,185,129,0.07), rgba(99,102,241,0.04))',
      border: '1px solid rgba(16,185,129,0.25)',
      display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    }}>
      <div style={{ fontSize: 26 }}>📊</div>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(16px,2vw,20px)', color: 'var(--cream)', letterSpacing: '-0.01em' }}>
          <span style={{ color: '#059669' }}>{Number(demanda).toLocaleString('es-MX')} personas</span> están buscando en {nombre}
        </div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', marginTop: 3 }}>
          Últimos 30 días{pres ? ` · presupuesto típico ${money(pres)}` : ''}{rec ? ` · suelen buscar ${rec} recámaras` : ''}.
        </div>
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', maxWidth: 150, lineHeight: 1.4 }}>
        Señal real de búsquedas en DesarrollosMX.
      </div>
    </div>
  );
}
