// W5.22 Z.2 Sub-D — Carruseles page · /portal/studio/carruseles
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PortalLayout from '../../../components/shared/PortalLayout';
import { Sparkles, Plus, X, Download, RefreshCw, Filter, TrendingUp } from 'lucide-react';
import * as z2 from '../../../api/studio_z2';
import * as studioApi from '../../../api/studio';
import HookScoreBadge from '../../../components/studio/HookScoreBadge';
import CarruselPreviewLive from '../../../components/studio/CarruselPreviewLive';
import CopyGeneratorModal from '../../../components/studio/CopyGeneratorModal';

const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';

const STATUS_LABELS = {
  pending: 'Pendiente',
  generating: 'Generando',
  ready: 'Listo',
  failed: 'Fallido',
  winner: 'Ganador',
};

export default function CarruselesPage({ user, onLogout }) {
  const { t } = useTranslation('common');
  const [carruseles, setCarruseles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ project_id: '', buyer_angle: '', status: '', ab_group: '' });
  const [generateOpen, setGenerateOpen] = useState(false);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [autoSelectCopyId, setAutoSelectCopyId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(null);
  const [abStats, setAbStats] = useState(null);
  const [toast, setToast] = useState('');
  const [brandKits, setBrandKits] = useState([]);
  const [copyJobs, setCopyJobs] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.project_id) params.project_id = filters.project_id;
      if (filters.buyer_angle) params.buyer_angle = filters.buyer_angle;
      if (filters.status) params.status = filters.status;
      if (filters.ab_group) params.ab_group_id = filters.ab_group;
      const r = await z2.listCarruseles(params);
      setCarruseles(r.items || []);
    } catch (e) {
      setToast(`${t('studio.toast.error')}: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    studioApi.getBrandKits().then((r) => setBrandKits(r.items || [])).catch(() => {});
    z2.listCopyJobs({ status: 'ready', limit: 30 }).then((r) => setCopyJobs(r.items || [])).catch(() => {});
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const tm = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(tm);
  }, [toast]);

  const filtered = useMemo(() => carruseles, [carruseles]);

  const openDetail = async (c) => {
    setDetailOpen(c);
    setAbStats(null);
    if (c.ab_group_id) {
      try {
        const s = await z2.getABStats(c.ab_group_id);
        setAbStats(s);
      } catch (e) { /* silencioso */ }
    }
  };

  const handleExportPDF = async (carruselId) => {
    try {
      const blob = await z2.exportCarruselPDF(carruselId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `carrusel-${carruselId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setToast(t('studio.carrusel.toast_pdf_exported'));
    } catch (e) {
      setToast(`${t('studio.toast.error')}: ${e.message}`);
    }
  };

  const handleDeclareWinner = async (groupId, variant) => {
    try {
      await z2.declareWinner(groupId, { winner_variant: variant });
      setToast(t('studio.carrusel.toast_winner_declared'));
      const s = await z2.getABStats(groupId);
      setAbStats(s);
      await load();
    } catch (e) {
      setToast(`${t('studio.toast.error')}: ${e.message}`);
    }
  };

  return (
    <PortalLayout role={user?.role} user={user} onLogout={onLogout}>
      <div data-testid="carruseles-page" style={{ padding: '22px 28px 80px', maxWidth: 1320 }}>
        <header style={{ marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
          <div>
            <div className="eyebrow">DMX STUDIO Z.2</div>
            <h1 style={hStyle()}>{t('studio.carrusel.title')}</h1>
            <p style={subStyle()}>{t('studio.carrusel.subtitle')}</p>
          </div>
          <button data-testid="new-carrusel-btn" onClick={() => setGenerateOpen(true)} style={primaryBtn()}>
            <Plus size={14} /> {t('studio.carrusel.new_cta')}
          </button>
        </header>

        {/* Filters */}
        <section style={filterCard()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 4, color: 'var(--cream-3)' }}>
            <Filter size={14} />
            <span style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {t('studio.carrusel.filters_label')}
            </span>
          </div>
          <input
            data-testid="filter-project"
            placeholder={t('studio.carrusel.filter_project_placeholder')}
            value={filters.project_id}
            onChange={(e) => setFilters((f) => ({ ...f, project_id: e.target.value }))}
            style={inputStyle()}
          />
          <select
            data-testid="filter-buyer-angle"
            value={filters.buyer_angle}
            onChange={(e) => setFilters((f) => ({ ...f, buyer_angle: e.target.value }))}
            style={selectStyle()}>
            <option value="">{t('studio.carrusel.filter_buyer_angle_all')}</option>
            {z2.BUYER_ANGLES.map((b) => (
              <option key={b} value={b}>{t(`studio.copy.persona.${b}`)}</option>
            ))}
          </select>
          <select
            data-testid="filter-status"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            style={selectStyle()}>
            <option value="">{t('studio.carrusel.filter_status_all')}</option>
            {Object.keys(STATUS_LABELS).map((s) => (
              <option key={s} value={s}>{t(`studio.carrusel.status_${s}`)}</option>
            ))}
          </select>
          <input
            data-testid="filter-ab"
            placeholder={t('studio.carrusel.filter_ab_placeholder')}
            value={filters.ab_group}
            onChange={(e) => setFilters((f) => ({ ...f, ab_group: e.target.value }))}
            style={inputStyle()}
          />
          <button onClick={load} style={ghostBtn()} aria-label={t('studio.carrusel.refresh')}>
            <RefreshCw size={13} />
          </button>
        </section>

        {/* Grid */}
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>
            {t('studio.carrusel.loading')}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState onCreate={() => setGenerateOpen(true)} t={t} />
        ) : (
          <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {filtered.map((c) => (
              <CarruselCard key={c.id} carrusel={c} onClick={() => openDetail(c)} t={t} />
            ))}
          </div>
        )}

        {generateOpen && (
          <GenerateModal
            brandKits={brandKits}
            copyJobs={copyJobs}
            autoSelectCopyId={autoSelectCopyId}
            onClearAutoSelect={() => setAutoSelectCopyId(null)}
            onOpenCopyModal={() => setCopyModalOpen(true)}
            onClose={() => setGenerateOpen(false)}
            onCreated={async () => {
              setGenerateOpen(false);
              setToast(t('studio.carrusel.toast_created'));
              await load();
            }}
            onGateFailed={(detail) => {
              const score = typeof detail?.hook_score === 'number' ? Math.round(detail.hook_score) : '?';
              const suggestion = detail?.suggestion || '';
              setToast(t('studio.copy.gate_failed_body', { score, suggestion })
                || `${t('studio.copy.gate_failed_title')} · ${score}/100`);
            }}
            onError={(msg) => setToast(`${t('studio.toast.error')}: ${msg}`)}
            t={t}
          />
        )}

        {copyModalOpen && (
          <CopyGeneratorModal
            open={copyModalOpen}
            onClose={() => setCopyModalOpen(false)}
            onCopyGenerated={async (newCopyId, job) => {
              // Refresca lista de copies y auto-selecciona el nuevo (si ready)
              try {
                const r = await z2.listCopyJobs({ status: 'ready', limit: 30 });
                const items = r.items || [];
                setCopyJobs(items);
                if (job?.status === 'ready' || job?.status === 'completed') {
                  setAutoSelectCopyId(newCopyId);
                  setToast(t('studio.copy.generated_toast'));
                } else {
                  setToast(t('studio.copy.generated_pending'));
                }
              } catch {
                setToast(t('studio.copy.generated_toast'));
              }
            }}
            onError={(msg) => setToast(`${t('studio.toast.error')}: ${msg}`)}
          />
        )}

        {detailOpen && (
          <DetailModal
            carrusel={detailOpen}
            abStats={abStats}
            brandKits={brandKits}
            onClose={() => { setDetailOpen(null); setAbStats(null); }}
            onExportPDF={handleExportPDF}
            onDeclareWinner={handleDeclareWinner}
            t={t}
          />
        )}

        {toast && (
          <div data-testid="carrusel-toast" role="status" style={toastStyle()}>{toast}</div>
        )}
      </div>
    </PortalLayout>
  );
}

