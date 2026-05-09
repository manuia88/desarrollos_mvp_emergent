// W3.8 — CompradorCrossSellSection
// Mounted in CompradorDashboard. Only shows if there are active partners.
import React, { useEffect, useState } from 'react';
import { CrossSellOfferCard } from './CrossSellOfferCard';
import { getMyOffers, getCrossSellOffers } from '../../api/crossSell';

export default function CompradorCrossSellSection() {
  const [offers, setOffers] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    // Fetch dashboard-level offers (no specific property_id → general offers)
    getCrossSellOffers()
      .then(r => setOffers(r.offers || []))
      .catch(() => setOffers([]))
      .finally(() => setLoaded(true));
  }, []);

  // No section at all if no active partner offers
  if (!loaded || offers.length === 0) return null;

  return (
    <div data-testid="dashboard-cross-sell-section" style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <p style={{
          fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11,
          letterSpacing: '0.10em', color: 'var(--cream-3)',
          textTransform: 'uppercase', margin: 0,
        }}>
          Servicios para tu compra
        </p>
        <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
          Partners verificados · respuesta 24-48h
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 8,
      }}>
        {offers.map(offer => (
          <CrossSellOfferCard
            key={offer.id}
            offer={offer}
            onSuccess={r => setSuccessMsg(r?.message || 'Solicitud enviada.')}
          />
        ))}
      </div>

      {successMsg && (
        <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#6ee7b7', margin: '8px 0 0' }}>
          {successMsg}
        </p>
      )}
    </div>
  );
}
