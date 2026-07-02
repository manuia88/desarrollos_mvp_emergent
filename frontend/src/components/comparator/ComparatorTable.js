// W5.x F4.2 Sub-D · ComparatorTable · REDISEÑO CLARO Apple-tier · "centro de mando"
// - Veredicto arriba · columnas-tarjeta .dmx-card por propiedad · badge ganador
// - Ganador consume result.deltas del backend (fuente-de-verdad · comparator_engine.compute_deltas)
//   → RETIRADO el re-cálculo bestIdxFor (riesgo de incoherencia con el backend)
// - Honestidad por celda: distingue "sin dato" vs "error" · chip+tooltip de fuente/estimado
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from 'lucide-react';

// ── Sistema visual CLARO (Mapa.js / InversionV4Calculator.js) ────────────────
const INK = '#1E2230';       // texto principal
const INK_2 = '#5A5F6E';     // secundario
const INK_3 = '#9AA0AE';     // tenue
const BORDER = '#ECECEC';
const PANEL = '#FAFAFB';
const WIN_BG = 'rgba(var(--theme-rgb), 0.06)';
const WIN_BORDER = 'rgba(var(--theme-rgb), 0.30)';
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

// ── Formatters ───────────────────────────────────────────────────────────────
const isErr = (v) => v && typeof v === 'object' && v.error !== undefined;
const isEmpty = (v) => v === null || v === undefined || v === '';

const fmtMXN = (n) => {
  if (isEmpty(n) || Number.isNaN(Number(n))) return null;
  return Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
};
const fmtNum = (n, suffix = '') => {
  if (isEmpty(n) || Number.isNaN(Number(n))) return null;
  return `${Number(n).toLocaleString('es-MX')}${suffix}`;
};
const fmtStr = (v) => (isEmpty(v) ? null : String(v));

// ── Fuentes por métrica (espejo de comparator_engine.generate_ai_verdict custom_facts) ──
// key backend → { srcKey (i18n), estimated } · cuando estimated, la celda muestra chip "est."
const METRIC_SOURCE = {
  price: { srcKey: 'catalog', estimated: false },
  avm_estimate: { srcKey: 'avm', estimated: true },
  score_ie: { srcKey: 'ie', estimated: false },
  drpi_zone: { srcKey: 'drpi', estimated: false },
  risk_score: { srcKey: 'risk', estimated: false },
  closing_total: { srcKey: 'tax', estimated: true },
  isai: { srcKey: 'tax', estimated: true },
  predial_y1: { srcKey: 'tax', estimated: true },
  predial_10y_total: { srcKey: 'tax', estimated: true },
  isr_estimado: { srcKey: 'tax', estimated: true },
  utilidad_neta: { srcKey: 'tax', estimated: true },
  roi_neto_pct: { srcKey: 'tax', estimated: true },
};

// ── Chip de estado de celda ──────────────────────────────────────────────────
function Tip({ children, label }) {
  return (
    <span className="cmp-tip" tabIndex={0} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      {children}
      <span className="cmp-tipbox" style={{
        position: 'absolute', bottom: '150%', left: 0, width: 'max-content', maxWidth: 230,
        background: INK, color: '#fff', fontWeight: 500, fontSize: 10.5, lineHeight: 1.45,
        padding: '8px 10px', borderRadius: 9, boxShadow: '0 12px 30px rgba(16,18,28,.28)',
        opacity: 0, visibility: 'hidden', transition: 'opacity .12s', zIndex: 60, textAlign: 'left',
        textTransform: 'none', letterSpacing: 0, pointerEvents: 'none', whiteSpace: 'normal', fontFamily: 'DM Sans, sans-serif',
      }}>{label}</span>
    </span>
  );
}

