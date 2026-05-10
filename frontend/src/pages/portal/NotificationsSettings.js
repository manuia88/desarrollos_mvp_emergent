// W4.17 — NotificationsSettings · página /portal/settings/notifications
import React, { useState, useEffect } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;

const CHANNELS = ['in_app', 'email', 'whatsapp'];
const CHANNEL_LABELS = {
  in_app: 'In-app',
  email: 'Email',
  whatsapp: 'WhatsApp',
};

const CATEGORY_LABELS = {
  lead_new: 'Nuevo lead asignado',
  lead_high_urgency: 'Lead alta urgencia',
  meeting_24h: 'Recordatorio cita 24h',
  meeting_1h: 'Recordatorio cita 1h',
  saved_zone_alert: 'Alerta zona guardada',
  message_pending: 'Mensaje sin respuesta',
  listing_view_repeat: 'Lead repite vista de listing',
  comparable_price_drop: 'Caída precio competidor',
  drop_off_pico: 'Pico de abandono',
  nurture_cooldown: 'Cooldown nurture',
  cron_failed: 'Cron del sistema fallido',
  api_limit_warn: 'Límite de API al 80%+',
};

const SA_ONLY = new Set(['cron_failed', 'api_limit_warn']);

const DIGEST_OPTIONS = [
  { value: 'instant', label: 'Instantáneo' },
  { value: 'hourly', label: 'Cada hora' },
  { value: '4h', label: 'Cada 4 horas' },
  { value: 'daily', label: 'Resumen diario' },
];

const TZ_OPTIONS = [
  'America/Mexico_City',
  'America/Bogota',
  'America/Lima',
  'America/Santiago',
  'America/Sao_Paulo',
  'America/Buenos_Aires',
];

