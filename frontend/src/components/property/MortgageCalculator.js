// Inline mortgage calculator — generic bank formula
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

function fmt(n) {
  return '$' + Math.round(n).toLocaleString('es-MX');
}

export default function MortgageCalculator({ price }) {
  const { t } = useTranslation();
  const [down, setDown] = useState(20);
  const [years, setYears] = useState(20);
  const [rate, setRate] = useState(10.5);

  const { loan, monthly, total, interest } = useMemo(() => {
    const loanAmt = price * (1 - down / 100);
    const monthlyRate = rate / 100 / 12;
    const n = years * 12;
    const m = loanAmt * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
    const tot = m * n;
    return { loan: loanAmt, monthly: m, total: tot, interest: tot - loanAmt };
  }, [price, down, years, rate]);

  const sliderStyle = {
    width: '100%', accentColor: '#6366F1',
  };

  return (
    <div
      data-testid="mortgage-calc"
      style={{
        background: 'linear-gradient(180deg, #0E1220 0%, #0A0D16 100%)',
        border: '1px solid var(--border)',
        borderRadius: 20, padding: 22,
      }}
    >
      <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', marginBottom: 16 }}>
        {t('detail.calc_h')}
      </h3>

      <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginBottom: 4 }}>
        {t('detail.calc_price')}
      </div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 22, color: 'var(--cream)', marginBottom: 18 }}>
        {fmt(price)}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)' }}>{t('detail.calc_down')}</span>
            <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--indigo-3)' }}>{down}%</span>
          </div>
          <input data-testid="calc-down" type="range" min={5} max={60} step={1} value={down}
            onChange={e => setDown(+e.target.value)} style={sliderStyle} />
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)' }}>{t('detail.calc_term')}</span>
            <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--indigo-3)' }}>{years}</span>
          </div>
          <input data-testid="calc-term" type="range" min={5} max={30} step={1} value={years}
            onChange={e => setYears(+e.target.value)} style={sliderStyle} />
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)' }}>{t('detail.calc_rate')}</span>
            <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--indigo-3)' }}>{rate.toFixed(1)}%</span>
          </div>
          <input data-testid="calc-rate" type="range" min={6} max={16} step={0.1} value={rate}
            onChange={e => setRate(+e.target.value)} style={sliderStyle} />
        </div>
      </div>

      <div style={{ marginTop: 20, padding: '16px 18px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.22)', borderRadius: 14 }}>
        <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
          {t('detail.calc_monthly')}
        </div>
        <div data-testid="calc-monthly" style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 28,
          background: 'var(--grad)', WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          letterSpacing: '-0.02em',
        }}>
          {fmt(monthly)}
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {[
          { k: t('detail.calc_loan'), v: fmt(loan) },
          { k: t('detail.calc_total'), v: fmt(total) },
          { k: t('detail.calc_interest'), v: fmt(interest) },
        ].map(({ k, v }) => (
          <div key={k} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)' }}>{k}</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', fontStyle: 'italic' }}>
        {t('detail.calc_hint')}
      </div>
    </div>
  );
}
