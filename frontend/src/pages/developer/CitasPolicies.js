/**
 * Phase 4 Batch 15 — /desarrollador/configuracion/citas-policies
 * Policy config per project: type, asesor pool (google-connected only), working hours,
 * slot duration, buffer. Preview next 7 slots.
 */
import React, { useState, useEffect, useCallback } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Card, Badge } from '../../components/advisor/primitives';
import { Building, Users, Calendar, Check, ChevronRight, ChevronDown } from '../../components/icons';

const API = process.env.REACT_APP_BACKEND_URL;

const POLICY_OPTIONS = [
  { value: 'round_robin', label: 'Round Robin', desc: 'Rotación FIFO entre asesores del pool' },
  { value: 'load_balance', label: 'Balance de carga', desc: 'Asesor con menos citas hoy gana' },
  { value: 'pre_selected', label: 'Pre-seleccionado', desc: 'El asesor del lead tiene prioridad' },
];

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = { mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb', sun: 'Dom' };

function WorkingHoursGrid({ hours, onChange }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
      {DAYS.map(day => {
        const active = !!hours[day];
        const range = hours[day] || [9, 18];
        return (
          <div key={day} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 10, fontWeight: 700, color: active ? 'var(--cream)' : 'rgba(240,235,224,0.35)',
              cursor: 'pointer', textTransform: 'uppercase',
            }}>
              <input
                type="checkbox"
                checked={active}
                onChange={e => onChange({ ...hours, [day]: e.target.checked ? [9, 18] : null })}
                style={{ width: 12, height: 12, accentColor: '#6366f1' }}
              />
              {DAY_LABELS[day]}
            </label>
            {active && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <input
                  type="number" min={0} max={23} value={range[0]}
                  onChange={e => onChange({ ...hours, [day]: [+e.target.value, range[1]] })}
                  style={{ width: '100%', background: 'rgba(240,235,224,0.07)', border: '1px solid rgba(240,235,224,0.12)', color: 'var(--cream)', borderRadius: 4, padding: '2px 4px', fontSize: 11, textAlign: 'center' }}
                />
                <input
                  type="number" min={0} max={23} value={range[1]}
                  onChange={e => onChange({ ...hours, [day]: [range[0], +e.target.value] })}
                  style={{ width: '100%', background: 'rgba(240,235,224,0.07)', border: '1px solid rgba(240,235,224,0.12)', color: 'var(--cream)', borderRadius: 4, padding: '2px 4px', fontSize: 11, textAlign: 'center' }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProjectPolicyForm({ project, asesoresWithGoogle }) {
  const [expanded, setExpanded] = useState(false);
  const [policy, setPolicy] = useState(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState([]);
  const [toastMsg, setToastMsg] = useState(null);

  function showToast(type, msg) {
    setToastMsg({ type, msg });
    setTimeout(() => setToastMsg(null), 3000);
  }

  const loadPolicy = useCallback(async () => {
    const res = await fetch(`${API}/api/appointments/policy/${project.id}`, { credentials: 'include' });
    if (res.ok) setPolicy(await res.json());
  }, [project.id]);

  useEffect(() => { if (expanded && !policy) loadPolicy(); }, [expanded, policy, loadPolicy]);

  async function loadPreview() {
    if (!policy) return;
    const now = new Date();
    const week = new Date(now.getTime() + 7 * 86400000);
    const res = await fetch(`${API}/api/appointments/availability`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: project.id,
        date_from: now.toISOString(),
        date_to: week.toISOString(),
      }),
    });
    if (res.ok) {
      const d = await res.json();
      setPreview((d.slots || []).slice(0, 7));
    }
  }

  async function save() {
    if (!policy) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/appointments/policy/${project.id}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policy),
      });
      if (res.ok) {
        showToast('ok', 'Política guardada');
        await loadPreview();
      } else {
        showToast('error', 'Error al guardar');
      }
    } finally {
      setSaving(false);
    }
  }

  const defaultHours = { mon: [9, 18], tue: [9, 18], wed: [9, 18], thu: [9, 18], fri: [9, 18], sat: [10, 14], sun: null };

  return (
    <Card data-testid={`policy-card-${project.id}`} style={{ marginBottom: 12 }}>
      <button
        onClick={() => setExpanded(x => !x)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        }}
      >
        <Building size={14} color="rgba(240,235,224,0.55)" />
        <span style={{ flex: 1, textAlign: 'left', fontFamily: 'Outfit,sans-serif', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>
          {project.name || project.id}
        </span>
        {expanded ? <ChevronDown size={14} color="rgba(240,235,224,0.4)" /> : <ChevronRight size={14} color="rgba(240,235,224,0.4)" />}
      </button>

      {expanded && policy && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Policy type */}
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>POLÍTICA DE ASIGNACIÓN</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {POLICY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  data-testid={`policy-type-${opt.value}`}
                  onClick={() => setPolicy(p => ({ ...p, policy_type: opt.value }))}
                  style={{
                    padding: '6px 14px', borderRadius: 9999, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                    border: `1px solid ${policy.policy_type === opt.value ? 'rgba(99,102,241,0.6)' : 'rgba(240,235,224,0.12)'}`,
                    background: policy.policy_type === opt.value ? 'rgba(99,102,241,0.15)' : 'transparent',
                    color: policy.policy_type === opt.value ? '#c7d2fe' : 'rgba(240,235,224,0.5)',
                    transition: 'all 0.15s',
                  }}
                  title={opt.desc}
                >
                  {policy.policy_type === opt.value && <Check size={9} style={{ marginRight: 4 }} />}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Asesor pool — only google-connected */}
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              POOL DE ASESORES
              <span style={{ marginLeft: 6, fontSize: 9, color: 'rgba(240,235,224,0.3)', textTransform: 'none', fontWeight: 400 }}>
                (solo con Google Calendar conectado)
              </span>
            </div>
            {asesoresWithGoogle.length === 0 ? (
              <div style={{ fontSize: 12, color: 'rgba(240,235,224,0.35)' }}>
                Sin asesores con Google Calendar conectado. Pide a tus asesores que conecten su calendario en /asesor/configuracion.
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {asesoresWithGoogle.map(a => {
                  const inPool = (policy.asesor_pool || []).includes(a.user_id);
                  return (
                    <button
                      key={a.user_id}
                      data-testid={`pool-asesor-${a.user_id}`}
                      onClick={() => setPolicy(p => ({
                        ...p,
                        asesor_pool: inPool
                          ? (p.asesor_pool || []).filter(id => id !== a.user_id)
                          : [...(p.asesor_pool || []), a.user_id],
                      }))}
                      style={{
                        padding: '4px 12px', borderRadius: 9999, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                        border: `1px solid ${inPool ? 'rgba(74,222,128,0.4)' : 'rgba(240,235,224,0.12)'}`,
                        background: inPool ? 'rgba(74,222,128,0.08)' : 'transparent',
                        color: inPool ? '#86efac' : 'rgba(240,235,224,0.45)',
                        transition: 'all 0.15s',
                      }}
                    >
                      <Users size={9} style={{ marginRight: 4 }} />
                      {a.name || a.email}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Working hours */}
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>HORARIO DE ATENCIÓN</div>
            <WorkingHoursGrid
              hours={policy.working_hours || defaultHours}
              onChange={wh => setPolicy(p => ({ ...p, working_hours: wh }))}
            />
          </div>

          {/* Slot config */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'rgba(240,235,224,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                Duración de cita (min)
              </label>
              <input
                data-testid="slot-duration-input"
                type="number" min={15} max={240} step={15}
                value={policy.slot_duration_min || 60}
                onChange={e => setPolicy(p => ({ ...p, slot_duration_min: +e.target.value }))}
                style={{ width: '100%', background: 'rgba(240,235,224,0.07)', border: '1px solid rgba(240,235,224,0.15)', color: 'var(--cream)', borderRadius: 8, padding: '7px 12px', fontSize: 13 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'rgba(240,235,224,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                Buffer entre citas (min)
              </label>
              <input
                data-testid="buffer-min-input"
                type="number" min={0} max={60} step={5}
                value={policy.buffer_min || 15}
                onChange={e => setPolicy(p => ({ ...p, buffer_min: +e.target.value }))}
                style={{ width: '100%', background: 'rgba(240,235,224,0.07)', border: '1px solid rgba(240,235,224,0.15)', color: 'var(--cream)', borderRadius: 8, padding: '7px 12px', fontSize: 13 }}
              />
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              data-testid={`save-policy-${project.id}`}
              onClick={save}
              disabled={saving}
              style={{
                padding: '8px 22px', borderRadius: 9999, cursor: 'pointer', fontWeight: 700, fontSize: 13,
                background: 'linear-gradient(135deg, #6366f1, #ec4899)',
                border: 'none', color: '#fff', opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Guardando…' : 'Guardar política'}
            </button>
            <button
              onClick={loadPreview}
              style={{
                padding: '8px 16px', borderRadius: 9999, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: 'transparent', border: '1px solid rgba(240,235,224,0.18)', color: 'rgba(240,235,224,0.55)',
              }}
            >
              <Calendar size={10} style={{ marginRight: 4 }} /> Ver próximos slots
            </button>
          </div>

          {/* Toast */}
          {toastMsg && (
            <div style={{
              padding: '8px 14px', borderRadius: 7, fontSize: 12, marginTop: 8,
              background: toastMsg.type === 'ok' ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
              border: `1px solid ${toastMsg.type === 'ok' ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
              color: toastMsg.type === 'ok' ? '#86efac' : '#fca5a5',
            }}>{toastMsg.msg}</div>
          )}

          {/* Slot preview */}
          {preview.length > 0 && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>PRÓXIMOS {preview.length} SLOTS DISPONIBLES</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {preview.map((s, i) => (
                  <div key={i} style={{
                    padding: '4px 10px', borderRadius: 8, fontSize: 11,
                    background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.22)',
                    color: '#c7d2fe',
                  }}>
                    {new Date(s.slot_start).toLocaleString('es-MX', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                ))}
              </div>
            </div>
          )}
          {preview.length === 0 && <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.25)' }}>Guarda la política y haz clic en "Ver próximos slots" para ver disponibilidad.</div>}
        </div>
      )}
      {expanded && !policy && (
        <div style={{ marginTop: 12, height: 40, background: 'rgba(240,235,224,0.05)', borderRadius: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />
      )}
    </Card>
  );
}

export default function CitasPolicies({ user, onLogout }) {
  const [projects, setProjects] = useState([]);
  const [asesoresWithGoogle, setAsesoresWithGoogle] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [projRes, tokenRes] = await Promise.all([
        fetch(`${API}/api/dev/projects/list-with-stats`, { credentials: 'include' }),
        fetch(`${API}/api/superadmin/users?role=asesor`, { credentials: 'include' }),
      ]);
      if (projRes.ok) setProjects(await projRes.json());

      // Get asesores with google connected
      if (tokenRes.ok) {
        const asesores = await tokenRes.json();
        const ids = asesores.map(a => a.user_id);
        if (ids.length) {
          const tokenDocs = await fetch(`${API}/api/oauth/connections`, { credentials: 'include' });
          if (tokenDocs.ok) {
            const d = await tokenDocs.json();
            const connectedIds = (d.connections || [])
              .filter(c => c.provider === 'google' && c.status === 'active')
              .map(c => c.user_id || '');
            setAsesoresWithGoogle(asesores.filter(a => connectedIds.includes(a.user_id)));
          }
        }
      }
      setLoading(false);
    }
    load().catch(() => setLoading(false));
  }, []);

  // Simplified: fetch all asesores with google_connected flag from oauth_tokens query
  useEffect(() => {
    fetch(`${API}/api/oauth/advisor-pool`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.advisors) setAsesoresWithGoogle(d.advisors); })
      .catch(() => {});
  }, []);

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="CONFIGURACIÓN"
        title="Políticas de citas"
        sub="Define cómo se asignan automáticamente las citas a tus asesores por proyecto."
      />

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 56, borderRadius: 12, background: 'rgba(240,235,224,0.05)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ) : (
        <div>
          {projects.length === 0 ? (
            <Card>
              <p style={{ color: 'rgba(240,235,224,0.4)', fontSize: 13 }}>No tienes proyectos activos aún.</p>
            </Card>
          ) : (
            projects.map(p => (
              <ProjectPolicyForm
                key={p.id}
                project={p}
                asesoresWithGoogle={asesoresWithGoogle}
              />
            ))
          )}
        </div>
      )}
    </DeveloperLayout>
  );
}