export default function NotificationsSettings({ user }) {
  const [prefs, setPrefs] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const role = user?.role || '';
  const isSuperadmin = role === 'superadmin';

  useEffect(() => {
    fetch(`${API}/api/notifications/preferences`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.preferences) setPrefs(d.preferences); })
      .catch(() => {});
  }, []);

  const toggle = (cat, channel) => {
    setPrefs(p => ({
      ...p,
      categories: {
        ...p.categories,
        [cat]: {
          ...(p.categories?.[cat] || {}),
          [channel]: !(p.categories?.[cat]?.[channel]),
        },
      },
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/notifications/preferences`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categories: prefs.categories,
          quiet_hours: prefs.quiet_hours,
          digest_frequency: prefs.digest_frequency,
        }),
      });
      if (r.ok) {
        setToast('Preferencias guardadas');
        setTimeout(() => setToast(''), 3000);
      }
    } catch {}
    setSaving(false);
  };

  if (!prefs) return (
    <div style={{ padding: 40, color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
      Cargando preferencias...
    </div>
  );

  const visibleCategories = Object.keys(CATEGORY_LABELS).filter(
    c => isSuperadmin || !SA_ONLY.has(c)
  );

  return (
    <div
      data-testid="notif-settings-page"
      style={{ padding: '32px 24px', maxWidth: 720, margin: '0 auto' }}
    >
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 22, color: 'var(--cream)', margin: 0 }}>
          Preferencias de notificaciones
        </h1>
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', marginTop: 6 }}>
          Controla cómo y cuándo recibes alertas del sistema.
        </p>
      </div>

      {/* Matrix de categorías × canales */}
      <div style={{
        background: 'rgba(13,16,23,0.92)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 24,
      }}>
        {/* Header row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr repeat(4, 80px)',
          padding: '10px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.02)',
        }}>
          <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Categoría
          </span>
          {CHANNELS.map(ch => (
            <span key={ch} style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>
              {CHANNEL_LABELS[ch]}
            </span>
          ))}
          <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center', opacity: 0.4 }}>
            Push
          </span>
        </div>

        {/* Rows */}
        {visibleCategories.map((cat, i) => (
          <div
            key={cat}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr repeat(4, 80px)',
              padding: '12px 16px',
              borderBottom: i < visibleCategories.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
              alignItems: 'center',
            }}
          >
            <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)', fontWeight: 500 }}>
              {CATEGORY_LABELS[cat]}
            </span>
            {CHANNELS.map(ch => (
              <div key={ch} style={{ display: 'flex', justifyContent: 'center' }}>
                <input
                  type="checkbox"
                  data-testid={`notif-pref-${cat}-${ch}`}
                  checked={prefs.categories?.[cat]?.[ch] ?? false}
                  onChange={() => toggle(cat, ch)}
                  style={{
                    width: 15, height: 15, cursor: 'pointer',
                    accentColor: '#6366F1',
                  }}
                />
              </div>
            ))}
            {/* Push disabled */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <input type="checkbox" disabled style={{ width: 15, height: 15, opacity: 0.3 }} />
            </div>
          </div>
        ))}
      </div>

      {/* Quiet hours */}
      <div style={{
        background: 'rgba(13,16,23,0.92)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: '18px 20px',
        marginBottom: 20,
      }}>
        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', marginBottom: 14 }}>
          Horas silenciosas
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>Desde</label>
            <input
              type="time"
              data-testid="notif-quiet-start"
              value={prefs.quiet_hours?.start || '21:00'}
              onChange={e => setPrefs(p => ({ ...p, quiet_hours: { ...p.quiet_hours, start: e.target.value } }))}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, color: 'var(--cream)',
                fontFamily: 'DM Sans', fontSize: 13,
                padding: '6px 10px',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>Hasta</label>
            <input
              type="time"
              value={prefs.quiet_hours?.end || '08:00'}
              onChange={e => setPrefs(p => ({ ...p, quiet_hours: { ...p.quiet_hours, end: e.target.value } }))}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, color: 'var(--cream)',
                fontFamily: 'DM Sans', fontSize: 13,
                padding: '6px 10px',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>Zona horaria</label>
            <select
              value={prefs.quiet_hours?.tz || 'America/Mexico_City'}
              onChange={e => setPrefs(p => ({ ...p, quiet_hours: { ...p.quiet_hours, tz: e.target.value } }))}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, color: 'var(--cream)',
                fontFamily: 'DM Sans', fontSize: 13,
                padding: '6px 10px', cursor: 'pointer',
              }}
            >
              {TZ_OPTIONS.map(tz => (
                <option key={tz} value={tz} style={{ background: '#06080F' }}>{tz}</option>
              ))}
            </select>
          </div>
        </div>
        <p style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 10, opacity: 0.8 }}>
          Las notificaciones críticas siempre se entregan, sin importar las horas silenciosas.
        </p>
      </div>

      {/* Digest frequency */}
      <div style={{
        background: 'rgba(13,16,23,0.92)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: '18px 20px',
        marginBottom: 24,
      }}>
        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', marginBottom: 12 }}>
          Frecuencia del resumen
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {DIGEST_OPTIONS.map(opt => (
            <button
              key={opt.value}
              data-testid={`notif-digest-frequency`}
              onClick={() => setPrefs(p => ({ ...p, digest_frequency: opt.value }))}
              style={{
                fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
                padding: '7px 14px', borderRadius: 9999, cursor: 'pointer',
                border: `1px solid ${prefs.digest_frequency === opt.value ? '#6366F1' : 'rgba(255,255,255,0.12)'}`,
                background: prefs.digest_frequency === opt.value ? 'rgba(99,102,241,0.2)' : 'transparent',
                color: prefs.digest_frequency === opt.value ? '#a5b4fc' : 'var(--cream-3)',
                transition: 'all 0.15s',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Save button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          data-testid="notif-save-btn"
          onClick={save}
          disabled={saving}
          style={{
            fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
            padding: '10px 24px', borderRadius: 9999,
            background: 'linear-gradient(90deg, #6366F1, #EC4899)',
            color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
            transition: 'opacity 0.2s',
          }}
        >
          {saving ? 'Guardando...' : 'Guardar preferencias'}
        </button>
        {toast && (
          <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#4ADE80', fontWeight: 600 }}>
            {toast}
          </span>
        )}
      </div>
    </div>
  );
}
