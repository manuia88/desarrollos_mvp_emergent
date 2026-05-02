// SlotsTab — Configuración de slots disponibles para citas en un proyecto
// Acceso: developer_admin puede editar, otros ven en modo lectura
import React, { useState, useEffect, useCallback } from 'react';
import { configureSlots, getSlotAvailability } from '../../api/developer';
import { CalendarCheck, Clock, CheckCircle, AlertCircle } from '../icons';

const DAYS = [
  { k: 0, label: 'Lunes',     short: 'Lun' },
  { k: 1, label: 'Martes',    short: 'Mar' },
  { k: 2, label: 'Miércoles', short: 'Mié' },
  { k: 3, label: 'Jueves',    short: 'Jue' },
  { k: 4, label: 'Viernes',   short: 'Vie' },
  { k: 5, label: 'Sábado',    short: 'Sáb' },
  { k: 6, label: 'Domingo',   short: 'Dom' },
];

const MONTHS_ES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function getDefaultSlots() {
  return DAYS.reduce((acc, d) => {
    acc[d.k] = { active: d.k < 5, hour_start: '10:00', hour_end: '18:00', max_concurrent: 1 };
    return acc;
  }, {});
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function fmtDate(date) {
  return `${date.getDate()} ${MONTHS_ES[date.getMonth()]}`;
}

function getNextNDates(n) {
  const results = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let cursor = new Date(today);
  let checked = 0;
  while (results.length < n && checked < 60) {
    results.push(new Date(cursor));
    cursor = addDays(cursor, 1);
    checked++;
  }
  return results.slice(0, n);
}

function isoDate(date) {
  return date.toISOString().split('T')[0];
}

const inputStyle = {
  padding: '6px 10px', borderRadius: 7,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid var(--border)',
  color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5,
  outline: 'none', width: '100%', boxSizing: 'border-box',
};

const disabledInputStyle = {
  ...inputStyle,
  opacity: 0.4, cursor: 'not-allowed', background: 'rgba(255,255,255,0.02)',
};

export default function SlotsTab({ devId, user }) {
  const isAdmin = user?.role === 'developer_admin' || user?.role === 'superadmin';
  const [slots, setSlots] = useState(getDefaultSlots());
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null); // { type: 'success'|'error', msg }
  const [errors, setErrors] = useState({});
  const [preview, setPreview] = useState([]); // [{date, label, hours:[]}]
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Fetch current slots from availability endpoint to populate saved values
  const loadCurrentSlots = useCallback(() => {
    // Use today and next few days to detect which days have slots configured
    // We just show defaults unless backend tells us more via availability
    const nextDates = getNextNDates(7);
    Promise.all(
      nextDates.map(d =>
        getSlotAvailability(devId, isoDate(d))
          .then(r => ({ dayOfWeek: d.getDay(), date: d, slots: r.slots || [] }))
          .catch(() => ({ dayOfWeek: d.getDay(), date: d, slots: [] }))
      )
    ).then(results => {
      // If any day has configured slots, overwrite defaults with backend data
      const newSlots = { ...getDefaultSlots() };
      for (const r of results) {
        // Convert JS day (0=Sun) to spec day (0=Mon)
        const specDay = r.dayOfWeek === 0 ? 6 : r.dayOfWeek - 1;
        if (r.slots.length > 0) {
          const firstSlot = r.slots[0];
          newSlots[specDay] = {
            active: true,
            hour_start: firstSlot.hour_start || '10:00',
            hour_end: firstSlot.hour_end || '18:00',
            max_concurrent: firstSlot.max_concurrent || 1,
          };
        }
      }
      setSlots(newSlots);
    });
  }, [devId]);

  // Load preview for next 4 available dates
  const loadPreview = useCallback(() => {
    const nextDates = getNextNDates(14);
    setLoadingPreview(true);
    Promise.all(
      nextDates.map(d =>
        getSlotAvailability(devId, isoDate(d))
          .then(r => ({ date: d, slots: r.slots || [] }))
          .catch(() => ({ date: d, slots: [] }))
      )
    ).then(results => {
      const withSlots = results
        .filter(r => r.slots.some(s => s.available))
        .slice(0, 4)
        .map(r => ({
          label: `${DAYS[(r.date.getDay() === 0 ? 6 : r.date.getDay() - 1)].label} ${fmtDate(r.date)}`,
          hours: r.slots.filter(s => s.available).map(s => s.hour_start),
        }));
      setPreview(withSlots);
    }).finally(() => setLoadingPreview(false));
  }, [devId]);

  useEffect(() => { loadCurrentSlots(); loadPreview(); }, [loadCurrentSlots, loadPreview]);

  const updateDay = (dayK, field, value) => {
    setSlots(s => ({ ...s, [dayK]: { ...s[dayK], [field]: value } }));
    setErrors(e => ({ ...e, [dayK]: undefined }));
  };

  const validate = () => {
    const errs = {};
    DAYS.forEach(d => {
      const s = slots[d.k];
      if (!s.active) return;
      if (!s.hour_start || !s.hour_end) { errs[d.k] = 'Hora requerida'; return; }
      if (s.hour_start >= s.hour_end) { errs[d.k] = 'Apertura debe ser < Cierre'; }
      if (!s.max_concurrent || s.max_concurrent < 1 || s.max_concurrent > 5) {
        errs[d.k] = 'Citas simultáneas: 1–5';
      }
    });
    return errs;
  };

  const handleSave = async () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      const payload = DAYS
        .filter(d => slots[d.k].active)
        .map(d => ({
          day_of_week: d.k,
          hour_start: slots[d.k].hour_start,
          hour_end: slots[d.k].hour_end,
          max_concurrent: Number(slots[d.k].max_concurrent),
          active: true,
        }));
      // Also send inactive days to disable them
      DAYS.filter(d => !slots[d.k].active).forEach(d => {
        payload.push({ day_of_week: d.k, hour_start: '10:00', hour_end: '18:00', max_concurrent: 1, active: false });
      });
      await configureSlots(devId, payload);
      setToast({ type: 'success', msg: 'Configuración de slots guardada' });
      setTimeout(() => setToast(null), 3000);
      loadPreview();
    } catch (err) {
      setToast({ type: 'error', msg: err.message || 'Error al guardar' });
      setTimeout(() => setToast(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-testid="slots-tab" style={{ maxWidth: 780 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 20, color: 'var(--cream)', margin: 0, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 9 }}>
            <CalendarCheck size={18} color="#818CF8" />
            Slots disponibles para citas
          </h2>
          <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', margin: '4px 0 0' }}>
            {isAdmin ? 'Define los horarios en que se pueden agendar citas.' : 'Vista de configuración de horarios (solo lectura).'}
          </p>
        </div>
        {!isAdmin && (
          <div style={{ padding: '5px 11px', borderRadius: 8, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', fontFamily: 'DM Sans', fontSize: 11.5, color: '#FCD34D' }}>
            Solo lectura
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div data-testid={`slots-toast-${toast.type}`} style={{
          padding: '10px 14px', borderRadius: 9, marginBottom: 16,
          background: toast.type === 'success' ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${toast.type === 'success' ? 'rgba(74,222,128,0.35)' : 'rgba(239,68,68,0.35)'}`,
          color: toast.type === 'success' ? '#4ADE80' : '#F87171',
          fontFamily: 'DM Sans', fontSize: 12.5,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {toast.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
          {toast.msg}
        </div>
      )}

      {/* Weekly config table */}
      <div style={{ borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 20 }}>
        {/* Table header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '130px 60px 1fr 1fr 100px',
          gap: 0, padding: '10px 16px',
          background: 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid var(--border)',
        }}>
          {['Día', 'Activo', 'Apertura', 'Cierre', 'Máx. citas'].map(h => (
            <div key={h} style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{h}</div>
          ))}
        </div>

        {/* Rows */}
        {DAYS.map((d, idx) => {
          const s = slots[d.k];
          const rowErr = errors[d.k];
          const isWeekend = d.k >= 5;
          return (
            <div key={d.k} data-testid={`slot-row-${d.k}`} style={{
              display: 'grid', gridTemplateColumns: '130px 60px 1fr 1fr 100px',
              gap: 0, padding: '11px 16px', alignItems: 'center',
              borderBottom: idx < DAYS.length - 1 ? '1px solid var(--border)' : 'none',
              background: s.active ? 'transparent' : 'rgba(255,255,255,0.015)',
              transition: 'background 0.15s',
            }}>
              {/* Day label */}
              <div style={{ fontFamily: 'DM Sans', fontWeight: s.active ? 600 : 400, fontSize: 13, color: s.active ? 'var(--cream)' : 'var(--cream-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                {isWeekend && <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#818CF8', flexShrink: 0 }} />}
                {d.label}
              </div>

              {/* Toggle */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', cursor: isAdmin ? 'pointer' : 'not-allowed', gap: 0 }} title={!isAdmin ? 'Solo administrador puede modificar slots' : ''}>
                  <input
                    type="checkbox"
                    data-testid={`slot-toggle-${d.k}`}
                    checked={s.active}
                    disabled={!isAdmin}
                    onChange={e => isAdmin && updateDay(d.k, 'active', e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: '#6366F1', cursor: isAdmin ? 'pointer' : 'not-allowed' }}
                  />
                </label>
              </div>

              {/* Hour start */}
              <div style={{ paddingRight: 10 }}>
                <input
                  type="time"
                  data-testid={`slot-start-${d.k}`}
                  value={s.hour_start}
                  disabled={!isAdmin || !s.active}
                  onChange={e => updateDay(d.k, 'hour_start', e.target.value)}
                  style={(!isAdmin || !s.active) ? disabledInputStyle : inputStyle}
                  title={!isAdmin ? 'Solo administrador puede modificar slots' : ''}
                />
              </div>

              {/* Hour end */}
              <div style={{ paddingRight: 10 }}>
                <input
                  type="time"
                  data-testid={`slot-end-${d.k}`}
                  value={s.hour_end}
                  disabled={!isAdmin || !s.active}
                  onChange={e => updateDay(d.k, 'hour_end', e.target.value)}
                  style={(!isAdmin || !s.active) ? disabledInputStyle : inputStyle}
                  title={!isAdmin ? 'Solo administrador puede modificar slots' : ''}
                />
              </div>

              {/* Max concurrent */}
              <div>
                <input
                  type="number"
                  data-testid={`slot-max-${d.k}`}
                  min={1} max={5}
                  value={s.max_concurrent}
                  disabled={!isAdmin || !s.active}
                  onChange={e => updateDay(d.k, 'max_concurrent', Math.min(5, Math.max(1, Number(e.target.value))))}
                  style={(!isAdmin || !s.active) ? disabledInputStyle : inputStyle}
                  title={!isAdmin ? 'Solo administrador puede modificar slots' : ''}
                />
                {rowErr && (
                  <div data-testid={`slot-error-${d.k}`} style={{ fontSize: 10.5, color: '#F87171', marginTop: 3, fontFamily: 'DM Sans' }}>{rowErr}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Save button (admin only) */}
      {isAdmin && (
        <button
          onClick={handleSave}
          disabled={saving}
          data-testid="slots-save-btn"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '11px 24px', borderRadius: 9999,
            background: saving ? 'var(--border)' : 'var(--grad)',
            border: 'none', color: '#fff',
            fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13.5,
            cursor: saving ? 'not-allowed' : 'pointer',
            marginBottom: 28,
          }}
        >
          <CalendarCheck size={14} />
          {saving ? 'Guardando...' : 'Guardar configuración'}
        </button>
      )}

      {/* Preview próximas fechas */}
      <div style={{ borderRadius: 12, border: '1px solid var(--border)', padding: '16px 18px', background: 'rgba(255,255,255,0.03)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
          <Clock size={13} color="#818CF8" />
          <span style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5, color: 'var(--cream-2)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Próximas 4 fechas con disponibilidad
          </span>
        </div>

        {loadingPreview ? (
          <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', padding: '8px 0' }}>Cargando...</div>
        ) : preview.length === 0 ? (
          <div data-testid="slots-preview-empty" style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', padding: '8px 0' }}>
            Sin fechas disponibles. Activa días y guarda la configuración.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {preview.map((p, i) => (
              <div key={i} data-testid={`slots-preview-row-${i}`} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--border)',
              }}>
                <div style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5, color: 'var(--cream)', minWidth: 120 }}>{p.label}</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {p.hours.map(h => (
                    <span key={h} style={{
                      padding: '2px 8px', borderRadius: 6,
                      background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
                      fontFamily: 'DM Sans', fontSize: 11.5, color: '#818CF8', fontWeight: 500,
                    }}>{h}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
