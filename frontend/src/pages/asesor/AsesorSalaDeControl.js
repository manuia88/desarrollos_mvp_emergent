// AsesorSalaDeControl — "Tu Asistente": la Sala de Control agéntica del asesor.
// Despierta el Cerebro para el rol asesor (el portal Dev ya tenía su Sala; el asesor no).
// Reusa los MISMOS endpoints /api/cerebro/* (que sirven metas del rol asesor) — cero motor nuevo.
// Loop agéntico: el asistente propone → ejecuta lo seguro solo → en lo delicado pide tu OK →
// aprende de los resultados ("cómo voy aprendiendo"). Detrás de CEREBRO_ENABLED (fail-soft).
import React, { useState, useEffect, useCallback } from 'react';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { Card } from '../../components/advisor/primitives';
import {
  getCerebroStatus, getCerebroTasks, runCerebroGoal,
  approveCerebroTask, rejectCerebroTask, getCerebroLearning, cerebroLearningDemo,
} from '../../api/cerebro';

export default function AsesorSalaDeControl({ user, onLogout }) {
  const [status, setStatus] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [learning, setLearning] = useState(null);
  const [loading, setLoading] = useState(true);
  const [runningGoal, setRunningGoal] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const [edits, setEdits] = useState({});
  const [busyTask, setBusyTask] = useState(null);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([
        getCerebroStatus().catch(() => ({ enabled: false })),
        getCerebroTasks().catch(() => ({ tasks: [] })),
      ]);
      setStatus(s); setTasks(t?.tasks || []);
      getCerebroLearning().then(setLearning).catch(() => setLearning(null));
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
    try { await approveCerebroTask(t.id, edits[t.id] ? { text: edits[t.id] } : null); flash('¡Hecho! Seguí adelante. ✅'); await load(); }
    catch { flash('No se pudo aprobar.'); } finally { setBusyTask(null); }
  };
  const reject = async (t) => {
    setBusyTask(t.id);
    try { await rejectCerebroTask(t.id); flash('Ok, no lo hice.'); await load(); }
    catch { flash('No se pudo.'); } finally { setBusyTask(null); }
  };

  const goals = status?.goals || {};
  const pending = tasks.filter((t) => t.status === 'awaiting_approval');
  const done = tasks.filter((t) => t.status === 'done').slice(0, 12);
  const learnEmpty = !learning || ((learning.calibration || []).every((c) => !c.n)
    && !(learning.lessons || []).length && !(learning.retrains || []).length);

  return (
    <AdvisorLayout user={user} onLogout={onLogout} active="asistente">
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ fontFamily: 'Outfit', fontSize: 24, fontWeight: 800, margin: 0 }}>🧠 Tu Asistente</h1>
          <p style={{ fontSize: 13.5, color: 'var(--cream-3,#807e78)', marginTop: 4 }}>
            Hace solo lo seguro y te pide permiso en lo delicado. Aprende de cada resultado.
          </p>
        </div>

        {toast && <div style={{ marginBottom: 14, padding: '9px 14px', borderRadius: 9, background: 'rgba(34,197,94,0.12)', color: '#16a34a', fontSize: 13 }}>{toast}</div>}

        {loading ? (
          <Card><div style={{ padding: 30, textAlign: 'center', color: 'var(--cream-3,#807e78)' }}>Cargando tu asistente…</div></Card>
        ) : !status?.enabled ? (
          <Card><div style={{ padding: '28px 18px', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Tu asistente está en preparación</div>
            <div style={{ fontSize: 13, color: 'var(--cream-3,#807e78)' }}>
              Se prende del lado del sistema. Cuando esté activo, aquí verás las jugadas que propone, lo que espera tu OK, y cómo va aprendiendo.
            </div>
          </div></Card>
        ) : (
          <>
            {/* TU TURNO · tareas que esperan tu OK */}
            {pending.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <div className="eyebrow" style={{ marginBottom: 10 }}>⏳ Tu Turno · Esperan Tu OK</div>
                {pending.map((t) => (
                  <div key={t.id} data-testid={`asesor-pending-${t.id}`}
                    style={{ marginBottom: 14, padding: 16, borderRadius: 14, border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.08)' }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 6 }}>{t.title || t.label || 'Jugada propuesta'}</div>
                    {(t.preview || t.summary) && <div style={{ fontSize: 13, color: 'var(--cream-2,#555)', marginBottom: 10, lineHeight: 1.5 }}>{t.preview || t.summary}</div>}
                    <textarea placeholder="Si quieres, ajústalo antes de aprobar…" defaultValue={t.preview || ''}
                      onChange={(e) => setEdits((p) => ({ ...p, [t.id]: e.target.value }))}
                      style={{ width: '100%', minHeight: 56, padding: 10, borderRadius: 9, border: '1px solid rgba(0,0,0,0.12)', fontFamily: 'DM Sans', fontSize: 13, marginBottom: 10, resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => approve(t)} disabled={busyTask === t.id} data-testid={`asesor-approve-${t.id}`}
                        style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: busyTask === t.id ? 0.6 : 1 }}>✓ Sí, dale</button>
                      <button onClick={() => reject(t)} disabled={busyTask === t.id}
                        style={{ background: 'transparent', color: 'var(--cream-2,#555)', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>✕ Ahora no</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* METAS · lo que tu asistente puede hacer */}
            <div className="eyebrow" style={{ marginBottom: 10 }}>🎯 Pídele Una Jugada</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 14 }}>
              {Object.entries(goals).map(([gid, label]) => (
                <Card key={gid}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, minHeight: 38 }}>{label}</div>
                  <button onClick={() => runGoal(gid)} disabled={runningGoal === gid} data-testid={`asesor-goal-${gid}`}
                    style={{ width: '100%', background: 'linear-gradient(90deg,#6366f1,#ec4899)', color: '#fff', border: 'none', borderRadius: 9, padding: '8px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: runningGoal === gid ? 0.6 : 1 }}>
                    {runningGoal === gid ? 'Trabajando…' : 'Ejecutar'}
                  </button>
                </Card>
              ))}
              {Object.keys(goals).length === 0 && <div style={{ fontSize: 13, color: 'var(--cream-3,#807e78)' }}>Aún sin jugadas disponibles para tu rol.</div>}
            </div>

            {/* Resultado del último run */}
            {lastRun && (
              <Card style={{ marginBottom: 22 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Resultado</div>
                {(lastRun.results || []).map((r, i) => (
                  <div key={i} style={{ fontSize: 13.5, color: 'var(--cream-2,#444)', marginBottom: 6, lineHeight: 1.5 }}>
                    {(r.result && (r.result.summary || r.result.answer)) || r.action || '—'}
                  </div>
                ))}
                {lastRun.status === 'paused' && <div style={{ fontSize: 13, color: '#b45309', marginTop: 8 }}>Para terminar, dame tu OK arriba 👆</div>}
              </Card>
            )}

            {/* CÓMO VOY APRENDIENDO */}
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div className="eyebrow">🌱 Cómo Voy Aprendiendo</div>
                {learnEmpty && <button onClick={() => cerebroLearningDemo().then(() => getCerebroLearning().then(setLearning)).catch(() => {})}
                  style={{ fontSize: 11, padding: '4px 10px', borderRadius: 9999, border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', cursor: 'pointer' }}>Ver ejemplo</button>}
              </div>
              {learnEmpty ? (
                <div style={{ fontSize: 13, color: 'var(--cream-3,#807e78)' }}>
                  Aún sin suficientes resultados para calificarme. Conforme cierres tratos, aquí verás qué tan bien te atino y qué aprendí.
                </div>
              ) : (
                <>
                  {(learning.calibration || []).filter((c) => c.n).map((c) => (
                    <div key={c.kind} style={{ fontSize: 13, marginBottom: 6 }}>
                      <strong>{c.label || c.kind}:</strong> {c.lectura || `${c.n} predicciones calificadas`}
                    </div>
                  ))}
                  {(learning.lessons || []).slice(0, 3).map((l, i) => (
                    <div key={i} style={{ fontSize: 13, color: 'var(--cream-2,#555)', marginBottom: 5 }}>💡 {l.text || l.summary || l}</div>
                  ))}
                  {(learning.retrains || [])[0] && <div style={{ fontSize: 12, color: 'var(--cream-3,#807e78)' }}>🔄 {learning.retrains[0].summary}</div>}
                </>
              )}
            </Card>

            {/* Historial breve */}
            {done.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Hecho Recientemente</div>
                {done.map((t) => (
                  <div key={t.id} style={{ fontSize: 12.5, color: 'var(--cream-3,#807e78)', marginBottom: 4 }}>✓ {t.title || t.label || t.action}</div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AdvisorLayout>
  );
}
