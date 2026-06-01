// W5.22 Z.2 Sub-D — Auto-Content queue · /portal/studio/auto-content
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PortalLayout from '../../../components/shared/PortalLayout';
import { CheckCircle2, XCircle, RefreshCw, Inbox, Sparkles } from 'lucide-react';
import * as z2 from '../../../api/studio_z2';

const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';

const STATUS_FILTERS = ['pending', 'approved', 'rejected', 'generated'];

export default function AutoContentPage({ user, onLogout }) {
  const { t } = useTranslation('common');
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, generated: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const params = filter ? { status: filter, limit: 30 } : { limit: 30 };
      const [r, s] = await Promise.all([
        z2.listAutoContent(params),
        z2.getAutoContentStats().catch(() => ({})),
      ]);
      setItems(r.items || []);
      setStats({
        pending: s.pending || 0,
        approved: s.approved || 0,
        rejected: s.rejected || 0,
        generated: s.generated || 0,
      });
    } catch (e) {
      setToast(`${t('studio.toast.error')}: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!toast) return undefined;
    const tm = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(tm);
  }, [toast]);

  const approve = async (id) => {
    setBusy((b) => ({ ...b, [id]: 'approving' }));
    try {
      await z2.approveAutoContent(id);
      setToast(t('studio.auto_content.toast_approved'));
      await load();
    } catch (e) {
      setToast(`${t('studio.toast.error')}: ${e.message}`);
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[id]; return n; });
    }
  };

  const reject = async (id) => {
    setBusy((b) => ({ ...b, [id]: 'rejecting' }));
    try {
      await z2.rejectAutoContent(id);
      setToast(t('studio.auto_content.toast_rejected'));
      await load();
    } catch (e) {
      setToast(`${t('studio.toast.error')}: ${e.message}`);
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[id]; return n; });
    }
  };

  return (
    <PortalLayout role={user?.role} user={user} onLogout={onLogout}>
      <div data-testid="auto-content-page" style={{ padding: '22px 28px 80px', maxWidth: 1180 }}>
        <header style={{ marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
          <div>
            <div className="eyebrow">DMX STUDIO Z.2</div>
            <h1 style={hStyle()}>{t('studio.auto_content.title')}</h1>
            <p style={subStyle()}>{t('studio.auto_content.subtitle')}</p>
          </div>
          <button onClick={load} style={ghostBtn()} aria-label={t('studio.auto_content.refresh')}>
            <RefreshCw size={13} /> {t('studio.auto_content.refresh')}
          </button>
        </header>

        {/* Stats strip */}
        <section style={statsStrip()}>
          {STATUS_FILTERS.map((s) => {
            const count = stats[s] || 0;
            const active = filter === s;
            return (
              <button
                key={s}
                data-testid={`stats-${s}`}
                onClick={() => setFilter(s)}
                style={{
                  flex: '1 1 140px', minWidth: 140,
                  padding: '12px 14px', borderRadius: 14,
                  background: active ? 'rgba(99,102,241,0.14)' : 'var(--surface-2)',
                  border: active ? '1px solid rgba(99,102,241,0.45)' : '1px solid var(--border)',
                  textAlign: 'left', cursor: 'pointer',
                  fontFamily: 'DM Sans',
                }}>
                <div style={{ fontSize: 10, color: 'var(--cream-3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {t(`studio.auto_content.status_${s}`)}
                </div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: active ? '#a5b4fc' : 'var(--cream)', marginTop: 4 }}>
                  {count}
                </div>
              </button>
            );
          })}
        </section>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>
            {t('studio.auto_content.loading')}
          </div>
        ) : items.length === 0 ? (
          <SmartEmptyState status={filter} t={t} />
        ) : (
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
            {items.map((it) => (
              <QueueCard
                key={it.id}
                item={it}
                busy={busy[it.id]}
                onApprove={() => approve(it.id)}
                onReject={() => reject(it.id)}
                t={t}
              />
            ))}
          </div>
        )}

        {toast && (
          <div data-testid="auto-content-toast" role="status" style={toastStyle()}>{toast}</div>
        )}
      </div>
    </PortalLayout>
  );
}

function QueueCard({ item, busy, onApprove, onReject, t }) {
  const isPending = item.status === 'pending';
  return (
    <article
      data-testid={`queue-card-${item.id}`}
      style={{
        padding: 16, borderRadius: 14,
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
      }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, color: 'var(--cream-3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {item.trigger_type || t('studio.auto_content.trigger_default')}
          </div>
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', margin: '4px 0 0' }}>
            {item.title || item.id}
          </h3>
        </div>
        <span style={pillStyle(item.status)}>{t(`studio.auto_content.status_${item.status || 'pending'}`)}</span>
      </header>

      <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', lineHeight: 1.55, margin: '0 0 12px' }}>
        {item.suggested_copy_summary || item.summary || t('studio.auto_content.no_summary')}
      </p>

      {item.metadata?.buyer_angle && (
        <div style={{ fontSize: 11, color: 'var(--cream-3)', fontFamily: 'DM Sans', marginBottom: 12 }}>
          {t('studio.auto_content.target')}: {t(`studio.copy.persona.${item.metadata.buyer_angle}`)}
        </div>
      )}

      {isPending && (
        <footer style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            data-testid={`approve-${item.id}`}
            onClick={onApprove}
            disabled={!!busy}
            style={primaryBtn(!!busy)}>
            <CheckCircle2 size={13} /> {busy === 'approving' ? t('studio.auto_content.approving') : t('studio.auto_content.approve_cta')}
          </button>
          <button
            data-testid={`reject-${item.id}`}
            onClick={onReject}
            disabled={!!busy}
            style={dangerBtn(!!busy)}>
            <XCircle size={13} /> {busy === 'rejecting' ? t('studio.auto_content.rejecting') : t('studio.auto_content.reject_cta')}
          </button>
        </footer>
      )}

      {item.status === 'generated' && item.generated_carrusel_id && (
        <a
          href={`/portal/studio/carruseles?id=${item.generated_carrusel_id}`}
          style={{ ...ghostBtn(), display: 'inline-flex', textDecoration: 'none' }}>
          <Sparkles size={12} /> {t('studio.auto_content.view_carrusel')}
        </a>
      )}
    </article>
  );
}

function SmartEmptyState({ status, t }) {
  const titleKey = `studio.auto_content.empty_title_${status || 'pending'}`;
  const bodyKey = `studio.auto_content.empty_body_${status || 'pending'}`;
  return (
    <div data-testid="auto-content-empty" style={{
      padding: '60px 28px', textAlign: 'center',
      background: 'var(--surface-2)', borderRadius: 14,
      border: '1px dashed var(--border)',
    }}>
      <Inbox size={28} style={{ color: '#6366F1', marginBottom: 10 }} />
      <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 20, color: 'var(--cream)', margin: '0 0 8px' }}>
        {t(titleKey, { defaultValue: t('studio.auto_content.empty_default_title') })}
      </h3>
      <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', maxWidth: 420, margin: '0 auto' }}>
        {t(bodyKey, { defaultValue: t('studio.auto_content.empty_default_body') })}
      </p>
    </div>
  );
}

function pillStyle(status) {
  const tones = {
    pending: { bg: 'rgba(245,158,11,0.15)', fg: '#F59E0B' },
    approved: { bg: 'rgba(99,102,241,0.15)', fg: '#a5b4fc' },
    rejected: { bg: 'rgba(239,68,68,0.15)', fg: 'var(--danger, #EF4444)' },
    generated: { bg: 'rgba(34,197,94,0.15)', fg: 'var(--success, #22C55E)' },
  };
  const tone = tones[status] || tones.pending;
  return {
    padding: '3px 10px', borderRadius: 9999,
    background: tone.bg, color: tone.fg,
    fontFamily: 'DM Sans', fontWeight: 700, fontSize: 10,
    whiteSpace: 'nowrap',
  };
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const hStyle = () => ({ fontFamily: 'Outfit', fontWeight: 800, fontSize: 32, color: 'var(--cream)', margin: '6px 0 4px', letterSpacing: '-0.02em' });
const subStyle = () => ({ fontFamily: 'DM Sans', color: 'var(--cream-2)', fontSize: 14, margin: 0, maxWidth: 720 });
const primaryBtn = (disabled = false) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
  background: GRADIENT, border: 'none', color: 'var(--cream, var(--cream))',
  borderRadius: 9999, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
});
const ghostBtn = () => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
  background: 'transparent', border: '1px solid var(--border)',
  color: 'var(--cream-2)', borderRadius: 9999, fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
  cursor: 'pointer',
});
const dangerBtn = (disabled = false) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
  background: 'transparent', border: '1px solid rgba(239,68,68,0.45)',
  color: 'var(--danger, #EF4444)', borderRadius: 9999, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
});
const statsStrip = () => ({
  display: 'flex', gap: 12, marginBottom: 22, flexWrap: 'wrap',
});
const toastStyle = () => ({
  position: 'fixed', bottom: 24, right: 24, padding: '10px 16px',
  background: 'var(--surface)', border: '1px solid rgba(99,102,241,0.4)',
  borderRadius: 9999, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13,
  zIndex: 2000, boxShadow: '0 10px 24px rgba(0,0,0,0.5)',
});
