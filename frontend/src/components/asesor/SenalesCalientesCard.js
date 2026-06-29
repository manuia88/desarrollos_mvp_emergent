// Asesor · LEADS ANÓNIMOS CALENTÁNDOSE — visitantes sin contacto aún, rankeados por comportamiento (apartado/intención
// pesan, rechazo resta) + qué miran. Cierra demanda anónima → asesor se adelanta. Lazy (botón) para no pesar la vista.
import React, { useState } from 'react';
import * as api from '../../api/advisor';

export default function SenalesCalientesCard() {
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(false);
  const load = () => { setOpen(true); api.getSenalesCalientes().then(setD).catch((e) => setD({ error: e.message })); };
  if (!open) {
    return (
      <button onClick={load}
        style={{ margin: '0 0 12px', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--card-border, #e5e5e5)', background: 'transparent', color: 'var(--cream-2, #555)', cursor: 'pointer', fontSize: 13 }}>
        🔥 Ver leads anónimos calentándose (la demanda que aún no te contacta)
      </button>
    );
  }
  if (!d) return <div style={{ padding: 10, fontSize: 13, color: '#888' }}>Cargando señales…</div>;
  if (d.error) return <div style={{ padding: 10, fontSize: 13, color: '#dc2626' }}>{d.error}</div>;
  const rows = d.calientes?.visitantes_calientes || [];
  return (
    <div style={{ margin: '0 0 14px', padding: '12px 16px', borderRadius: 10, border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.04)' }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: '#16a34a', fontSize: 14 }}>🔥 Leads anónimos calentándose</div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Aún no te contactan, pero su comportamiento dice que están cerca. Adelántate con la oferta correcta.</div>
      {rows.length === 0 && <div style={{ fontSize: 13, color: '#888' }}>Sin leads calientes en este momento.</div>}
      {rows.slice(0, 8).map((v) => (
        <div key={v.visitor_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '4px 0', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
          <span>{(v.features || []).join(', ') || 'explorando'}{(v.colonias || []).length > 0 ? ` · ${v.colonias.join('/')}` : ''}</span>
          <strong style={{ color: '#16a34a' }}>calor {v.calor}</strong>
        </div>
      ))}
    </div>
  );
}
