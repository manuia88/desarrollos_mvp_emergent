// W7.AS.3.D · Round 2 · SuperadminKbGaps — huecos de conocimiento detectados
// ("no supe responder"). 1-clic "Convertir a FAQ" (con verify_source W6.11) +
// descartar. Stats: top huecos de la semana.
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle, RefreshCw, Loader2, Check, X, Plus, ShieldCheck } from 'lucide-react';
import SuperadminLayout from './SuperadminLayout';

const API = process.env.REACT_APP_BACKEND_URL || '';
const SIGNAL_COLOR = {
  negative_handoff: 'var(--theme-danger, #EF4444)',
  llm_stub_fallback: 'var(--theme-warning, #F59E0B)',
  technical_error_reply: 'var(--theme-muted, #94A3B8)',
};

function authHeaders() {
  const tk = localStorage.getItem('dmx_token') || localStorage.getItem('token');
  return tk ? { Authorization: `Bearer ${tk}` } : {};
}

export default function SuperadminKbGaps({ embedded }) {
  const { t } = useTranslation('conversation_round2_ui');
  const [gaps, setGaps] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);   // gap_id en edición
  const [answer, setAnswer] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (detect = false) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ status: 'open', limit: '50' });
      if (detect) qs.set('detect', 'true');
      const res = await fetch(`${API}/api/superadmin/kb-gaps/list?${qs.toString()}`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setGaps(Array.isArray(data.gaps) ? data.gaps : []);
        setStats(data.stats || null);
      } else {
        setGaps([]); setStats(null);
      }
    } catch {
      setGaps([]); setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  const startConvert = useCallback((gap) => {
    setEditing(gap.gap_id);
    setAnswer('');
    setSourceUrl('');
  }, []);

  const saveFaq = useCallback(async (gap) => {
    if (!answer.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/superadmin/kb-gaps/add-faq`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          gap_id: gap.gap_id, question: gap.sample_question,
          answer: answer.trim(), source_url: sourceUrl.trim() || null,
        }),
      });
      if (res.ok) { setEditing(null); setAnswer(''); setSourceUrl(''); await load(false); }
    } catch { /* no-op */ } finally { setSaving(false); }
  }, [answer, sourceUrl, saving, load]);

  const dismiss = useCallback(async (gapId) => {
    try {
      const res = await fetch(`${API}/api/superadmin/kb-gaps/dismiss-gap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ gap_id: gapId }),
      });
      if (res.ok) await load(false);
    } catch { /* no-op */ }
  }, [load]);

  return (
    <SuperadminLayout bare={embedded}>
      <div style={{ padding: 24, color: 'var(--cream, #F0EBE0)', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <HelpCircle size={22} />
          <div style={{ flex: 1 }}>
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 22, margin: 0 }}>{t('kbGaps.title')}</h1>
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(240,235,224,0.55)' }}>{t('kbGaps.subtitle')}</p>
          </div>
          <button type="button" onClick={() => load(true)}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--cream, #F0EBE0)', padding: '6px 10px', cursor: 'pointer', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} /> {t('kbGaps.detect')}
          </button>
        </div>

        {stats && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
            <Stat label={t('kbGaps.stat_open')} value={stats.open} color="var(--theme-warning, #F59E0B)" />
            <Stat label={t('kbGaps.stat_converted')} value={stats.converted} color="var(--theme-success, #22C55E)" />
            <Stat label={t('kbGaps.stat_dismissed')} value={stats.dismissed} color="var(--theme-muted, #94A3B8)" />
          </div>
        )}

        {loading ? (
          <div style={{ padding: 24, color: 'rgba(240,235,224,0.5)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> …
          </div>
        ) : gaps.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'rgba(240,235,224,0.4)', fontSize: 14 }}>{t('kbGaps.empty')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {gaps.map((g) => (
              <div key={g.gap_id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{g.sample_question}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(99,102,241,0.18)', color: 'var(--theme-primary, #818CF8)' }}>
                        {g.occurrences || 1} {t('kbGaps.occurrences')}
                      </span>
                      {(g.signals || []).map((s) => (
                        <span key={s} style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: SIGNAL_COLOR[s] || 'rgba(240,235,224,0.6)' }}>
                          {t(`kbGaps.signal_${s}`, s)}
                        </span>
                      ))}
                    </div>
                  </div>
                  {editing !== g.gap_id && (
                    <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
                      <button type="button" onClick={() => startConvert(g)}
                        style={{ background: 'linear-gradient(135deg,#6366F1,#EC4899)', border: 'none', borderRadius: 8, color: '#fff', padding: '7px 11px', cursor: 'pointer', fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Plus size={13} /> {t('kbGaps.convert')}
                      </button>
                      <button type="button" onClick={() => dismiss(g.gap_id)}
                        style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'rgba(240,235,224,0.7)', padding: '7px 11px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <X size={13} /> {t('kbGaps.dismiss')}
                      </button>
                    </div>
                  )}
                </div>

                {editing === g.gap_id && (
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    <label style={lbl}>{t('kbGaps.answer_label')}</label>
                    <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3}
                      style={{ width: '100%', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--cream, #F0EBE0)', padding: 9, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', marginBottom: 10 }} />
                    <label style={lbl}>{t('kbGaps.source_label')}</label>
                    <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…"
                      style={{ width: '100%', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--cream, #F0EBE0)', padding: 9, fontSize: 13, boxSizing: 'border-box', marginBottom: 6 }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(240,235,224,0.45)', marginBottom: 12 }}>
                      <ShieldCheck size={12} /> {t('kbGaps.verify_note')}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => saveFaq(g)} disabled={saving || !answer.trim()}
                        style={{ background: (saving || !answer.trim()) ? 'rgba(34,197,94,0.4)' : 'var(--theme-success, #22C55E)', border: 'none', borderRadius: 8, color: '#0b1f12', padding: '8px 13px', cursor: (saving || !answer.trim()) ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Check size={14} /> {saving ? t('kbGaps.saving') : t('kbGaps.save_faq')}
                      </button>
                      <button type="button" onClick={() => { setEditing(null); setAnswer(''); setSourceUrl(''); }}
                        style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--cream, #F0EBE0)', padding: '8px 13px', cursor: 'pointer', fontSize: 12.5 }}>
                        {t('kbGaps.cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </SuperadminLayout>
  );
}

const lbl = { display: 'block', fontSize: 11.5, color: 'rgba(240,235,224,0.5)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.03em' };

function Stat({ label, value, color }) {
  return (
    <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px' }}>
      <div style={{ fontSize: 11.5, color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--cream, #F0EBE0)', marginTop: 2 }}>{value ?? 0}</div>
    </div>
  );
}
