// W3.8 — CrossSellOfferCard component
import React, { useState } from 'react';
import { HeartHandshake as HandshakeIcon } from 'lucide-react';
import PartnerOfferModal from './PartnerOfferModal';
import { clickOffer } from '../../api/crossSell';

const TYPE_CONFIG = {
  mortgage_broker:    { label: 'Hipoteca',      color: '#6366F1', tagline: 'Bróker multi-banco · respuesta 24-48h' },
  mortgage:           { label: 'Hipoteca',      color: '#6366F1', tagline: 'Bróker multi-banco · respuesta 24-48h' },
  insurance_broker:   { label: 'Seguros',       color: '#EC4899', tagline: 'Cotización multi-aseguradora sin compromiso' },
  insurance:          { label: 'Seguros',       color: '#EC4899', tagline: 'Cotización multi-aseguradora sin compromiso' },
  notaria:            { label: 'Notaría',       color: '#10B981', tagline: 'Escrituración + verificación RPP' },
  avaluo:             { label: 'Avalúo',        color: '#F59E0B', tagline: 'Perito certificado SHF/INDAABIN' },
  moving:             { label: 'Post-Cierre',   color: '#818CF8', tagline: 'Mudanza + cerrajería + interiorismo' },
  construction:       { label: 'Construcción',  color: '#34D399', tagline: 'Proyectos de adecuación' },
};

export function CrossSellOfferCard({ offer, onSuccess }) {
  const [modalOpen, setModalOpen] = useState(false);
  const cfg = TYPE_CONFIG[offer.partner_type] || TYPE_CONFIG.mortgage_broker;
  const firstProduct = offer.product_offerings?.[0] || {};

  const handleClick = async () => {
    try { await clickOffer(offer.id); } catch {}
    setModalOpen(true);
  };

  return (
    <>
      <div
        data-testid={`cross-sell-card-${offer.id}`}
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${cfg.color}30`,
          borderRadius: 12,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          transition: 'transform 0.18s, border-color 0.18s',
          cursor: 'pointer',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.borderColor = `${cfg.color}60`;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.borderColor = `${cfg.color}30`;
        }}
        onClick={handleClick}
      >
        {/* Icon */}
        <div style={{
          width: 40, height: 40, borderRadius: 9999, flexShrink: 0,
          background: `${cfg.color}18`,
          border: `1px solid ${cfg.color}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <HandshakeIcon size={18} color={cfg.color} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{
              fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)',
            }}>
              {offer.partner_name}
            </span>
            <span style={{
              background: `${cfg.color}20`, color: cfg.color,
              fontSize: 10, fontWeight: 700, padding: '2px 7px',
              borderRadius: 9999, fontFamily: 'DM Sans', textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              {cfg.label}
            </span>
          </div>
          <p style={{
            fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)',
            margin: 0, lineHeight: 1.4,
          }}>
            {firstProduct.description || cfg.tagline}
          </p>
        </div>

        {/* CTA */}
        <button
          data-testid={`cross-sell-cta-${offer.id}`}
          onClick={e => { e.stopPropagation(); handleClick(); }}
          style={{
            background: `${cfg.color}20`,
            border: `1px solid ${cfg.color}50`,
            color: cfg.color,
            fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
            padding: '7px 14px', borderRadius: 9999, cursor: 'pointer',
            flexShrink: 0, whiteSpace: 'nowrap',
          }}
        >
          Solicitar info
        </button>
      </div>

      {modalOpen && (
        <PartnerOfferModal
          offer={offer}
          onClose={() => setModalOpen(false)}
          onSuccess={(result) => {
            setModalOpen(false);
            if (onSuccess) onSuccess(result);
          }}
        />
      )}
    </>
  );
}
