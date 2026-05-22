// W5.x F4.2 Sub-D · ComparatorTable · side-by-side rows + winner badges + collapsible
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from 'lucide-react';

const INDIGO = '#6366F1';
const ROSE = '#EC4899';
const CREAM = '#F0EBE0';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const MUTED = 'rgba(240,235,224,0.62)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const fmtMXN = (n) => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  if (typeof n === 'object') return n.error ? '—' : '—';
  return Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
};

const fmtNum = (n, suffix = '') => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  if (typeof n === 'object') return '—';
  return `${Number(n).toLocaleString('es-MX')}${suffix}`;
};

const sectionBox = {
  background: CARD_BG, border: BORDER, borderRadius: 18, overflow: 'hidden', marginBottom: 14,
};

const cellBase = {
  padding: '14px 16px', borderRight: '1px solid rgba(240,235,224,0.06)',
  fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: CREAM,
};

function Row({ label, values, winnerIdx, format = (v) => v }) {
  const visibleValues = values.map((v, idx) => ({ v: format(v), winner: idx === winnerIdx }));
  return (
    <tr style={{ borderTop: '1px solid rgba(240,235,224,0.06)' }}>
      <td style={{ ...cellBase, color: MUTED, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', width: 200 }}>{label}</td>
      {visibleValues.map((c, i) => (
        <td key={i} style={{
          ...cellBase,
          background: c.winner ? 'rgba(236,72,153,0.08)' : 'transparent',
          borderLeft: c.winner ? `1px solid ${ROSE}88` : '1px solid rgba(240,235,224,0.04)',
          position: 'relative',
        }}>
          {c.v ?? '—'}
          {c.winner && (
            <span style={{
              position: 'absolute', top: 6, right: 6, padding: '2px 8px', borderRadius: 9999,
              background: ROSE, color: '#FFF', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700,
            }}>★</span>
          )}
        </td>
      ))}
    </tr>
  );
}

function Section({ titleKey, defaultOpen = true, children }) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div data-testid={`section-${titleKey}`} style={sectionBox}>
      <button type="button" onClick={() => setOpen((s) => !s)} style={{
        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 18px', background: 'transparent', border: 'none', color: CREAM,
        cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 13,
        letterSpacing: '0.18em', textTransform: 'uppercase',
      }}>
        {t(`comparator.section_${titleKey}`)}
        <Icons.ChevronDown size={16} style={{ transition: `transform 320ms ${EASE}`, transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </button>
      {open && <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>{children}</table></div>}
    </div>
  );
}

function bestIdxFor(items, metric, lowerBetter = true) {
  let bestIdx = -1;
  let bestVal = lowerBetter ? Infinity : -Infinity;
  items.forEach((it, idx) => {
    const v = it?.[metric];
    if (v === null || v === undefined || typeof v === 'object') return;
    const num = Number(v);
    if (Number.isNaN(num)) return;
    if ((lowerBetter && num < bestVal) || (!lowerBetter && num > bestVal)) {
      bestVal = num;
      bestIdx = idx;
    }
  });
  return bestIdx;
}

function HeaderRow({ items, t }) {
  return (
    <thead>
      <tr style={{ position: 'sticky', top: 0, zIndex: 10, background: CARD_BG, backdropFilter: 'blur(24px)' }}>
        <th style={{ ...cellBase, color: MUTED, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{t('comparator.title')}</th>
        {items.map((it) => (
          <th key={it.entity_id} style={{ ...cellBase, textAlign: 'left' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {it.photo_url && (
                <div style={{
                  width: 60, height: 44, borderRadius: 8, background: `center/cover url(${it.photo_url})`,
                  border: BORDER,
                }} />
              )}
              <div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 14 }}>{it.title || it.entity_id}</div>
                <div style={{ color: MUTED, fontSize: 12 }}>{fmtMXN(it.price)}</div>
                {(it.labels || []).length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                    {(it.labels || []).slice(0, 3).map((l) => (
                      <span key={l} style={{
                        padding: '2px 8px', borderRadius: 9999, background: `${ROSE}22`,
                        color: ROSE, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700,
                      }}>{l.replace(/_/g, ' ')}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </th>
        ))}
      </tr>
    </thead>
  );
}

export default function ComparatorTable({ items, audience, verdict, loading }) {
  const { t } = useTranslation('common');
  if (loading) {
    return <div data-testid="comparator-loading" style={{ ...sectionBox, padding: 40, textAlign: 'center', color: MUTED }}>{t('comparator.loading')}</div>;
  }
  if (!items || items.length === 0) return null;

  const showInvest = audience === 'investor' || audience === 'luxury';
  const headerTable = (
    <table data-testid="comparator-header" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14, background: CARD_BG, border: BORDER, borderRadius: 18, overflow: 'hidden' }}>
      <HeaderRow items={items} t={t} />
    </table>
  );

  return (
    <div data-testid="comparator-table">
      {headerTable}

      <Section titleKey="specs">
        <tbody>
          <Row label="m²" values={items.map((i) => i.specs?.area_m2)} winnerIdx={bestIdxFor(items.map((i) => ({ v: i.specs?.area_m2 })), 'v', false)} format={(v) => fmtNum(v, ' m²')} />
          <Row label="Recamaras" values={items.map((i) => i.specs?.bedrooms)} winnerIdx={bestIdxFor(items.map((i) => ({ v: i.specs?.bedrooms })), 'v', false)} format={fmtNum} />
          <Row label="Banos" values={items.map((i) => i.specs?.bathrooms)} winnerIdx={bestIdxFor(items.map((i) => ({ v: i.specs?.bathrooms })), 'v', false)} format={fmtNum} />
          <Row label="Estacionamientos" values={items.map((i) => i.specs?.parking)} winnerIdx={bestIdxFor(items.map((i) => ({ v: i.specs?.parking })), 'v', false)} format={fmtNum} />
        </tbody>
      </Section>

      <Section titleKey="location">
        <tbody>
          <Row label="Colonia" values={items.map((i) => i.colonia || '—')} winnerIdx={-1} format={(v) => v} />
          <Row label="DRPI 12m" values={items.map((i) => i.drpi_zone)} winnerIdx={bestIdxFor(items, 'drpi_zone', false)} format={(v) => fmtNum(v, '%')} />
        </tbody>
      </Section>

      <Section titleKey="finance">
        <tbody>
          <Row label="AVM estimate" values={items.map((i) => i.avm_estimate)} winnerIdx={bestIdxFor(items, 'avm_estimate', false)} format={fmtMXN} />
          <Row label="Precio listado" values={items.map((i) => i.price)} winnerIdx={bestIdxFor(items, 'price', true)} format={fmtMXN} />
        </tbody>
      </Section>

      <Section titleKey="tax">
        <tbody>
          <Row label="ISAI" values={items.map((i) => i.isai)} winnerIdx={bestIdxFor(items, 'isai', true)} format={fmtMXN} />
          <Row label="TOTAL closing" values={items.map((i) => i.closing_total)} winnerIdx={bestIdxFor(items, 'closing_total', true)} format={fmtMXN} />
        </tbody>
      </Section>

      {showInvest && (
        <Section titleKey="invest">
          <tbody>
            <Row label="ISR proyectado" values={items.map((i) => i.isr_estimado)} winnerIdx={bestIdxFor(items, 'isr_estimado', true)} format={fmtMXN} />
            <Row label="Utilidad neta" values={items.map((i) => i.utilidad_neta)} winnerIdx={bestIdxFor(items, 'utilidad_neta', false)} format={fmtMXN} />
            <Row label="ROI neto" values={items.map((i) => i.roi_neto_pct)} winnerIdx={bestIdxFor(items, 'roi_neto_pct', false)} format={(v) => fmtNum(v, '%')} />
          </tbody>
        </Section>
      )}

      <Section titleKey="predial">
        <tbody>
          <Row label="Primer año" values={items.map((i) => i.predial_y1)} winnerIdx={bestIdxFor(items, 'predial_y1', true)} format={fmtMXN} />
          <Row label="Total 10 años" values={items.map((i) => i.predial_10y_total)} winnerIdx={bestIdxFor(items, 'predial_10y_total', true)} format={fmtMXN} />
        </tbody>
      </Section>

      <Section titleKey="scores">
        <tbody>
          <Row label="IE Score" values={items.map((i) => i.score_ie)} winnerIdx={bestIdxFor(items, 'score_ie', false)} format={fmtNum} />
          <Row label="Risk Score" values={items.map((i) => i.risk_score)} winnerIdx={bestIdxFor(items, 'risk_score', true)} format={fmtNum} />
          <Row label="Comparables" values={items.map((i) => (i.comparables_3 || []).length)} winnerIdx={-1} format={fmtNum} />
        </tbody>
      </Section>

      {verdict && (
        <section data-testid="ai-verdict" style={{
          marginTop: 18, padding: 26, borderRadius: 24, background: CARD_BG, position: 'relative', overflow: 'hidden',
          border: `1px solid transparent`, backgroundClip: 'padding-box',
          backdropFilter: 'blur(24px)',
        }}>
          <div style={{ position: 'absolute', inset: 0, padding: 1, borderRadius: 24, background: `linear-gradient(90deg, ${INDIGO}, ${ROSE})`, WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude', pointerEvents: 'none' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 9999, background: `linear-gradient(90deg, ${INDIGO}, ${ROSE})`, color: '#FFF', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700 }}>
              {t('comparator.verdict_title')}
            </div>
            <p style={{ marginTop: 14, color: CREAM, fontSize: 15, lineHeight: 1.6, fontFamily: 'DM Sans, sans-serif' }}>{verdict}</p>
          </div>
        </section>
      )}
    </div>
  );
}