// ── Celda de valor ────────────────────────────────────────────────────────────
// state: 'ok' | 'empty' | 'error' · win/pct/estimated/sourceLabel opcionales
function ValueCell({ display, state, win, pct, estimated, sourceLabel, t }) {
  if (state === 'error') {
    return (
      <Tip label={t('comparator.cell_error_tip')}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--red)', fontWeight: 700, fontSize: 13 }}>
          <Icons.AlertTriangle size={13} /> {t('comparator.cell_error')}
        </span>
      </Tip>
    );
  }
  if (state === 'empty') {
    return (
      <Tip label={t('comparator.cell_no_data_tip')}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: INK_3, fontWeight: 600, fontSize: 13 }}>
          <Icons.Minus size={12} /> {t('comparator.cell_no_data')}
        </span>
      </Tip>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 15, color: win ? 'var(--theme)' : INK, letterSpacing: '-0.01em' }}>{display}</span>
        {estimated && (
          <Tip label={t('comparator.estimated_tip', { source: sourceLabel })}>
            <span style={{ fontSize: 8.5, fontWeight: 800, color: INK_3, background: 'rgba(16,18,28,0.05)', borderRadius: 5, padding: '1px 5px', textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'default' }}>{t('comparator.chip_estimated')}</span>
          </Tip>
        )}
      </div>
      {win && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontWeight: 800, color: 'var(--theme)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          <Icons.Crown size={11} /> {t('comparator.winner_badge')}{typeof pct === 'number' && pct > 0 ? ` · +${pct}%` : ''}
        </span>
      )}
      {!win && sourceLabel && !estimated && (
        <span style={{ fontSize: 9, color: INK_3, fontWeight: 600 }}>{sourceLabel}</span>
      )}
    </div>
  );
}

// ── Fila de métrica ───────────────────────────────────────────────────────────
// metricKey enlaza con deltas del backend (o null para filas sin ranking, p.ej. specs).
function Row({ label, items, pick, metricKey, format, winnerId, pct, t, help }) {
  const src = metricKey ? METRIC_SOURCE[metricKey] : null;
  return (
    <tr style={{ borderTop: `1px solid ${BORDER}` }}>
      <td style={{
        padding: '13px 16px', width: 190, verticalAlign: 'top',
        fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: INK_2, fontWeight: 600,
      }}>
        {label}
        {help && (
          <Tip label={help}>
            <span style={{ marginLeft: 5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 13, height: 13, borderRadius: '50%', background: 'rgba(16,18,28,0.05)', color: INK_3, fontSize: 8.5, fontWeight: 800, cursor: 'default' }}>?</span>
          </Tip>
        )}
      </td>
      {items.map((it) => {
        const raw = pick(it);
        let state = 'ok';
        let display = null;
        if (isErr(raw)) state = 'error';
        else {
          display = format(raw);
          if (display === null || display === undefined) state = 'empty';
        }
        const win = !!(metricKey && winnerId && it.entity_id === winnerId && state === 'ok');
        const sourceLabel = src ? t(`comparator.source_${src.srcKey}`) : null;
        return (
          <td key={it.entity_id} style={{
            padding: '13px 16px', textAlign: 'right', verticalAlign: 'top',
            borderLeft: `1px solid ${win ? WIN_BORDER : BORDER}`,
            background: win ? WIN_BG : 'transparent',
          }}>
            <ValueCell
              display={display} state={state} win={win} pct={win ? pct : null}
              estimated={state === 'ok' && !!src?.estimated} sourceLabel={sourceLabel} t={t}
            />
          </td>
        );
      })}
    </tr>
  );
}

// ── Sección colapsable ────────────────────────────────────────────────────────
function Section({ titleKey, defaultOpen = true, children }) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="dmx-card" data-testid={`section-${titleKey}`} style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 14 }}>
      <button type="button" onClick={() => setOpen((s) => !s)} style={{
        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 18px', background: PANEL, border: 'none', color: INK, cursor: 'pointer',
        fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase',
      }}>
        {t(`comparator.section_${titleKey}`)}
        <Icons.ChevronDown size={16} color={INK_2} style={{ transition: `transform .28s ${EASE}`, transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </button>
      {open && <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>{children}</table></div>}
    </div>
  );
}

