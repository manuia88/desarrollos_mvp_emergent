// Public Cita Page — /cita/:token
// Phase 4 Batch 4.3 — Magic Link Self-Service (no auth, mobile-first)
// Allows the client to confirm / cancel / reschedule their appointment.
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarCheck, CheckCircle, X, Clock, MapPin, Phone, AlertCircle } from '../../components/icons';

const API = process.env.REACT_APP_BACKEND_URL;

const j = async (url, opts = {}) => {
  const r = await fetch(`${API}${url}`, { ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  return body;
};
const post = (url, body) => j(url, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body || {}),
});

const CANCEL_REASONS = [
  { k: 'cambio_presupuesto', label: 'Cambio de presupuesto' },
  { k: 'encontro_otra', label: 'Encontré otra opción' },
  { k: 'imprevisto', label: 'Imprevisto / Emergencia' },
  { k: 'otro', label: 'Otro motivo' },
];

const ACTIONS = [
  { k: 'confirm',    label: 'Confirmar mi cita',  Icon: CheckCircle,  tone: 'green' },
  { k: 'reschedule', label: 'Reagendar',          Icon: CalendarCheck, tone: 'amber' },
  { k: 'cancel',     label: 'Cancelar',           Icon: X,             tone: 'red' },
];

const TONE = {
  green: { bg: 'rgba(34,197,94,0.10)',  bd: 'rgba(34,197,94,0.30)',  fg: 'var(--green)' },
  amber: { bg: 'rgba(245,158,11,0.10)', bd: 'rgba(245,158,11,0.30)', fg: 'var(--amber)' },
  red:   { bg: 'rgba(239,68,68,0.10)',  bd: 'rgba(239,68,68,0.30)',  fg: 'var(--red)' },
};

export default function PublicCitaPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [view, setView] = useState('home'); // home | cancel | reschedule | done
  const [done, setDone] = useState(null);

  const load = async () => {
    setError(null);
    try {
      const r = await j(`/api/cita/public/${token}`);
      setData(r);
    } catch (e) {
      if (e.status === 410) setError({ gone: true, msg: e.body?.detail || 'Cita ya procesada' });
      else if (e.status === 404) setError({ notfound: true, msg: 'Esta cita no existe o el enlace ya no es válido' });
      else setError({ msg: e.body?.detail || 'No se pudo cargar la cita' });
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);

  if (error) {
    return (
      <Frame>
        <ErrorState
          title={error.gone ? 'Esta cita ya fue gestionada' : error.notfound ? 'Enlace no válido' : 'Algo salió mal'}
          msg={error.msg}
        />
      </Frame>
    );
  }
  if (!data) {
    return <Frame><Loading /></Frame>;
  }
  if (view === 'done' && done) {
    return <Frame><DoneState {...done} /></Frame>;
  }

  return (
    <Frame>
      <CitaCard data={data} />
      {view === 'home' && (
        <ActionGrid
          onSelect={(k) => {
            if (k === 'confirm') {
              (async () => {
                try {
                  await post(`/api/cita/public/${token}/confirm`);
                  setDone({ kind: 'confirmed', msg: 'Cita confirmada. Te esperamos.' });
                  setView('done');
                } catch (e) {
                  setError({ msg: e.body?.detail || 'No se pudo confirmar' });
                }
              })();
            } else if (k === 'cancel') setView('cancel');
            else if (k === 'reschedule') setView('reschedule');
          }}
        />
      )}
      {view === 'cancel' && (
        <CancelForm
          onCancel={async (reason, notes) => {
            try {
              await post(`/api/cita/public/${token}/cancel`, { reason, notes });
              setDone({ kind: 'cancelled', msg: 'Tu cita fue cancelada. Gracias por avisarnos.' });
              setView('done');
            } catch (e) {
              setError({ msg: e.body?.detail || 'No se pudo cancelar' });
            }
          }}
          onBack={() => setView('home')}
        />
      )}
      {view === 'reschedule' && (
        <RescheduleForm
          onReschedule={async (new_datetime, reason) => {
            try {
              await post(`/api/cita/public/${token}/reschedule`, { new_datetime, reason });
              setDone({ kind: 'rescheduled', msg: 'Tu cita fue reagendada. Te enviamos un correo con los nuevos detalles.' });
              setView('done');
            } catch (e) {
              setError({ msg: e.body?.detail || 'No se pudo reagendar' });
            }
          }}
          onBack={() => setView('home')}
        />
      )}
    </Frame>
  );
}

