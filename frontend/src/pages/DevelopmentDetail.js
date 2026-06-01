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
// W6.MOV.3 — Reviews Residentes
import DevReviewsBlock from '../components/property/DevReviewsBlock';
// W5.x F4 — Narrative Layer LLM (cross-feature storyteller)
import NarrativeBlockLLM from '../components/NarrativeBlock';
// W5.x F7 — Lead Capture (behavioral tracker + modal)
import useBehavioralTracker from '../hooks/useBehavioralTracker';
import LeadCaptureModal from '../components/leadCapture/LeadCaptureModal';
import { ComplianceBadgeInline } from '../components/marketplace/ComplianceBadge';
import AvmConfidenceRange from '../components/shared/AvmConfidenceRange';
import BriefingIEModal from '../components/advisor/BriefingIEModal';
import ProbabilityBar from '../components/shared/ProbabilityBar';
import AtlaxBubble from '../components/landing/AtlaxBubble';
// Phase 4 Batch 27 — Mortgage + Tour + WA CTA
import MortgageCalculator from '../components/marketplace/MortgageCalculator';
import VirtualTourPlaceholder from '../components/marketplace/VirtualTourPlaceholder';
import WhatsAppAsesorCTA from '../components/marketplace/WhatsAppAsesorCTA';
// Phase 4 Batch 28 — buyer view tracking (auth-gated)
import { trackPropertyView } from '../lib/funnelTracker';
// W4.2B — SEO structured data
import StructuredData from '../components/seo/StructuredData';
// W4.14 — Investment Simulator embed
import InvestmentSimulator from '../components/investment/InvestmentSimulator';
// W4.9 — Brochure Generator
import BrochureGenerator from '../components/brochure/BrochureGenerator';
// W4.9.6 — 3DGS Tour
import Tour3DViewer from '../components/tour3d/Tour3DViewer';
import Tour3DOnboardingWizard from '../components/tour3d/Tour3DOnboardingWizard';
// W6.MOV.5 — Construction Quality Badge
import ConstructionQualityBadge from '../components/property/ConstructionQualityBadge';
import { getQualityIndex } from '../api/constructionQuality';

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
  const [brochureOpen, setBrochureOpen] = useState(false);
  // W6.MOV.5 — Construction Quality Index (score + breakdown 4 dims)
  const [cqData, setCqData] = useState(null);
  const [searchParams] = useSearchParams();
  const leadId = searchParams.get('lead');
  const contactoId = searchParams.get('contacto');
  const isAdvisor = user?.role && ADVISOR_ROLES.has(user.role);

  // W5.x F7 — Behavioral tracker (escucha scroll/time/exit-intent · dispara modal vía CustomEvent)
  useBehavioralTracker({ enabled: !!dev?.id, pageType: 'development', entityId: dev?.id });

  useEffect(() => {
    let alive = true;
    fetchDevelopment(id).then((d) => { if (alive) setDev(d); }).catch(() => { if (alive) setDev(null); });
    // Phase 4 Batch 28 — buyer view tracking (silent if not authenticated)
    trackPropertyView(id, 'marketplace');
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

  // W6.MOV.5 — Fetch construction quality index (best-effort · no bloquea render si falla)
  useEffect(() => {
    if (!id) return;
    let alive = true;
    getQualityIndex(id)
      .then((data) => { if (alive) setCqData(data); })
      .catch(() => { if (alive) setCqData(null); });
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

  // W5.16 · Social card dinámico og:image (additive · pattern ColoniaLanding)
  useEffect(() => {
    if (!id) return;
    const API = process.env.REACT_APP_BACKEND_URL;
    if (!API) return;
    const og = document.querySelector('meta[property="og:image"]') || (() => {
      const m = document.createElement('meta');
      m.setAttribute('property', 'og:image');
      document.head.appendChild(m);
      return m;
    })();
    og.setAttribute('content', `${API}/api/social-cards/og/development/${encodeURIComponent(id)}.png`);
    const tw = document.querySelector('meta[name="twitter:card"]') || (() => {
      const m = document.createElement('meta');
      m.setAttribute('name', 'twitter:card');
      document.head.appendChild(m);
      return m;
    })();
    tw.setAttribute('content', 'summary_large_image');
  }, [id]);

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
    { k: 'tour', label: 'Tour 360°' },
    { k: 'tour_3d', label: 'Tour 3D' },
    { k: 'hipoteca', label: 'Hipoteca' },
  ];

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navbar user={user} onLogin={onLogin} onLogout={onLogout} />
      {/* W4.2B — RealEstateListing structured data */}
      <StructuredData
        type="RealEstateListing"
        data={{
          name: dev.name,
          description: dev.description || '',
          url: `https://desarrollosmx.io/desarrollo/${dev.id}`,
          image: (dev.images || [])[0] || '',
          address: dev.address_full || '',
          colonia: dev.colonia || '',
          postal_code: dev.postal_code || '',
          lat: dev.center ? dev.center[1] : undefined,
          lng: dev.center ? dev.center[0] : undefined,
          price_from: dev.price_from,
          price_to: dev.price_to,
          m2_range: dev.m2_range,
        }}
      />
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
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <ComplianceBadgeInline devId={dev.id} />
                {cqData && cqData.score !== null && (
                  <ConstructionQualityBadge
                    score={cqData.score}
                    tier={cqData.tier}
                    breakdown={cqData.breakdown}
                    developmentName={dev.name}
                    hasBreakdown={!cqData.manual_override}
                    size="sm"
                  />
                )}
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

          {/* W6.MOV.3 — Reviews Residentes para el desarrollo */}
          <section data-testid="dev-reviews-residents-section" style={{ marginTop: 20 }}>
            <DevReviewsBlock devId={dev.id} />
          </section>

          {/* W5.x F4 — Narrative Layer LLM cross-feature (project audience) */}
          <section data-testid="dev-narrative-layer-section" style={{ marginTop: 20 }}>
            <NarrativeBlockLLM scope="project" entityId={dev.id} audience="neutral" />
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
              {tab === 'tour' && (
                <VirtualTourPlaceholder
                  propiedadId={dev.id}
                  propiedadNombre={dev.name}
                  tourUrl={dev.virtual_tour_url}
                />
              )}
              {tab === 'tour_3d' && (
                <Tour3DTabPanel
                  unitId={selectedUnit?.id || dev.id}
                  projectSlug={dev.id}
                  devId={dev.dev_org_id || dev.developer_id}
                  isAdvisor={isAdvisor}
                />
              )}
              {tab === 'hipoteca' && (
                <MortgageCalculator
                  variant="inline"
                  propiedadId={dev.id}
                  propiedadNombre={dev.name}
                  precioInicial={dev.price_from || 0}
                />
              )}
            </div>

            {/* W5.15 P2 — AVM Confidence Range para este desarrollo */}
            <div style={{ marginTop: 24 }}>
              <AvmConfidenceRange property_id={`${dev.colonia_slug || dev.colonia || 'cdmx'}_dev_${dev.id}`} />
            </div>

            {/* W4.14 — Investment Simulator embed (siempre visible debajo de tabs) */}
            <div style={{ marginTop: 32 }}>
              <div style={{
                background: 'rgba(13,16,23,0.9)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 14, padding: '20px 20px',
              }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)', marginBottom: 4 }}>
                  Simulador de inversión
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginBottom: 18 }}>
                  Calcula ROI, TIR y flujo de caja en 3 escenarios para este desarrollo
                </div>
                <InvestmentSimulator
                  compact
                  prefilled={{
                    precio: dev.price_from,
                    m2: dev.m2_from || 80,
                    colonia: dev.zone_id || 'del-valle',
                  }}
                />
              </div>
            </div>

            <div>
              <Sidebar dev={dev} selectedUnit={selectedUnit} onLogin={onLogin} user={user} />
              {/* W5.19 — Probability Bar: sells_complete 12m */}
              <div style={{ marginTop: 14 }}>
                <ProbabilityBar
                  type="sells_complete"
                  entity_id={dev.id}
                  params={{ months: 12 }}
                />
              </div>
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
              {isAdvisor && (
                <button
                  data-testid="brochure-generate-cta"
                  onClick={() => setBrochureOpen(true)}
                  style={{
                    marginTop: 10, width: '100%',
                    padding: '12px 20px', borderRadius: 9999,
                    background: 'transparent',
                    border: '1px solid rgba(240,235,224,0.3)',
                    color: 'var(--cream)',
                    fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                    letterSpacing: '0.02em',
                    cursor: 'pointer',
                  }}
                >
                  Generar brochure PDF
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

      {brochureOpen && (
        <BrochureGenerator
          projectId={dev.id}
          projectName={dev.name}
          onClose={() => setBrochureOpen(false)}
        />
      )}

      <style>{`
        @media (max-width: 900px) {
          .dev-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <AtlaxBubble />
      <WhatsAppAsesorCTA
        asesorPhone={dev.asesor_phone}
        propiedadNombre={dev.name}
      />
      {/* W5.x F7 — Lead Capture Modal · self-mounted via lead_capture_trigger event */}
      <LeadCaptureModal
        entityId={dev?.id}
        propertyScope="project"
        propertyTitle={dev?.name}
        sourcePage={typeof window !== 'undefined' ? window.location.pathname : '/desarrollo'}
      />
    </div>
  );
}

// ─── Tour 3D Tab Panel ────────────────────────────────────────────────────────
function Tour3DTabPanel({ unitId, projectSlug, devId, isAdvisor }) {
  const [scan, setScan] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const API_BASE = process.env.REACT_APP_BACKEND_URL;

  const loadScan = React.useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (unitId) params.set('unit_id', unitId);
    if (projectSlug) params.set('project_slug', projectSlug);
    params.set('limit', '1');
    fetch(`${API_BASE}/api/tour-3dgs/scans?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setScan(d?.items?.[0] || null);
      })
      .catch(() => setScan(null))
      .finally(() => setLoading(false));
  }, [API_BASE, unitId, projectSlug]);

  React.useEffect(() => { loadScan(); }, [loadScan]);

  if (loading) {
    return (
      <div data-testid="unit-tab-tour-3d" style={{
        padding: 40, textAlign: 'center', color: 'var(--cream-3)',
        fontFamily: 'DM Sans', fontSize: 13,
      }}>
        Cargando tour 3D…
      </div>
    );
  }

  if (!scan) {
    return (
      <div data-testid="unit-tab-tour-3d" style={{
        padding: 40, textAlign: 'center',
        background: 'rgba(13,16,23,0.5)',
        border: '1px solid rgba(240,235,224,0.08)',
        borderRadius: 14,
      }}>
        <div data-testid="tour-empty-state" style={{
          fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', marginBottom: 6,
        }}>
          Tour 3D no disponible
        </div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', marginBottom: 18 }}>
          Próximamente compartiremos un tour 3D inmersivo de esta unidad.
        </div>
        {isAdvisor && (
          <button
            type="button"
            data-testid="tour-capture-btn"
            onClick={() => setWizardOpen(true)}
            style={{
              background: 'linear-gradient(90deg, #6366F1, #EC4899)',
              color: '#fff', border: 'none', borderRadius: 9999,
              padding: '10px 22px',
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 12, letterSpacing: '0.1em',
              cursor: 'pointer',
            }}
          >
            CAPTURAR TOUR 3D
          </button>
        )}
        {wizardOpen && (
          <Tour3DOnboardingWizard
            unitId={unitId}
            projectSlug={projectSlug}
            devId={devId}
            onClose={() => setWizardOpen(false)}
            onCreated={() => { setWizardOpen(false); loadScan(); }}
          />
        )}
      </div>
    );
  }

  if (scan.status === 'processing') {
    return (
      <div data-testid="unit-tab-tour-3d" style={{
        padding: 40, textAlign: 'center',
        background: 'rgba(99,102,241,0.06)',
        border: '1px solid rgba(99,102,241,0.25)',
        borderRadius: 14,
        color: 'var(--cream)',
      }}>
        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15 }}>
          Procesando tour 3D
        </div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 8 }}>
          Te avisaremos cuando esté listo.
        </div>
      </div>
    );
  }

  if (scan.status === 'failed') {
    return (
      <div data-testid="unit-tab-tour-3d" style={{
        padding: 30, textAlign: 'center',
        background: 'rgba(239,68,68,0.08)',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 14,
        color: 'var(--cream)',
      }}>
        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15 }}>
          El procesamiento falló
        </div>
        {isAdvisor && (
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            style={{
              marginTop: 16,
              background: 'linear-gradient(90deg, #6366F1, #EC4899)',
              color: '#fff', border: 'none', borderRadius: 9999,
              padding: '9px 20px',
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 11, letterSpacing: '0.1em',
              cursor: 'pointer',
            }}
          >
            REINTENTAR
          </button>
        )}
        {wizardOpen && (
          <Tour3DOnboardingWizard
            unitId={unitId}
            projectSlug={projectSlug}
            devId={devId}
            onClose={() => setWizardOpen(false)}
            onCreated={() => { setWizardOpen(false); loadScan(); }}
          />
        )}
      </div>
    );
  }

  return (
    <div data-testid="unit-tab-tour-3d">
      <Tour3DViewer
        scanId={scan.scan_id}
        viewerConfig={scan.viewer_config}
        theme="cream"
        uiMode="full"
      />
    </div>
  );
}
