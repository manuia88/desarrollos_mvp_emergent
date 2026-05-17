/**
 * W5.11 Parte 3 — DesarrolladorDisputas
 * Ruta: /desarrollador/disputas
 *
 * Lista de leads en estado under_review del dev_org_id. Permite al dev_admin
 * resolver disputas (aprobar = liberar lead · rechazar = cerrar + cooldown 90d).
 *
 * Design system: rounded-full, gradient indigo→rose solo en CTAs primarios,
 * sin shadow-2xl (border + backdrop-blur 24px). Cero emoji. Strings via i18n.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import {
  AlertTriangle, CheckCircle2, Clock, Inbox, RefreshCw, Shield, User, X,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

const REASON_CODES = ['duplicate_confirmed', 'low_intent', 'data_falsification', 'other'];

// ─── Atoms ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, Icon, color = 'var(--cream)', testid }) {
  return (
    <div
      data-testid={testid}
      style={{
        flex: '1 1 180px', minWidth: 160,
        background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, padding: '18px 22px',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        {Icon && <Icon size={14} color={color} />}
        <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.55)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          {label}
        </span>
      </div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 30, color, lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

function PillBtn({ children, onClick, kind = 'ghost', disabled, testid }) {
  const palettes = {
    primary: {
      background: 'linear-gradient(90deg, #6366F1, #EC4899)',
      color: '#fff', border: '1px solid transparent',
    },
    success: {
      background: 'rgba(34,197,94,0.10)', color: '#86efac',
      border: '1px solid rgba(34,197,94,0.35)',
    },
    danger: {
      background: 'rgba(239,68,68,0.10)', color: '#fca5a5',
      border: '1px solid rgba(239,68,68,0.35)',
    },
    ghost: {
      background: 'rgba(255,255,255,0.04)', color: 'var(--cream-2, #d6d2c4)',
      border: '1px solid rgba(255,255,255,0.10)',
    },
  };
  const p = palettes[kind] || palettes.ghost;
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '9px 18px', borderRadius: 9999,
        fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'transform 200ms ease, opacity 200ms ease',
        ...p,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}>
      {children}
    </button>
  );
}

function VelocityBadge({ count }) {
  if (!count) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 12px', borderRadius: 9999, fontSize: 10,
      fontFamily: 'DM Mono, monospace', fontWeight: 700,
      background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)',
      color: '#fcd34d',
    }}>
      <Clock size={9} /> Velocidad {count}/30min
    </span>
  );
}

function SmartEmptyState({ title, sub }) {
  return (
    <div data-testid="empty-state" style={{
      padding: '60px 24px', textAlign: 'center',
      background: 'rgba(13,16,23,0.55)', backdropFilter: 'blur(24px)',
      border: '1px dashed rgba(255,255,255,0.10)', borderRadius: 18,
    }}>
      <div style={{ display: 'inline-flex', padding: 14, borderRadius: 9999, background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.30)', marginBottom: 16 }}>
        <Inbox size={20} color="#a5b4fc" />
      </div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream, #F0EBE0)', marginBottom: 6 }}>{title}</div>
      {sub && <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.55)' }}>{sub}</div>}
    </div>
  );
}

// ─── Modal Aprobar ──────────────────────────────────────────────────────────

function ApproveModal({ open, lead, onClose, onConfirm, busy }) {
  const { t } = useTranslation();
  if (!open || !lead) return null;
  return (
    <div data-testid="approve-modal" onClick={onClose} style={modalBackdropStyle}>
      <div onClick={(e) => e.stopPropagation()} style={modalCardStyle}>
        <div style={modalHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircle2 size={18} color="#86efac" />
            <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream, #F0EBE0)' }}>
              {t('disputes.approve_title', 'Aprobar disputa')}
            </span>
          </div>
          <button onClick={onClose} data-testid="approve-close-btn" style={iconBtnStyle}><X size={14} /></button>
        </div>
        <div style={{ padding: '20px 24px', fontFamily: 'DM Sans', fontSize: 14, color: 'rgba(240,235,224,0.85)', lineHeight: 1.55 }}>
          {t('disputes.approve_body', 'El lead volvera a estado "nuevo" y el asesor podra operarlo. Esta accion queda registrada en el audit log inmutable.')}
          <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'rgba(240,235,224,0.45)', textTransform: 'uppercase', marginBottom: 4 }}>Lead</div>
            <div style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, color: 'var(--cream, #F0EBE0)' }}>{lead.contact?.name || lead.lead_id}</div>
          </div>
        </div>
        <div style={modalFooterStyle}>
          <PillBtn kind="ghost" onClick={onClose} testid="approve-cancel-btn">{t('disputes.cancel', 'Cancelar')}</PillBtn>
          <PillBtn kind="primary" onClick={onConfirm} disabled={busy} testid="approve-confirm-btn">
            <CheckCircle2 size={12} /> {busy ? t('disputes.sending', 'Enviando...') : t('disputes.approve', 'Aprobar')}
          </PillBtn>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Rechazar ─────────────────────────────────────────────────────────

function RejectModal({ open, lead, onClose, onConfirm, busy }) {
  const { t } = useTranslation();
  const [reasonCode, setReasonCode] = useState('duplicate_confirmed');
  const [reasonText, setReasonText] = useState('');

  useEffect(() => {
    if (!open) { setReasonCode('duplicate_confirmed'); setReasonText(''); }
  }, [open]);

  const requiresText = reasonCode === 'other';
  const submitDisabled = busy || (requiresText && !reasonText.trim());

  if (!open || !lead) return null;

  return (
    <div data-testid="reject-modal" onClick={onClose} style={modalBackdropStyle}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...modalCardStyle, maxWidth: 520 }}>
        <div style={modalHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={18} color="#fda4af" />
            <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream, #F0EBE0)' }}>
              {t('disputes.reject_title', 'Rechazar disputa')}
            </span>
          </div>
          <button onClick={onClose} data-testid="reject-close-btn" style={iconBtnStyle}><X size={14} /></button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={fieldLabelStyle}>{t('disputes.reason_code_label', 'Razon')}</label>
            <select
              data-testid="reject-reason-code"
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
              style={selectStyle}>
              {REASON_CODES.map(rc => (
                <option key={rc} value={rc}>{t(`disputes.reason_codes.${rc}`, rc)}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={fieldLabelStyle}>
              {t('disputes.reason_text_label', 'Detalle')}
              {requiresText && <span style={{ color: '#fda4af', marginLeft: 6 }}>*</span>}
            </label>
            <textarea
              data-testid="reject-reason-text"
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value.slice(0, 500))}
              placeholder={t('disputes.reason_text_placeholder', 'Explica al asesor por que se rechaza...')}
              rows={4}
              style={textareaStyle}
            />
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'rgba(240,235,224,0.45)', textAlign: 'right', marginTop: 4 }}>
              {reasonText.length}/500
            </div>
          </div>

          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '12px 14px', borderRadius: 12,
            background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)',
          }}>
            <AlertTriangle size={14} color="#fda4af" style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#fecaca', lineHeight: 1.5 }}>
              {t('disputes.cooldown_warning', 'Al rechazar, este asesor no podra registrar leads en este proyecto durante 90 dias')}
            </span>
          </div>
        </div>

        <div style={modalFooterStyle}>
          <PillBtn kind="ghost" onClick={onClose} testid="reject-cancel-btn">{t('disputes.cancel', 'Cancelar')}</PillBtn>
          <PillBtn
            kind="danger"
            disabled={submitDisabled}
            onClick={() => onConfirm({ reason_code: reasonCode, reason_text: reasonText.trim() })}
            testid="reject-confirm-btn">
            <X size={12} /> {busy ? t('disputes.sending', 'Enviando...') : t('disputes.reject', 'Rechazar')}
          </PillBtn>
        </div>
      </div>
    </div>
  );
}

// ─── Card ───────────────────────────────────────────────────────────────────

function DisputeCard({ row, onApprove, onReject, onClickLead }) {
  const { t } = useTranslation();
  const c = row.contact || {};
  const presup = row.presupuesto || {};
  const presupLabel = (presup.min || presup.max)
    ? `$${(presup.min || 0).toLocaleString('es-MX')} – $${(presup.max || 0).toLocaleString('es-MX')}`
    : '—';

  return (
    <div
      data-testid={`dispute-card-${row.lead_id}`}
      style={{
        background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18,
        padding: '20px 22px',
        transition: 'transform 220ms ease, border-color 220ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
      }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'flex-start' }}>
        <div
          onClick={() => onClickLead(row)}
          data-testid={`dispute-card-info-${row.lead_id}`}
          style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream, #F0EBE0)' }}>
              {c.name || row.lead_id}
            </span>
            <VelocityBadge count={row.velocity_count} />
            {row.suspected_match_lead_id && (
              <span data-testid={`suspected-match-${row.lead_id}`} style={{
                padding: '3px 12px', borderRadius: 9999, fontSize: 10,
                fontFamily: 'DM Mono, monospace', fontWeight: 700,
                background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.30)',
                color: '#a5b4fc',
              }}>
                {t('disputes.suspected_match', 'Posible match')}: {row.suspected_match_lead_id.slice(0, 14)}…
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.65)' }}>
            <span>{c.phone || '—'}</span>
            <span>{c.email || '—'}</span>
          </div>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
            <FieldRow Icon={User} label={t('disputes.field_advisor', 'Asesor')} value={row.asesor_name || row.asesor_id || '—'} />
            <FieldRow Icon={Shield} label={t('disputes.field_project', 'Proyecto')} value={row.project_name || row.project_id || '—'} />
            <FieldRow Icon={Clock} label={t('disputes.field_created', 'Creado')} value={(row.created_at || '').slice(0, 10) || '—'} />
            <FieldRow label={t('disputes.field_budget', 'Presupuesto')} value={presupLabel} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignSelf: 'flex-start' }}>
          <PillBtn kind="success" onClick={() => onApprove(row)} testid={`approve-btn-${row.lead_id}`}>
            <CheckCircle2 size={12} /> {t('disputes.approve', 'Aprobar')}
          </PillBtn>
          <PillBtn kind="danger" onClick={() => onReject(row)} testid={`reject-btn-${row.lead_id}`}>
            <X size={12} /> {t('disputes.reject', 'Rechazar')}
          </PillBtn>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ Icon, label, value }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
        {Icon && <Icon size={11} color="rgba(240,235,224,0.45)" />}
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'rgba(240,235,224,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.85)', fontWeight: 500 }}>{value}</div>
    </div>
  );
}

// ─── Toast ──────────────────────────────────────────────────────────────────

function FloatingToast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(onClose, 3500);
    return () => clearTimeout(id);
  }, [toast, onClose]);
  if (!toast) return null;
  const palette = toast.kind === 'success'
    ? { bg: 'rgba(34,197,94,0.18)', bd: 'rgba(34,197,94,0.45)', fg: '#bbf7d0' }
    : toast.kind === 'error'
      ? { bg: 'rgba(239,68,68,0.18)', bd: 'rgba(239,68,68,0.45)', fg: '#fecaca' }
      : { bg: 'rgba(99,102,241,0.18)', bd: 'rgba(99,102,241,0.42)', fg: '#e0e7ff' };
  return (
    <div data-testid="toast" style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 300,
      padding: '12px 18px', borderRadius: 9999,
      background: palette.bg, border: `1px solid ${palette.bd}`,
      color: palette.fg, fontFamily: 'DM Sans', fontWeight: 500, fontSize: 13,
      backdropFilter: 'blur(24px)', maxWidth: 360,
    }}>{toast.text}</div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const modalBackdropStyle = {
  position: 'fixed', inset: 0, zIndex: 200,
  background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 20,
};
const modalCardStyle = {
  background: 'rgba(13,16,23,0.96)', backdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.10)', borderRadius: 20,
  width: '100%', maxWidth: 460, overflow: 'hidden',
};
const modalHeaderStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)',
};
const modalFooterStyle = {
  display: 'flex', justifyContent: 'flex-end', gap: 10,
  padding: '14px 22px 20px',
};
const iconBtnStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28, borderRadius: 9999,
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
  color: 'var(--cream-2, #d6d2c4)', cursor: 'pointer',
};
const fieldLabelStyle = {
  display: 'block', fontFamily: 'DM Mono, monospace', fontSize: 10,
  color: 'rgba(240,235,224,0.55)', textTransform: 'uppercase',
  letterSpacing: '0.06em', marginBottom: 6,
};
const selectStyle = {
  width: '100%', padding: '10px 14px', borderRadius: 9999,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  color: 'var(--cream, #F0EBE0)', fontFamily: 'DM Sans', fontSize: 13,
  outline: 'none',
};
const textareaStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 16,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  color: 'var(--cream, #F0EBE0)', fontFamily: 'DM Sans', fontSize: 13,
  outline: 'none', resize: 'vertical', minHeight: 90,
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DesarrolladorDisputas({ user, onLogout }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((kind, text) => setToast({ kind, text }), []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pendRes, histRes] = await Promise.all([
        fetch(`${API}/api/dev/disputes/pending`, { credentials: 'include' }).then(r => r.json()).catch(() => ({})),
        fetch(`${API}/api/dev/disputes/history?limit=200`, { credentials: 'include' }).then(r => r.json()).catch(() => ({})),
      ]);
      setRows(pendRes.pending || []);
      setHistory(histRes.history || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const kpis = useMemo(() => {
    const cutoff30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let approved30 = 0, rejected30 = 0, cooldownActive = 0;
    const nowIso = new Date().toISOString();
    for (const h of history) {
      const ts = h.resolved_at ? Date.parse(h.resolved_at) : 0;
      if (ts >= cutoff30) {
        if (h.resolution === 'approved') approved30 += 1;
        else if (h.resolution === 'rejected') rejected30 += 1;
      }
      if (h.cooldown_until && h.cooldown_until > nowIso) cooldownActive += 1;
    }
    return { pending: rows.length, approved30, rejected30, cooldownActive };
  }, [rows, history]);

  const resolveCall = async (leadId, body) => {
    const r = await fetch(`${API}/api/dev/disputes/${leadId}/resolve`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || `Error ${r.status}`);
    }
    return r.json();
  };

  const handleApproveConfirm = async () => {
    if (!approveTarget) return;
    setBusy(true);
    try {
      await resolveCall(approveTarget.lead_id, { resolution: 'approved', reason_code: 'duplicate_confirmed' });
      showToast('success', t('disputes.toast_approved', 'Disputa aprobada'));
      setApproveTarget(null);
      loadAll();
    } catch (e) { showToast('error', e.message || t('disputes.toast_error', 'Error al resolver')); }
    finally { setBusy(false); }
  };

  const handleRejectConfirm = async ({ reason_code, reason_text }) => {
    if (!rejectTarget) return;
    setBusy(true);
    try {
      await resolveCall(rejectTarget.lead_id, { resolution: 'rejected', reason_code, reason_text });
      showToast('success', t('disputes.toast_rejected', 'Disputa rechazada · cooldown 90d activo'));
      setRejectTarget(null);
      loadAll();
    } catch (e) { showToast('error', e.message || t('disputes.toast_error', 'Error al resolver')); }
    finally { setBusy(false); }
  };

  const handleClickLead = (row) => {
    navigate(`/desarrollador/crm?lead_id=${encodeURIComponent(row.lead_id)}`);
  };

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <div data-testid="disputes-page" style={{ padding: '8px 4px 60px 4px', maxWidth: 1280, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 28 }}>
          <div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.08em', color: 'rgba(240,235,224,0.45)', textTransform: 'uppercase', marginBottom: 8 }}>
              {t('disputes.eyebrow', 'Workflow diario · revision de leads')}
            </div>
            <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 32, color: 'var(--cream, #F0EBE0)', letterSpacing: '-0.02em', margin: 0, lineHeight: 1.1 }}>
              {t('disputes.title', 'Disputas de leads')}
            </h1>
            <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'rgba(240,235,224,0.65)', marginTop: 8, maxWidth: 620, lineHeight: 1.55 }}>
              {t('disputes.subtitle', 'Revisa los leads en estado bajo revision. Aprueba si son legitimos · rechaza para cerrar y activar cooldown 90d en este proyecto.')}
            </p>
          </div>
          <PillBtn kind="ghost" onClick={loadAll} disabled={loading} testid="disputes-reload-btn">
            <RefreshCw size={11} /> {t('disputes.reload', 'Recargar')}
          </PillBtn>
        </div>

        {/* KPIs */}
        <div data-testid="disputes-kpi-strip" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 28 }}>
          <KpiCard label={t('disputes.kpi_pending', 'Pendientes')} value={kpis.pending} Icon={Inbox} color="#a5b4fc" testid="kpi-pending" />
          <KpiCard label={t('disputes.kpi_approved_30d', 'Aprobadas 30d')} value={kpis.approved30} Icon={CheckCircle2} color="#86efac" testid="kpi-approved" />
          <KpiCard label={t('disputes.kpi_rejected_30d', 'Rechazadas 30d')} value={kpis.rejected30} Icon={X} color="#fda4af" testid="kpi-rejected" />
          <KpiCard label={t('disputes.kpi_cooldown_active', 'Cooldown activos')} value={kpis.cooldownActive} Icon={Clock} color="#fcd34d" testid="kpi-cooldown" />
        </div>

        {/* List */}
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.55)' }}>
            {t('disputes.loading', 'Cargando disputas...')}
          </div>
        ) : rows.length === 0 ? (
          <SmartEmptyState
            title={t('disputes.empty', 'Sin disputas pendientes')}
            sub={t('disputes.empty_sub', 'Todos los leads han sido revisados. Vuelve mas tarde.')}
          />
        ) : (
          <div data-testid="disputes-list" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {rows.map(row => (
              <DisputeCard
                key={row.lead_id}
                row={row}
                onApprove={(r) => setApproveTarget(r)}
                onReject={(r) => setRejectTarget(r)}
                onClickLead={handleClickLead}
              />
            ))}
          </div>
        )}

        <ApproveModal
          open={!!approveTarget}
          lead={approveTarget}
          onClose={() => !busy && setApproveTarget(null)}
          onConfirm={handleApproveConfirm}
          busy={busy}
        />
        <RejectModal
          open={!!rejectTarget}
          lead={rejectTarget}
          onClose={() => !busy && setRejectTarget(null)}
          onConfirm={handleRejectConfirm}
          busy={busy}
        />
        <FloatingToast toast={toast} onClose={() => setToast(null)} />
      </div>
    </DeveloperLayout>
  );
}
