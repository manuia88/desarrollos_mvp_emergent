// NewCitaModal — 5-section cita registration form (dual entry points)
import React, { useState, useEffect, useCallback } from 'react';
import { X, CalendarCheck, Video, Phone, CheckCircle, AlertCircle, Plus, ExternalLink } from '../icons';
import { createCita, getSlotAvailability } from '../../api/developer';

const API = process.env.REACT_APP_BACKEND_URL;

const PAYMENT_OPTS = [
  { k: 'recursos_propios',       label: 'Recursos propios' },
  { k: 'credito_hipotecario',    label: 'Crédito hipotecario' },
  { k: 'infonavit',              label: 'Infonavit' },
  { k: 'cofinavit',              label: 'Cofinavit' },
];

function Collapse({ title, open, onToggle, children, required, filled }) {
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 0', background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)',
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {title}
          {required && <span style={{ fontSize: 10, color: 'var(--cream-3)' }}>obligatorio</span>}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {filled && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ADE80' }} />}
          <span style={{ color: 'var(--cream-3)', fontSize: 16, transition: 'transform 0.2s', transform: open ? 'rotate(45deg)' : 'none' }}>+</span>
        </span>
      </button>
      {open && <div style={{ paddingBottom: 16 }}>{children}</div>}
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
        {label}
      </label>
      {children}
      {error && <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: '#F87171', marginTop: 3 }}>{error}</div>}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
  color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13,
  outline: 'none', boxSizing: 'border-box',
};

