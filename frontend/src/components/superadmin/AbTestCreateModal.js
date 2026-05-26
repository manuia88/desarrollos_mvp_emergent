// W7.AS.3.G · AbTestCreateModal — crea un A/B test (2 prompts paralelos).
// Form: name + description + prompt A + prompt B + traffic_split slider (50/50).
// ESC + body-scroll-lock · aurora design. Valida split entero 0-100 (A+B=100).
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, FlaskConical, Loader2 } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL || '';
const GRADIENT = 'linear-gradient(135deg, #6366F1, #EC4899)';

function authHeaders() {
  const t = localStorage.getItem('dmx_token') || localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function AbTestCreateModal({ open, onClose, onCreated }) {
  const { t } = useTranslation('conversation_ab_testing');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [promptA, setPromptA] = useState('');
  const [promptB, setPromptB] = useState('');
  const [splitA, setSplitA] = useState(50);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !submitting) onClose && onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, submitting, onClose]);

  useEffect(() => {
    if (open) {
      setName(''); setDescription(''); setPromptA(''); setPromptB('');
      setSplitA(50); setError(''); setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const splitB = 100 - splitA;

  const submit = async () => {
    setError('');
    if (!name.trim() || !promptA.trim() || !promptB.trim()) {
      setError(t('validation_required'));
      return;
    }
    if (!Number.isInteger(splitA) || splitA < 0 || splitA > 100) {
      setError(t('validation_split'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/superadmin/ab-testing/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          name: name.trim(), description: description.trim() || null,
          prompt_a: promptA, prompt_b: promptB, split_pct: splitA,
        }),
      });
      if (!res.ok) throw new Error('create_failed');
      const data = await res.json();
      onCreated && onCreated(data);
      onClose && onClose();
    } catch (e) {
      setError(t('create_error'));
    } finally {
      setSubmitting(false);
    }
  };

  const field = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 10,
    color: 'var(--cream, #F0EBE0)', padding: '10px 12px', fontSize: 13, outline: 'none',
    width: '100%', boxSizing: 'border-box', fontFamily: 'DM Sans, system-ui, sans-serif',
  };
  const label = { fontSize: 11.5, color: 'rgba(240,235,224,0.55)', fontWeight: 600, marginBottom: 6, display: 'block' };

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget && !submitting) onClose && onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div role="dialog" aria-label={t('modal_title')} style={{
        width: 'min(720px, 96vw)', maxHeight: '90vh', overflowY: 'auto', background: '#0D1017',
        border: '1px solid rgba(255,255,255,0.12)', borderRadius: 18, fontFamily: 'DM Sans, system-ui, sans-serif',
      }}>
        {/* header */}
        <div style={{ background: GRADIENT, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FlaskConical size={18} /> {t('modal_title')}
          </span>
          <button type="button" onClick={() => !submitting && onClose && onClose()} aria-label="Cerrar"
            style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex' }}>
            <X size={20} />
          </button>
        </div>

        {/* body */}
        <div style={{ padding: 18, color: 'var(--cream, #F0EBE0)' }}>
          <div style={{ marginBottom: 14 }}>
            <label style={label}>{t('name_label')}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('name_ph')} style={field} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={label}>{t('description_label')}</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('description_ph')} style={field} />
          </div>

          {/* 2 prompts parallel */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={label}>{t('prompt_a_label')}</label>
              <textarea value={promptA} onChange={(e) => setPromptA(e.target.value)} placeholder={t('prompt_ph')}
                rows={6} style={{ ...field, resize: 'vertical', lineHeight: 1.5 }} />
            </div>
            <div>
              <label style={label}>{t('prompt_b_label')}</label>
              <textarea value={promptB} onChange={(e) => setPromptB(e.target.value)} placeholder={t('prompt_ph')}
                rows={6} style={{ ...field, resize: 'vertical', lineHeight: 1.5 }} />
            </div>
          </div>

          {/* traffic split */}
          <div style={{ marginBottom: 16 }}>
            <label style={label}>{t('traffic_split')} — {t('split_hint', { a: splitA, b: splitB })}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, color: '#6366F1', fontWeight: 700, width: 44 }}>A {splitA}%</span>
              <input type="range" min={0} max={100} step={1} value={splitA}
                onChange={(e) => setSplitA(parseInt(e.target.value, 10))}
                style={{ flex: 1, accentColor: '#6366F1' }} aria-label={t('traffic_split')} />
              <span style={{ fontSize: 12, color: '#EC4899', fontWeight: 700, width: 44, textAlign: 'right' }}>B {splitB}%</span>
            </div>
          </div>

          {error ? <div style={{ color: '#EF4444', fontSize: 12.5, marginBottom: 12 }}>{error}</div> : null}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={() => !submitting && onClose && onClose()}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: 10,
                color: 'var(--cream, #F0EBE0)', padding: '10px 18px', cursor: 'pointer', fontWeight: 600 }}>
              {t('cancel')}
            </button>
            <button type="button" onClick={submit} disabled={submitting}
              style={{ background: GRADIENT, border: 'none', borderRadius: 10, color: '#fff', padding: '10px 22px',
                cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.6 : 1, fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 8 }}>
              {submitting ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : null}
              {submitting ? t('creating') : t('create')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
