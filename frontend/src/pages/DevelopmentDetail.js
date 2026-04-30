// DevelopmentDetail — STUB for Iteration A. Full 5-tab page ships in Iteration B.
// Shows essentials so marketplace navigation doesn't lead to nothing.
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/landing/Navbar';
import { fetchDevelopment, fetchColonia } from '../api/marketplace';
import { MapPin, ArrowRight, Bed, Bath, Car, Ruler, Sparkle } from '../components/icons';

export default function DevelopmentDetail({ user, onLogin, onLogout }) {
  const { t } = useTranslation();
  const { id } = useParams();
  const [dev, setDev] = useState(null);
  const [colonia, setColonia] = useState(null);

  useEffect(() => {
    fetchDevelopment(id).then(async (d) => {
      setDev(d);
      try { setColonia(await fetchColonia(d.colonia_id)); } catch {}
    }).catch(() => setDev(null));
  }, [id]);

  if (!dev) {
    return (
      <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
        <Navbar user={user} onLogin={onLogin} onLogout={onLogout} />
        <div style={{ padding: 120, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>…</div>
      </div>
    );
  }

  const stageColors = {
    preventa: '#10B981',
    en_construccion: '#F59E0B',
    entrega_inmediata: '#3B82F6',
    exclusiva: '#8B5CF6',
  };
  const stageColor = stageColors[dev.stage] || '#6366F1';

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navbar user={user} onLogin={onLogin} onLogout={onLogout} />
      <main style={{ paddingTop: 80 }}>
        <section style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 32px 64px' }}>
          <Link to="/marketplace" className="eyebrow"
            style={{ color: 'var(--cream-3)', textDecoration: 'none', display: 'inline-block', marginBottom: 18 }}>
            ← {t('dev.back_to_marketplace')}
          </Link>

          <div style={{ marginBottom: 22 }}>
            <span style={{
              display: 'inline-block',
              padding: '3px 12px', borderRadius: 9999,
              background: stageColor + '22',
              border: `1px solid ${stageColor}55`,
              color: stageColor,
              fontFamily: 'Outfit', fontWeight: 700, fontSize: 11,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              marginBottom: 12,
            }}>
              {t(`marketplace_v2.stage.${dev.stage}`)}
            </span>
            <h1 data-testid="dev-detail-title" style={{
              fontFamily: 'Outfit', fontWeight: 800,
              fontSize: 'clamp(32px, 4.5vw, 54px)',
              letterSpacing: '-0.028em', color: 'var(--cream)',
              lineHeight: 1.0,
            }}>
              {dev.name}
            </h1>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <MapPin size={13} color="var(--cream-3)" />
              <span style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-3)' }}>
                {dev.address_full}
              </span>
            </div>
          </div>

          <div style={{
            padding: '18px 22px',
            background: 'linear-gradient(140deg, rgba(99,102,241,0.12), rgba(236,72,153,0.06))',
            border: '1px solid rgba(99,102,241,0.26)',
            borderRadius: 18,
            display: 'flex', alignItems: 'center', gap: 12,
            marginBottom: 32,
          }}>
            <Sparkle size={18} color="var(--indigo-3)" />
            <div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>
                {t('dev.coming_soon')}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', lineHeight: 1.5 }}>
                {t('dev.coming_soon_body')}
              </div>
            </div>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 300px', gap: 32, alignItems: 'start',
          }} className="stub-grid">
            <div>
              <p style={{ fontFamily: 'DM Sans', fontSize: 15, color: 'var(--cream-2)', lineHeight: 1.7, marginBottom: 24 }}>
                {dev.description}
              </p>

              <div className="eyebrow" style={{ marginBottom: 10 }}>Resumen</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }} className="stub-meta">
                {[
                  { Icon: Bed, a: dev.bedrooms_range[0], b: dev.bedrooms_range[1], unit: 'rec' },
                  { Icon: Bath, a: dev.bathrooms_range[0], b: dev.bathrooms_range[1], unit: 'baños' },
                  { Icon: Car, a: dev.parking_range[0], b: dev.parking_range[1], unit: 'cajones' },
                  { Icon: Ruler, a: dev.m2_range[0], b: dev.m2_range[1], unit: 'm²' },
                ].map(({ Icon, a, b, unit }, i) => (
                  <div key={i} style={{
                    padding: 14, background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--border)', borderRadius: 12,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  }}>
                    <Icon size={14} color="var(--indigo-3)" />
                    <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)' }}>
                      {a === b ? a : `${a}-${b}`}
                    </div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      {unit}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{
              padding: 22,
              background: 'linear-gradient(180deg, #0E1220, #0A0D16)',
              border: '1px solid var(--border)',
              borderRadius: 18,
              position: 'sticky', top: 100,
            }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>{t('marketplace_v2.card_from')}</div>
              <div style={{
                fontFamily: 'Outfit', fontWeight: 800, fontSize: 28,
                color: 'var(--cream)', letterSpacing: '-0.028em',
              }}>
                {dev.price_from_display} <span style={{ fontSize: 12, color: 'var(--cream-3)', fontWeight: 500 }}>MXN</span>
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginBottom: 14 }}>
                {t('dev.delivery')} {dev.delivery_estimate}
              </div>

              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', marginBottom: 8 }}>
                {t('dev.units', { avail: dev.units_available, total: dev.units_total })}
              </div>

              <div style={{
                padding: '10px 12px', marginBottom: 12,
                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                borderRadius: 10,
              }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{t('dev.dev_by')}</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>
                  {dev.developer?.name}
                </div>
              </div>

              <Link to="/marketplace" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                {t('dev.back_to_marketplace')} <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <style>{`
        @media (max-width: 860px) {
          .stub-grid { grid-template-columns: 1fr !important; }
          .stub-meta { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
