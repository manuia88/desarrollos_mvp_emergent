// Salud de tu Red (Red Comercial · Bloque 1.5) — capa IA-first sobre el directorio: concentración
// (¿dependes de uno?), in-house vs broker, quién cierra y quién no, con acciones (diversifica/reasigna).
// Mismo patrón que "Red de Asesores" del Dev-Master, sobre los leads del dev. Consume /red-salud.
import React, { useEffect, useState } from 'react';
import { getDevRedSalud } from '../../api/developer';
import { Sparkle } from '../icons';

const card = { background: 'var(--surface, #fff)', border: '1px solid var(--border-2, var(--border))', borderRadius: 14, padding: 16, boxShadow: 'var(--asr-shadow, none)' };

export default function DevRedSalud({ onVerAsesores }) {
  const [d, setD] = useState(null);
  useEffect(() => { getDevRedSalud().then(setD).catch(() => setD(false)); }, []);
  if (!d) return null;

  const split = d.canal_split || {};
  const splitTotal = (split.inhouse || 0) + (split.broker || 0) || 1;
  const maxLeads = Math.max(...(d.red || []).map(a => a.leads), 1);

  return (
    <div data-testid="dev-red-salud" style={{ ...card, borderColor: 'rgba(109,74,255,0.4)', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--theme)' }}>
          <Sparkle size={11} /> Salud de tu Red
        </div>
        <span style={{ fontSize: 11, color: d.concentracion_top >= 35 ? 'var(--warm, #E2982E)' : 'var(--cream-3)' }}>Concentración top: {d.concentracion_top}%</span>
      </div>
      <p data-testid="rs-resumen" style={{ margin: 0, fontFamily: 'Outfit,sans-serif', fontWeight: 700, fontSize: 15.5, color: 'var(--cream)', lineHeight: 1.45 }}>{d.resumen}</p>

      {/* split in-house vs broker */}
      <div style={{ display: 'flex', height: 7, borderRadius: 999, overflow: 'hidden', marginTop: 12 }}>
        <div style={{ width: `${(split.inhouse || 0) / splitTotal * 100}%`, background: 'var(--theme, #6D4AFF)' }} />
        <div style={{ width: `${(split.broker || 0) / splitTotal * 100}%`, background: 'var(--warm, #E2982E)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 5 }}>
        <span>In-house {split.inhouse || 0}</span><span>Brokers {split.broker || 0}</span>
      </div>

      {/* ranking compacto */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 12 }}>
        {(d.red || []).slice(0, 5).map((a, i) => (
          <div key={i} data-testid="rs-asesor" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
            <span style={{ minWidth: 130, color: 'var(--cream)' }}>{a.asesor}<span style={{ fontSize: 9.5, marginLeft: 6, color: a.canal === 'broker' ? 'var(--warm, #E2982E)' : 'var(--theme)' }}>{a.canal === 'broker' ? 'broker' : 'in-house'}</span></span>
            <div style={{ flex: 1, maxWidth: 120, height: 5, borderRadius: 999, background: 'rgba(var(--cream-rgb),0.08)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round(a.leads / maxLeads * 100)}%`, background: 'var(--theme, #6D4AFF)', borderRadius: 999 }} />
            </div>
            <span style={{ minWidth: 110, textAlign: 'right', color: 'var(--cream-3)' }}>{a.leads} leads · <b style={{ color: a.conversion >= 15 ? 'var(--ok, #1FA06A)' : (a.conversion === 0 ? 'var(--hot, #F2635B)' : 'var(--cream)') }}>{a.conversion}%</b></span>
          </div>
        ))}
      </div>

      {/* acciones agentic */}
      {(d.acciones || []).length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border, rgba(var(--cream-rgb),0.08))', display: 'flex', flexDirection: 'column', gap: 7 }}>
          {(d.acciones || []).map((a, i) => (
            <div key={i} data-testid="rs-accion" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.45 }}>
              <span style={{ color: 'var(--theme)', fontWeight: 800 }}>{i + 1}.</span>{a.texto}
            </div>
          ))}
        </div>
      )}
      {onVerAsesores && (
        <button onClick={onVerAsesores} style={{ marginTop: 10, background: 'transparent', border: 'none', color: 'var(--theme)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Ver métricas de asesores a fondo →</button>
      )}
    </div>
  );
}