// ─── Layout primitives ──────────────────────────────────────────────────────
function Frame({ children }) {
  return (
    <div data-testid="public-cita-page" style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px',
    }}>
      <div style={{
        width: '100%', maxWidth: 480,
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <Header />
        {children}
        <Footer />
      </div>
    </div>
  );
}

function Header() {
  return (
    <div style={{ textAlign: 'center', marginBottom: 8 }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 14px', borderRadius: 9999,
        background: 'rgba(240,235,224,0.04)', border: '1px solid var(--border)',
      }}>
        <CalendarCheck size={13} color="var(--cream-2)" />
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'var(--cream-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          DesarrollosMX · Tu cita
        </span>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <p style={{
      fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)',
      textAlign: 'center', margin: '20px 0 0', lineHeight: 1.5,
    }}>
      Si tienes problemas con este enlace, escríbenos a <a href="mailto:soporte@desarrollosmx.com" style={{ color: 'var(--cream-2)' }}>soporte@desarrollosmx.com</a>
    </p>
  );
}

function CitaCard({ data }) {
  return (
    <div data-testid="cita-card" style={{
      padding: 22, borderRadius: 14,
      background: 'rgba(240,235,224,0.04)', border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Tu cita</div>
        <h1 data-testid="cita-project" style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)',
          letterSpacing: '-0.02em', margin: 0,
        }}>{data.project_name}</h1>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontFamily: 'DM Sans', fontSize: 13 }}>
        <Row icon={<Clock size={14} />} label="Fecha y hora" value={data.datetime_legible} />
        <Row icon={<MapPin size={14} />} label="Modalidad" value={data.modalidad === 'videollamada' ? 'Videollamada' : 'Presencial'} />
        <Row icon={<Phone size={14} />} label="Asesor" value={data.asesor_name + (data.asesor_phone ? ` · ${data.asesor_phone}` : '')} />
      </div>
      {data.status !== 'agendada' && (
        <div style={{
          padding: 10, borderRadius: 8,
          background: TONE.amber.bg, border: `1px solid ${TONE.amber.bd}`, color: TONE.amber.fg,
          fontFamily: 'DM Sans', fontSize: 12,
        }}>
          Estado actual: <strong>{data.status}</strong>
        </div>
      )}
    </div>
  );
}

