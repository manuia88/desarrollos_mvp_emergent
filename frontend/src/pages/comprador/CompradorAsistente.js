// CompradorAsistente — "Tu Asistente de Compra": la Sala de Control agéntica del COMPRADOR.
// Despierta el Cerebro para el rol comprador (asesor y dev ya tenían su Sala; el comprador no).
// Reusa los MISMOS endpoints /api/cerebro/* — cero motor nuevo. El asistente busca, revisa
// (precio justo + riesgo de zona), simula tus finanzas y arma tu shortlist SOLO; y para pedir
// una visita (que te conecta con un humano) PIDE tu OK. Aprende de cada resultado.
// Detrás de CEREBRO_ENABLED (fail-soft: si está apagado, muestra "en preparación").
import React, { useState, useEffect, useCallback } from 'react';
import CompradorLayout from '../../components/comprador/CompradorLayout';
import { Brain, Search, Eye, Calendar, Check, X, Zap } from '../../components/icons';
import {
  getCerebroStatus, getCerebroTasks, runCerebroGoal,
  approveCerebroTask, rejectCerebroTask, getCerebroLearning, cerebroLearningDemo,
  getCerebroConfig, saveCerebroConfig, getCerebroCatalog,
} from '../../api/cerebro';
import { fetchVisitas } from '../../api/comprador';

// Cuánta libertad le das (en lenguaje de persona · cero jerga).
const AUTONOMY = [
  { key: 'suggest', label: 'Pregúntame antes de todo', hint: 'Tú decides cada paso' },
  { key: 'semi', label: 'Haz lo seguro, pregúntame lo delicado', hint: 'Recomendado' },
  { key: 'pilot', label: 'Hazlo todo solo', hint: 'Máxima libertad' },
];

const GOAL_ICON = { find_home: Search, watch_market: Eye };

const card = {
  padding: 18, borderRadius: 14, background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)', marginBottom: 16,
};
const eyebrow = {
  fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.07em', color: 'rgba(240,235,224,0.55)',
};

