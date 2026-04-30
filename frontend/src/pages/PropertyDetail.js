// Property Detail page — /propiedad/:id
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/landing/Navbar';
import { Bed, Bath, Car, Ruler, Heart, MapPin, Leaf, Route, Shield, Store, ArrowRight } from '../components/icons';
import { fetchProperty, fetchColonia, fetchSimilar, isFavorite, toggleFavorite } from '../api/marketplace';
import MortgageCalculator from '../components/property/MortgageCalculator';
import BriefingCard from '../components/property/BriefingCard';
import ShareMenu from '../components/property/ShareMenu';
import MiniMap from '../components/property/MiniMap';
import PropertyCard from '../components/marketplace/PropertyCard';

const SCORE_ICON = { vida: Leaf, movilidad: Route, seguridad: Shield, comercio: Store };

function HeroPhoto({ idx = 0 }) {
  return (
    <svg viewBox="0 0 960 460" style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`d-${idx}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a1040" />
          <stop offset="100%" stopColor="#0A0D16" />
        </linearGradient>
      </defs>
      <rect width={960} height={460} fill={`url(#d-${idx})`} />
      <rect x={180} y={70} width={600} height={330} fill="rgba(28,28,58,0.78)" />
      {Array.from({ length: 10 }).map((_, row) => (
        Array.from({ length: 9 }).map((_, col) => (
          <rect key={`${row}${col}`} x={200 + col*62} y={90 + row*30} width={38} height={18}
            fill={((row*9+col) % 3) > 0 ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.04)'} rx={2} />
        ))
      ))}
      <rect x={180} y={360} width={600} height={40} fill="rgba(99,102,241,0.15)" />
      <ellipse cx={480} cy={430} rx={360} ry={30} fill="rgba(99,102,241,0.12)" />
    </svg>
  );
}

export default function PropertyDetail({ user, onLogin, onLogout }) {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const [property, setProperty] = useState(null);
  const [colonia, setColonia] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchProperty(id).then(async (p) => {
      setProperty(p);
      setSaved(isFavorite(p.id));
      const [c, sim] = await Promise.all([fetchColonia(p.colonia_id), fetchSimilar(p.id)]);
      setColonia(c);
      setSimilar(sim);
    }).catch(() => setProperty(null));
  }, [id]);

  if (!property) {
    return (
      <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
        <Navbar user={user} onLogin={onLogin} onLogout={onLogout} />
        <div style={{ padding: 120, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>…</div>
      </div>
    );
  }

  const title = i18n.language === 'en' ? property.titulo_en : property.titulo;
  const description = i18n.language === 'en' ? property.description_en : property.description;
  const onToggleFav = () => setSaved(toggleFavorite(property.id));

  const waPhone = (property.advisor?.phone || '').replace(/\D/g, '');
  const waText = t('detail.wa_prefill', { colonia: property.colonia, title });
  const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(waText)}`;

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navbar user={user} onLogin={onLogin} onLogout={onLogout} />
      <main style={{ paddingTop: 80 }}>
        <section style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 32px 64px' }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>
            <Link to="/marketplace" style={{ color: 'var(--cream-3)', textDecoration: 'none' }}>{t('marketplace.page_title')}</Link>
            {' / '}
            <span style={{ color: 'var(--cream)' }}>{title}</span>
          </div>

          {/* Hero photo */}
          <div style={{ position: 'relative', height: 460, borderRadius: 22, overflow: 'hidden', marginBottom: 24, border: '1px solid var(--border)' }}>
            <div style={{ position: 'absolute', inset: 0 }}><HeroPhoto idx={0} /></div>
            <div style={{ position: 'absolute', top: 16, left: 16 }}>
              <span style={{
                background: 'var(--grad)', color: '#fff',
                borderRadius: 9999, padding: '3px 12px',
                fontFamily: 'Outfit', fontWeight: 700, fontSize: 11,
                letterSpacing: '0.12em', textTransform: 'uppercase',
              }}>
                {t(`listings.tag.${property.tag}`)}
              </span>
            </div>
            <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 8 }}>
              <button onClick={onToggleFav} data-testid="fav-detail"
                className="btn btn-glass btn-sm" style={{ gap: 6 }}>
                <Heart size={13} filled={saved} />
                {saved ? t('detail.favorite_saved') : t('detail.favorite_save')}
              </button>
              <ShareMenu property={property} />
            </div>
            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              padding: '64px 28px 22px',
              background: 'linear-gradient(to top, rgba(6,8,15,0.92), transparent)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <MapPin size={13} color="var(--cream-3)" />
                <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>
                  {property.colonia} · {property.alcaldia}
                </span>
              </div>
              <h1 data-testid="detail-title" style={{
                fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(28px, 4vw, 44px)',
                letterSpacing: '-0.028em', color: 'var(--cream)',
              }}>
                {title}
              </h1>
            </div>
          </div>

          <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 32, alignItems: 'start' }}>
            {/* LEFT column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* Meta + price */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                  {[
                    { Icon: Bed, v: property.beds, unit: t('detail.beds') },
                    { Icon: Bath, v: property.baths, unit: t('detail.baths') },
                    { Icon: Car, v: property.parking, unit: t('detail.parking') },
                    { Icon: Ruler, v: property.sqm, unit: t('detail.sqm') },
                  ].map(({ Icon, v, unit }, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 14px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                    }}>
                      <Icon size={14} color="var(--indigo-3)" />
                      <div>
                        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)' }}>{v}</div>
                        <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)' }}>{unit}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: 'var(--cream)',
                    letterSpacing: '-0.028em',
                  }}>
                    {property.price_display}
                  </div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
                    {property.ppm2_display} · {t('detail.delivery')} {property.delivery}
                  </div>
                </div>
              </div>

              {/* Briefing + WA share */}
              <BriefingCard property={property} />

              {/* Description */}
              <div>
                <div className="eyebrow" style={{ marginBottom: 8 }}>{t('detail.description_h')}</div>
                <p style={{ fontFamily: 'DM Sans', fontSize: 15, color: 'var(--cream-2)', lineHeight: 1.7 }}>
                  {description}
                </p>
              </div>

              {/* Amenities */}
              {property.amenities?.length > 0 && (
                <div>
                  <div className="eyebrow" style={{ marginBottom: 10 }}>{t('detail.amenities_h')}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {property.amenities.map(a => (
                      <span key={a} className="filter-chip active" style={{ cursor: 'default' }}>
                        {t(`detail.amenity.${a}`, a)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Colonia scores breakdown */}
              {colonia && (
                <div style={{
                  background: 'linear-gradient(180deg, #0E1220 0%, #0A0D16 100%)',
                  border: '1px solid var(--border)',
                  borderRadius: 20, padding: 22,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div>
                      <div className="eyebrow" style={{ marginBottom: 4 }}>{t('detail.colonia_h')}</div>
                      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)' }}>
                        {colonia.name}
                      </div>
                    </div>
                    <span className={colonia.momentum_positive ? 'mom-pill mom-up' : 'mom-pill mom-dn'}>
                      {colonia.momentum}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }} className="score-grid">
                    {['vida', 'movilidad', 'seguridad', 'comercio'].map(k => {
                      const Icon = SCORE_ICON[k];
                      return (
                        <div key={k} style={{
                          padding: '14px', borderRadius: 14,
                          background: 'rgba(99,102,241,0.08)',
                          border: '1px solid rgba(99,102,241,0.22)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <Icon size={13} color="var(--indigo-3)" />
                            <span style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11, color: 'var(--indigo-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                              {t(`bento.layers.${k}`)}
                            </span>
                          </div>
                          <div style={{
                            fontFamily: 'Outfit', fontWeight: 800, fontSize: 24,
                            background: 'var(--grad)', WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                          }}>
                            {colonia.scores[k]}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <Link
                    to={`/mapa?colonia=${colonia.id}`}
                    data-testid="colonia-link"
                    style={{
                      marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontFamily: 'DM Sans', fontSize: 13, color: 'var(--indigo-3)', textDecoration: 'none',
                    }}
                  >
                    {t('detail.colonia_link')} <ArrowRight size={12} color="var(--indigo-3)" />
                  </Link>
                </div>
              )}
            </div>

            {/* RIGHT column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{
                padding: 20,
                background: 'linear-gradient(180deg, #0E1220 0%, #0A0D16 100%)',
                border: '1px solid var(--border)',
                borderRadius: 20,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 9999,
                    background: 'var(--grad)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: '#fff',
                  }}>
                    {property.advisor.initials}
                  </div>
                  <div>
                    <div style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 14, color: 'var(--cream)' }}>
                      {property.advisor.name}
                    </div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
                      {t('listings.advisor_role')}
                    </div>
                  </div>
                </div>
                <a href={waUrl} target="_blank" rel="noreferrer" data-testid="wa-advisor-btn"
                  className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                  {t('detail.contact_advisor')}
                  <ArrowRight size={12} />
                </a>
              </div>

              <MortgageCalculator price={property.price} />

              {colonia && <MiniMap center={colonia.center} label={colonia.name} />}
            </div>
          </div>

          {/* Similar */}
          {similar.length > 0 && (
            <section style={{ marginTop: 64 }}>
              <h2 style={{
                fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(22px, 3vw, 32px)',
                letterSpacing: '-0.028em', color: 'var(--cream)', marginBottom: 20,
              }}>
                {t('detail.similar_h')}
              </h2>
              <div className="mkp-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
                {similar.map((p, i) => (
                  <PropertyCard key={p.id} property={p} index={i} />
                ))}
              </div>
            </section>
          )}
        </section>
      </main>

      <style>{`
        @media (max-width: 1000px) {
          .detail-grid { grid-template-columns: 1fr !important; }
          .score-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 680px) {
          .mkp-cards { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
