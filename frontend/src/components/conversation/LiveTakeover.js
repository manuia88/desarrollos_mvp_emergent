// W7.AS.3.D · Round 2 · LiveTakeover — botón "Tomar yo" + modal de confirmación
// con preview del impacto en pesos SOC (el asesor hereda el response_time de la
// conversación). Llama al endpoint existente POST /takeover (Round 1).
import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Hand, X, Gauge } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL || '';

function authHeaders() {
  const tk = localStorage.getItem('dmx_token') || localStorage.getItem('token');
  return tk ? { Authorization: `Bearer ${tk}` } : {};
}

export default function LiveTakeover({ conversationId, onTakenOver, disabled = false, floating = false }) {
  const { t } = useTranslation('conversation_round2_ui');
  const [open, setOpen] = useState(false);
  const [taking, setTaking] = useState(false);
  const [error, setError] = useState('');

  const confirm = useCallback(async () => {
    if (!conversationId || taking) return;
    setTaking(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/superadmin/conversations/takeover`, {
        method: 'POST',
        credentials: 'include', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ conversation_id: conversationId }),
      });
      if (res.ok) {
        const data = await res.json();
        setOpen(false);
        if (onTakenOver) onTakenOver(data);
      } else {
        setError(`${res.status}`);
      }
    } catch {
      setError('network');
    } finally {
      setTaking(false);
    }
  }, [conversationId, taking, onTakenOver]);

  const triggerStyle = floating
    ? { position: 'absolute', bottom: 16, right: 16, boxShadow: '0 6px 18px rgba(0,0,0,0.35)' }
    : {};

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} disabled={disabled || !conversationId}
        style={{
          background: disabled ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg,#6366F1,#EC4899)',
          border: 'none', borderRadius: 9, color: '#fff', padding: '8px 12px',
          cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 12.5,
          display: 'flex', alignItems: 'center', gap: 6, ...triggerStyle,
        }}>
        <Hand size={14} /> {t('takeover.button')}
      </button>

      {open && (
        <div role="dialog" aria-modal="true"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
          onClick={() => !taking && setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface, #16161e)', border: '1px solid var(--border)', borderRadius: 16,
              padding: 22, maxWidth: 440, width: '100%', color: 'var(--cream, #F0EBE0)',
              fontFamily: 'DM Sans, system-ui, sans-serif',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Hand size={18} />
              <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 17, flex: 1 }}>
                {t('takeover.modal_title')}
              </h3>
              <button type="button" onClick={() => !taking && setOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'rgba(240,235,224,0.6)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.5, color: 'rgba(240,235,224,0.8)', margin: '0 0 14px' }}>
              {t('takeover.modal_body')}
            </p>
            <div style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Gauge size={15} style={{ color: 'var(--theme-primary, #818CF8)' }} />
                <span style={{ fontWeight: 700, fontSize: 12.5 }}>{t('takeover.soc_preview')}</span>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: 'rgba(240,235,224,0.7)', lineHeight: 1.45 }}>
                {t('takeover.response_time_note')}
              </p>
            </div>
            {error && (
              <div style={{ fontSize: 12, color: 'var(--theme-danger, #EF4444)', marginBottom: 10 }}>
                {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setOpen(false)} disabled={taking}
                style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--cream, #F0EBE0)', padding: '9px 14px', cursor: 'pointer', fontSize: 13 }}>
                {t('takeover.cancel')}
              </button>
              <button type="button" onClick={confirm} disabled={taking}
                style={{ background: 'linear-gradient(135deg,#6366F1,#EC4899)', border: 'none', borderRadius: 9, color: '#fff', padding: '9px 16px', cursor: taking ? 'wait' : 'pointer', fontWeight: 600, fontSize: 13 }}>
                {taking ? t('takeover.taking') : t('takeover.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
