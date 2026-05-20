// W5.22 Z.8 — LandingsPage: portal /portal/studio/landings (builder)
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PortalLayout from '../../../components/shared/PortalLayout';
import * as api from '../../../api/studio_z8';
import LandingTemplatePicker, { TEMPLATE_KEYS } from '../../../components/studio/LandingTemplatePicker';
import LandingContentEditor from '../../../components/studio/LandingContentEditor';
import { Plus, Trash2, ExternalLink, FileDown, GitBranch, Eye, X, ChevronLeft } from 'lucide-react';

const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';
const BG_PANEL = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(99,102,241,0.2)';

function btnGradient(extra = {}) {
  return {
    padding: '10px 18px',
    background: GRADIENT,
    color: '#fff',
    border: 'none',
    borderRadius: 9999,
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 13,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    ...extra,
  };
}

function btnSecondary(extra = {}) {
  return {
    padding: '10px 16px',
    background: 'rgba(99,102,241,0.12)',
    color: '#F0EBE0',
    border: '1px solid rgba(99,102,241,0.3)',
    borderRadius: 9999,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    ...extra,
  };
}

function CreateModal({ open, onClose, onCreated }) {
  const { t } = useTranslation('common');
  const [step, setStep] = useState(1);
  const [tpl, setTpl] = useState('modern');
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [cta, setCta] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setStep(1); setTpl('modern'); setTitle(''); setSlug(''); setSubtitle(''); setCta(''); setError('');
    }
  }, [open]);

  const handleCreate = async () => {
    setError('');
    setLoading(true);
    try {
      const r = await api.createLanding({
        template_key: tpl,
        title,
        slug: slug || undefined,
        subtitle,
        cta_text: cta,
      });
      onCreated(r.landing);
    } catch (e) {
      setError(e.body?.detail || e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;
  return (
    <div data-testid="create-modal" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20 }}>
      <div style={{ width: 'min(900px, 100%)', maxHeight: '90vh', overflow: 'auto', background: BG_PANEL, border: BORDER, borderRadius: 18, padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', color: '#F0EBE0' }}>
            {step === 1 && t('studio.landings.step1_title')}
            {step === 2 && t('studio.landings.step2_title')}
            {step === 3 && t('studio.landings.step3_title')}
          </h2>
          <button data-testid="create-modal-close" type="button" onClick={onClose} style={{ background: 'transparent', color: '#a0a4b0', border: 'none', cursor: 'pointer' }} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {step === 1 && <LandingTemplatePicker value={tpl} onChange={setTpl} />}
        {step === 2 && (
          <div style={{ display: 'grid', gap: 14 }}>
            <label style={{ fontSize: 13, color: '#a0a4b0' }}>{t('studio.landings.field_title')}
              <input data-testid="create-title-input" value={title} onChange={(e) => setTitle(e.target.value)} style={{ marginTop: 6, width: '100%', padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#F0EBE0' }} />
            </label>
            <label style={{ fontSize: 13, color: '#a0a4b0' }}>{t('studio.landings.field_slug')}
              <input data-testid="create-slug-input" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="ej. capricornio-polanco" style={{ marginTop: 6, width: '100%', padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#F0EBE0' }} />
              <span style={{ fontSize: 11, color: '#6b7280' }}>{t('studio.landings.field_slug_hint')}</span>
            </label>
          </div>
        )}
        {step === 3 && (
          <div style={{ display: 'grid', gap: 14 }}>
            <label style={{ fontSize: 13, color: '#a0a4b0' }}>{t('studio.landings.field_subtitle')}
              <textarea data-testid="create-subtitle-input" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} style={{ marginTop: 6, width: '100%', padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#F0EBE0', minHeight: 70 }} />
            </label>
            <label style={{ fontSize: 13, color: '#a0a4b0' }}>{t('studio.landings.field_cta_text')}
              <input data-testid="create-cta-input" value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Agenda tu visita" style={{ marginTop: 6, width: '100%', padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#F0EBE0' }} />
            </label>
          </div>
        )}
        {error && <div data-testid="create-modal-error" style={{ color: '#F87171', marginTop: 12, fontSize: 13 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 22 }}>
          {step > 1 ? (
            <button data-testid="create-modal-back" type="button" onClick={() => setStep(step - 1)} style={btnSecondary()}>{t('studio.landings.back')}</button>
          ) : <span />}
          {step < 3 ? (
            <button data-testid="create-modal-next" type="button" onClick={() => setStep(step + 1)} disabled={step === 2 && !title.trim()} style={btnGradient({ opacity: step === 2 && !title.trim() ? 0.5 : 1 })}>{t('studio.landings.next')}</button>
          ) : (
            <button data-testid="create-modal-create" type="button" disabled={loading || !title.trim()} onClick={handleCreate} style={btnGradient()}>{loading ? t('studio.landings.creating') : t('studio.landings.create_cta')}</button>
          )}
        </div>
      </div>
    </div>
  );
}

function ABStatsPanel({ groupId, onClose, onWinner }) {
  const { t } = useTranslation('common');
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState('');
  const load = async () => {
    try {
      const r = await api.getABStats(groupId);
      setStats(r);
    } catch (e) {
      setErr(e.message);
    }
  };
  useEffect(() => { load(); }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <div style={{ color: '#F87171' }}>{err}</div>;
  if (!stats) return <div style={{ color: '#a0a4b0' }}>...</div>;
  const declare = async (variant) => {
    await api.declareWinner(groupId, variant);
    await load();
    onWinner?.();
  };
  return (
    <div data-testid="ab-stats" style={{ background: BG_PANEL, border: BORDER, borderRadius: 14, padding: 18, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <strong style={{ fontFamily: 'Outfit, sans-serif', color: '#F0EBE0' }}>{t('studio.landings.ab_section_title')}</strong>
        {onClose && <button type="button" onClick={onClose} style={btnSecondary({ padding: '6px 10px' })} aria-label="Close"><X size={14} /></button>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
        <Cell label={t('studio.landings.ab_views_a')} value={stats.stats?.a_views || 0} />
        <Cell label={t('studio.landings.ab_views_b')} value={stats.stats?.b_views || 0} />
        <Cell label={t('studio.landings.ab_leads_a')} value={stats.stats?.a_leads || 0} />
        <Cell label={t('studio.landings.ab_leads_b')} value={stats.stats?.b_leads || 0} />
        <Cell label={t('studio.landings.ab_conv_a')} value={`${stats.conversion_rate_a}%`} />
        <Cell label={t('studio.landings.ab_conv_b')} value={`${stats.conversion_rate_b}%`} />
        <Cell label={t('studio.landings.ab_chi_square')} value={stats.chi_square?.stat ?? 0} />
        <Cell label={stats.chi_square?.significant ? t('studio.landings.ab_significant') : t('studio.landings.ab_not_significant')} value={stats.auto_winner || '—'} />
      </div>
      {stats.winner_id ? (
        <div data-testid="ab-winner" style={{ color: '#10B981', fontWeight: 600 }}>{t('studio.landings.ab_winner_decided', { variant: stats.winner_id === stats.variant_a_landing_id ? 'A' : 'B' })}</div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button data-testid="ab-declare-a" type="button" onClick={() => declare('A')} style={btnSecondary()}>{t('studio.landings.ab_declare_a')}</button>
          <button data-testid="ab-declare-b" type="button" onClick={() => declare('B')} style={btnSecondary()}>{t('studio.landings.ab_declare_b')}</button>
          <button data-testid="ab-declare-auto" type="button" onClick={() => declare(null)} disabled={!stats.can_declare} style={btnGradient({ opacity: stats.can_declare ? 1 : 0.5 })}>{t('studio.landings.ab_declare_auto')}</button>
        </div>
      )}
    </div>
  );
}

function Cell({ label, value }) {
  return (
    <div style={{ background: 'rgba(99,102,241,0.06)', padding: 12, borderRadius: 10 }}>
      <div style={{ fontSize: 11, color: '#a0a4b0', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 18, fontFamily: 'Outfit, sans-serif', color: '#F0EBE0', marginTop: 4, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function EditView({ landing, onBack, onChanged }) {
  const { t } = useTranslation('common');
  const [content, setContent] = useState(landing.content);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [showAB, setShowAB] = useState(false);
  const [abVariantTpl, setAbVariantTpl] = useState('luxury');
  const publicUrl = `${window.location.origin}/landing/${landing.slug}`;

  const save = async () => {
    setSaving(true);
    try {
      await api.patchLanding(landing.id, { content });
      setToast(t('studio.landings.toast_saved'));
      onChanged?.();
    } catch (e) {
      setToast(e.message);
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async () => {
    try {
      await api.publishLanding(landing.id, !landing.published);
      setToast(landing.published ? t('studio.landings.toast_unpublished') : t('studio.landings.toast_published'));
      onChanged?.();
    } catch (e) {
      setToast(e.message);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t('studio.landings.confirm_delete'))) return;
    try {
      await api.deleteLanding(landing.id);
      setToast(t('studio.landings.toast_deleted'));
      onBack();
      onChanged?.();
    } catch (e) {
      setToast(e.message);
    }
  };

  const createAB = async () => {
    try {
      await api.createABVariant(landing.id, abVariantTpl);
      setToast(t('studio.landings.toast_ab_created'));
      onChanged?.();
    } catch (e) {
      setToast(e.body?.detail || e.message);
    }
  };

  return (
    <div data-testid="landing-edit-view" style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <button data-testid="edit-back" type="button" onClick={onBack} style={btnSecondary()}>
          <ChevronLeft size={14} />
          {t('studio.landings.edit_back')}
        </button>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a data-testid="open-preview" href={`/landing/${landing.slug}?preview=1`} target="_blank" rel="noreferrer" style={btnSecondary({ textDecoration: 'none' })}>
            <Eye size={14} />
            {t('studio.landings.open_preview')}
          </a>
          <a data-testid="export-pdf-btn" href={api.exportPdfUrl(landing.id)} target="_blank" rel="noreferrer" style={btnSecondary({ textDecoration: 'none' })}>
            <FileDown size={14} />
            {t('studio.landings.export_pdf')}
          </a>
          <button data-testid="publish-btn" type="button" onClick={togglePublish} style={btnGradient()}>
            {landing.published ? t('studio.landings.unpublish') : t('studio.landings.publish')}
          </button>
          <button data-testid="delete-btn" type="button" onClick={handleDelete} style={btnSecondary({ color: '#F87171', borderColor: '#F87171aa' })} aria-label="Delete">
            <Trash2 size={14} />
            {t('studio.landings.delete')}
          </button>
        </div>
      </div>

      <h1 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', color: '#F0EBE0', fontSize: 'clamp(1.5rem, 3vw, 2rem)' }}>
        {t('studio.landings.edit_title')}: <span style={{ color: '#a0a4b0', fontSize: '0.65em' }}>{landing.slug}</span>
      </h1>
      <div style={{ fontSize: 13, color: '#a0a4b0' }}>
        {t('studio.landings.public_url_label')}: <a href={publicUrl} target="_blank" rel="noreferrer" style={{ color: '#6366F1' }}>{publicUrl}</a>
      </div>

      <div style={{ background: BG_PANEL, border: BORDER, borderRadius: 14, padding: 18 }}>
        <LandingContentEditor content={content} onChange={setContent} />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button data-testid="save-btn" type="button" onClick={save} disabled={saving} style={btnGradient()}>
          {saving ? t('studio.landings.saving') : t('studio.landings.save')}
        </button>
        {!landing.ab_group_id ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select data-testid="ab-variant-tpl" value={abVariantTpl} onChange={(e) => setAbVariantTpl(e.target.value)} style={{ padding: '10px 12px', borderRadius: 9999, background: 'rgba(99,102,241,0.12)', color: '#F0EBE0', border: '1px solid rgba(99,102,241,0.3)' }}>
              {TEMPLATE_KEYS.filter((k) => k !== landing.template_key).map((k) => <option key={k} value={k}>{t(`studio.landings.tpl_${k}`)}</option>)}
            </select>
            <button data-testid="ab-create-btn" type="button" onClick={createAB} style={btnSecondary()}>
              <GitBranch size={14} />
              {t('studio.landings.ab_create_variant')}
            </button>
          </div>
        ) : (
          <button data-testid="ab-stats-btn" type="button" onClick={() => setShowAB(!showAB)} style={btnSecondary()}>
            <GitBranch size={14} />
            {t('studio.landings.ab_section_title')}
          </button>
        )}
      </div>

      {showAB && landing.ab_group_id && (
        <ABStatsPanel groupId={landing.ab_group_id} onClose={() => setShowAB(false)} onWinner={onChanged} />
      )}

      <div style={{ background: BG_PANEL, border: BORDER, borderRadius: 14, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <strong style={{ fontFamily: 'Outfit, sans-serif', color: '#F0EBE0' }}>{t('studio.landings.preview_title')}</strong>
          <a href={`/landing/${landing.slug}?preview=1`} target="_blank" rel="noreferrer" style={{ color: '#6366F1', fontSize: 12, textDecoration: 'none' }}>
            <ExternalLink size={12} style={{ display: 'inline', marginRight: 4 }} />
            {t('studio.landings.open_preview')}
          </a>
        </div>
        <iframe
          data-testid="preview-iframe"
          src={`/landing/${landing.slug}?preview=1`}
          title="preview"
          style={{ width: '100%', minHeight: 560, borderRadius: 10, border: '1px solid rgba(99,102,241,0.2)', background: '#06080F' }}
        />
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: BG_PANEL, color: '#F0EBE0', padding: '12px 18px', borderRadius: 9999, border: BORDER, zIndex: 1100 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

function LandingCard({ item, onOpen }) {
  const { t } = useTranslation('common');
  return (
    <button
      data-testid={`landing-card-${item.id}`}
      type="button"
      onClick={onOpen}
      style={{ textAlign: 'left', background: BG_PANEL, border: BORDER, borderRadius: 14, overflow: 'hidden', cursor: 'pointer', padding: 0 }}
    >
      <div style={{ aspectRatio: '16/9', background: `linear-gradient(135deg, rgba(99,102,241,0.25), rgba(236,72,153,0.25))`, position: 'relative' }}>
        <div style={{ position: 'absolute', top: 10, right: 10, padding: '4px 10px', borderRadius: 9999, background: item.published ? 'rgba(16,185,129,0.85)' : 'rgba(99,102,241,0.5)', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em' }}>
          {item.published ? t('studio.landings.card_status_published') : t('studio.landings.card_status_draft')}
        </div>
        {item.ab_group_id && (
          <div style={{ position: 'absolute', top: 10, left: 10, padding: '4px 10px', borderRadius: 9999, background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 11 }}>
            {t('studio.landings.card_ab_active')} · {item.variant_label}
          </div>
        )}
        <div style={{ position: 'absolute', bottom: 10, left: 10, color: '#fff', fontSize: 11, padding: '2px 8px', background: 'rgba(0,0,0,0.5)', borderRadius: 9999 }}>
          {item.template_key}
        </div>
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, color: '#F0EBE0' }}>{item.content?.hero?.title || item.slug}</div>
        <div style={{ fontSize: 12, color: '#a0a4b0', marginTop: 4 }}>/landing/{item.slug}</div>
        <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 12, color: '#a0a4b0' }}>
          <span><Eye size={12} style={{ display: 'inline', marginRight: 4 }} />{item.views_count || 0} {t('studio.landings.card_views')}</span>
          <span>· {item.leads_count || 0} {t('studio.landings.card_leads')}</span>
        </div>
      </div>
    </button>
  );
}

export default function LandingsPage({ user, onLogout }) {
  const { t } = useTranslation('common');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({ status: '', template_key: '', project_id: '' });

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.listLandings(filters);
      setItems(r.items || []);
    } catch (e) {
      console.error(e); // eslint-disable-line no-console
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [filters.status, filters.template_key, filters.project_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshEdit = async () => {
    if (!editing) return;
    try {
      const r = await api.getLanding(editing.id);
      setEditing(r.landing);
      await load();
    } catch (e) {
      console.error(e); // eslint-disable-line no-console
    }
  };

  const filtered = useMemo(() => items, [items]);

  return (
    <PortalLayout role={user?.role} user={user} onLogout={onLogout}>
      <div data-testid="landings-page" style={{ padding: '24px 8px', color: '#F0EBE0' }}>
        {editing ? (
          <EditView landing={editing} onBack={() => setEditing(null)} onChanged={refreshEdit} />
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 22 }}>
              <div>
                <div style={{ letterSpacing: '0.3em', fontSize: 11, color: '#6366F1', textTransform: 'uppercase' }}>DMX STUDIO · Z.8</div>
                <h1 style={{ margin: '8px 0 0', fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(1.6rem, 3vw, 2.25rem)', fontWeight: 800 }}>{t('studio.landings.title')}</h1>
                <p style={{ color: '#a0a4b0', marginTop: 6, maxWidth: 640 }}>{t('studio.landings.subtitle')}</p>
              </div>
              <button data-testid="new-landing-btn" type="button" onClick={() => setShowCreate(true)} style={btnGradient({ padding: '12px 22px', fontSize: 14 })}>
                <Plus size={16} />
                {t('studio.landings.new_btn')}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
              <select data-testid="filter-status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} style={{ padding: '8px 14px', borderRadius: 9999, background: 'rgba(99,102,241,0.12)', color: '#F0EBE0', border: '1px solid rgba(99,102,241,0.3)' }}>
                <option value="">{t('studio.landings.all')} · {t('studio.landings.filter_status')}</option>
                <option value="published">{t('studio.landings.status_published')}</option>
                <option value="draft">{t('studio.landings.status_draft')}</option>
              </select>
              <select data-testid="filter-template" value={filters.template_key} onChange={(e) => setFilters({ ...filters, template_key: e.target.value })} style={{ padding: '8px 14px', borderRadius: 9999, background: 'rgba(99,102,241,0.12)', color: '#F0EBE0', border: '1px solid rgba(99,102,241,0.3)' }}>
                <option value="">{t('studio.landings.all')} · {t('studio.landings.filter_template')}</option>
                {TEMPLATE_KEYS.map((k) => <option key={k} value={k}>{t(`studio.landings.tpl_${k}`)}</option>)}
              </select>
              <input data-testid="filter-project" placeholder={t('studio.landings.filter_project')} value={filters.project_id} onChange={(e) => setFilters({ ...filters, project_id: e.target.value })} style={{ padding: '8px 14px', borderRadius: 9999, background: 'rgba(99,102,241,0.12)', color: '#F0EBE0', border: '1px solid rgba(99,102,241,0.3)' }} />
            </div>

            {loading ? (
              <div data-testid="landings-loading" style={{ color: '#a0a4b0' }}>{t('studio.landings.loading')}</div>
            ) : filtered.length === 0 ? (
              <div data-testid="landings-empty" style={{ padding: 48, textAlign: 'center', background: BG_PANEL, border: BORDER, borderRadius: 16 }}>
                <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif' }}>{t('studio.landings.empty_title')}</h3>
                <p style={{ color: '#a0a4b0', marginTop: 8 }}>{t('studio.landings.empty_body')}</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>
                {filtered.map((it) => (
                  <LandingCard key={it.id} item={it} onOpen={() => setEditing(it)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <CreateModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(landing) => {
          setShowCreate(false);
          setEditing(landing);
          load();
        }}
      />
    </PortalLayout>
  );
}