// ── Header: columnas-tarjeta por propiedad ────────────────────────────────────
function HeaderRow({ items, t }) {
  return (
    <thead>
      <tr>
        <th style={{ padding: '18px 16px', textAlign: 'left', width: 190, fontFamily: 'DM Sans, sans-serif', fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: INK_3, fontWeight: 700, verticalAlign: 'bottom' }}>
          {t('comparator.header_property')}
        </th>
        {items.map((it) => (
          <th key={it.entity_id} style={{ padding: '16px', textAlign: 'left', borderLeft: `1px solid ${BORDER}`, verticalAlign: 'bottom', minWidth: 210 }}>
            {it.photo_url && (
              <div className="mkt-photo" style={{ overflow: 'hidden', borderRadius: 12, marginBottom: 10, border: `1px solid ${BORDER}` }}>
                <div style={{ width: '100%', height: 108, background: `center/cover url(${it.photo_url})` }} />
              </div>
            )}
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 16, color: INK, letterSpacing: '-0.01em', lineHeight: 1.2 }}>{it.title || it.entity_id}</div>
            {it.colonia && <div style={{ color: INK_2, fontSize: 12.5, marginTop: 3, fontFamily: 'DM Sans, sans-serif' }}>{it.colonia}</div>}
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 20, color: INK, marginTop: 6, letterSpacing: '-0.02em' }}>
              {fmtMXN(it.price) || <span style={{ fontSize: 13, color: INK_3, fontWeight: 600 }}>{t('comparator.cell_no_data')}</span>}
            </div>
            {(it.labels || []).length > 0 && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 9 }}>
                {(it.labels || []).slice(0, 3).map((l) => (
                  <span key={l} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 9px', borderRadius: 9999,
                    background: 'rgba(var(--theme-rgb), 0.10)', color: 'var(--theme)', fontSize: 9.5, letterSpacing: '0.03em', fontWeight: 800,
                  }}>
                    <Icons.Crown size={9} /> {t(`comparator.label_${l}`, l.replace(/_/g, ' '))}
                  </span>
                ))}
              </div>
            )}
          </th>
        ))}
      </tr>
    </thead>
  );
}