export default function CompradorAsistente() {
  const [status, setStatus] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [learning, setLearning] = useState(null);
  const [loading, setLoading] = useState(true);
  const [runningGoal, setRunningGoal] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const [busyTask, setBusyTask] = useState(null);
  const [toast, setToast] = useState('');
  const [config, setConfig] = useState(null);
  const [catalog, setCatalog] = useState({});
  const [configOpen, setConfigOpen] = useState(false);
  const [visitas, setVisitas] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([
        getCerebroStatus().catch(() => ({ enabled: false })),
        getCerebroTasks().catch(() => ({ tasks: [] })),
      ]);
      setStatus(s); setTasks(t?.tasks || []);
      getCerebroLearning().then(setLearning).catch(() => setLearning(null));
      getCerebroConfig().then((c) => setConfig(c?.config || c || null)).catch(() => setConfig(null));
      getCerebroCatalog().then((c) => setCatalog(c?.areas || {})).catch(() => setCatalog({}));
      fetchVisitas().then((v) => setVisitas(v?.visitas || [])).catch(() => setVisitas([]));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2600); };

  const runGoal = async (gid) => {
    setRunningGoal(gid); setLastRun(null);
    try {
      const r = await runCerebroGoal(gid);
      setLastRun({ gid, status: r.status, results: r.results || [] });
      await load();
    } catch { flash('No se pudo ejecutar. Intenta de nuevo.'); }
    finally { setRunningGoal(null); }
  };

  const approve = async (t) => {
    setBusyTask(t.id);
    try { await approveCerebroTask(t.id, null); flash('¡Listo! Seguí adelante. ✅'); await load(); }
    catch { flash('No se pudo aprobar.'); } finally { setBusyTask(null); }
  };
  const reject = async (t) => {
    setBusyTask(t.id);
    try { await rejectCerebroTask(t.id); flash('Ok, no lo hice.'); await load(); }
    catch { flash('No se pudo.'); } finally { setBusyTask(null); }
  };

  const setAutonomy = async (lvl) => {
    setConfig((c) => ({ ...(c || {}), autonomy: lvl }));
    try { const r = await saveCerebroConfig({ autonomy: lvl }); setConfig(r?.config || r); flash('Listo, lo guardé.'); }
    catch { flash('No se pudo guardar.'); load(); }
  };
  const actionNeedsOk = (a) => {
    if (a.hard) return true;
    const del = config?.delicate_overrides || [];
    const auto = config?.auto_overrides || [];
    if (del.includes(a.action)) return true;
    if (auto.includes(a.action)) return false;
    return !!a.delicate;
  };
  const toggleAction = async (a) => {
    if (a.hard) return;
    const del = new Set(config?.delicate_overrides || []);
    const auto = new Set(config?.auto_overrides || []);
    if (actionNeedsOk(a)) { del.delete(a.action); auto.add(a.action); }
    else { auto.delete(a.action); del.add(a.action); }
    const patch = { delicate_overrides: [...del], auto_overrides: [...auto] };
    setConfig((c) => ({ ...(c || {}), ...patch }));
    try { const r = await saveCerebroConfig(patch); setConfig(r?.config || r); }
    catch { flash('No se pudo guardar.'); load(); }
  };

  const goals = status?.goals || {};
  const pending = tasks.filter((t) => t.status === 'awaiting_approval');
  const done = tasks.filter((t) => t.status === 'done').slice(0, 10);
  const learnEmpty = !learning || ((learning.calibration || []).every((c) => !c.n)
    && !(learning.lessons || []).length && !(learning.retrains || []).length);

  // Renderiza el resultado de un paso en lenguaje humano (+ propiedades si las trae).
  const StepResult = ({ r }) => {
    const res = r.result || {};
    const props = res.properties || res.items || [];
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13.5, color: 'rgba(240,235,224,0.85)', lineHeight: 1.5 }}>
          {res.summary || res.veredicto || res.answer || r.action || '—'}
        </div>
        {props.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {props.slice(0, 6).map((p, i) => (
              <div key={p.property_id || i} style={{
                padding: '7px 11px', borderRadius: 9999,
                background: 'rgba(var(--theme-rgb),0.10)',
                border: '1px solid rgba(var(--theme-rgb),0.22)',
                fontSize: 12, color: 'rgba(240,235,224,0.85)',
              }}>
                {p.property_title || p.property_id}
                {p.score != null && <strong style={{ color: 'var(--theme)', marginLeft: 6 }}>{Math.round(p.score)}</strong>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <CompradorLayout>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Brain size={22} color="var(--theme)" />
          <h1 style={{ fontFamily: 'Outfit', fontSize: 24, fontWeight: 800, margin: 0, color: 'var(--cream)' }}>
            Tu Asistente de Compra
          </h1>
        </div>
        <p style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'rgba(240,235,224,0.7)', margin: '0 0 18px' }}>
          Busca, revisa el precio y el riesgo, te simula las finanzas y arma tu lista — solo. Para pedir una visita, te pide tu OK.
        </p>

        {toast && (
          <div style={{
            marginBottom: 14, padding: '9px 14px', borderRadius: 10,
            background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
            color: '#4ADE80', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
          }}>{toast}</div>
        )}

        {loading ? (
          <div style={{ ...card, textAlign: 'center', color: 'rgba(240,235,224,0.6)', fontSize: 13 }}>
            Cargando tu asistente…
          </div>
        ) : !status?.enabled ? (
          <div style={{ ...card, textAlign: 'center', padding: '28px 18px' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--cream)', marginBottom: 6 }}>
              Tu asistente está en preparación
            </div>
            <div style={{ fontSize: 13, color: 'rgba(240,235,224,0.65)', maxWidth: 460, margin: '0 auto', lineHeight: 1.5 }}>
              Se prende del lado del sistema. Cuando esté activo, aquí le pides que te encuentre tu casa
              o que vigile el mercado por ti — y verás cada paso que da.
            </div>
          </div>
        ) : (
          <>
            {/* TU TURNO · lo que espera tu OK */}
            {pending.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ ...eyebrow, marginBottom: 10 }}>⏳ Tu Turno · Espera Tu OK</div>
                {pending.map((t) => (
                  <div key={t.id} data-testid={`comprador-pending-${t.id}`} style={{
                    marginBottom: 14, padding: 16, borderRadius: 14,
                    border: '1px solid rgba(250,204,21,0.4)', background: 'rgba(250,204,21,0.08)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Calendar size={15} color="#FACC15" />
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--cream)' }}>
                        {t.title || t.label || 'Solicitar visita'}
                      </div>
                    </div>
                    {(t.preview || t.summary) && (
                      <div style={{ fontSize: 13, color: 'rgba(240,235,224,0.72)', marginBottom: 10, lineHeight: 1.5 }}>
                        {t.preview || t.summary}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => approve(t)} disabled={busyTask === t.id} data-testid={`comprador-approve-${t.id}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: busyTask === t.id ? 0.6 : 1 }}>
                        <Check size={14} /> Sí, pídela
                      </button>
                      <button onClick={() => reject(t)} disabled={busyTask === t.id}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', color: 'rgba(240,235,224,0.7)', border: '1px solid rgba(240,235,224,0.18)', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        <X size={14} /> Ahora no
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* PÍDELE UNA JUGADA · las metas del comprador */}
            <div style={{ ...eyebrow, marginBottom: 10 }}>🎯 ¿Qué Quieres Que Haga?</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12, marginBottom: 16 }}>
              {Object.entries(goals).map(([gid, label]) => {
                const Icon = GOAL_ICON[gid] || Zap;
                return (
                  <div key={gid} style={{ ...card, marginBottom: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, minHeight: 40 }}>
                      <Icon size={16} color="var(--theme)" />
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--cream)' }}>{label}</div>
                    </div>
                    <button onClick={() => runGoal(gid)} disabled={runningGoal === gid} data-testid={`comprador-goal-${gid}`}
                      style={{ width: '100%', background: 'linear-gradient(90deg, var(--theme), var(--theme-3, #ec4899))', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: runningGoal === gid ? 0.6 : 1 }}>
                      {runningGoal === gid ? 'Trabajando…' : 'Hazlo'}
                    </button>
                  </div>
                );
              })}
              {Object.keys(goals).length === 0 && (
                <div style={{ fontSize: 13, color: 'rgba(240,235,224,0.6)' }}>Aún sin jugadas disponibles.</div>
              )}
            </div>

            {/* RESULTADO del último run */}
            {lastRun && (
              <div style={card}>
                <div style={{ ...eyebrow, marginBottom: 10 }}>Esto Hice</div>
                {(lastRun.results || []).map((r, i) => <StepResult key={i} r={r} />)}
                {(lastRun.results || []).length === 0 && (
                  <div style={{ fontSize: 13, color: 'rgba(240,235,224,0.6)' }}>Sin pasos para mostrar.</div>
                )}
                {lastRun.status === 'paused' && (
                  <div style={{ fontSize: 13, color: '#FACC15', marginTop: 8, fontWeight: 600 }}>
                    Para terminar, dame tu OK arriba 👆
                  </div>
                )}
              </div>
            )}

            {/* TUS VISITAS · estado de las que pediste (el dev las recibe y confirma) */}
            {visitas.length > 0 && (
              <div style={card}>
                <div style={{ ...eyebrow, marginBottom: 10 }}>🗓️ Tus Visitas</div>
                {visitas.slice(0, 6).map((v) => {
                  const color = v.status === 'accepted' ? '#4ADE80' : v.status === 'declined' ? '#F87171' : '#FACC15';
                  return (
                    <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
                      <Calendar size={14} color={color} />
                      <div style={{ flex: 1, fontSize: 13, color: 'rgba(240,235,224,0.85)' }}>
                        {v.property_name || v.property_id}
                      </div>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color }}>{v.status_label}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* CÓMO VOY APRENDIENDO */}
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={eyebrow}>🌱 Cómo Voy Aprendiendo</div>
                {learnEmpty && (
                  <button onClick={() => cerebroLearningDemo().then(() => getCerebroLearning().then(setLearning)).catch(() => {})}
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 9999, border: '1px solid rgba(240,235,224,0.18)', background: 'transparent', color: 'rgba(240,235,224,0.7)', cursor: 'pointer' }}>
                    Ver ejemplo
                  </button>
                )}
              </div>
              {learnEmpty ? (
                <div style={{ fontSize: 13, color: 'rgba(240,235,224,0.6)', lineHeight: 1.5 }}>
                  Todavía aprendo de ti. Conforme uses el asistente, aquí verás qué tan bien le atino a lo que buscas.
                </div>
              ) : (
                <>
                  {(learning.calibration || []).filter((c) => c.n).map((c) => (
                    <div key={c.kind} style={{ fontSize: 13, marginBottom: 6, color: 'rgba(240,235,224,0.85)' }}>
                      <strong>{c.label || c.kind}:</strong> {c.lectura || `${c.n} predicciones calificadas`}
                    </div>
                  ))}
                  {(learning.lessons || []).slice(0, 3).map((l, i) => (
                    <div key={i} style={{ fontSize: 13, color: 'rgba(240,235,224,0.72)', marginBottom: 5 }}>💡 {l.text || l.summary || l}</div>
                  ))}
                </>
              )}
            </div>

            {/* CONFIGURAR MI ASISTENTE · confianza que se gana */}
            <div style={card}>
              <button onClick={() => setConfigOpen((o) => !o)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <span style={eyebrow}>⚙️ Configurar Mi Asistente</span>
                <span style={{ fontSize: 12, color: 'rgba(240,235,224,0.6)' }}>{configOpen ? 'Ocultar' : 'Ajustar'}</span>
              </button>
              {configOpen && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)', marginBottom: 8 }}>¿Cuánta libertad le das?</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                    {AUTONOMY.map((lvl) => {
                      const on = (config?.autonomy || 'semi') === lvl.key;
                      return (
                        <button key={lvl.key} onClick={() => setAutonomy(lvl.key)} data-testid={`comprador-autonomy-${lvl.key}`}
                          style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                                   border: on ? '1.5px solid var(--theme)' : '1px solid rgba(240,235,224,0.15)',
                                   background: on ? 'rgba(var(--theme-rgb),0.10)' : 'transparent' }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--cream)' }}>{lvl.label}
                            {lvl.hint === 'Recomendado' && <span style={{ fontSize: 10, fontWeight: 700, color: '#4ADE80', marginLeft: 6 }}>Recomendado</span>}</div>
                          {lvl.hint !== 'Recomendado' && <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.55)' }}>{lvl.hint}</div>}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)', marginBottom: 8 }}>¿Qué quieres aprobar tú?</div>
                  {Object.entries(catalog).map(([area, actions]) => (
                    <div key={area} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'rgba(240,235,224,0.45)', marginBottom: 5 }}>{area}</div>
                      {actions.map((a) => {
                        const needsOk = actionNeedsOk(a);
                        return (
                          <div key={a.action} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0' }}>
                            <span style={{ fontSize: 13, color: 'rgba(240,235,224,0.85)' }}>{a.label}{a.hard && <span style={{ fontSize: 10, color: '#FACC15', marginLeft: 6 }}>🔒 siempre tu OK</span>}</span>
                            <button onClick={() => toggleAction(a)} disabled={a.hard} data-testid={`comprador-act-${a.action}`}
                              style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 9999, cursor: a.hard ? 'default' : 'pointer',
                                       border: 'none', background: needsOk ? 'rgba(250,204,21,0.15)' : 'rgba(34,197,94,0.15)',
                                       color: needsOk ? '#FACC15' : '#4ADE80', opacity: a.hard ? 0.7 : 1 }}>
                              {needsOk ? 'Pídeme OK' : 'Hazlo solo'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {Object.keys(catalog).length === 0 && <div style={{ fontSize: 12, color: 'rgba(240,235,224,0.6)' }}>Sin acciones configurables aún.</div>}
                </div>
              )}
            </div>

            {/* HECHO RECIENTEMENTE */}
            {done.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <div style={{ ...eyebrow, marginBottom: 8 }}>Hecho Recientemente</div>
                {done.map((t) => (
                  <div key={t.id} style={{ fontSize: 12.5, color: 'rgba(240,235,224,0.55)', marginBottom: 4 }}>✓ {t.title || t.label || t.action}</div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </CompradorLayout>
  );
}
