/**
 * ObservabilidadIA (Dev-Master · Fase 3) — Cómo Aprende la IA (el cerebro, visible).
 * Rescata los modelos ML que corrían por detrás (cron) sin panel: qué tan bien le atina cada uno,
 * cómo se reentrena solo, qué aprendió el Cerebro, qué vigila — y un inventario que muestra qué IA
 * está ACTIVA vs EN ESPERA de datos (el cable dormido). Consume /devmaster/observabilidad-ia.
 * Integra toda la IA de los 4 portales (AVM/forecast/close-prob/cerebro/alertas).
 */
import React, { useEffect, useState } from 'react';
import { Brain, Gauge, RefreshCw, Eye, Sparkles, CircuitBoard, Lightbulb, BookOpen, Zap } from 'lucide-react';
import { fetchObservabilidadIA, activarModelo } from '../../api/superadminDevmaster';

const dim = { color: 'var(--sa-text-dim)' };
const mute = { color: 'var(--sa-text-mute)' };
const card = { background: 'var(--bg-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16 };
const GREEN = '#34D399'; const AMBER = '#F5C451';

function Panel({ icon: Icon, title, sub, children, accent }) {
  return (
    <div style={{ ...card, ...(accent ? { borderColor: 'rgba(var(--theme-rgb),0.4)' } : {}) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: sub ? 2 : 12 }}>
        {Icon && <Icon size={15} style={{ color: 'var(--theme)' }} />}
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14.5, color: 'var(--sa-text)', margin: 0 }}>{title}</h3>
      </div>
      {sub && <div style={{ fontSize: 11, ...mute, marginBottom: 12 }}>{sub}</div>}
      {children}
    </div>
  );
}

