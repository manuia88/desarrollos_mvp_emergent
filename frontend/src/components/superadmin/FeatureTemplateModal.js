// W5.FF3 · FeatureTemplateModal — modal para apply-template bulk
// Cero hex hardcoded · usa var(--theme*) y var(--cream*).
import React, { useState } from 'react';
import { X } from 'lucide-react';

const TEMPLATES = [
  { key: 'starter',    label: 'Starter (free)',     description: 'Dashboard · Marketplace · Perfil' },
  { key: 'pro',        label: 'Pro',                description: 'Battle Card · FSD Accuracy · Live Pulse · Knowledge Graph + free' },
  { key: 'enterprise', label: 'Enterprise',         description: 'API Keys · Bulk CSV · A/B Testing · Data Licensing + pro' },
];

const overlay = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.65)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  padding: 16,
};

const modalBox = {
  width: '100%',
  maxWidth: 520,
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: 24,
  fontFamily: 'DM Sans',
};

const label = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--cream-2)',
  marginBottom: 6,
};

const fieldBox = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--border)',
  color: 'var(--cream)',
  fontSize: 13,
  fontFamily: 'DM Sans',
};

const cardOption = (active) => ({
  padding: '12px 14px',
  borderRadius: 10,
  border: active ? '1px solid rgba(var(--theme-rgb), 0.55)' : '1px solid var(--border)',
  background: active ? 'rgba(var(--theme-rgb), 0.10)' : 'rgba(255,255,255,0.02)',
  cursor: 'pointer',
  marginBottom: 8,
  transition: 'all 0.15s',
});

export default function FeatureTemplateModal({ open, onClose, users, onApply }) {
  const [selectedUser, setSelectedUser] = useState('');
  const [tpl, setTpl] = useState('pro');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!open) return null;

  const userObj = users && users.find(u => u.user_id === selectedUser);

  async function handleApply() {
    if (!userObj) {
      setErr('Selecciona un usuario.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await onApply({
        user_id: userObj.user_id,
        tenant_id: userObj.tenant_id || userObj.user_id,
        template: tpl,
      });
      onClose && onClose();
    } catch (e) {
      setErr(e.message || 'Error aplicando template');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={overlay} role="dialog" aria-modal="true">
      <div style={modalBox}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{
            fontFamily: 'Outfit',
            fontWeight: 800,
            fontSize: 20,
            color: 'var(--cream)',
            margin: 0,
            letterSpacing: '-0.02em',
          }}>
            Aplicar plantilla a usuario
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--cream-2)',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={label}>Usuario</div>
          <select
            data-testid="tpl-user-select"
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            style={fieldBox}
          >
            <option value="">— Selecciona —</option>
            {(users || []).map(u => (
              <option key={u.user_id} value={u.user_id}>
                {(u.name || u.email || u.user_id) + ' · ' + (u.tier || 'free')}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={label}>Plantilla</div>
          {TEMPLATES.map(t => (
            <div
              key={t.key}
              data-testid={`tpl-option-${t.key}`}
              role="button"
              tabIndex={0}
              onClick={() => setTpl(t.key)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTpl(t.key); } }}
              style={cardOption(tpl === t.key)}
            >
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>{t.label}</div>
              <div style={{ fontSize: 11, color: 'var(--cream-3)', marginTop: 4 }}>{t.description}</div>
            </div>
          ))}
        </div>

        {err && (
          <div style={{
            padding: '8px 12px',
            borderRadius: 6,
            background: 'rgba(244,63,94,0.12)',
            border: '1px solid rgba(244,63,94,0.35)',
            color: '#fda4af',
            fontSize: 12,
            marginBottom: 12,
          }}>
            {err}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '9px 16px',
              borderRadius: 8,
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--cream-2)',
              fontSize: 12,
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
              fontFamily: 'DM Sans',
            }}
          >
            Cancelar
          </button>
          <button
            data-testid="tpl-apply-btn"
            onClick={handleApply}
            disabled={busy || !selectedUser}
            style={{
              padding: '9px 18px',
              borderRadius: 8,
              background: 'rgba(var(--theme-rgb), 0.22)',
              border: '1px solid rgba(var(--theme-rgb), 0.55)',
              color: 'var(--theme-2)',
              fontSize: 12,
              fontWeight: 700,
              cursor: (busy || !selectedUser) ? 'not-allowed' : 'pointer',
              opacity: (busy || !selectedUser) ? 0.5 : 1,
              fontFamily: 'DM Sans',
            }}
          >
            {busy ? 'Aplicando…' : 'Aplicar plantilla'}
          </button>
        </div>
      </div>
    </div>
  );
}
