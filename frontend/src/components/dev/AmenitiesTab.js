// Tab 4 — Amenidades (shared public/registered)
import React from 'react';
import { useTranslation } from 'react-i18next';

const AMENITY_SVG = {
  gym: <g><path d="M6 6v12M18 6v12M4 10h2M4 14h2M18 10h2M18 14h2M6 12h12" stroke="currentColor" strokeWidth={2} strokeLinecap="round" fill="none"/></g>,
  alberca: <g><path d="M2 18c1.5-1 3-1 5 0s3.5 1 5 0 3.5-1 5 0 3.5 1 5 0M2 14c1.5-1 3-1 5 0s3.5 1 5 0 3.5-1 5 0 3.5 1 5 0" stroke="currentColor" strokeWidth={2} strokeLinecap="round" fill="none"/><circle cx={12} cy={7} r={2} stroke="currentColor" strokeWidth={2} fill="none"/></g>,
  roof: <g><path d="M3 11l9-7 9 7M5 11v9h14v-9" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none"/><path d="M9 14v4M12 14v4M15 14v4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"/></g>,
  concierge: <g><circle cx={12} cy={9} r={4} stroke="currentColor" strokeWidth={2} fill="none"/><path d="M4 20c1-4 4-6 8-6s7 2 8 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" fill="none"/></g>,
  pet: <g><circle cx={7} cy={8} r={2} stroke="currentColor" strokeWidth={2} fill="none"/><circle cx={17} cy={8} r={2} stroke="currentColor" strokeWidth={2} fill="none"/><circle cx={5} cy={14} r={2} stroke="currentColor" strokeWidth={2} fill="none"/><circle cx={19} cy={14} r={2} stroke="currentColor" strokeWidth={2} fill="none"/><path d="M8 20c1-3 3-4 4-4s3 1 4 4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" fill="none"/></g>,
  seguridad: <g><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" stroke="currentColor" strokeWidth={2} fill="none"/></g>,
  estacionamiento: <g><rect x={4} y={7} width={16} height={12} rx={2} stroke="currentColor" strokeWidth={2} fill="none"/><path d="M9 7V5M15 7V5" stroke="currentColor" strokeWidth={2} strokeLinecap="round"/><circle cx={8} cy={16} r={1.5} fill="currentColor"/><circle cx={16} cy={16} r={1.5} fill="currentColor"/></g>,
  cowork: <g><rect x={3} y={5} width={18} height={12} rx={2} stroke="currentColor" strokeWidth={2} fill="none"/><path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth={2} strokeLinecap="round"/></g>,
  spa: <g><path d="M12 3c3 3 3 6 0 9-3-3-3-6 0-9zM5 12c4 0 7 3 7 7-4 0-7-3-7-7zM19 12c-4 0-7 3-7 7 4 0 7-3 7-7z" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none"/></g>,
  business_center: <g><rect x={3} y={8} width={18} height={12} rx={2} stroke="currentColor" strokeWidth={2} fill="none"/><path d="M8 8V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3" stroke="currentColor" strokeWidth={2} fill="none"/></g>,
  salon_eventos: <g><path d="M3 9l9-6 9 6-9 6-9-6zM3 13l9 6 9-6M3 17l9 6 9-6" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" fill="none"/></g>,
  cava: <g><path d="M8 2v20M16 2v20M8 8h8M8 16h8" stroke="currentColor" strokeWidth={2} strokeLinecap="round" fill="none"/></g>,
  sky_lounge: <g><path d="M4 20h16M6 20V9l6-5 6 5v11M10 20v-7h4v7" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" fill="none"/></g>,
  bicicletas: <g><circle cx={6} cy={17} r={3} stroke="currentColor" strokeWidth={2} fill="none"/><circle cx={18} cy={17} r={3} stroke="currentColor" strokeWidth={2} fill="none"/><path d="M6 17l4-8h4l-2 6M14 9h4" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" fill="none"/></g>,
  jardines: <g><path d="M12 3v18M6 9c0-2 2-4 6-4s6 2 6 4-2 4-6 4-6-2-6-4zM4 14c2 0 4 2 4 4s-2 4-4 4M20 14c-2 0-4 2-4 4s2 4 4 4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none"/></g>,
  area_pets: <g><path d="M4 15a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v5H4z" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" fill="none"/><circle cx={9} cy={8} r={1.6} fill="currentColor"/><circle cx={15} cy={8} r={1.6} fill="currentColor"/></g>,
};

export default function AmenitiesTab({ dev }) {
  const { t } = useTranslation();
  const list = dev.amenities || [];
  return (
    <div data-testid="amenities-tab" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }} className="amen-grid">
      {list.map(a => (
        <div key={a} style={{
          padding: 22,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          display: 'flex', flexDirection: 'column', gap: 10,
          alignItems: 'flex-start',
          transition: 'transform 0.2s, border-color 0.2s',
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.34)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'rgba(99,102,241,0.10)',
            border: '1px solid rgba(99,102,241,0.24)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--indigo-3)',
          }}>
            <svg width={18} height={18} viewBox="0 0 24 24">{AMENITY_SVG[a] || <circle cx={12} cy={12} r={6} stroke="currentColor" strokeWidth={2} fill="none"/>}</svg>
          </div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>
            {t(`marketplace_v2.amenity_aliases.${a}`, { defaultValue: a })}
          </div>
        </div>
      ))}
      <style>{`
        @media (max-width: 900px) { .amen-grid { grid-template-columns: repeat(3, 1fr) !important; } }
        @media (max-width: 600px) { .amen-grid { grid-template-columns: repeat(2, 1fr) !important; } }
      `}</style>
    </div>
  );
}