export default function ObservabilidadIA() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [activando, setActivando] = useState(null);   // modelo en proceso
  const [resultado, setResultado] = useState({});     // {modelo: mensaje}

  const cargar = () => fetchObservabilidadIA().then(setD).catch(e => setErr(e.message));
  useEffect(() => {
    let alive = true;
    fetchObservabilidadIA().then(r => { if (alive) setD(r); }).catch(e => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, []);

  const onActivar = async (modelo) => {
    setActivando(modelo);
    try {
      const r = await activarModelo(modelo);
      setResultado(prev => ({ ...prev, [modelo]: r.mensaje }));
      await cargar();
    } catch (e) {
      setResultado(prev => ({ ...prev, [modelo]: 'No se pudo activar. Intenta de nuevo.' }));
    } finally {
      setActivando(null);
    }
  };

  if (err) return <div style={{ color: '#FCA5A5' }}>No se pudo cargar la observabilidad de la IA.</div>;
  if (!d) return <div style={mute}>Abriendo el cerebro de la IA…</div>;

  const acc = d.salud_modelos?.accuracy;
  const mape30 = acc?.mape_30d;

  return (
    <div data-testid="observabilidad-ia" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Titular */}
      <div style={{ ...card, borderColor: 'rgba(var(--theme-rgb),0.45)', background: 'linear-gradient(150deg, rgba(var(--theme-rgb),0.10), rgba(var(--theme-rgb),0.02))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <Brain size={16} style={{ color: 'var(--theme)' }} />
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--sa-text)', margin: 0 }}>Cómo Aprende la IA</h3>
          <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'rgba(var(--theme-rgb),0.18)', color: 'var(--theme)' }}>{d.activos}/{d.total_modelos} Modelos Activos</span>
        </div>
        <p data-testid="oi-resumen" style={{ fontSize: 14, color: 'var(--sa-text)', lineHeight: 1.55, margin: 0, fontWeight: 600 }}>{d.resumen}</p>
        <div style={{ fontSize: 11.5, ...mute, marginTop: 8 }}>{d.fuente?.nota}</div>
      </div>

      {/* Acciones */}
      {(d.acciones || []).length > 0 && (
        <Panel icon={Lightbulb} title="Qué Hacer con Esto" accent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(d.acciones || []).map((a, i) => (
              <div key={i} data-testid="oi-accion" style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--sa-text-dim)', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--theme)', fontWeight: 800 }}>{i + 1}.</span>{a.texto}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Inventario de modelos (el cable dormido) */}
      <Panel icon={CircuitBoard} title="Inventario de Modelos" sub="Qué inteligencia está prendida y qué está lista esperando datos.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 10 }}>
          {(d.inventario_modelos || []).map((m, i) => (
            <div key={i} data-testid="oi-modelo" style={{ ...card, padding: 12, background: 'var(--bg-card-2)', borderColor: m.estado === 'activo' ? 'rgba(52,211,153,0.25)' : 'var(--sa-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)' }}>{m.modelo}</span>
                <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 8px', borderRadius: 999, color: m.estado === 'activo' ? GREEN : AMBER, background: m.estado === 'activo' ? 'rgba(52,211,153,0.12)' : 'rgba(245,196,81,0.12)' }}>
                  {m.estado === 'activo' ? 'Activo' : 'En espera'}
                </span>
              </div>
              <div style={{ fontSize: 10.5, ...mute, marginTop: 4 }}>{m.para}</div>
              {m.detalle && <div style={{ fontSize: 11, ...dim, marginTop: 5 }}>{m.detalle}</div>}
              {m.accion && (
                <button onClick={() => onActivar(m.accion)} disabled={activando === m.accion} data-testid={`activar-${m.accion}`}
                  style={{ marginTop: 9, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: activando === m.accion ? 'wait' : 'pointer',
                    background: 'rgba(var(--theme-rgb),0.12)', border: '1px solid rgba(var(--theme-rgb),0.35)', color: 'var(--theme)',
                    fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 8 }}>
                  <Zap size={11} />{activando === m.accion ? 'Procesando…' : (m.accion_label || 'Activar')}
                </button>
              )}
              {resultado[m.accion] && <div style={{ fontSize: 10.5, color: GREEN, marginTop: 6, lineHeight: 1.4 }}>{resultado[m.accion]}</div>}
            </div>
          ))}
        </div>
      </Panel>

      {/* Grid: salud + cómo aprende + vigila */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(290px,1fr))', gap: 16 }}>
        {/* Salud de los modelos */}
        <Panel icon={Gauge} title="Qué Tan Bien le Atina" sub="Margen de error de la valuación (menor = mejor).">
          <div style={{ marginBottom: 10 }}>
            {mape30?.disponible ? (
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: mape30.valor <= 8 ? GREEN : (mape30.valor <= 12 ? AMBER : '#F2635B') }}>±{mape30.valor}%</div>
            ) : (
              <div style={{ fontSize: 12.5, ...dim, lineHeight: 1.5 }}>
                Aún se está calibrando: necesita ~{mape30?.min || 20} cierres reales para medir su precisión (lleva {mape30?.muestras || 0}). El modelo ya corre; empieza a calificarse solo con los primeros cierres.
              </div>
            )}
            {acc?.cuando && <div style={{ fontSize: 10.5, ...mute, marginTop: 4 }}>Última medición {acc.cuando}</div>}
          </div>
          {(d.salud_modelos?.validaciones || []).slice(0, 4).map((v, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, padding: '5px 0', borderTop: '1px solid var(--sa-border)' }}>
              <span style={{ color: 'var(--sa-text)' }}>{v.modelo}</span>
              <span style={dim}>{v.r2 != null ? `R² ${v.r2}` : ''}{v.muestras ? ` · ${v.muestras} muestras` : ''}</span>
            </div>
          ))}
        </Panel>

        {/* Cómo aprende sola */}
        <Panel icon={RefreshCw} title="Se Reentrena Sola" sub="Los modelos se actualizan automáticamente con datos nuevos.">
          {(d.como_aprende?.retrains || []).map((r, i) => (
            <div key={i} style={{ padding: '7px 0', borderTop: i ? '1px solid var(--sa-border)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                <span style={{ color: 'var(--sa-text)' }}>{r.motor}</span>
                <span style={{ color: GREEN }}>{r.cuando || '—'}</span>
              </div>
              <div style={{ fontSize: 11, ...mute, marginTop: 2 }}>{r.zonas != null ? `${r.zonas} zonas` : ''}{r.corridas ? ` · ${r.corridas} reentrenamientos` : ''}</div>
            </div>
          ))}
          <div style={{ fontSize: 11.5, ...dim, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--sa-border)' }}>
            <b style={{ color: 'var(--sa-text)' }}>{d.como_aprende?.modelos_vivos_hedonico || 0}</b> modelos de precio por zona vivos.
          </div>
        </Panel>

        {/* Qué vigila */}
        <Panel icon={Eye} title="Qué Vigila Sola" sub="Escanea leads y detecta cambios sin que nadie le diga.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={mute}>Revisiones automáticas</span><span style={{ color: 'var(--sa-text)', fontWeight: 700 }}>{d.vigilancia?.corridas ?? '—'}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={mute}>Última revisión</span><span style={{ color: 'var(--sa-text)' }}>{d.vigilancia?.cuando || '—'}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={mute}>Alertas generadas</span><span style={{ color: 'var(--sa-text)' }}>{d.vigilancia?.alertas_creadas ?? 0}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={mute}>Desfase de modelos (drift)</span><span style={{ color: d.vigilancia?.drift_alertas ? '#F2635B' : GREEN, fontWeight: 700 }}>{d.vigilancia?.drift_alertas ? `${d.vigilancia.drift_alertas} alertas` : 'sin desfase'}</span></div>
          </div>
        </Panel>
      </div>

      {/* El espejo del asistente */}
      <Panel icon={BookOpen} title="El Espejo del Asistente" sub="Lo que la IA ya aprendió del uso real — y cómo se reajustó.">
        {(d.espejo?.lecciones || []).length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(d.espejo.lecciones).map((l, i) => (
              <div key={i} data-testid="oi-leccion" style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 12.5 }}>
                <Sparkles size={13} style={{ color: l.resultado === 'won' ? GREEN : 'var(--theme)', marginTop: 2, flexShrink: 0 }} />
                <span style={{ color: 'var(--sa-text-dim)', lineHeight: 1.45 }}>{l.texto} {l.cuando && <span style={{ ...mute, fontSize: 10.5 }}>· {l.cuando}</span>}</span>
              </div>
            ))}
          </div>
        ) : <div style={{ fontSize: 12, ...mute }}>La IA empieza a dejar lecciones cuando se cierran tratos reales.</div>}
        {(d.espejo?.reajustes || []).length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--sa-border)', fontSize: 11.5, ...dim }}>
            Reajustes recientes: {(d.espejo.reajustes).map((r, i) => <span key={i}>{(r.motores || []).join?.(', ') || r.resumen || r.disparo}{i < d.espejo.reajustes.length - 1 ? ' · ' : ''}</span>)}
          </div>
        )}
      </Panel>
    </div>
  );
}
