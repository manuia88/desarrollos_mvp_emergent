// Sticky sidebar for /desarrollo/:id — pricing, CTAs, plusvalía + plan de pagos
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Calendar, ArrowRight } from '../icons';

function fmt(n) { return '$' + Math.round(n).toLocaleString('es-MX'); }

// Derive months-until-delivery from YYYY-MM
function monthsUntil(deliveryYyyyMm) {
  if (!deliveryYyyyMm) return 24;
  const [y, m] = deliveryYyyyMm.split('-').map(Number);
  const now = new Date();
  const diff = (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
  return Math.max(6, diff);
}

export default function Sidebar({ dev, selectedUnit, onLogin, user }) {
  const { t } = useTranslation();
  const [apprec, setApprec] = useState(8);   // plusvalía annual %
  const [down, setDown] = useState(20);       // enganche %

  const activePrice = selectedUnit?.price || dev.price_from;

  const { today, delivery, plusvaliaDelta } = useMemo(() => {
    const months = monthsUntil(dev.delivery_estimate);
    const years = months / 12;
    const tgt = activePrice * Math.pow(1 + apprec / 100, years);
    return { today: activePrice, delivery: tgt, plusvaliaDelta: tgt - activePrice };
  }, [activePrice, apprec, dev.delivery_estimate]);

  const { downAmt, monthlyCount, monthlyAmt, finalAmt } = useMemo(() => {
    const downAmtV = activePrice * (down / 100);
    const final = activePrice * 0.5; // common Mexican preventa scheme: 50% at delivery
    const during = activePrice - downAmtV - final;
    const months = Math.max(1, monthsUntil(dev.delivery_estimate));
    return { downAmt: downAmtV, monthlyCount: months, monthlyAmt: during / months, finalAmt: final };
  }, [activePrice, down, dev.delivery_estimate]);

  const waPhone = (dev.contact_phone || '+525512345678').replace(/\D/g, '');
  const waText = `Hola, me interesa ${dev.name} en ${dev.colonia}. ${typeof window !== 'undefined' ? window.location.origin : 'https://dmx.mx'}/desarrollo/${dev.id}`;
  const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(waText)}`;

  const slider = { width: '100%', accentColor: '#6366F1' };

  return (
    <aside
      data-testid="dev-sidebar"
      style={{
        background: 'linear-gradient(180deg, #0E1220, #0A0D16)',
        border: '1px solid var(--border)',
        borderRadius: 22, padding: 22,
        position: 'sticky', top: 90,
        maxHeight: 'calc(100vh - 110px)',
        overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 18,
      }}
    >
      <div>
        <div className="eyebrow" style={{ marginBottom: 4 }}>
          {selectedUnit ? `Unidad ${selectedUnit.unit_number}` : t('marketplace_v2.card_from')}
        </div>
        <div data-testid="sidebar-price" style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 32,
          background: 'var(--grad)', WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          letterSpacing: '-0.03em', lineHeight: 1,
        }}>
          {fmt(activePrice)}
        </div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 4 }}>
          MXN · {t(`marketplace_v2.stage.${dev.stage}`)} · {t('dev.delivery')} {dev.delivery_estimate}
        </div>
      </div>

      {/* CTA stack */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={() => alert(t('dev.visit_alert'))} data-testid="cta-visit"
          className="btn btn-primary" style={{ justifyContent: 'center', padding: '11px 16px' }}>
          <Calendar size={13} />
          {t('dev.cta_visit')}
        </button>
        <a href="#tab-precios" data-testid="cta-prices" className="btn btn-glass"
          style={{ justifyContent: 'center', textDecoration: 'none' }}>
          {t('dev.cta_prices')}
          <ArrowRight size={12} />
        </a>
        <a href={waUrl} target="_blank" rel="noreferrer" data-testid="cta-whatsapp"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '11px 16px',
            background: 'linear-gradient(135deg, #10B981, #059669)',
            border: 'none', color: '#fff',
            fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
            borderRadius: 9999, textDecoration: 'none',
            transition: 'transform 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
          <MessageSquare size={13} />
          WhatsApp
        </a>
      </div>

      {/* Plusvalía calculator */}
      <div style={{
        padding: 16,
        background: 'rgba(99,102,241,0.06)',
        border: '1px solid rgba(99,102,241,0.18)',
        borderRadius: 14,
      }}>
        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)', marginBottom: 10 }}>
          {t('dev.plusvalia_h')}
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)' }}>{t('dev.plusvalia_slider')}</span>
            <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 12, color: 'var(--indigo-3)' }}>{apprec}%</span>
          </div>
          <input data-testid="plusvalia-slider" type="range" min={0} max={15} step={0.5} value={apprec}
            onChange={e => setApprec(+e.target.value)} style={slider} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {[
            { k: t('dev.today'), v: fmt(today), color: 'var(--cream)' },
            { k: t('dev.at_delivery'), v: fmt(delivery), color: 'var(--cream)' },
            { k: t('dev.gain'), v: fmt(plusvaliaDelta), color: '#86efac' },
          ].map(({ k, v, color }) => (
            <div key={k} style={{ padding: '8px 6px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 10, textAlign: 'center' }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 9, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k}</div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color, letterSpacing: '-0.02em' }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', fontStyle: 'italic' }}>
          {t('dev.plusvalia_disclaimer')}
        </div>
      </div>

      {/* Plan de pagos */}
      <div style={{
        padding: 16,
        background: 'rgba(236,72,153,0.06)',
        border: '1px solid rgba(236,72,153,0.18)',
        borderRadius: 14,
      }}>
        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)', marginBottom: 10 }}>
          {t('dev.plan_h')}
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)' }}>{t('dev.plan_down')}</span>
            <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 12, color: '#f472b6' }}>{down}%</span>
          </div>
          <input data-testid="plan-slider" type="range" min={10} max={50} step={1} value={down}
            onChange={e => setDown(+e.target.value)} style={slider} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { k: t('dev.plan_down_amt'), v: fmt(downAmt) },
            { k: t('dev.plan_monthly', { n: monthlyCount }), v: `${fmt(monthlyAmt)}/mes` },
            { k: t('dev.plan_final'), v: fmt(finalAmt) },
          ].map(({ k, v }) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{k}</span>
              <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 12, color: 'var(--cream)' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {!user && (
        <button onClick={onLogin} data-testid="sidebar-signup"
          style={{
            background: 'none', border: '1px dashed var(--border-2)',
            borderRadius: 12, padding: 12,
            fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)',
            cursor: 'pointer', lineHeight: 1.5, textAlign: 'left',
          }}>
          {t('dev.signup_hint')}
        </button>
      )}
    </aside>
  );
}
