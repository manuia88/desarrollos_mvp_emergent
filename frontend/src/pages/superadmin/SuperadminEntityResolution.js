// W5 cleanup · SuperadminEntityResolution · queue de dedup desarrolladoras
// Reusa wrappers existentes en api/entity_resolution.js (compat layer agregado)
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getEntityResolutionQueue, decidePair } from '../../api/entity_resolution';

const BG = '#06080F';
const CREAM = '#F0EBE0';
const INDIGO = '#6366F1';
const ROSE = '#EC4899';
const MUTED = 'rgba(240,235,224,0.62)';
const MUTED_2 = 'rgba(240,235,224,0.45)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const STATUS_FILTERS = [
  { value: 'pending', label_key: 'entityResolution.filter_pending' },
  { value: 'auto_merged', label_key: 'entityResolution.filter_auto_merged' },
  { value: 'rejected', label_key: 'entityResolution.filter_rejected' },
];

const ACTION_BTNS = [
  { key: 'merge', label_key: 'entityResolution.btn_merge', variant: 'gradient', testid: 'btn-merge' },
  { key: 'reject', label_key: 'entityResolution.btn_reject', variant: 'rose', testid: 'btn-reject' },
  { key: 'skip', label_key: 'entityResolution.btn_skip', variant: 'ghost', testid: 'btn-skip' },
];

function chipStyle(active) {
  return {
    padding: '8px 14px',
    borderRadius: 9999,
    fontFamily: 'DM Sans, sans-serif',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.04em',
    cursor: 'pointer',
    border: active ? '1px solid rgba(99,102,241,0.55)' : '1px solid rgba(240,235,224,0.10)',
    background: active ? 'rgba(99,102,241,0.14)' : 'rgba(240,235,224,0.04)',
    color: active ? '#C7D2FE' : 'rgba(240,235,224,0.72)',
    transition: `transform 280ms ${EASE}, background 280ms ${EASE}, border-color 280ms ${EASE}`,
    textTransform: 'uppercase',
  };
}

function actionBtnStyle(variant, busy) {
  const base = {
    padding: '7px 14px', borderRadius: 9999,
    fontFamily: 'DM Sans, sans-serif', fontSize: 11.5, fontWeight: 700,
    letterSpacing: '0.04em', cursor: busy ? 'wait' : 'pointer',
    border: '1px solid transparent',
    transition: `transform 280ms ${EASE}`,
    opacity: busy ? 0.6 : 1,
    whiteSpace: 'nowrap',
  };
  if (variant === 'gradient') return { ...base, background: GRAD, color: '#FFF' };
  if (variant === 'rose') return { ...base, background: 'transparent', color: '#F9A8D4', border: `1px solid ${ROSE}55` };
  return { ...base, background: 'transparent', color: CREAM, border: '1px solid rgba(240,235,224,0.20)' };
}

function similarityChipStyle(score) {
  const s = Math.max(0, Math.min(1, Number(score) || 0));
  let bg = 'rgba(240,235,224,0.06)';
  let color = MUTED;
  if (s >= 0.9) { bg = GRAD; color = '#FFF'; }
  else if (s >= 0.75) { bg = 'rgba(99,102,241,0.16)'; color = '#C7D2FE'; }
  else if (s >= 0.55) { bg = 'rgba(245,158,11,0.14)'; color = '#FBBF24'; }
  return {
    display: 'inline-block', padding: '3px 10px', borderRadius: 9999,
    fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
    background: bg, color, fontVariantNumeric: 'tabular-nums',
  };
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(iso);
  }
}

