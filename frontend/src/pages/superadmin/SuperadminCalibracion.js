/**
 * SuperadminCalibracion — F1.6 · Calibración de motores contra casos reales.
 * El "examen": mete los datos reales de Puente Alvarado a nuestras fórmulas del terreno y
 * compara lo que predecimos vs lo que pasó. Cada chequeo: calibrado o por ajustar.
 * Cierra el ciclo: botón para aplicar los valores documentados al motor de valor residual.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Gauge, CheckCircle, AlertTriangle, RefreshCw, Info } from 'lucide-react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card } from '../../components/advisor/primitives';
import { getCalibracionTerreno, aplicarCalibracionTerreno } from '../../api/indices';

const ESTADO = {
  calibrado: { color: '#22c55e', bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.35)', label: 'Calibrado', Icon: CheckCircle },
  ajustar:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.38)', label: 'Por ajustar', Icon: AlertTriangle },
  info:      { color: '#818cf8', bg: 'rgba(129,140,248,0.08)', border: 'rgba(129,140,248,0.35)', label: 'Referencia', Icon: Info },
};
const GLOBAL = {
  calibrado: { color: '#22c55e', label: 'Calibrado' },
  casi:      { color: '#f59e0b', label: 'Casi — aplica los valores' },
  ajustar:   { color: '#ef4444', label: 'Por ajustar' },
};

export default function SuperadminCalibracion() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [err, setErr] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true); setErr('');
    try { setData(await getCalibracionTerreno()); }
    catch (e) { setErr(e.message || 'No se pudo cargar'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const aplicar = async () => {
    setApplying(true); setErr('');
    try { await aplicarCalibracionTerreno(); await cargar(); }
    catch (e) { setErr(e.message || 'No se pudo aplicar'); }
    finally { setApplying(false); }
  };

  const g = data ? (GLOBAL[data.estado] || GLOBAL.ajustar) : null;
  const hayAjustes = data && (data.sugerencias || []).length > 0;

  return (
    <SuperadminLayout>
      <PageHeader
        eyebrow="Calidad · Calibración de Motores"
        title="¿Nuestras fórmulas reproducen la realidad?"
        sub="Le metemos a nuestros motores del terreno los datos reales de un proyecto conocido (Puente Alvarado) y comparamos lo que predecimos contra lo que pasó."
      />

      {err && <Card style={{ padding: 14, marginBottom: 14, color: '#f87171' }}>{err}</Card>}
      {loading && <Card style={{ padding: 28, color: '#64748b' }}>Corriendo el examen…</Card>}

      {data && !loading && (
        <>
          {/* Veredicto global */}
          <Card style={{ padding: 22, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Gauge size={26} style={{ color: g.color }} />
                <div>
                  <div style={{ fontSize: 13, color: '#94a3b8' }}>Examen vs {data.caso}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: g.color }}>{g.label}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={cargar} disabled={loading} style={btn('ghost')}>
                  <RefreshCw size={14} /> Volver a correr
                </button>
                {hayAjustes && (
                  <button onClick={aplicar} disabled={applying} style={btn('primary')}>
                    {applying ? 'Aplicando…' : 'Aplicar valores calibrados'}
                  </button>
                )}
              </div>
            </div>
            <div style={{ fontSize: 13.5, color: '#cbd5e1', marginTop: 12, lineHeight: 1.5 }}>{data.resumen}</div>
            {data.calibracion_aplicada && (
              <div style={{ fontSize: 12, color: '#22c55e', marginTop: 8 }}>
                ● El motor de valor residual ya usa los valores calibrados.
              </div>
            )}
          </Card>

          {/* Sugerencias (qué cambiar) */}
          {hayAjustes && (
            <Card style={{ padding: 16, marginBottom: 16, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.3)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fcd34d', marginBottom: 10 }}>Qué ajustaríamos</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {data.sugerencias.map((s, i) => (
                  <div key={i} style={{ fontSize: 13, color: '#e2e8f0' }}>
                    {s.que}: <span style={{ color: '#f87171' }}>{s.de}</span> → <span style={{ color: '#86efac', fontWeight: 700 }}>{s.a}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Cada chequeo */}
          <div style={{ display: 'grid', gap: 12 }}>
            {data.checks.map(ch => {
              const e = ESTADO[ch.estado] || ESTADO.ajustar;
              return (
                <Card key={ch.clave} style={{ padding: 16, background: e.bg, border: `1px solid ${e.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minWidth: 0 }}>
                      <e.Icon size={18} style={{ color: e.color, flexShrink: 0, marginTop: 1 }} />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{ch.nombre}</div>
                        {ch.detalle && <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 3, lineHeight: 1.45 }}>{ch.detalle}</div>}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 800, color: e.color, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{e.label}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 24, marginTop: 12, flexWrap: 'wrap' }}>
                    <Metric label="Esperado (real)" value={ch.esperado} unidad={ch.unidad} />
                    <Metric label="Nuestro motor" value={ch.obtenido} unidad={ch.unidad} />
                    {ch.error_pct != null && <Metric label="Diferencia" value={`${ch.error_pct > 0 ? '+' : ''}${ch.error_pct}%`} />}
                  </div>
                  {ch.sugerencia && <div style={{ fontSize: 12.5, color: '#a5b4fc', marginTop: 10 }}>→ {ch.sugerencia}</div>}
                </Card>
              );
            })}
          </div>

          <div style={{ fontSize: 12, color: '#64748b', marginTop: 16, lineHeight: 1.5 }}>{data.nota}</div>
        </>
      )}
    </SuperadminLayout>
  );
}

function Metric({ label, value, unidad }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#f1f5f9', marginTop: 2 }}>
        {value}{unidad && typeof value === 'number' ? ` ${unidad}` : ''}
      </div>
    </div>
  );
}

function btn(kind) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10,
    fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none',
  };
  if (kind === 'primary') return { ...base, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff' };
  return { ...base, background: 'transparent', border: '1px solid rgba(148,163,184,0.3)', color: '#94a3b8' };
}
