/**
 * Phase 4 Batch 16 · Sub-Chunk C — Public Booking Page
 *
 * Route: /reservar/:slug  (no auth required)
 *
 * Flow:
 *   1. Fetch project info + availability.
 *   2. User picks a slot.
 *   3. Fills minimal lead form (name / email / phone).
 *   4. Submits → backend creates/reuses lead + auto-assigns appointment.
 *   5. Confirmation screen with asesor name + calendar link.
 *
 * UTM tracking: captured from URL and forwarded to backend.
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Calendar, Check, MapPin, Building, ArrowRight, ArrowLeft } from '../../components/icons';

const API = process.env.REACT_APP_BACKEND_URL;

function fmtDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-MX', {
      weekday: 'short', day: 'numeric', month: 'short',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function fmtTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return iso.slice(11, 16);
  }
}

function fmtMXN(n) {
  if (n === null || n === undefined) return '';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', maximumFractionDigits: 0,
  }).format(n);
}

function groupByDay(slots) {
  const map = {};
  for (const s of slots) {
    const day = s.slot_start.slice(0, 10);
    if (!map[day]) map[day] = [];
    map[day].push(s);
  }
  return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
}

const Shell = ({ children }) => (
  <div style={{
    minHeight: '100vh', background: 'var(--bg, #06080F)',
    color: 'var(--cream, #F0EBE0)', fontFamily: 'DM Sans',
    padding: '32px 16px 80px',
  }}>
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      {children}
    </div>
  </div>
);

export default function PublicBookingPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const utm = useMemo(() => ({
    utm_source: searchParams.get('utm_source') || '',
    utm_medium: searchParams.get('utm_medium') || '',
    utm_campaign: searchParams.get('utm_campaign') || '',
  }), [searchParams]);

  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selected, setSelected] = useState(null);

  const [step, setStep] = useState('slots'); // 'slots' | 'form' | 'done'
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [confirmation, setConfirmation] = useState(null);

  // Load project info
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API}/api/public/projects/${slug}/booking`);
        if (!res.ok) {
          const t = res.status === 404 ? 'Proyecto no encontrado' : 'No se pudo cargar el proyecto';
          if (active) setError(t);
          return;
        }
        const data = await res.json();
        if (active) setInfo(data);
      } catch {
        if (active) setError('Error de red');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [slug]);

  // Load slots after info loads (14 days window)
  const loadSlots = useCallback(async () => {
    if (!info?.booking_enabled) return;
    try {
      setSlotsLoading(true);
      const now = new Date();
      now.setMinutes(0, 0, 0);
      const from = now.toISOString();
      const toDt = new Date(now);
      toDt.setDate(toDt.getDate() + 14);
      const to = toDt.toISOString();
      const res = await fetch(`${API}/api/public/projects/${slug}/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_from: from, date_to: to }),
      });
      if (res.ok) {
        const data = await res.json();
        setSlots(data.slots || []);
      } else {
        setSlots([]);
      }
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [slug, info]);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  const onSubmit = async () => {
    if (!selected || !form.name.trim() || !form.email.trim() || !form.phone.trim()) {
      setSubmitError('Completa todos los campos');
      return;
    }
    try {
      setSubmitting(true);
      setSubmitError('');
      const res = await fetch(`${API}/api/public/projects/${slug}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_name: form.name.trim(),
          lead_email: form.email.trim(),
          lead_phone: form.phone.trim(),
          slot_start: selected.slot_start,
          slot_end: selected.slot_end,
          ...utm,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data.detail || 'No se pudo completar la reserva');
        return;
      }
      const data = await res.json();
      setConfirmation(data);
      setStep('done');
    } catch {
      setSubmitError('Error de red');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Shell>
        <div data-testid="public-booking-loading" style={{ textAlign: 'center', padding: 60, color: 'rgba(240,235,224,0.5)' }}>
          Cargando…
        </div>
      </Shell>
    );
  }

  if (error || !info) {
    return (
      <Shell>
        <div data-testid="public-booking-error" style={{
          padding: 40, borderRadius: 16,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          textAlign: 'center',
        }}>
          <h2 style={{ fontFamily: 'Outfit', margin: 0 }}>{error || 'Proyecto no disponible'}</h2>
          <button onClick={() => navigate('/marketplace')}
            data-testid="public-booking-back-marketplace"
            style={{
              marginTop: 20, padding: '10px 20px', borderRadius: 9999,
              background: 'var(--cream)', color: 'var(--bg)',
              border: 0, cursor: 'pointer', fontWeight: 600,
            }}
          >
            Volver al marketplace
          </button>
        </div>
      </Shell>
    );
  }

  // ─── STEP: Confirmation ─────────────────────────────────────────
  if (step === 'done' && confirmation) {
    return (
      <Shell>
        <div data-testid="public-booking-confirmation" style={{
          padding: 40, borderRadius: 16,
          background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.32)',
          textAlign: 'center',
        }}>
          <div style={{
            width: 64, height: 64, margin: '0 auto 20px', borderRadius: 9999,
            background: 'rgba(16,185,129,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Check size={32} />
          </div>
          <h1 style={{ fontFamily: 'Outfit', fontSize: 28, margin: '0 0 8px' }}>
            ¡Visita agendada!
          </h1>
          <p style={{ color: 'rgba(240,235,224,0.78)', margin: 0, fontSize: 15 }}>
            Te confirmamos la cita para <strong>{fmtDate(confirmation.slot_start)}</strong>
            {' a las '}
            <strong>{fmtTime(confirmation.slot_start)}</strong>.
          </p>
          {confirmation.asesor_name && (
            <p style={{ color: 'rgba(240,235,224,0.78)', marginTop: 12, fontSize: 14 }}>
              Tu asesor asignado: <strong>{confirmation.asesor_name}</strong>
            </p>
          )}
          <p style={{ color: 'rgba(240,235,224,0.55)', marginTop: 16, fontSize: 13 }}>
            Te enviamos los detalles por WhatsApp al número que proporcionaste.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
            {confirmation.calendar_html_link && (
              <a
                href={confirmation.calendar_html_link}
                target="_blank" rel="noreferrer"
                data-testid="public-booking-calendar-link"
                style={{
                  padding: '10px 20px', borderRadius: 9999,
                  background: 'var(--cream)', color: 'var(--bg)',
                  textDecoration: 'none', fontWeight: 600, fontSize: 14,
                }}
              >
                Agregar al calendario
              </a>
            )}
            <button
              onClick={() => navigate(`/desarrollo/${slug}`)}
              data-testid="public-booking-view-project"
              style={{
                padding: '10px 20px', borderRadius: 9999,
                background: 'transparent', color: 'var(--cream)',
                border: '1px solid rgba(240,235,224,0.25)', cursor: 'pointer',
                fontWeight: 600, fontSize: 14,
              }}
            >
              Ver el proyecto
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ─── Header (shared) ────────────────────────────────────────────
  const Header = (
    <div data-testid="public-booking-header" style={{ marginBottom: 24 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase',
        color: 'rgba(240,235,224,0.5)', marginBottom: 10,
      }}>
        <Building size={14} /> {info.developer?.name || 'DesarrollosMX'}
      </div>
      <h1 style={{
        fontFamily: 'Outfit', fontSize: 32, fontWeight: 700,
        margin: '0 0 8px', lineHeight: 1.15,
      }}>
        Agenda tu visita — {info.name}
      </h1>
      {info.address && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          color: 'rgba(240,235,224,0.6)', fontSize: 13, marginBottom: 6,
        }}>
          <MapPin size={13} /> {info.address}
        </div>
      )}
      {(info.price_from || info.price_to) && (
        <div style={{ color: 'rgba(240,235,224,0.55)', fontSize: 13 }}>
          Desde <strong>{fmtMXN(info.price_from)}</strong>
          {info.price_to ? <> hasta <strong>{fmtMXN(info.price_to)}</strong></> : null}
        </div>
      )}
    </div>
  );

  // ─── STEP: Slots ────────────────────────────────────────────────
  if (step === 'slots') {
    return (
      <Shell>
        {Header}
        {!info.booking_enabled ? (
          <div data-testid="public-booking-disabled" style={{
            padding: 32, borderRadius: 16,
            background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.28)',
          }}>
            <h3 style={{ fontFamily: 'Outfit', margin: '0 0 8px' }}>Agenda temporalmente no disponible</h3>
            <p style={{ color: 'rgba(240,235,224,0.65)', margin: 0, fontSize: 14 }}>
              Este proyecto aún no tiene asesores configurados para agendar visitas públicas.
              Te invitamos a explorar la ficha pública y contactar al desarrollador directamente.
            </p>
            <button
              onClick={() => navigate(`/desarrollo/${slug}`)}
              data-testid="public-booking-go-dev"
              style={{
                marginTop: 16, padding: '10px 18px', borderRadius: 9999,
                background: 'var(--cream)', color: 'var(--bg)',
                border: 0, cursor: 'pointer', fontWeight: 600,
              }}
            >
              Ver ficha completa
            </button>
          </div>
        ) : slotsLoading ? (
          <div data-testid="public-booking-slots-loading" style={{ padding: 40, textAlign: 'center', color: 'rgba(240,235,224,0.45)' }}>
            Consultando disponibilidad…
          </div>
        ) : slots.length === 0 ? (
          <div data-testid="public-booking-no-slots" style={{
            padding: 32, borderRadius: 16,
            background: 'rgba(240,235,224,0.04)', border: '1px dashed rgba(240,235,224,0.15)',
            textAlign: 'center',
          }}>
            <Calendar size={28} />
            <h3 style={{ fontFamily: 'Outfit', marginTop: 14, marginBottom: 8 }}>
              Sin horarios disponibles próximamente
            </h3>
            <p style={{ color: 'rgba(240,235,224,0.55)', margin: 0, fontSize: 14 }}>
              Los asesores aún no han configurado disponibilidad para los próximos 14 días.
              Vuelve más tarde o explora la ficha pública.
            </p>
          </div>
        ) : (
          <div data-testid="public-booking-slots-list">
            <h2 style={{ fontFamily: 'Outfit', fontSize: 18, margin: '0 0 14px' }}>
              Elige un horario
            </h2>
            {groupByDay(slots).map(([day, daySlots]) => (
              <div key={day} style={{ marginBottom: 20 }}>
                <div style={{
                  fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase',
                  color: 'rgba(240,235,224,0.5)', marginBottom: 8,
                }}>
                  {fmtDate(daySlots[0].slot_start)}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {daySlots.map((s) => {
                    const isSel = selected?.slot_start === s.slot_start;
                    return (
                      <button
                        key={s.slot_start}
                        data-testid={`public-booking-slot-${s.slot_start}`}
                        onClick={() => setSelected(s)}
                        style={{
                          padding: '8px 14px', borderRadius: 9999,
                          background: isSel ? 'var(--cream)' : 'rgba(240,235,224,0.06)',
                          color: isSel ? 'var(--bg)' : 'var(--cream)',
                          border: isSel ? 'none' : '1px solid rgba(240,235,224,0.12)',
                          cursor: 'pointer', fontWeight: 500, fontSize: 13,
                          fontFamily: 'DM Sans',
                        }}
                      >
                        {fmtTime(s.slot_start)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
              <button
                data-testid="public-booking-continue-btn"
                onClick={() => selected && setStep('form')}
                disabled={!selected}
                style={{
                  padding: '12px 24px', borderRadius: 9999,
                  background: selected ? 'var(--cream)' : 'rgba(240,235,224,0.1)',
                  color: selected ? 'var(--bg)' : 'rgba(240,235,224,0.4)',
                  border: 0, cursor: selected ? 'pointer' : 'not-allowed',
                  fontWeight: 700, fontSize: 14,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                Continuar <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}
      </Shell>
    );
  }

  // ─── STEP: Form ─────────────────────────────────────────────────
  return (
    <Shell>
      {Header}
      <div data-testid="public-booking-form" style={{
        padding: 24, borderRadius: 16,
        background: 'rgba(240,235,224,0.04)',
        border: '1px solid rgba(240,235,224,0.1)',
      }}>
        <div style={{
          padding: 12, borderRadius: 10,
          background: 'rgba(99,102,241,0.12)',
          border: '1px solid rgba(99,102,241,0.3)',
          marginBottom: 20, fontSize: 13,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Calendar size={14} />
          <span>
            Visita el <strong>{fmtDate(selected?.slot_start)}</strong> a las{' '}
            <strong>{fmtTime(selected?.slot_start)}</strong>
          </span>
        </div>

        <h2 style={{ fontFamily: 'Outfit', fontSize: 18, margin: '0 0 16px' }}>
          Tus datos
        </h2>

        <Field label="Nombre completo">
          <input
            data-testid="public-booking-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Tu nombre"
            style={inputStyle}
          />
        </Field>
        <Field label="Correo electrónico">
          <input
            data-testid="public-booking-email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="tu@correo.com"
            style={inputStyle}
          />
        </Field>
        <Field label="Teléfono / WhatsApp">
          <input
            data-testid="public-booking-phone"
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="55 1234 5678"
            style={inputStyle}
          />
        </Field>

        {submitError && (
          <div data-testid="public-booking-form-error" style={{
            padding: 10, borderRadius: 10, marginTop: 8,
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
            color: 'rgba(240,235,224,0.9)', fontSize: 13,
          }}>
            {submitError}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
          <button
            data-testid="public-booking-back-btn"
            onClick={() => setStep('slots')}
            style={{
              padding: '10px 18px', borderRadius: 9999,
              background: 'transparent', color: 'var(--cream)',
              border: '1px solid rgba(240,235,224,0.2)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
            }}
          >
            <ArrowLeft size={13} /> Volver
          </button>
          <button
            data-testid="public-booking-submit-btn"
            onClick={onSubmit}
            disabled={submitting}
            style={{
              padding: '12px 22px', borderRadius: 9999,
              background: submitting
                ? 'rgba(240,235,224,0.4)'
                : 'linear-gradient(135deg, #6366F1, #EC4899)',
              color: '#fff',
              border: 0, cursor: submitting ? 'not-allowed' : 'pointer',
              fontWeight: 700, fontSize: 14,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {submitting ? 'Agendando…' : 'Confirmar reserva'}
            {!submitting && <ArrowRight size={14} />}
          </button>
        </div>

        <p style={{
          marginTop: 20, fontSize: 11, color: 'rgba(240,235,224,0.4)',
          textAlign: 'center',
        }}>
          Al agendar aceptas compartir tus datos con el desarrollador para la gestión de la visita.
        </p>
      </div>
    </Shell>
  );
}

const inputStyle = {
  width: '100%', padding: '10px 14px', borderRadius: 10,
  background: 'rgba(240,235,224,0.06)',
  border: '1px solid rgba(240,235,224,0.14)',
  color: 'var(--cream, #F0EBE0)', fontSize: 14, fontFamily: 'DM Sans',
  outline: 'none',
};

const Field = ({ label, children }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{
      display: 'block', fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase',
      color: 'rgba(240,235,224,0.55)', marginBottom: 6,
    }}>
      {label}
    </label>
    {children}
  </div>
);
