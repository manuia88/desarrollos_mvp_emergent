// W5.22 Z.8.2 — CalendarBooking: slots placeholder
import React, { useState } from 'react';

const today = new Date();
const SLOTS = ['09:00', '11:00', '13:00', '16:00', '18:00'];

function nextDays(n = 7) {
  return Array.from({ length: n }).map((_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i + 1);
    return d;
  });
}

export default function CalendarBookingSection({ config = {}, brandKit = {} }) {
  const [day, setDay] = useState(null);
  const [slot, setSlot] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const primary = brandKit.color_primary || '#6366F1';
  const secondary = brandKit.color_secondary || '#EC4899';
  const grad = `linear-gradient(90deg, ${primary}, ${secondary})`;

  return (
    <section data-testid="sec-calendar" style={{ padding: '4rem 1.5rem', maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ fontFamily: 'Outfit, sans-serif', textAlign: 'center', margin: '0 0 24px', fontSize: 'clamp(1.5rem, 2.5vw, 2rem)' }}>Agenda visita</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: 24 }}>
        {nextDays(7).map((d, i) => (
          <button key={i} type="button" data-testid={`cal-day-${i}`} onClick={() => setDay(d)} style={{ padding: 14, borderRadius: 12, background: day && d.toDateString() === day.toDateString() ? grad : 'rgba(13,16,23,0.6)', color: '#F0EBE0', border: '1px solid rgba(99,102,241,0.18)', cursor: 'pointer', textAlign: 'center', fontWeight: 600 }}>
            <div style={{ fontSize: 11, opacity: 0.7 }}>{d.toLocaleDateString('es-MX', { weekday: 'short' })}</div>
            <div style={{ fontSize: 22 }}>{d.getDate()}</div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>{d.toLocaleDateString('es-MX', { month: 'short' })}</div>
          </button>
        ))}
      </div>
      {day && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10 }}>
          {SLOTS.map((s) => (
            <button key={s} type="button" data-testid={`cal-slot-${s}`} onClick={() => { setSlot(s); setConfirmed(true); }} style={{ padding: '12px 8px', borderRadius: 10, background: slot === s ? grad : 'rgba(99,102,241,0.08)', color: '#F0EBE0', border: '1px solid rgba(99,102,241,0.2)', cursor: 'pointer', fontWeight: 600 }}>{s}</button>
          ))}
        </div>
      )}
      {confirmed && (
        <div data-testid="cal-confirmed" style={{ marginTop: 24, padding: 18, borderRadius: 12, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.4)', textAlign: 'center' }}>
          Reserva confirmada para {day?.toLocaleDateString('es-MX')} a las {slot}. Te enviamos confirmacion por correo.
        </div>
      )}
    </section>
  );
}
