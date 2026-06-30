// UnitPulsePanel — el lente TASTE a nivel UNIDAD: qué unidad atrae y cuál enfría, desde el comportamiento real
// del comprador (vistas/guardados vs descartes + foto-dwell). Cierra el gap "el porqué del NO no llega a nivel unidad
// al dev". Hide-if-empty (solo aparece cuando hay señal conductual real).
import React, { useEffect, useState } from 'react';
import { getUnitPulse } from '../../api/developer';

const HEAD = "'Outfit',sans-serif";

export default function UnitPulsePanel({ devId }) {
  const [d, setD] = useState(null);
  useEffect(() => { let alive = true; getUnitPulse(devId).then((r) => alive && setD(r)).catch(() => alive && setD(null)); return () => { alive = false; }; }, [devId]);

  if (!d || !d.unidades) return null;
  const conSenal = d.unidades.filter((u) => (u.vistas + u.guardados + u.descartes) > 0);
  if (conSenal.length === 0) return null; // hide-if-empty

  const calientes = d.unidades.filter((u) => u.señal === 'caliente').slice(0, 6);
  const frias = d.unidades.filter((u) => u.señal === 'fría').slice(0, 6);
  const pill = (label, color) => ({ fontSize: 11.5, color, background: `${color}1a`, border: `1px solid ${color}55`, padding: '2px 9px', borderRadius: 9999 });

  return (
    <div style={{ border: '1px solid rgba(var(--cream-rgb),0.12)', borderRadius: 14, padding: '14px 16px', background: 'rgba(var(--cream-rgb),0.03)', marginBottom: 16 }}>
      <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 14.5, color: 'var(--cream)' }}>Pulso por unidad</div>
      <div style={{ fontSize: 12, color: 'var(--cream-3)', marginTop: 2, marginBottom: 10 }}>
        Qué unidad atrae y cuál enfría, según el comportamiento real del comprador. {d.lectura}
      </div>
      {calientes.length > 0 && (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--cream-2)' }}>Calientes:</span>
          {calientes.map((u) => <span key={u.unit_id} style={pill(u.unit_id.replace(/.*-/, ''), '#22c55e')}>{u.unit_id.replace(/.*-/, '')} · {u.guardados}★ {u.vistas}👁</span>)}
        </div>
      )}
      {frias.length > 0 && (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--cream-2)' }}>Frías (revisa precio/fotos):</span>
          {frias.map((u) => <span key={u.unit_id} style={pill(u.unit_id.replace(/.*-/, ''), '#f59e0b')}>{u.unit_id.replace(/.*-/, '')} · {u.descartes} descartes</span>)}
        </div>
      )}
    </div>
  );
}
