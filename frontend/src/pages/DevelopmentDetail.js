// Full /desarrollo/:id — 5 tabs + sticky sidebar + paywall gate
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import Navbar from '../components/landing/Navbar';
import { fetchDevelopment } from '../api/marketplace';
import { MapPin, ArrowRight, Sparkle } from '../components/icons';
import PhotoGallery from '../components/dev/PhotoGallery';
import DescriptionTab from '../components/dev/DescriptionTab';
import PriceListTab from '../components/dev/PriceListTab';
import ProgressTab from '../components/dev/ProgressTab';
import AmenitiesTab from '../components/dev/AmenitiesTab';
import LocationTab from '../components/dev/LocationTab';
import Sidebar from '../components/dev/Sidebar';
import RegistrationModal from '../components/dev/RegistrationModal';
import ZoneScoreStrip from '../components/landing/ZoneScoreStrip';
import ScoreExplainModal from '../components/landing/ScoreExplainModal';
import NarrativeBlock from '../components/landing/NarrativeBlock';
import { ComplianceBadgeInline } from '../components/marketplace/ComplianceBadge';
import BriefingIEModal from '../components/advisor/BriefingIEModal';
import CayaBubble from '../components/landing/CayaBubble';

const ADVISOR_ROLES = new Set(['advisor', 'asesor_admin', 'superadmin']);

const STAGE_COLORS = {
  preventa: '#10B981',
  en_construccion: '#F59E0B',
  entrega_inmediata: '#3B82F6',
  exclusiva: '#8B5CF6',
};

