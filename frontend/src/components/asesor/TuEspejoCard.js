// TuEspejoCard — "Tu Espejo": diagnóstico de desempeño on-demand del asesor.
// Despierta una feature apagada: reusa el motor del agente Coach (coaching_analysis) que
// hoy solo corre 1 tip/día → ahora el asesor pide su análisis cuando quiera. IA-first.
// Backend: GET /api/asesor/mi-espejo → { patterns[], suggestions[] }.
import React, { useEffect, useState } from 'react';
import { Card } from '../advisor/primitives';
import { getMiEspejo } from '../../api/advisor';

const SEV_COLOR = { alta: '#ef4444', media: '#f59e0b', baja: '#22c55e', critical: '#ef4444', warning: '#f59e0b' };

export default function TuEspejoCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = async () => {
    setLoading(true); setErr('');
    try {
      const d = await getMiEspejo();
      setData(d);
    } catch (e) {
      setErr(e?.message || 'No se pudo cargar tu espejo');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const patterns = data?.patterns || [];
  const suggestions = data?.suggestions || [];
  const vacio = !loading && !err && patterns.length === 0 && suggestions.length === 0 && !data?.ritmo;

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          🪞 Tu Espejo · Cómo Vas
        </div>
        <button onClick={load} disabled={loading}
          style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 9999,
                   border: '1px solid rgba(0,0,0,0.12)', background: 'transparent',
                   cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Analizando…' : 'Pedir análisis'}
        </button>
      </div>

      {err && <div style={{ fontSize: 12, color: '#ef4444' }}>{err}</div>}

      {/* #3 · "Tu Ritmo": señal de actividad propia (solo aparece si bajó) */}
      {data?.ritmo?.lectura && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12,
                      padding: '9px 11px', borderRadius: 9, background: 'rgba(245,158,11,0.10)' }}>
          <span style={{ fontSize: 14 }}>📉</span>
          <span style={{ fontSize: 12.5, lineHeight: 1.45, color: '#b45309' }}>{data.ritmo.lectura}</span>
        </div>
      )}
      {vacio && <div style={{ fontSize: 12, color: 'var(--cream-3,#807e78)' }}>
        Aún sin suficiente actividad para un análisis. Trabaja unos leads y vuelve — tu espejo se llena solo.
      </div>}

      {patterns.length > 0 && (
        <div style={{ marginBottom: suggestions.length ? 12 : 0 }}>
          {patterns.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: 9999, marginTop: 5,
                             background: SEV_COLOR[p.severity] || '#9ca3af', flexShrink: 0 }} />
              <span style={{ fontSize: 13, lineHeight: 1.45 }}>{p.summary || p.label || p.key}</span>
            </div>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 10 }}>
          <div className="eyebrow" style={{ marginBottom: 6, fontSize: 10 }}>Tu Siguiente Jugada</div>
          {suggestions.map((s, i) => (
            <div key={i} style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 6, display: 'flex', gap: 6 }}>
              <span>→</span><span>{s.text || s}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10, color: 'var(--cream-3,#9ca3af)', marginTop: 10, opacity: 0.8 }}>
        Basado en tu actividad real (cierres, ritmo, SOC). Honesto: si hay poco dato, lo dice.
      </div>
    </Card>
  );
}