function EmptyState({ onCreate, t }) {
  return (
    <div data-testid="carrusel-empty" style={{
      padding: '60px 28px', textAlign: 'center',
      background: 'rgba(255,255,255,0.03)', borderRadius: 14,
      border: '1px dashed rgba(255,255,255,0.10)',
    }}>
      <Sparkles size={28} style={{ color: '#6366F1', marginBottom: 10 }} />
      <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 20, color: 'var(--cream)', margin: '0 0 8px' }}>
        {t('studio.carrusel.empty_title')}
      </h3>
      <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', marginBottom: 18, maxWidth: 420, margin: '0 auto 18px' }}>
        {t('studio.carrusel.empty_body')}
      </p>
      <button onClick={onCreate} style={primaryBtn()}>
        <Plus size={14} /> {t('studio.carrusel.new_cta')}
      </button>
    </div>
  );
}

function CarruselCard({ carrusel, onClick, t }) {
  return (
    <article
      data-testid={`carrusel-card-${carrusel.id}`}
      onClick={onClick}
      style={cardStyle()}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, color: 'var(--cream-3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {t(`studio.copy.persona.${carrusel.buyer_angle || 'inversor'}`)}
          </div>
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', margin: '4px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {carrusel.title || carrusel.id}
          </h3>
        </div>
        {typeof carrusel.hook_score === 'number' && (
          <HookScoreBadge score={carrusel.hook_score} breakdown={carrusel.hook_score_breakdown} />
        )}
      </header>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {(carrusel.aspect_ratios || []).slice(0, 5).map((r) => (
          <span key={r} style={chipStyle()}>{r}</span>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>
        <span>{t(`studio.carrusel.status_${carrusel.status || 'pending'}`)}</span>
        {carrusel.ab_group_id && (
          <span style={{ color: '#6366F1', fontWeight: 700 }}>
            A/B · {carrusel.variant || '—'}
          </span>
        )}
      </div>
    </article>
  );
}

function GenerateModal({ brandKits, copyJobs, autoSelectCopyId, onClearAutoSelect, onOpenCopyModal, onClose, onCreated, onGateFailed, onError, t }) {
  const [copyId, setCopyId] = useState('');
  const [brandKitId, setBrandKitId] = useState(brandKits.find((b) => b.is_active)?.id || '');
  const [ratios, setRatios] = useState(['1:1', '4:5']);
  const [abTest, setAbTest] = useState(false);
  const [hookMin, setHookMin] = useState(60);
  const [submitting, setSubmitting] = useState(false);

  // Auto-select copy generado por CopyGeneratorModal (si llega ready)
  useEffect(() => {
    if (autoSelectCopyId && copyJobs.some((j) => j.id === autoSelectCopyId)) {
      setCopyId(autoSelectCopyId);
      if (onClearAutoSelect) onClearAutoSelect();
    }
  }, [autoSelectCopyId, copyJobs, onClearAutoSelect]);

  const toggleRatio = (r) => {
    setRatios((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);
  };

  const submit = async () => {
    if (ratios.length === 0) {
      onError(t('studio.carrusel.error_no_ratios'));
      return;
    }
    setSubmitting(true);
    try {
      await z2.generateCarrusel({
        copy_id: copyId || null,
        brand_kit_id: brandKitId || null,
        aspect_ratios: ratios,
        pages_data: {},
        ab_test_bool: abTest,
        hook_score_pre_gate_min: hookMin,
      });
      onCreated();
    } catch (e) {
      // W5.22 Z.2.1 · 422 hook_score gate handler · feedback UX claro
      const detail = e?.body?.detail;
      if (e?.status === 422 && detail && typeof detail.hook_score === 'number') {
        if (onGateFailed) onGateFailed(detail);
      } else {
        onError(e.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" style={overlayStyle()}>
      <div style={modalStyle(560)} data-testid="generate-modal">
        <header style={modalHeader()}>
          <h2 style={{ margin: 0, fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)' }}>
            {t('studio.carrusel.modal_new_title')}
          </h2>
          <button onClick={onClose} style={iconCloseBtn()} aria-label={t('studio.carrusel.close')}>
            <X size={16} />
          </button>
        </header>
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={labelStyle()}>{t('studio.carrusel.field_copy')}
              <select value={copyId} onChange={(e) => setCopyId(e.target.value)} style={selectStyle()}>
                <option value="">{t('studio.carrusel.field_copy_none')}</option>
                {copyJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {t(`studio.copy.persona.${j.buyer_angle || 'inversor'}`)} · {j.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              data-testid="generate-copy-first"
              onClick={onOpenCopyModal}
              style={{
                marginTop: 8, padding: '6px 14px', borderRadius: 9999,
                background: 'transparent', border: '1px solid rgba(99,102,241,0.45)',
                color: '#a5b4fc', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11.5,
                cursor: 'pointer',
              }}>
              {t('studio.copy.generate_first_button')}
            </button>
          </div>
          <label style={labelStyle()}>{t('studio.carrusel.field_brand_kit')}
            <select value={brandKitId} onChange={(e) => setBrandKitId(e.target.value)} style={selectStyle()}>
              <option value="">{t('studio.carrusel.field_brand_kit_default')}</option>
              {brandKits.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.variant_key}{b.is_active ? ' ✓' : ''}
                </option>
              ))}
            </select>
          </label>
          <div>
            <div style={labelStyle()}>{t('studio.carrusel.field_ratios')}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {z2.ASPECT_RATIOS.map((r) => {
                const active = ratios.includes(r);
                return (
                  <button
                    key={r}
                    data-testid={`gen-ratio-${r}`}
                    onClick={() => toggleRatio(r)}
                    style={{
                      padding: '6px 12px', borderRadius: 9999,
                      background: active ? GRADIENT : 'transparent',
                      border: active ? 'none' : '1px solid rgba(255,255,255,0.14)',
                      color: active ? 'var(--cream, #F0EBE0)' : 'var(--cream-2)',
                      fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11.5,
                      cursor: 'pointer',
                    }}>
                    {r}
                  </button>
                );
              })}
            </div>
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)' }}>
            <input type="checkbox" checked={abTest} onChange={(e) => setAbTest(e.target.checked)} data-testid="gen-ab-toggle" />
            {t('studio.carrusel.field_ab_test')}
          </label>
          <label style={labelStyle()}>
            {t('studio.carrusel.field_hook_min')} · {hookMin}
            <input
              type="range" min="0" max="100" step="5"
              value={hookMin}
              data-testid="gen-hook-min"
              onChange={(e) => setHookMin(parseInt(e.target.value, 10))}
              style={{ width: '100%' }}
            />
          </label>
        </div>
        <footer style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={onClose} style={ghostBtn()}>{t('studio.carrusel.cancel')}</button>
          <button
            data-testid="gen-submit"
            onClick={submit}
            disabled={submitting}
            style={primaryBtn(submitting)}>
            <Sparkles size={13} /> {submitting ? t('studio.carrusel.generating') : t('studio.carrusel.generate_cta')}
          </button>
        </footer>
      </div>
    </div>
  );
}

function DetailModal({ carrusel, abStats, brandKits, onClose, onExportPDF, onDeclareWinner, t }) {
  const brandKit = brandKits.find((b) => b.id === carrusel.brand_kit_id) || brandKits.find((b) => b.is_active);
  const pages = carrusel.pages_data?.pages || [];
  return (
    <div role="dialog" aria-modal="true" style={overlayStyle()}>
      <div style={modalStyle(880)} data-testid="detail-modal">
        <header style={modalHeader()}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--cream-3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {t(`studio.copy.persona.${carrusel.buyer_angle || 'inversor'}`)} · {t(`studio.carrusel.status_${carrusel.status || 'pending'}`)}
            </div>
            <h2 style={{ margin: '4px 0 0', fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)' }}>
              {carrusel.title || carrusel.id}
            </h2>
          </div>
          <button onClick={onClose} style={iconCloseBtn()} aria-label={t('studio.carrusel.close')}>
            <X size={16} />
          </button>
        </header>

        {typeof carrusel.hook_score === 'number' && (
          <div style={{ marginBottom: 12 }}>
            <HookScoreBadge score={carrusel.hook_score} breakdown={carrusel.hook_score_breakdown} size="lg" />
          </div>
        )}

        <CarruselPreviewLive pages={pages} brandKit={brandKit} initialRatio={(carrusel.aspect_ratios || ['1:1'])[0]} />

        {abStats && (
          <section data-testid="ab-stats" style={{ marginTop: 18, padding: 16, borderRadius: 12, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.20)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, color: 'var(--cream)', fontFamily: 'Outfit', fontWeight: 700, fontSize: 14 }}>
              <TrendingUp size={14} /> {t('studio.carrusel.ab_stats_title')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
              <ABMetric label={t('studio.carrusel.ab_views')} a={abStats.variant_a?.views} b={abStats.variant_b?.views} />
              <ABMetric label={t('studio.carrusel.ab_clicks')} a={abStats.variant_a?.clicks} b={abStats.variant_b?.clicks} />
              <ABMetric label={t('studio.carrusel.ab_conv')} a={abStats.variant_a?.conversions} b={abStats.variant_b?.conversions} />
              <ABMetric label={t('studio.carrusel.ab_chi')} a={abStats.chi_square_p ?? '—'} b="" />
            </div>
            {!abStats.winner && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button data-testid="declare-a" onClick={() => onDeclareWinner(carrusel.ab_group_id, 'A')} style={ghostBtn()}>
                  {t('studio.carrusel.declare_winner_a')}
                </button>
                <button data-testid="declare-b" onClick={() => onDeclareWinner(carrusel.ab_group_id, 'B')} style={ghostBtn()}>
                  {t('studio.carrusel.declare_winner_b')}
                </button>
                <button data-testid="declare-auto" onClick={() => onDeclareWinner(carrusel.ab_group_id, null)} style={primaryBtn()}>
                  {t('studio.carrusel.declare_auto')}
                </button>
              </div>
            )}
            {abStats.winner && (
              <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--success, #22C55E)', fontWeight: 700 }}>
                {t('studio.carrusel.winner_label')}: {abStats.winner}
              </div>
            )}
          </section>
        )}

        <footer style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18, flexWrap: 'wrap' }}>
          <button onClick={() => onExportPDF(carrusel.id)} data-testid="export-pdf" style={ghostBtn()}>
            <Download size={13} /> {t('studio.carrusel.export_pdf')}
          </button>
          <button onClick={onClose} style={primaryBtn()}>{t('studio.carrusel.close')}</button>
        </footer>
      </div>
    </div>
  );
}

function ABMetric({ label, a, b }) {
  return (
    <div style={{ padding: 10, borderRadius: 10, background: 'rgba(6,8,15,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ fontSize: 10, color: 'var(--cream-3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, color: 'var(--cream)', fontSize: 14 }}>
        {a ?? '—'}{b !== '' && b != null ? ` / ${b}` : ''}
      </div>
    </div>
  );
}

// ─── Styles helpers ───────────────────────────────────────────────────────────
const hStyle = () => ({ fontFamily: 'Outfit', fontWeight: 800, fontSize: 32, color: 'var(--cream)', margin: '6px 0 4px', letterSpacing: '-0.02em' });
const subStyle = () => ({ fontFamily: 'DM Sans', color: 'var(--cream-2)', fontSize: 14, margin: 0, maxWidth: 720 });
const primaryBtn = (disabled = false) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
  background: GRADIENT, border: 'none', color: 'var(--cream, #F0EBE0)',
  borderRadius: 9999, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
});
const ghostBtn = () => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
  background: 'transparent', border: '1px solid rgba(255,255,255,0.14)',
  color: 'var(--cream-2)', borderRadius: 9999, fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5,
  cursor: 'pointer',
});
const iconCloseBtn = () => ({
  padding: '6px 8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.14)',
  color: 'var(--cream-2)', borderRadius: 9999, cursor: 'pointer',
});
const inputStyle = () => ({
  padding: '8px 12px', minWidth: 140, fontFamily: 'DM Sans', fontSize: 12.5,
  background: 'rgba(6,8,15,0.5)', border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 9999, color: 'var(--cream)',
});
const selectStyle = () => ({
  padding: '8px 12px', minWidth: 160, fontFamily: 'DM Sans', fontSize: 12.5,
  background: 'rgba(6,8,15,0.5)', border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 9999, color: 'var(--cream)',
});
const filterCard = () => ({
  display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
  padding: 14, borderRadius: 14, marginBottom: 18,
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
});
const cardStyle = () => ({
  padding: 16, borderRadius: 14, cursor: 'pointer',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.10)',
  transition: 'transform 0.15s, border-color 0.15s',
});
const chipStyle = () => ({
  padding: '2px 10px', borderRadius: 9999,
  background: 'rgba(99,102,241,0.14)', color: '#a5b4fc',
  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 10,
});
const labelStyle = () => ({
  display: 'block', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11,
  color: 'var(--cream-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4,
});
const overlayStyle = () => ({
  position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 22, zIndex: 1000,
});
const modalStyle = (maxW = 560) => ({
  width: '100%', maxWidth: maxW, maxHeight: '88vh', overflow: 'auto',
  padding: 22, borderRadius: 18,
  background: 'rgba(13,16,23,0.96)',
  border: '1px solid rgba(255,255,255,0.10)',
  boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
});
const modalHeader = () => ({
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
});
const toastStyle = () => ({
  position: 'fixed', bottom: 24, right: 24, padding: '10px 16px',
  background: 'rgba(13,16,23,0.96)', border: '1px solid rgba(99,102,241,0.4)',
  borderRadius: 9999, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13,
  zIndex: 2000, boxShadow: '0 10px 24px rgba(0,0,0,0.5)',
});
