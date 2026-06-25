// Sticky sidebar for /desarrollo/:id — pricing + CTAs (plusvalía/plan de pagos viven en "Tu dinero")
import React from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Calendar, ArrowRight } from '../icons';
import { tc } from '../../lib/titleCase';

function fmt(n) { return '$' + Math.round(n).toLocaleString('es-MX'); }

export default function Sidebar({ dev, selectedUnit, onLogin, user }) {
  const { t } = useTranslation();
  const activePrice = selectedUnit?.price || dev.price_from;

  const waPhone = (dev.contact_phone || '+525512345678').replace(/\D/g, '');
  const waText = `Hola, me interesa ${dev.name} en ${dev.colonia}. ${typeof window !== 'undefined' ? window.location.origin : 'https://desarrollosmx.io'}/desarrollo/${dev.id}`;
  const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(waText)}`;

  return (
    <aside
      data-testid="dev-sidebar"
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--card-border, var(--border))',
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

      {/* (Calculadora de plusvalía + plan de pagos → integradas en "Tu dinero" · no se duplican en el riel.
          El riel queda limpio: precio + CTAs.) */}

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