export default function NewCitaModal({ user, prefilledProject, projects = [], onClose, onSuccess }) {
  const [open, setOpen] = useState({ cliente: true, cita: false, presupuesto: false, asesor: false, consent: false });
  const [form, setForm] = useState({
    nombre: '', celular: '+52', correo: '',
    project_id: prefilledProject?.id || '',
    fecha: '', hora: '', modalidad: 'presencial',
    presupuesto_min: '', presupuesto_max: '',
    payment_methods: [],
    asesor_id: '',
    lfpdppp: false,
  });
  const [errors, setErrors] = useState({});
  const [availSlots, setAvailSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // success | under_review

  const toggle = (section) => setOpen(o => ({ ...o, [section]: !o[section] }));

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => ({ ...e, [k]: undefined }));
  };

  // Load slot availability when project + fecha change
  useEffect(() => {
    if (!form.project_id || !form.fecha) { setAvailSlots([]); return; }
    setLoadingSlots(true);
    getSlotAvailability(form.project_id, form.fecha)
      .then(r => setAvailSlots(r.slots || []))
      .catch(() => setAvailSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [form.project_id, form.fecha]);

  const togglePayment = (k) => {
    set('payment_methods', form.payment_methods.includes(k)
      ? form.payment_methods.filter(m => m !== k)
      : [...form.payment_methods, k]);
  };

  const validate = () => {
    const e = {};
    if (!form.nombre.trim()) e.nombre = 'Nombre requerido';
    if (!form.celular || form.celular.length < 10) e.celular = 'Celular inválido';
    if (!form.correo && !form.celular) e.correo = 'Correo o celular requerido';
    if (form.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.correo)) e.correo = 'Correo inválido';
    if (!form.project_id) e.project_id = 'Selecciona un proyecto';
    if (!form.fecha) e.fecha = 'Fecha requerida';
    if (!form.hora) e.hora = 'Hora requerida';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (form.fecha && new Date(form.fecha) < today) e.fecha = 'La fecha debe ser futura';
    if (form.presupuesto_min && form.presupuesto_max) {
      if (Number(form.presupuesto_min) > Number(form.presupuesto_max)) e.presupuesto_min = 'Mín debe ser ≤ Máx';
    }
    if (!form.lfpdppp) e.lfpdppp = 'Debes aceptar el aviso de privacidad';
    return e;
  };

  const buildDatetime = () => {
    if (!form.fecha || !form.hora) return null;
    return new Date(`${form.fecha}T${form.hora}:00`).toISOString();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSubmitting(true);
    try {
      const dt = buildDatetime();
      const body = {
        project_id: form.project_id,
        contact: { name: form.nombre, phone: form.celular, email: form.correo || undefined },
        datetime: dt,
        modalidad: form.modalidad,
        presupuesto: form.presupuesto_min ? { min: Number(form.presupuesto_min), max: Number(form.presupuesto_max) || Number(form.presupuesto_min) } : undefined,
        payment_methods: form.payment_methods,
        intent: 'visitar',
        lfpdppp_consent: { accepted: true },
        asesor_id: form.asesor_id || undefined,
      };
      const res = await createCita(body);
      setResult(res);
      if (onSuccess) onSuccess(res);
    } catch (err) {
      const detail = err.body?.detail;
      if (err.status === 409) {
        // Exact duplicate
        setResult({
          status: 'conflict_409',
          wa_template_url: typeof detail === 'object' ? detail.wa_template_url : '',
          message: typeof detail === 'object' ? detail.error : (detail || 'Lead duplicado'),
        });
      } else {
        const msg = typeof detail === 'string' ? detail : (typeof detail === 'object' ? JSON.stringify(detail) : 'Error al crear la cita');
        setErrors({ _global: msg });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Post-submit result screen
  if (result) {
    const isConflict = result.status === 'conflict_409';
    const isReview = result.status === 'under_review';
    const isSuccess = result.status === 'created';
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
        <div style={{ background: 'linear-gradient(135deg, #0D1118, #111827)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 420, padding: 32, textAlign: 'center' }}>
          {isConflict ? (
            <>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
                <AlertCircle size={28} color="#F87171" />
              </div>
              <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)', margin: '0 0 10px' }}>Lead duplicado</h2>
              <p style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.6, marginBottom: 22 }}>{result.message}</p>
            </>
          ) : isReview ? (
            <>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(251,191,36,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
                <AlertCircle size={28} color="#FCD34D" />
              </div>
              <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)', margin: '0 0 10px' }}>Tu registro está en revisión</h2>
              <p style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.6, marginBottom: 22 }}>
                Detectamos información similar a un lead ya registrado. El desarrollador validará en menos de 24h. Si tienes urgencia, contacta directo.
              </p>
            </>
          ) : (
            <>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(74,222,128,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
                <CheckCircle size={28} color="#4ADE80" />
              </div>
              <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)', margin: '0 0 10px' }}>Cita registrada con éxito</h2>
              <p style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.6, marginBottom: 22 }}>
                Tu cita está agendada. Recibirás recordatorios 24h y 2h antes.
              </p>
            </>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {result.wa_template_url && (
              <a
                href={result.wa_template_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '11px 20px', borderRadius: 9999, textDecoration: 'none',
                  background: isReview || isConflict ? 'rgba(251,191,36,0.12)' : 'var(--grad)',
                  border: isReview || isConflict ? '1px solid rgba(251,191,36,0.35)' : 'none',
                  color: isReview || isConflict ? '#FCD34D' : '#fff',
                  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13.5,
                }}
                data-testid="cita-result-wa-btn"
              >
                <ExternalLink size={14} />
                {isReview || isConflict ? 'WhatsApp con desarrollador' : 'Confirmar con WhatsApp dev'}
              </a>
            )}
            <button
              onClick={onClose}
              data-testid="cita-result-close-btn"
              style={{
                padding: '11px 20px', borderRadius: 9999, background: 'transparent',
                border: '1px solid var(--border)', color: 'var(--cream-3)',
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13.5, cursor: 'pointer',
              }}
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const projectList = prefilledProject ? [prefilledProject, ...projects.filter(p => p.id !== prefilledProject.id)] : projects;
  const selectedProject = projectList.find(p => p.id === form.project_id);
  const minDate = new Date().toISOString().split('T')[0];
  const availHours = availSlots.filter(s => s.available).map(s => s.hour_start);
  const noSlots = form.fecha && availSlots.length > 0 && availSlots.every(s => !s.available);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '24px 16px', overflowY: 'auto' }}>
      <div style={{ background: 'linear-gradient(135deg, #0D1118, #111827)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 540, padding: '28px 28px 24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--grad)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CalendarCheck size={16} color="#fff" />
            </div>
            <div>
              <h2 data-testid="new-cita-modal-title" style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)', margin: 0, letterSpacing: '-0.02em' }}>Nueva Cita / Lead</h2>
              {selectedProject && <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{selectedProject.name}</div>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cream-3)', padding: 4 }} data-testid="new-cita-close">
            <X size={18} />
          </button>
        </div>

        {errors._global && (
          <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontFamily: 'DM Sans', fontSize: 12.5, color: '#F87171' }}>
            {errors._global}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* ① CLIENTE */}
          <Collapse title="① Cliente" open={open.cliente} onToggle={() => toggle('cliente')} required
            filled={!!form.nombre && (!!form.celular || !!form.correo)}>
            <Field label="Nombre completo" error={errors.nombre}>
              <input style={inputStyle} value={form.nombre} onChange={e => set('nombre', e.target.value)}
                placeholder="Ana García" data-testid="cita-nombre" />
            </Field>
            <Field label="Celular" error={errors.celular}>
              <input style={inputStyle} value={form.celular} onChange={e => set('celular', e.target.value)}
                placeholder="+52 55 1234 5678" data-testid="cita-celular" />
            </Field>
            <Field label="Correo electrónico" error={errors.correo}>
              <input style={inputStyle} type="email" value={form.correo} onChange={e => set('correo', e.target.value)}
                placeholder="ana@email.com" data-testid="cita-correo" />
            </Field>
          </Collapse>

          {/* ② CITA */}
          <Collapse title="② Cita" open={open.cita} onToggle={() => toggle('cita')} required
            filled={!!form.project_id && !!form.fecha && !!form.hora}>
            <Field label="Proyecto" error={errors.project_id}>
              <select style={inputStyle} value={form.project_id} onChange={e => set('project_id', e.target.value)} data-testid="cita-project">
                <option value="">— Selecciona proyecto —</option>
                {projectList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Fecha (mín hoy)" error={errors.fecha}>
                <input style={inputStyle} type="date" min={minDate} value={form.fecha}
                  onChange={e => set('fecha', e.target.value)} data-testid="cita-fecha" />
              </Field>
              <Field label={loadingSlots ? 'Hora (cargando...)' : `Hora ${availHours.length ? `(${availHours.length} disponibles)` : ''}`} error={errors.hora}>
                {availSlots.length > 0 ? (
                  <select style={inputStyle} value={form.hora} onChange={e => set('hora', e.target.value)} data-testid="cita-hora">
                    <option value="">— Hora —</option>
                    {availSlots.map(s => (
                      <option key={s.hour_start} value={s.hour_start} disabled={!s.available}>
                        {s.hour_start} {!s.available ? `(${s.reason === 'full' ? 'lleno' : 'pasado'})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input style={inputStyle} type="time" value={form.hora} onChange={e => set('hora', e.target.value)} data-testid="cita-hora" />
                )}
                {noSlots && <div style={{ fontSize: 11, color: '#FCD34D', marginTop: 3 }}>Sin horarios disponibles este día</div>}
              </Field>
            </div>
            <Field label="Modalidad">
              <div style={{ display: 'flex', gap: 10 }}>
                {[{ k: 'presencial', icon: <Phone size={13} />, label: 'Presencial' }, { k: 'videollamada', icon: <Video size={13} />, label: 'Videollamada' }].map(m => (
                  <button key={m.k} type="button" onClick={() => set('modalidad', m.k)}
                    data-testid={`cita-modalidad-${m.k}`}
                    style={{
                      flex: 1, padding: '9px 0', borderRadius: 8, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600,
                      background: form.modalidad === m.k ? 'rgba(236,72,153,0.14)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${form.modalidad === m.k ? 'rgba(236,72,153,0.5)' : 'var(--border)'}`,
                      color: form.modalidad === m.k ? '#EC4899' : 'var(--cream-3)',
                    }}>
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
            </Field>
          </Collapse>

          {/* ③ PRESUPUESTO Y PAGO */}
          <Collapse title="③ Presupuesto y Pago" open={open.presupuesto} onToggle={() => toggle('presupuesto')}
            filled={!!form.presupuesto_min || form.payment_methods.length > 0}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Presupuesto mín (MXN)" error={errors.presupuesto_min}>
                <input style={inputStyle} type="number" min="0" step="100000" value={form.presupuesto_min}
                  onChange={e => set('presupuesto_min', e.target.value)} placeholder="2,000,000" data-testid="cita-pmin" />
              </Field>
              <Field label="Presupuesto máx (MXN)">
                <input style={inputStyle} type="number" min="0" step="100000" value={form.presupuesto_max}
                  onChange={e => set('presupuesto_max', e.target.value)} placeholder="5,000,000" data-testid="cita-pmax" />
              </Field>
            </div>
            <Field label="Forma de pago (múltiple)">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {PAYMENT_OPTS.map(pm => (
                  <button key={pm.k} type="button" onClick={() => togglePayment(pm.k)}
                    data-testid={`cita-pm-${pm.k}`}
                    style={{
                      padding: '7px 12px', borderRadius: 9999, cursor: 'pointer',
                      fontFamily: 'DM Sans', fontSize: 12, fontWeight: 500,
                      background: form.payment_methods.includes(pm.k) ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${form.payment_methods.includes(pm.k) ? 'rgba(99,102,241,0.5)' : 'var(--border)'}`,
                      color: form.payment_methods.includes(pm.k) ? '#818CF8' : 'var(--cream-3)',
                    }}>
                    {pm.label}
                  </button>
                ))}
              </div>
            </Field>
          </Collapse>

          {/* ④ ASESOR */}
          <Collapse title="④ Asesor" open={open.asesor} onToggle={() => toggle('asesor')}>
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>
                {user?.name || 'Usuario actual'} · <span style={{ color: 'var(--cream-3)' }}>{user?.role}</span>
              </div>
              {(user?.role === 'developer_admin' || user?.role === 'superadmin') && (
                <input style={{ ...inputStyle, marginTop: 8 }} value={form.asesor_id}
                  onChange={e => set('asesor_id', e.target.value)}
                  placeholder="user_id de asesor (opcional override)" data-testid="cita-asesor-override" />
              )}
            </div>
          </Collapse>

          {/* ⑤ CONSENTIMIENTO */}
          <Collapse title="⑤ Consentimiento LFPDPPP" open={open.consent} onToggle={() => toggle('consent')} required
            filled={form.lfpdppp}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0' }}>
              <input
                type="checkbox"
                id="lfpdppp-cb"
                checked={form.lfpdppp}
                onChange={e => set('lfpdppp', e.target.checked)}
                data-testid="cita-lfpdppp"
                style={{ marginTop: 2, accentColor: '#6366F1', width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
              />
              <label htmlFor="lfpdppp-cb" style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.55, cursor: 'pointer' }}>
                El cliente acepta el tratamiento de sus datos personales de acuerdo al{' '}
                <a href="/aviso-privacidad" target="_blank" rel="noopener noreferrer"
                  style={{ color: '#818CF8', textDecoration: 'underline' }}>
                  Aviso de Privacidad
                </a>{' '}
                de DesarrollosMX, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.
              </label>
            </div>
            {errors.lfpdppp && <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: '#F87171', marginTop: 3 }}>{errors.lfpdppp}</div>}
          </Collapse>

          {/* Footer */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button type="button" onClick={onClose} style={{
              padding: '10px 20px', borderRadius: 9999, background: 'transparent',
              border: '1px solid var(--border)', color: 'var(--cream-3)',
              fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13.5, cursor: 'pointer',
            }} data-testid="cita-cancel-btn">
              Cancelar
            </button>
            <button type="submit" disabled={submitting} style={{
              padding: '10px 24px', borderRadius: 9999,
              background: submitting ? 'var(--border)' : 'var(--grad)',
              border: 'none', color: '#fff',
              fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13.5, cursor: submitting ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 7,
            }} data-testid="cita-submit-btn">
              <CalendarCheck size={14} />
              {submitting ? 'Registrando...' : 'Crear cita'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