function Row({ icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <div style={{ color: 'var(--cream-3)', flexShrink: 0, paddingTop: 2 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        <div style={{ color: 'var(--cream)', fontWeight: 500 }}>{value}</div>
      </div>
    </div>
  );
}

// ─── Action grid ────────────────────────────────────────────────────────────
function ActionGrid({ onSelect }) {
  return (
    <div data-testid="action-grid" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {ACTIONS.map(a => {
        const Icon = a.Icon;
        const t = TONE[a.tone];
        return (
          <button
            key={a.k}
            data-testid={`action-${a.k}`}
            onClick={() => onSelect(a.k)}
            style={{
              padding: '14px 18px', borderRadius: 12, cursor: 'pointer',
              background: t.bg, border: `1px solid ${t.bd}`, color: t.fg,
              fontFamily: 'DM Sans', fontWeight: 600, fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              transition: 'transform 0.12s, background 0.12s',
            }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            <Icon size={15} /> {a.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Cancel form ────────────────────────────────────────────────────────────
function CancelForm({ onCancel, onBack }) {
  const [reason, setReason] = useState('cambio_presupuesto');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div data-testid="cancel-form" style={{
      padding: 20, borderRadius: 14,
      background: 'rgba(240,235,224,0.04)', border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <h2 style={{
        fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)',
        margin: 0,
      }}>Cancelar cita</h2>
      <div>
        <label style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block' }}>
          Motivo
        </label>
        <select
          data-testid="cancel-reason"
          value={reason}
          onChange={e => setReason(e.target.value)}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8,
            background: 'rgba(240,235,224,0.06)', border: '1px solid var(--border)',
            color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none',
          }}
        >
          {CANCEL_REASONS.map(r => <option key={r.k} value={r.k}>{r.label}</option>)}
        </select>
      </div>
      <div>
        <label style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block' }}>
          Notas (opcional)
        </label>
        <textarea
          data-testid="cancel-notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="Cuéntanos brevemente por qué cancelas…"
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8,
            background: 'rgba(240,235,224,0.06)', border: '1px solid var(--border)',
            color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none', resize: 'vertical',
          }}
        />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button data-testid="cancel-back" onClick={onBack} disabled={busy} style={btnSecondary}>Volver</button>
        <button
          data-testid="cancel-submit"
          onClick={async () => { setBusy(true); await onCancel(reason, notes || null); setBusy(false); }}
          disabled={busy}
          style={{ ...btnPrimary, background: TONE.red.bg, border: `1px solid ${TONE.red.bd}`, color: TONE.red.fg }}
        >
          {busy ? 'Procesando…' : 'Confirmar cancelación'}
        </button>
      </div>
    </div>
  );
}

// ─── Reschedule form ────────────────────────────────────────────────────────
function RescheduleForm({ onReschedule, onBack }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!date) return;
    const iso = new Date(`${date}T${time}:00`).toISOString();
    setBusy(true);
    await onReschedule(iso, reason || null);
    setBusy(false);
  };

  return (
    <div data-testid="reschedule-form" style={{
      padding: 20, borderRadius: 14,
      background: 'rgba(240,235,224,0.04)', border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <h2 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', margin: 0 }}>
        Elegir nueva fecha
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 10 }}>
        <div>
          <label style={labelStyle}>Fecha</label>
          <input data-testid="resched-date" type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Hora</label>
          <input data-testid="resched-time" type="time" value={time} onChange={e => setTime(e.target.value)} style={inputStyle} />
        </div>
      </div>
      <div>
        <label style={labelStyle}>Motivo (opcional)</label>
        <input data-testid="resched-reason" type="text" value={reason} onChange={e => setReason(e.target.value)}
          placeholder="Ej: viaje imprevisto" style={inputStyle} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button data-testid="resched-back" onClick={onBack} disabled={busy} style={btnSecondary}>Volver</button>
        <button data-testid="resched-submit" onClick={submit} disabled={busy || !date}
          style={{ ...btnPrimary, background: TONE.amber.bg, border: `1px solid ${TONE.amber.bd}`, color: TONE.amber.fg }}>
          {busy ? 'Procesando…' : 'Confirmar nueva fecha'}
        </button>
      </div>
    </div>
  );
}

// ─── Done state ─────────────────────────────────────────────────────────────
function DoneState({ kind, msg }) {
  const Icon = kind === 'confirmed' ? CheckCircle : kind === 'cancelled' ? X : CalendarCheck;
  const tone = kind === 'confirmed' ? TONE.green : kind === 'cancelled' ? TONE.red : TONE.amber;
  return (
    <div data-testid="done-state" style={{
      padding: '36px 24px', borderRadius: 14, textAlign: 'center',
      background: tone.bg, border: `1px solid ${tone.bd}`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 9999,
        background: tone.bg, border: `2px solid ${tone.bd}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: tone.fg,
      }}>
        <Icon size={26} />
      </div>
      <div>
        <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', margin: '0 0 8px' }}>¡Listo!</h2>
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', margin: 0, lineHeight: 1.5 }}>{msg}</p>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>
      Cargando tu cita…
    </div>
  );
}

function ErrorState({ title, msg }) {
  return (
    <div data-testid="error-state" style={{
      padding: '36px 24px', borderRadius: 14, textAlign: 'center',
      background: TONE.red.bg, border: `1px solid ${TONE.red.bd}`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
    }}>
      <AlertCircle size={28} color={TONE.red.fg} />
      <h2 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', margin: 0 }}>{title}</h2>
      <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', margin: 0, lineHeight: 1.5 }}>{msg}</p>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: 'rgba(240,235,224,0.06)', border: '1px solid var(--border)',
  color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none',
};
const labelStyle = {
  fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'var(--cream-3)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block',
};
const btnPrimary = {
  flex: 1, padding: '12px 16px', borderRadius: 9999, cursor: 'pointer',
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
};
const btnSecondary = {
  flex: 1, padding: '12px 16px', borderRadius: 9999, cursor: 'pointer',
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--cream-2)',
  fontFamily: 'DM Sans', fontWeight: 500, fontSize: 13,
};
