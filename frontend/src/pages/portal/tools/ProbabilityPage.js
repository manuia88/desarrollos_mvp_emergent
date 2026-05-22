// W5.19 wire · ProbabilityPage · standalone T0 público · consume ProbabilityCard
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ProbabilityCard from '../../../components/probability/ProbabilityCard';

const BG = '#06080F';
const CREAM = '#F0EBE0';
const INDIGO = '#6366F1';
const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const MUTED = 'rgba(240,235,224,0.62)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const inputStyle = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 12,
  background: 'rgba(240,235,224,0.04)',
  border: '1px solid rgba(240,235,224,0.14)',
  color: CREAM,
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 14,
  outline: 'none',
  transition: `border-color 320ms ${EASE}`,
};

const labelStyle = {
  display: 'block',
  fontSize: 11,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: MUTED,
  marginBottom: 8,
  fontFamily: 'DM Sans, sans-serif',
  fontWeight: 500,
};

const TYPE_OPTIONS = [
  { value: 'sells_complete', labelKey: 'probabilityPage.type_sells_complete' },
  { value: 'drpi_up', labelKey: 'probabilityPage.type_drpi_up' },
  { value: 'closes_below_listed', labelKey: 'probabilityPage.type_closes_below_listed' },
];

export default function ProbabilityPage() {
  const { t } = useTranslation('common');
  const [type, setType] = useState('sells_complete');
  const [id, setId] = useState('');
  const [months, setMonths] = useState(12);
  const [listed, setListed] = useState('');
  const [submitted, setSubmitted] = useState(null);

  const showListed = type === 'closes_below_listed';
  const canSubmit = !!type && !!id.trim() && (!showListed || Number(listed) > 0);

  const handleSubmit = () => {
    if (!canSubmit) return;
    setSubmitted({
      type,
      id: id.trim(),
      months: Number(months) || 12,
      listed: showListed ? Number(listed) : undefined,
    });
  };

  return (
    <div
      data-testid="probability-page"
      style={{
        minHeight: '100vh',
        background: BG,
        color: CREAM,
        fontFamily: 'DM Sans, sans-serif',
        padding: '64px 24px 96px',
      }}
    >
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        {/* Hero */}
        <header style={{ marginBottom: 40 }}>
          <div style={{
            letterSpacing: '0.22em', fontSize: 11, color: INDIGO,
            textTransform: 'uppercase', marginBottom: 12,
          }}>
            {t('probabilityPage.eyebrow', 'Probabilidad · datos reales')}
          </div>
          <h1 style={{
            margin: 0,
            fontFamily: 'Outfit, sans-serif',
            fontWeight: 800,
            fontSize: 'clamp(32px, 5vw, 48px)',
            letterSpacing: '-0.02em',
            background: GRADIENT,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
          }}>
            {t('probabilityPage.page_title', 'Probabilidad de inversión')}
          </h1>
          <p style={{
            margin: '14px 0 0', color: MUTED, fontSize: 15, lineHeight: 1.55, maxWidth: 620,
          }}>
            {t('probabilityPage.page_subtitle', 'Calcula la probabilidad de eventos clave (venta completa, alza de precios, cierre por debajo del listado) con fuentes ponderadas Kalshi-style.')}
          </p>
        </header>

        {/* Form card */}
        <section style={{
          background: CARD_BG, border: BORDER, borderRadius: 24, padding: 28, marginBottom: 28,
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        }}>
          <div style={{ display: 'grid', gap: 22 }}>
            <div>
              <label style={labelStyle}>{t('probabilityPage.input_type', 'Tipo de evento')}</label>
              <select
                data-testid="prob-input-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                style={inputStyle}
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} style={{ background: BG, color: CREAM }}>
                    {t(opt.labelKey, opt.value)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>
                {type === 'drpi_up'
                  ? t('probabilityPage.input_id_zone', 'Slug de zona (ej. polanco)')
                  : t('probabilityPage.input_id_property', 'ID de propiedad o proyecto')}
              </label>
              <input
                data-testid="prob-input-id"
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder={type === 'drpi_up' ? 'polanco' : 'prop_abc123'}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>
                {t('probabilityPage.input_months', 'Horizonte (meses)')} · {months}
              </label>
              <input
                data-testid="prob-input-months"
                type="range"
                min={1}
                max={24}
                step={1}
                value={months}
                onChange={(e) => setMonths(Number(e.target.value))}
                style={{ width: '100%', accentColor: INDIGO }}
              />
            </div>

            {showListed && (
              <div>
                <label style={labelStyle}>
                  {t('probabilityPage.input_listed', 'Precio listado (MXN)')}
                </label>
                <input
                  data-testid="prob-input-listed"
                  type="number"
                  min={0}
                  value={listed}
                  onChange={(e) => setListed(e.target.value)}
                  placeholder="8500000"
                  style={inputStyle}
                />
              </div>
            )}

            <button
              data-testid="prob-input-submit"
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{
                marginTop: 6,
                padding: '14px 22px',
                borderRadius: 9999,
                border: 'none',
                background: canSubmit ? GRADIENT : 'rgba(240,235,224,0.08)',
                color: canSubmit ? '#FFF' : MUTED,
                fontFamily: 'Outfit, sans-serif',
                fontWeight: 700,
                fontSize: 15,
                letterSpacing: '0.02em',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                transition: `transform 220ms ${EASE}, opacity 220ms ${EASE}`,
              }}
            >
              {t('probabilityPage.btn_calculate', 'Calcular probabilidad')}
            </button>
          </div>
        </section>

        {/* Result */}
        {submitted && (
          <section style={{ marginBottom: 28 }}>
            <ProbabilityCard
              type={submitted.type}
              id={submitted.id}
              months={submitted.months}
              listed={submitted.listed}
            />
          </section>
        )}

        {/* Disclaimer */}
        <aside style={{
          padding: '18px 20px',
          borderRadius: 14,
          background: 'rgba(99,102,241,0.08)',
          border: `1px solid ${INDIGO}33`,
          color: MUTED,
          fontSize: 13,
          lineHeight: 1.6,
        }}>
          {t('probabilityPage.disclaimer', 'Predicciones basadas en datos verificados (AVM, Forecast, WhatIf). Pueden tener insuficiente historial para zonas o proyectos recientes. No constituyen recomendación de inversión.')}
        </aside>
      </div>
    </div>
  );
}
