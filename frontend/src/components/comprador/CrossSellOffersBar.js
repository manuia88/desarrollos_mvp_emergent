// W3.8 — CrossSellOffersBar — wrapper for PropertyDetail
// Shows only when there are ACTIVE partner offers. No empty space if none.
import React, { useEffect, useState } from 'react';
import { CrossSellOfferCard } from './CrossSellOfferCard';
import { getCrossSellOffers } from '../../api/crossSell';

export default function CrossSellOffersBar({ propertyId }) {
  const [offers, setOffers] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!propertyId) return;
    getCrossSellOffers(propertyId)
      .then(r => setOffers(r.offers || []))
      .catch(() => setOffers([]))
      .finally(() => setLoaded(true));
  }, [propertyId]);

  // Show nothing until loaded to avoid layout shift
  if (!loaded || offers.length === 0) return null;

  return (
    <div data-testid="cross-sell-bar" style={{ marginTop: 4 }}>
      <p style={{
        fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11,
        letterSpacing: '0.10em', color: 'var(--cream-3)',
        textTransform: 'uppercase', margin: '0 0 10px',
      }}>
        Servicios para tu compra
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {offers.map(offer => (
          <CrossSellOfferCard
            key={offer.id}
            offer={offer}
            onSuccess={(result) => setSuccessMsg(result?.message || 'Solicitud enviada.')}
          />
        ))}
      </div>
      {successMsg && (
        <p style={{
          fontFamily: 'DM Sans', fontSize: 12, color: '#6ee7b7',
          margin: '8px 0 0', lineHeight: 1.5,
        }}>
          {successMsg}
        </p>
      )}
    </div>
  );
}
