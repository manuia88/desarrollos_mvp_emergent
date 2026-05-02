// Universal Cita notification banner — Phase 4 Batch 4.3
// Polls /api/notifications every 60s; renders inline action banners for:
//   - cita_post_check    (asesor sees "¿Cómo te fue con {client}?")
//   - cita_followup      (24h after realizada: "¿Hay propuesta?")
//   - cita_client_confirmed / cita_client_cancelled / cita_client_rescheduled (info-only)
// Uses dismiss endpoint after action taken.
import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle, X, CalendarCheck, AlertCircle, MessageCircle } from '../icons';
import * as leadsApi from '../../api/leads';

const API = process.env.REACT_APP_BACKEND_URL;

const j = async (url, opts = {}) => {
  const r = await fetch(`${API}${url}`, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  return body;
};
const post = (url, body) => j(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

const TYPE_TONE = {
  cita_post_check:           { bg: 'rgba(245,158,11,0.08)', bd: 'rgba(245,158,11,0.30)', fg: 'var(--amber)', Icon: AlertCircle },
  cita_followup:             { bg: 'rgba(240,235,224,0.06)', bd: 'rgba(240,235,224,0.20)', fg: 'var(--cream-2)', Icon: MessageCircle },
  cita_client_confirmed:     { bg: 'rgba(34,197,94,0.08)',  bd: 'rgba(34,197,94,0.30)', fg: 'var(--green)', Icon: CheckCircle },
  cita_client_cancelled:     { bg: 'rgba(239,68,68,0.08)',  bd: 'rgba(239,68,68,0.30)', fg: 'var(--red)', Icon: X },
  cita_client_rescheduled:   { bg: 'rgba(245,158,11,0.08)', bd: 'rgba(245,158,11,0.30)', fg: 'var(--amber)', Icon: CalendarCheck },
};

const ACTIONABLE_TYPES = ['cita_post_check', 'cita_followup'];

export default function CitaNotifBanner() {
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await j('/api/notifications?limit=10&unread_only=true');
      const filtered = (r.items || []).filter(n => Object.keys(TYPE_TONE).includes(n.type));
      setItems(filtered);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);

  const dismiss = async (nid) => {
    try { await post(`/api/notifications/${nid}/dismiss`); } catch {}
    setItems(s => s.filter(n => n.id !== nid));
  };

  const doPostAction = async (notif, action, extra) => {
    setBusyId(notif.id);
    try {
      const aptId = notif.payload?.appointment_id || notif.related_id;
      await leadsApi.citaPostAction(aptId, action, extra || {});
      await dismiss(notif.id);
    } catch (e) {
      alert(e.body?.detail || 'Error al procesar acción');
    } finally { setBusyId(null); }
  };

  const doFollowup = async (notif, has_proposal) => {
    setBusyId(notif.id);
    try {
      const leadId = notif.payload?.lead_id;
      if (!leadId) throw new Error('Lead id no encontrado');
      await leadsApi.leadPostRealizadaFollowup(leadId, has_proposal);
      await dismiss(notif.id);
    } catch (e) {
      alert(e.body?.detail || 'Error al procesar respuesta');
    } finally { setBusyId(null); }
  };

  if (items.length === 0) return null;

  return (
    <div data-testid="cita-notif-banner" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
      {items.map(n => {
        const tone = TYPE_TONE[n.type];
        const Icon = tone.Icon;
        const cn = n.payload?.contact_name || 'Cliente';
        const isBusy = busyId === n.id;
        const renderActions = ACTIONABLE_TYPES.includes(n.type);

        return (
          <div key={n.id} data-testid={`notif-${n.type}-${n.id}`} style={{
            padding: '14px 16px', borderRadius: 12,
            background: tone.bg, border: `1px solid ${tone.bd}`,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ color: tone.fg, flexShrink: 0, paddingTop: 2 }}>
                <Icon size={16} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>
                  {n.payload?.title || titleFor(n.type, cn)}
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', marginTop: 4 }}>
                  {subtitleFor(n)}
                </div>
              </div>
              <button data-testid={`notif-dismiss-${n.id}`} onClick={() => dismiss(n.id)}
                title="Descartar"
                style={{ background: 'transparent', border: 'none', color: 'var(--cream-3)', cursor: 'pointer', padding: 4 }}>
                <X size={13} />
              </button>
            </div>

            {renderActions && n.type === 'cita_post_check' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <ActionBtn testid={`act-realizada-${n.id}`} disabled={isBusy} onClick={() => doPostAction(n, 'realizada')} tone="green">
                  Sí, se realizó
                </ActionBtn>
                <ActionBtn testid={`act-noshow-${n.id}`} disabled={isBusy} onClick={() => doPostAction(n, 'noshow')} tone="red">
                  No-show
                </ActionBtn>
                <ActionBtn testid={`act-resched-${n.id}`} disabled={isBusy}
                  onClick={() => {
                    const v = window.prompt('Nueva fecha y hora (YYYY-MM-DDTHH:MM, ej: 2026-05-10T16:00)');
                    if (!v) return;
                    const iso = new Date(v).toISOString();
                    doPostAction(n, 'reschedule', { new_datetime: iso });
                  }} tone="amber">
                  Reagendar
                </ActionBtn>
              </div>
            )}

            {renderActions && n.type === 'cita_followup' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <ActionBtn testid={`act-proposal-yes-${n.id}`} disabled={isBusy} onClick={() => doFollowup(n, true)} tone="green">
                  Sí, propuesta enviada
                </ActionBtn>
                <ActionBtn testid={`act-proposal-no-${n.id}`} disabled={isBusy} onClick={() => doFollowup(n, false)} tone="amber">
                  Aún no
                </ActionBtn>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ActionBtn({ children, onClick, disabled, tone, testid }) {
  const tones = {
    green: { bg: 'rgba(34,197,94,0.12)', bd: 'rgba(34,197,94,0.40)', fg: 'var(--green)' },
    red:   { bg: 'rgba(239,68,68,0.12)', bd: 'rgba(239,68,68,0.40)', fg: 'var(--red)' },
    amber: { bg: 'rgba(245,158,11,0.12)', bd: 'rgba(245,158,11,0.40)', fg: 'var(--amber)' },
  };
  const t = tones[tone] || tones.green;
  return (
    <button data-testid={testid} onClick={onClick} disabled={disabled} style={{
      padding: '8px 14px', borderRadius: 9999, cursor: disabled ? 'not-allowed' : 'pointer',
      background: t.bg, border: `1px solid ${t.bd}`, color: t.fg,
      fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
      opacity: disabled ? 0.6 : 1,
    }}>{children}</button>
  );
}

function titleFor(type, name) {
  switch (type) {
    case 'cita_post_check':         return `¿Cómo te fue con ${name}?`;
    case 'cita_followup':           return `¿Hay propuesta para ${name}?`;
    case 'cita_client_confirmed':   return `${name} confirmó su cita`;
    case 'cita_client_cancelled':   return `${name} canceló su cita`;
    case 'cita_client_rescheduled': return `${name} reagendó su cita`;
    default: return 'Notificación';
  }
}

function subtitleFor(n) {
  if (n.type === 'cita_client_cancelled') {
    return `Motivo: ${n.payload?.reason || 'no especificado'}` + (n.payload?.notes ? ` · ${n.payload.notes}` : '');
  }
  if (n.type === 'cita_client_rescheduled') {
    return `Nueva fecha: ${n.payload?.new_datetime?.slice(0, 16).replace('T', ' ') || '—'}`;
  }
  return n.payload?.datetime?.slice(0, 16).replace('T', ' ') || 'Acción requerida';
}
