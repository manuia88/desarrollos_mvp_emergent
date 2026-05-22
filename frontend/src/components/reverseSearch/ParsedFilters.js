// W5.x F5 · ParsedFilters · 4 grupos de chips (duros, blandos, exclusiones, audiencia)
import React from 'react';
import { useTranslation } from 'react-i18next';

const CREAM = '#F0EBE0';
const INDIGO = '#6366F1';
const ROSE = '#EC4899';
const RED = '#EF4444';
const MUTED = 'rgba(240,235,224,0.62)';

const chipBase = {
  display: 'inline-flex', alignItems: 'center',
  padding: '6px 14px', borderRadius: 9999, fontSize: 12,
  letterSpacing: '0.08em', fontFamily: 'DM Sans, sans-serif',
  background: 'rgba(13,16,23,0.6)', color: CREAM,
  marginRight: 8, marginBottom: 8, whiteSpace: 'nowrap',
};

const groupTitle = {
  fontSize: 11, color: MUTED, textTransform: 'uppercase',
  letterSpacing: '0.2em', marginBottom: 8, fontFamily: 'DM Sans, sans-serif',
  marginTop: 14,
};

const fmtMXN = (n) => `${Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;

function hardChips(hf, t) {
  const out = [];
  if (!hf) return out;
  if (hf.precio_max) out.push(`≤$${fmtMXN(hf.precio_max)}`);
  if (hf.precio_min) out.push(`≥$${fmtMXN(hf.precio_min)}`);
  if (hf.recamaras_min) out.push(`≥${hf.recamaras_min} rec`);
  if (hf.banos_min) out.push(`≥${hf.banos_min} banos`);
  if (hf.m2_min) out.push(`≥${hf.m2_min} m²`);
  if (hf.m2_max) out.push(`≤${hf.m2_max} m²`);
  if (hf.colonia) out.push(hf.colonia);
  if (hf.alcaldia) out.push(hf.alcaldia);
  return out;
}

export default function ParsedFilters({ parsed }) {
  const { t } = useTranslation('common');
  if (!parsed) return null;

  const hards = hardChips(parsed.hard_filters, t);
  const softs = Array.isArray(parsed.soft_criteria) ? parsed.soft_criteria : [];
  const negs = Array.isArray(parsed.negative_criteria) ? parsed.negative_criteria : [];
  const audience = parsed.buyer_intent;

  if (!hards.length && !softs.length && !negs.length && !audience) return null;

  return (
    <section data-testid="parsed-filters" style={{ width: '100%', overflowX: 'auto' }}>
      {hards.length > 0 && (
        <>
          <div style={groupTitle}>{t('reverseSearch.parsed_hard_filters')}</div>
          <div>
            {hards.map((h, i) => (
              <span key={i} data-testid={`chip-hard-${i}`} style={{ ...chipBase, border: `1px solid ${INDIGO}88` }}>{h}</span>
            ))}
          </div>
        </>
      )}
      {softs.length > 0 && (
        <>
          <div style={groupTitle}>{t('reverseSearch.parsed_soft_criteria')}</div>
          <div>
            {softs.map((s, i) => (
              <span key={i} data-testid={`chip-soft-${i}`} style={{ ...chipBase, border: `1px solid ${ROSE}88` }}>{s}</span>
            ))}
          </div>
        </>
      )}
      {negs.length > 0 && (
        <>
          <div style={groupTitle}>{t('reverseSearch.parsed_negative_criteria')}</div>
          <div>
            {negs.map((n, i) => (
              <span key={i} data-testid={`chip-neg-${i}`} style={{ ...chipBase, border: `1px solid ${RED}88`, color: '#FCA5A5' }}>NO · {n}</span>
            ))}
          </div>
        </>
      )}
      {audience && (
        <>
          <div style={groupTitle}>{t('reverseSearch.parsed_audience')}</div>
          <div>
            <span data-testid="chip-audience" style={{ ...chipBase, border: `1px solid ${CREAM}` }}>
              {t(`reverseSearch.audience_${audience}`, audience)}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
