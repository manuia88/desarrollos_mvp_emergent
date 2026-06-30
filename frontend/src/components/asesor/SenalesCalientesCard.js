// Asesor · LEADS ANÓNIMOS CALENTÁNDOSE — visitantes sin contacto aún, rankeados por comportamiento (apartado/intención
// pesan, rechazo resta) + qué miran. Cierra demanda anónima → asesor se adelanta. Lazy (botón) para no pesar la vista.
import React, { useState } from 'react';
import * as api from '../../api/advisor';

// ASR-05 · índices del cubo de Lead Intelligence (antes números mágicos sueltos en el render).
const IDX_FIT = 85;       // qué tan bien encaja la zona con la demanda
const IDX_URGENCIA = 86;  // urgencia de cierre en la zona
const IDX_INVENTARIO = 81; // inventario disponible en la zona

export default function SenalesCalientesCard() {
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(false);
  // ASR-04 · ya no mostramos el error crudo del servidor; marcamos una bandera y ofrecemos reintentar.
  const load = () => { setOpen(true); setD(null); api.getSenalesCalientes().then(setD).catch(() => setD({ error: true })); };
  if (!open) {
    return (
      <button onClick={load}
        style={{ margin: '0 0 12px', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--card-border, #e5e5e5)', background: 'transparent', color: 'var(--cream-2, #555)', cursor: 'pointer', fontSize: 13 }}>
        🔥 Ver leads anónimos calentándose (la demanda que aún no te contacta)
      </button>
    );
  }
  if (!d) return <div style={{ padding: 10, fontSize: 13, color: '#888' }}>Cargando señales…</div>;
  if (d.error) return (
    <div style={{ padding: 10, fontSize: 13, color: 'var(--cream-2, #555)', display: 'flex', alignItems: 'center', gap: 10 }}>
      <span>No pudimos cargar las señales en este momento.</span>
      <button onClick={load}
        style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--card-border, #e5e5e5)', background: 'transparent', color: 'var(--cream-2, #555)', cursor: 'pointer', fontSize: 12 }}>
        Reintentar
      </button>
    </div>
  );
  const rows = d.calientes?.visitantes_calientes || [];
  return (
    <div style={{ margin: '0 0 14px', padding: '12px 16px', borderRadius: 10, border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.04)' }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--ok, #16a34a)', fontSize: 14 }}>🔥 Leads anónimos calentándose</div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Aún no te contactan, pero su comportamiento dice que están cerca. Adelántate con la oferta correcta.</div>
      {rows.length === 0 && <div style={{ fontSize: 13, color: '#888' }}>Sin leads calientes en este momento.</div>}
      {rows.slice(0, 8).map((v) => (
        <div key={v.visitor_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '4px 0', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
          <span>{(v.features || []).join(', ') || 'explorando'}{(v.colonias || []).length > 0 ? ` · ${v.colonias.join('/')}` : ''}</span>
          <strong style={{ color: 'var(--ok, #16a34a)' }}>calor {v.calor}</strong>
        </div>
      ))}

      {/* Bolsillo del comprador (eje financiero) */}
      {d.financiero && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(0,0,0,0.06)', fontSize: 12, color: '#666' }}>
          <strong style={{ color: '#333' }}>El bolsillo del mercado:</strong>{' '}
          {Object.entries(d.financiero.presupuesto || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'} más buscado ·{' '}
          {d.financiero.intent?.invertir || 0} invertir / {d.financiero.intent?.vivir || 0} vivir
          {d.financiero.mensualidad_mediana ? ` · mensualidad ~$${Math.round(d.financiero.mensualidad_mediana / 1000)}k` : ''}
        </div>
      )}

      {/* Lead Intelligence — compuestas por zona (next-best-zone / urgencia / fit) */}
      {(d.compuestas_lead?.por_zona || []).length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#333', marginBottom: 6 }}>Mejores zonas para ofrecer (urgencia × inventario)</div>
          {(d.compuestas_lead.por_zona)
            .map((z) => ({ z, urg: z.valores?.[IDX_URGENCIA], fit: z.valores?.[IDX_FIT], inv: z.valores?.[IDX_INVENTARIO] }))
            .filter((x) => x.urg === 'ALTA' || (x.inv || 0) >= 40)
            .slice(0, 5)
            .map(({ z, urg, fit, inv }) => (
              <div key={z.zona} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0', color: '#555' }}>
                <span>{z.nombre || z.zona}</span>
                <span>{urg === 'ALTA' ? <strong style={{ color: 'var(--hot, #dc2626)' }}>cerrar YA</strong> : `fit ${fit ?? '—'}`} · inv {inv ?? '—'}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
