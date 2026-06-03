// Fase B · Loop 1 (agentic) — el asistente como CAPA del CRM del dev.
// El Cerebro lee el pipeline y surfacea lo que mueve la aguja AHORA: jugadas que
// propone (aprobar/descartar = lo delicado) + señales reales del pipeline que el dev
// debe atender (disputas por arbitrar, solicitudes de acceso). Hace lo seguro solo;
// se pausa en lo delicado → tu OK en 1 clic. fail-open: si algo falla, no rompe el CRM.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCerebroStatus, getCerebroTasks, approveCerebroTask, rejectCerebroTask } from '../../api/cerebro';
import { disputes_pending_count } from '../../api/badges';
import { Sparkle, ArrowRight } from '../icons';

const API = process.env.REACT_APP_BACKEND_URL;

// El CRM es del PIPELINE: solo tareas de leads/citas/nurture/seguimiento.
// Las de mercado/pricing (dev.*, deal.change_price) viven en el Inicio/Inteligencia → no se duplican aquí.
const isPipelineAction = (a) => /^(lead|contacto|contact|cita|nurture|conversa|mensaje|seguim|follow|asign|crm)/i.test(a || '');

export default function CrmAssistantStrip() {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const st = await getCerebroStatus();
        const enabled = !!st?.enabled;
        const [tk, disp, sol] = await Promise.allSettled([
          enabled ? getCerebroTasks() : Promise.resolve({ tasks: [] }),
          disputes_pending_count(),
          fetch(`${API}/api/dev/whitelist/pending`, { credentials: 'include' })
            .then(r => r.json()).then(x => (x?.pending?.length ?? x?.count ?? 0)).catch(() => 0),
        ]);
        const tasks = tk.status === 'fulfilled'
          ? (tk.value?.tasks || []).filter(t => ['proposed', 'awaiting_approval'].includes(t.status) && isPipelineAction(t.action))
          : [];
        setD({
          enabled,
          tasks,
          disputes: disp.status === 'fulfilled' ? disp.value : 0,
          solicitudes: sol.status === 'fulfilled' ? sol.value : 0,
        });
      } catch (_) { setD({ enabled: false, tasks: [], disputes: 0, solicitudes: 0 }); }
    })();
  }, []);

  if (!d) return null;

  const act = async (t, approve) => {
    setBusy(b => ({ ...b, [t.id]: true }));
    try {
      if (approve) await approveCerebroTask(t.id); else await rejectCerebroTask(t.id);
      setD(p => ({ ...p, tasks: (p.tasks || []).filter(x => x.id !== t.id) }));
    } catch (_) { }
    setBusy(b => ({ ...b, [t.id]: false }));
  };

  // Señales reales del pipeline que el dev debe atender (lo distingue del asistente del Inicio).
  const signals = [];
  if (d.disputes > 0) signals.push({ k: 'disp', emoji: '⚖️', label: `${d.disputes} disputa${d.disputes === 1 ? '' : 's'} por arbitrar`, route: '/desarrollador/disputas' });
  if (d.solicitudes > 0) signals.push({ k: 'sol', emoji: '🔓', label: `${d.solicitudes} solicitud${d.solicitudes === 1 ? '' : 'es'} de acceso de asesores`, route: '/desarrollador/solicitudes' });
  const total = d.tasks.length + signals.length;

  const card = (children, accent) => (
    <div data-testid="crm-assistant-strip" style={{ position: 'relative', overflow: 'hidden', background: 'var(--surface, #fff)', border: '1px solid var(--border-2, var(--border))', borderRadius: 14, padding: '14px 16px', marginBottom: 18, boxShadow: 'var(--asr-shadow, none)' }}>
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: accent }} />
      <div className="eyebrow" style={{ marginBottom: 8, color: 'var(--theme)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Sparkle size={11} /> TU ASISTENTE
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ok, #1FA06A)', boxShadow: '0 0 0 3px rgba(31,160,106,0.18)' }} />
      </div>
      {children}
    </div>
  );

  // Apagado (prod sin flag Cerebro) — invitación sutil.
  if (!d.enabled && total === 0) {
    return card(
      <div style={{ fontSize: 13.5, color: 'var(--cream-2)' }}>Tu asistente de pipeline está listo. Actívalo para que trabaje tus leads por ti.</div>,
      'var(--theme, #6D4AFF)'
    );
  }

  // Al día.
  if (total === 0) {
    return card(
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: 'var(--cream)' }}>Al día · estoy trabajando tu pipeline</div>
          <div style={{ fontSize: 12.5, color: 'var(--cream-2)', marginTop: 3 }}>Sin nada que requiera tu turno ahora. Te aviso cuando algo mueva la aguja.</div>
        </div>
        <button onClick={() => navigate('/desarrollador/crm/sala-control')} data-testid="crm-assistant-open"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '9px 15px', borderRadius: 10, fontSize: 12.5, fontWeight: 800, fontFamily: 'DM Sans,sans-serif', background: 'var(--surface, #fff)', color: 'var(--theme, #6D4AFF)', border: '1px solid rgba(109,74,255,0.4)' }}>
          Abrir mi asistente <ArrowRight size={13} />
        </button>
      </div>,
      'var(--ok, #1FA06A)'
    );
  }

  // Hay jugadas / señales.
  return card(
    <>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)', letterSpacing: '-0.01em' }}>
        Veo {total} {total === 1 ? 'cosa' : 'cosas'} en tu pipeline
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
        {/* Señales reales (delicado: arbitraje / acceso) → revisar */}
        {signals.map(s => (
          <div key={s.k} data-testid={`crm-assistant-signal-${s.k}`} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 9, background: 'rgba(226,152,46,0.08)', border: '1px solid rgba(226,152,46,0.2)' }}>
            <span style={{ fontSize: 15 }}>{s.emoji}</span>
            <div style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: 'var(--cream)', fontFamily: 'DM Sans,sans-serif' }}>{s.label}</div>
            <button onClick={() => navigate(s.route)} style={{ padding: '4px 11px', borderRadius: 7, fontSize: 11, fontWeight: 800, cursor: 'pointer', background: 'var(--grad, linear-gradient(120deg,#6366F1,#EC4899))', color: '#fff', border: 'none' }}>Revisar</button>
          </div>
        ))}
        {/* Jugadas que propone el Cerebro (delicado: aprobar/descartar) */}
        {d.tasks.slice(0, 3).map(t => (
          <div key={t.id} data-testid="crm-assistant-task" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 9, background: 'rgba(var(--cream-rgb),0.04)', border: '1px solid rgba(var(--cream-rgb),0.08)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: t.needs_approval ? 'var(--warm, #E2982E)' : 'var(--theme, #6D4AFF)' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cream)', fontFamily: 'DM Sans,sans-serif' }}>{t.params?.titulo || t.action}</div>
              {t.params?.detalle && <div style={{ fontSize: 11, color: 'var(--cream-2)', marginTop: 1 }}>{t.params.detalle}</div>}
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button onClick={() => act(t, true)} disabled={busy[t.id]} style={{ padding: '4px 11px', borderRadius: 7, fontSize: 11, fontWeight: 800, cursor: busy[t.id] ? 'wait' : 'pointer', background: 'var(--grad, linear-gradient(120deg,#6366F1,#EC4899))', color: '#fff', border: 'none', opacity: busy[t.id] ? 0.6 : 1 }}>{t.needs_approval ? 'Aprobar' : 'Hecho'}</button>
                <button onClick={() => act(t, false)} disabled={busy[t.id]} style={{ padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'transparent', color: 'var(--cream-3)', border: '1px solid rgba(var(--cream-rgb),0.14)' }}>Descartar</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>,
    'var(--warm, #E2982E)'
  );
}