export default function DevelopmentDetail({ user, onLogin, onLogout }) {
  const { t } = useTranslation();
  const { id } = useParams();
  const [dev, setDev] = useState(null);
  const [tab, setTab] = useState('descripcion');
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [gateContext, setGateContext] = useState(null);
  const [explain, setExplain] = useState(null); // { zoneId, code } | null
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const leadId = searchParams.get('lead');
  const contactoId = searchParams.get('contacto');
  const isAdvisor = user?.role && ADVISOR_ROLES.has(user.role);

  useEffect(() => {
    let alive = true;
    fetchDevelopment(id).then((d) => { if (alive) setDev(d); }).catch(() => { if (alive) setDev(null); });
    // Phase 7.6: superpone fotos reales de dev_assets si existen.
    const API = process.env.REACT_APP_BACKEND_URL;
    fetch(`${API}/api/developments/${encodeURIComponent(id)}/assets`)
      .then(r => r.ok ? r.json() : null)
      .then((data) => {
        if (!alive || !data) return;
        const photoTypes = ['foto_hero', 'foto_render', 'foto_unidad_modelo'];
        const realPhotos = (data.assets || [])
          .filter(a => photoTypes.includes(a.asset_type))
          .map(a => `${API}${a.public_url}`);
        if (realPhotos.length > 0) {
          setDev((prev) => prev ? { ...prev, photos: realPhotos } : prev);
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [id]);

  // Scroll to #ie-scores anchor when navigated from marketplace badge click
  useEffect(() => {
    if (!dev || window.location.hash !== '#ie-scores') return;
    const t = setTimeout(() => {
      const el = document.getElementById('ie-scores');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
    return () => clearTimeout(t);
  }, [dev]);

  const openGate = (ctx) => {
    setGateContext(ctx || null);
    setGateOpen(true);
  };

  if (!dev) {
    return (
      <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
        <Navbar user={user} onLogin={onLogin} onLogout={onLogout} />
        <div style={{ padding: 120, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>…</div>
      </div>
    );
  }

  const stageColor = STAGE_COLORS[dev.stage] || '#6366F1';
  const tabs = [
    { k: 'descripcion', label: t('dev.tab_desc') },
    { k: 'precios', label: t('dev.tab_prices') },
    { k: 'avance', label: t('dev.tab_progress') },
    { k: 'amenidades', label: t('dev.tab_amen') },
    { k: 'localizacion', label: t('dev.tab_loc') },
  ];

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navbar user={user} onLogin={onLogin} onLogout={onLogout} />
      <main style={{ paddingTop: 80 }}>
        <section style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 32px 64px' }}>

          {/* Header */}
          <div style={{ marginBottom: 20 }}>
            <div className="eyebrow" style={{ marginBottom: 10, letterSpacing: '0.14em' }}>
              <Link to="/marketplace" style={{ color: 'var(--cream-3)', textDecoration: 'none' }}>{t('marketplace.page_title')}</Link>
              {' / '}
              {dev.colonia.toUpperCase()} · {dev.alcaldia.toUpperCase()} · CDMX
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 10 }}>
              <h1 data-testid="dev-h1" style={{
                fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(32px, 4.5vw, 54px)',
                letterSpacing: '-0.028em', color: 'var(--cream)', lineHeight: 1.0, margin: 0,
              }}>
                {dev.name}
              </h1>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <ComplianceBadgeInline devId={dev.id} />
                {dev.verified && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '3px 12px', borderRadius: 9999,
                    background: 'rgba(34,197,94,0.14)', border: '1px solid rgba(34,197,94,0.40)',
                    fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11, color: '#86efac',
                  }}>
                    <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#86efac" strokeWidth={3}><polyline points="20 6 9 17 4 12"/></svg>
                    {t('dev.verified')}
                  </span>
                )}
                <span style={{
                  padding: '3px 12px', borderRadius: 9999,
                  background: stageColor + '22', border: `1px solid ${stageColor}55`, color: stageColor,
                  fontFamily: 'Outfit', fontWeight: 700, fontSize: 11,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                }}>
                  {t(`marketplace_v2.stage.${dev.stage}`)}
                </span>
                {dev.featured && (
                  <span style={{
                    padding: '3px 12px', borderRadius: 9999,
                    background: 'var(--grad)', color: '#fff',
                    fontFamily: 'Outfit', fontWeight: 700, fontSize: 11,
                    letterSpacing: '0.12em', textTransform: 'uppercase',
                  }}>
                    {t('dev.featured')}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--cream-3)' }}>
              <MapPin size={13} color="var(--cream-3)" />
              <span style={{ fontFamily: 'DM Sans', fontSize: 14 }}>{dev.address_full}</span>
            </div>
          </div>

          <PhotoGallery dev={dev} />

          {/* Score IE del proyecto — nueva sección entre hero y tabs (Phase B3) */}
          <section id="ie-scores" data-testid="dev-ie-scores" style={{
            marginTop: 28, padding: '22px 24px',
            background: 'linear-gradient(180deg, rgba(99,102,241,0.06), rgba(236,72,153,0.03))',
            border: '1px solid var(--border)',
            borderRadius: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 6 }}>
              <div>
                <div className="eyebrow" style={{ margin: 0, letterSpacing: '0.14em' }}>Score IE del proyecto</div>
                <h2 style={{
                  fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(20px, 2.6vw, 28px)',
                  letterSpacing: '-0.02em', color: 'var(--cream)', margin: '4px 0 0',
                }}>
                  Cómo mide DMX a <span style={{ background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{dev.name}</span>
                </h2>
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', maxWidth: 360, lineHeight: 1.45 }}>
                12 indicadores cruzan inventario DMX, track record del developer y comparativa de mercado. <strong style={{ color: 'var(--cream)' }}>DMX no opina, mide.</strong>
              </div>
            </div>
            <ZoneScoreStrip
              zoneId={dev.id}
              scope="proyecto"
              limit={8}
              title=" "
              onScoreClick={s => setExplain({ zoneId: dev.id, code: s.code })}
            />
          </section>

          {/* Narrativa AI — N5 (Phase C2) */}
          <section data-testid="dev-narrative-section" style={{ marginTop: 20 }}>
            <NarrativeBlock scope="development" entityId={dev.id} />
          </section>

          {/* Layout */}
          <div className="dev-grid" style={{
            display: 'grid', gridTemplateColumns: '1fr 380px', gap: 32,
            alignItems: 'start', marginTop: 28,
          }}>
            <div>
              {/* Tab nav */}
              <div style={{
                display: 'flex', gap: 4,
                padding: 6,
                background: '#0D1118',
                border: '1px solid var(--border)',
                borderRadius: 9999,
                marginBottom: 22,
                overflowX: 'auto',
              }} data-testid="tab-nav">
                {tabs.map(t0 => {
                  const active = tab === t0.k;
                  return (
                    <button key={t0.k}
                      data-testid={`tab-${t0.k}`}
                      onClick={() => setTab(t0.k)}
                      style={{
                        padding: '9px 18px', borderRadius: 9999,
                        background: active ? 'var(--grad)' : 'transparent',
                        border: 'none',
                        color: active ? '#fff' : 'var(--cream-2)',
                        fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}>
                      {t0.label}
                    </button>
                  );
                })}
              </div>

              {/* Active tab content */}
              {tab === 'descripcion' && <DescriptionTab dev={dev} />}
              {tab === 'precios' && (
                <PriceListTab dev={dev} user={user}
                  onGateOpen={openGate}
                  selectedUnit={selectedUnit}
                  onSelectUnit={setSelectedUnit} />
              )}
              {tab === 'avance' && <ProgressTab dev={dev} user={user} onGateOpen={openGate} />}
              {tab === 'amenidades' && <AmenitiesTab dev={dev} />}
              {tab === 'localizacion' && <LocationTab dev={dev} user={user} onGateOpen={openGate} />}
            </div>

            <div>
              <Sidebar dev={dev} selectedUnit={selectedUnit} onLogin={onLogin} user={user} />
              {isAdvisor && (
                <button
                  data-testid="briefing-ie-cta"
                  onClick={() => setBriefingOpen(true)}
                  style={{
                    marginTop: 12, width: '100%',
                    padding: '13px 20px', borderRadius: 9999,
                    background: 'var(--grad)',
                    border: 'none', color: '#fff',
                    fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                    letterSpacing: '0.02em',
                    cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: '0 8px 22px rgba(236,72,153,0.28)',
                    transition: 'transform 360ms cubic-bezier(0.22,1,0.36,1)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
                >
                  <Sparkle size={13} /> Briefing IE para cliente
                </button>
              )}
            </div>
          </div>
        </section>
      </main>

      <RegistrationModal
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        onLogin={onLogin}
        context={gateContext}
      />

      <ScoreExplainModal
        open={!!explain}
        zoneId={explain?.zoneId}
        code={explain?.code}
        onClose={() => setExplain(null)}
      />

      <BriefingIEModal
        open={briefingOpen}
        development={dev}
        leadId={leadId}
        contactId={contactoId}
        onClose={() => setBriefingOpen(false)}
      />

      <style>{`
        @media (max-width: 900px) {
          .dev-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <CayaBubble />
    </div>
  );
}