function renderOrgCell(org) {
  if (!org) return <span style={{ color: MUTED_2 }}>—</span>;
  const name = org.name || org.org_name || org.legal_name || org.id || '—';
  const rfc = org.rfc || org.tax_id || '';
  return (
    <div>
      <div style={{ color: CREAM, fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{name}</div>
      {rfc && <div style={{ color: MUTED_2, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>{rfc}</div>}
    </div>
  );
}

export default function SuperadminEntityResolution() {
  const { t } = useTranslation('common');
  const [status, setStatus] = useState('pending');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [silentFailure, setSilentFailure] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    const data = await getEntityResolutionQueue(status);
    setSilentFailure(!!data?._silent);
    setItems(Array.isArray(data?.items) ? data.items : []);
    setTotal(typeof data?.total === 'number' ? data.total : 0);
    setLoading(false);
  }, [status]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleDecide = async (pairId, decision) => {
    if (!pairId || busyId) return;
    setBusyId(pairId);
    try {
      await decidePair(pairId, decision);
      await fetchQueue();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div data-testid="superadmin-entity-resolution-page" style={{ minHeight: '100vh', background: BG, color: CREAM, fontFamily: 'DM Sans, sans-serif' }}>
      <header style={{ padding: '48px 24px 16px', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ letterSpacing: '0.3em', fontSize: 11, color: INDIGO, textTransform: 'uppercase' }}>
          DesarrollosMX · Superadmin
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{
              margin: '4px 0 6px', fontFamily: 'Outfit, sans-serif', fontWeight: 800,
              fontSize: 'clamp(1.8rem, 3.2vw, 2.6rem)', lineHeight: 1.1, color: CREAM, letterSpacing: '-0.02em',
            }}>{t('entityResolution.page_title', 'Entity Resolution · Dedup Desarrolladoras')}</h1>
            <p style={{ margin: 0, color: MUTED, fontSize: 14 }}>
              {t('entityResolution.page_subtitle', 'Revisa pares posiblemente duplicados detectados por el dedup engine.')}
            </p>
          </div>
          <span
            data-testid="entity-resolution-counter"
            style={{
              padding: '6px 14px', borderRadius: 9999,
              background: 'rgba(99,102,241,0.14)', color: '#C7D2FE',
              border: `1px solid ${INDIGO}55`,
              fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
            }}
          >{t('entityResolution.counter_pending', 'Pendientes')}: {total}</span>
        </div>
      </header>

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '8px 24px 96px', display: 'grid', gap: 20 }}>
        {/* Filters */}
        <section data-testid="entity-resolution-filters" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              data-testid={`entity-resolution-filter-${f.value}`}
              onClick={() => setStatus(f.value)}
              style={chipStyle(status === f.value)}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >{t(f.label_key)}</button>
          ))}
        </section>

        {/* Table */}
        <section
          data-testid="entity-resolution-table"
          style={{
            background: CARD_BG, border: BORDER, borderRadius: 20,
            backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
            overflow: 'hidden',
          }}
        >
          <div
            role="row"
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr 1fr 130px 160px 240px',
              gap: 12, padding: '14px 20px',
              background: 'rgba(240,235,224,0.04)',
              borderBottom: BORDER,
              color: MUTED_2,
              fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            <span>{t('entityResolution.col_pair', 'Pair ID')}</span>
            <span>{t('entityResolution.col_org_a', 'Organizacion A')}</span>
            <span>{t('entityResolution.col_org_b', 'Organizacion B')}</span>
            <span>{t('entityResolution.col_similarity', 'Similitud')}</span>
            <span>{t('entityResolution.col_created', 'Creado')}</span>
            <span style={{ textAlign: 'right' }}>{t('entityResolution.col_actions', 'Acciones')}</span>
          </div>

          {loading && (
            <div data-testid="entity-resolution-loading" style={{ padding: 12 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{
                  height: 56, borderRadius: 12, margin: '8px 0',
                  background: 'linear-gradient(90deg, rgba(240,235,224,0.03), rgba(240,235,224,0.08), rgba(240,235,224,0.03))',
                  backgroundSize: '200% 100%', animation: 'erShimmer 1.4s linear infinite',
                }} />
              ))}
              <style>{`@keyframes erShimmer { 0%{background-position:200% 0;} 100%{background-position:-200% 0;} }`}</style>
            </div>
          )}

          {!loading && items.length === 0 && (
            <div
              data-testid="entity-resolution-empty"
              style={{ padding: '36px 24px', textAlign: 'center', color: MUTED }}
            >
              {silentFailure
                ? t('entityResolution.error_generic', 'No fue posible cargar la cola. Intenta de nuevo.')
                : t('entityResolution.empty_state', 'Sin pares pendientes · queue limpio')}
            </div>
          )}

          {!loading && items.map((it) => {
            const pairId = it.pair_id || it.id || it._id;
            const orgA = it.dev_org_a || it.org_a || it.entity_a || it.a;
            const orgB = it.dev_org_b || it.org_b || it.entity_b || it.b;
            const sim = it.similarity_score ?? it.similarity ?? it.score ?? 0;
            const created = it.created_at || it.detected_at;
            const isBusy = busyId === pairId;
            return (
              <div
                key={pairId}
                role="row"
                data-testid={`entity-resolution-row-${pairId}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '120px 1fr 1fr 130px 160px 240px',
                  gap: 12, padding: '14px 20px',
                  alignItems: 'center',
                  borderBottom: BORDER,
                  background: isBusy ? 'rgba(99,102,241,0.04)' : 'transparent',
                  transition: `background 280ms ${EASE}`,
                }}
              >
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: MUTED }}>{String(pairId || '—').slice(0, 14)}</span>
                {renderOrgCell(orgA)}
                {renderOrgCell(orgB)}
                <span><span style={similarityChipStyle(sim)}>{(Number(sim) || 0).toFixed(2)}</span></span>
                <span style={{ color: MUTED_2, fontSize: 12 }}>{fmtDate(created)}</span>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  {ACTION_BTNS.map((b) => (
                    <button
                      key={b.key}
                      type="button"
                      data-testid={`entity-resolution-${b.testid}-${pairId}`}
                      disabled={isBusy}
                      onClick={() => handleDecide(pairId, b.key)}
                      style={actionBtnStyle(b.variant, isBusy)}
                      onMouseEnter={(e) => { if (!isBusy) e.currentTarget.style.transform = 'translateY(-1px)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                    >{t(b.label_key)}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </section>

        <aside style={{
          padding: '14px 18px',
          borderLeft: `3px solid ${INDIGO}`, background: 'rgba(99,102,241,0.06)', borderRadius: 12,
          color: MUTED_2, fontSize: 12,
        }}>
          {t('entityResolution.footer_disclaimer', 'Cada decision queda registrada en el audit log inmutable de Entity Resolution.')}
        </aside>
      </main>
    </div>
  );
}