// ── Skeleton en carga ─────────────────────────────────────────────────────────
function Skeleton({ n = 3 }) {
  const bar = (w, h = 14) => <div style={{ width: w, height: h, borderRadius: 7, background: 'linear-gradient(90deg, #eef0f3 25%, #f6f7f9 37%, #eef0f3 63%)', backgroundSize: '400% 100%', animation: 'cmpShimmer 1.4s ease infinite' }} />;
  return (
    <div data-testid="comparator-loading">
      <style>{'@keyframes cmpShimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}'}</style>
      <div className="dmx-card" style={{ background: '#fff', borderRadius: 16, padding: 20, marginBottom: 14, display: 'grid', gridTemplateColumns: `190px repeat(${n}, 1fr)`, gap: 18 }}>
        <div />
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ width: '100%', height: 108, borderRadius: 12, background: '#eef0f3' }} />
            {bar('70%', 16)} {bar('45%', 12)}
          </div>
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, s) => (
        <div key={s} className="dmx-card" style={{ background: '#fff', borderRadius: 16, padding: 18, marginBottom: 14 }}>
          {Array.from({ length: 3 }).map((__, r) => (
            <div key={r} style={{ display: 'grid', gridTemplateColumns: `190px repeat(${n}, 1fr)`, gap: 18, padding: '10px 0' }}>
              {bar('60%')}{Array.from({ length: n }).map((___, c) => <div key={c} style={{ display: 'flex', justifyContent: 'flex-end' }}>{bar('50%')}</div>)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function ComparatorTable({ items, audience, verdict, deltas, loading }) {
  const { t } = useTranslation('common');

  // winnerByMetric · fuente-de-verdad = backend deltas (comparator_engine.compute_deltas)
  const winner = useMemo(() => {
    const map = {};
    Object.entries(deltas || {}).forEach(([metric, d]) => {
      if (d && d.best_entity_id) map[metric] = { id: d.best_entity_id, pct: d.percent_diff_best_vs_worst };
    });
    return map;
  }, [deltas]);
  const winOf = (m) => winner[m]?.id || null;
  const pctOf = (m) => winner[m]?.pct;

  if (loading) return <Skeleton n={(items && items.length) || 3} />;
  if (!items || items.length === 0) return null;

  const showInvest = audience === 'investor' || audience === 'luxury';

  // Cuenta de ganadores por propiedad (para el veredicto arriba) · desde deltas del backend
  const winCount = {};
  items.forEach((it) => { winCount[it.entity_id] = 0; });
  Object.values(winner).forEach((w) => { if (w.id in winCount) winCount[w.id] += 1; });
  const leaderId = Object.keys(winCount).sort((a, b) => winCount[b] - winCount[a])[0];
  const leader = items.find((i) => i.entity_id === leaderId);
  const hasDeltas = Object.keys(winner).length > 0;

  return (
    <div data-testid="comparator-table">
      <style>{'.cmp-tip:hover .cmp-tipbox,.cmp-tip:focus .cmp-tipbox{opacity:1 !important;visibility:visible !important}'}</style>

      {/* ── VEREDICTO ARRIBA · resultado primero ─────────────────────────── */}
      {hasDeltas && leader && (
        <section data-testid="comparator-verdict-hero" className="dmx-card" style={{ background: '#fff', borderRadius: 18, padding: '22px 24px', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: 12, background: 'var(--grad)', color: '#fff', flexShrink: 0 }}>
              <Icons.Crown size={22} />
            </span>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--theme)', fontWeight: 800 }}>{t('comparator.verdict_leader_eyebrow')}</div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 22, color: INK, letterSpacing: '-0.02em', marginTop: 2 }}>{leader.title || leader.entity_id}</div>
              <div style={{ color: INK_2, fontSize: 13, marginTop: 3, fontFamily: 'DM Sans, sans-serif' }}>
                {t('comparator.verdict_leader_sub', { count: winCount[leaderId] })}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {items.map((it) => (
                <div key={it.entity_id} style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 26, color: it.entity_id === leaderId ? 'var(--theme)' : INK, letterSpacing: '-0.02em' }}>{winCount[it.entity_id]}</div>
                  <div style={{ fontSize: 10.5, color: INK_3, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title || it.entity_id}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── HEADER columnas-tarjeta ───────────────────────────────────────── */}
      <div data-testid="comparator-header" className="dmx-card" style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <HeaderRow items={items} t={t} />
          </table>
        </div>
      </div>

      <Section titleKey="specs">
        <tbody>
          <Row t={t} label={t('comparator.row_area')} items={items} pick={(i) => i.specs?.area_m2} metricKey={null} format={(v) => fmtNum(v, ' m²')} />
          <Row t={t} label={t('comparator.row_bedrooms')} items={items} pick={(i) => i.specs?.bedrooms} metricKey={null} format={(v) => fmtNum(v)} />
          <Row t={t} label={t('comparator.row_bathrooms')} items={items} pick={(i) => i.specs?.bathrooms} metricKey={null} format={(v) => fmtNum(v)} />
          <Row t={t} label={t('comparator.row_parking')} items={items} pick={(i) => i.specs?.parking} metricKey={null} format={(v) => fmtNum(v)} />
        </tbody>
      </Section>

      <Section titleKey="location">
        <tbody>
          <Row t={t} label={t('comparator.row_colonia')} items={items} pick={(i) => i.colonia} metricKey={null} format={fmtStr} />
          <Row t={t} label={t('comparator.row_drpi')} items={items} pick={(i) => i.drpi_zone} metricKey="drpi_zone" winnerId={winOf('drpi_zone')} pct={pctOf('drpi_zone')} format={(v) => fmtNum(v, '%')} help={t('comparator.help_drpi')} />
        </tbody>
      </Section>

      <Section titleKey="finance">
        <tbody>
          <Row t={t} label={t('comparator.row_avm')} items={items} pick={(i) => i.avm_estimate} metricKey="avm_estimate" winnerId={winOf('avm_estimate')} pct={pctOf('avm_estimate')} format={fmtMXN} help={t('comparator.help_avm')} />
          <Row t={t} label={t('comparator.row_price')} items={items} pick={(i) => i.price} metricKey="price" winnerId={winOf('price')} pct={pctOf('price')} format={fmtMXN} />
        </tbody>
      </Section>

      <Section titleKey="tax">
        <tbody>
          <Row t={t} label={t('comparator.row_isai')} items={items} pick={(i) => i.isai} metricKey="isai" format={fmtMXN} help={t('comparator.help_isai')} />
          <Row t={t} label={t('comparator.row_closing')} items={items} pick={(i) => i.closing_total} metricKey="closing_total" winnerId={winOf('closing_total')} pct={pctOf('closing_total')} format={fmtMXN} help={t('comparator.help_closing')} />
        </tbody>
      </Section>

      {showInvest && (
        <Section titleKey="invest">
          <tbody>
            <Row t={t} label={t('comparator.row_isr')} items={items} pick={(i) => i.isr_estimado} metricKey="isr_estimado" winnerId={winOf('isr_estimado')} pct={pctOf('isr_estimado')} format={fmtMXN} help={t('comparator.help_isr')} />
            <Row t={t} label={t('comparator.row_utility')} items={items} pick={(i) => i.utilidad_neta} metricKey="utilidad_neta" format={fmtMXN} />
            <Row t={t} label={t('comparator.row_roi')} items={items} pick={(i) => i.roi_neto_pct} metricKey="roi_neto_pct" winnerId={winOf('roi_neto_pct')} pct={pctOf('roi_neto_pct')} format={(v) => fmtNum(v, '%')} help={t('comparator.help_roi')} />
          </tbody>
        </Section>
      )}

      <Section titleKey="predial">
        <tbody>
          <Row t={t} label={t('comparator.row_predial_y1')} items={items} pick={(i) => i.predial_y1} metricKey="predial_y1" winnerId={winOf('predial_y1')} pct={pctOf('predial_y1')} format={fmtMXN} help={t('comparator.help_predial')} />
          <Row t={t} label={t('comparator.row_predial_10y')} items={items} pick={(i) => i.predial_10y_total} metricKey="predial_10y_total" format={fmtMXN} />
        </tbody>
      </Section>

      <Section titleKey="scores">
        <tbody>
          <Row t={t} label={t('comparator.row_score_ie')} items={items} pick={(i) => i.score_ie} metricKey="score_ie" winnerId={winOf('score_ie')} pct={pctOf('score_ie')} format={(v) => fmtNum(v)} help={t('comparator.help_ie')} />
          <Row t={t} label={t('comparator.row_risk')} items={items} pick={(i) => i.risk_score} metricKey="risk_score" winnerId={winOf('risk_score')} pct={pctOf('risk_score')} format={(v) => fmtNum(v)} help={t('comparator.help_risk')} />
          <Row t={t} label={t('comparator.row_comparables')} items={items} pick={(i) => (i.comparables_3 || []).length} metricKey={null} format={(v) => fmtNum(v)} />
        </tbody>
      </Section>

      {/* ── VEREDICTO IA (narrativa) ──────────────────────────────────────── */}
      {verdict && (
        <section data-testid="ai-verdict" className="dmx-card" style={{ marginTop: 4, padding: '22px 24px', borderRadius: 18, background: '#fff', position: 'relative' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 9999, background: 'var(--grad)', color: '#fff', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 800 }}>
            <Icons.Sparkles size={12} /> {t('comparator.verdict_title')}
          </div>
          <p style={{ marginTop: 14, marginBottom: 0, color: INK, fontSize: 15, lineHeight: 1.65, fontFamily: 'DM Sans, sans-serif' }}>{verdict}</p>
        </section>
      )}
    </div>
  );
}
