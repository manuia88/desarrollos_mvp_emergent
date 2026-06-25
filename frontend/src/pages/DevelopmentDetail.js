// Full /desarrollo/:id — 5 tabs + sticky sidebar + paywall gate
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { LightScope, PublicNav } from '../components/ui';
import { sendBuyerSignal, fetchInteres, visitorId } from '../lib/buyerSignal';
import { readMatchCriteria } from '../lib/unitMatch';
import { tc } from '../lib/titleCase';
import { fetchDevelopment, fetchDevelopmentAssets, fetchSimilarDevelopments } from '../api/marketplace';
import { MapPin, ArrowRight, Sparkle } from '../components/icons';
import PhotoGallery from '../components/dev/PhotoGallery';
import DescriptionTab from '../components/dev/DescriptionTab';
import PriceListTab from '../components/dev/PriceListTab';
import UnidadesPorTipo from '../components/dev/UnidadesPorTipo';
import ProgressTab from '../components/dev/ProgressTab';
import AmenitiesTab from '../components/dev/AmenitiesTab';
import LocationTab from '../components/dev/LocationTab';
import Sidebar from '../components/dev/Sidebar';
import RegistrationModal from '../components/dev/RegistrationModal';
import ScoreExplainModal from '../components/landing/ScoreExplainModal';
// W6.MOV.3 — Reviews Residentes
import DevReviewsBlock from '../components/property/DevReviewsBlock';
// W5.x F4 — Narrative Layer LLM (cross-feature storyteller)
// W5.x F7 — Lead Capture (behavioral tracker + modal)
import useBehavioralTracker from '../hooks/useBehavioralTracker';
import LeadCaptureModal from '../components/leadCapture/LeadCaptureModal';
import { resolvePricingExperiment, trackPricingEvent } from '../api/leads';
import { ComplianceBadgeInline } from '../components/marketplace/ComplianceBadge';
import AvmConfidenceRange from '../components/shared/AvmConfidenceRange';
import BriefingIEModal from '../components/advisor/BriefingIEModal';
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
import MarketValueCard from '../components/marketplace/MarketValueCard';
import ForecastChart from '../components/forecast/ForecastChart';
import ProbabilityCard from '../components/probability/ProbabilityCard';
import BuySignal from '../components/marketplace/BuySignal';
import VeredictoDesarrollo from '../components/marketplace/VeredictoDesarrollo';
import DemandaZonaCard from '../components/marketplace/DemandaZonaCard';
import GeneralidadesDev from '../components/marketplace/GeneralidadesDev';
import PerfilLente from '../components/marketplace/PerfilLente';
import RiesgosHonestos from '../components/marketplace/RiesgosHonestos';
import OwnershipCalculator from '../components/marketplace/OwnershipCalculator';
// B2 — Cables a Marketplace: lo que el dev configuró, visible para el comprador
import DevConfigSections from '../components/marketplace/DevConfigSections';
import PublicCotizador from '../components/marketplace/PublicCotizador';
import PlusvaliaCard from '../components/marketplace/PlusvaliaCard';

const ADVISOR_ROLES = new Set(['advisor', 'asesor_admin', 'superadmin']);

const STAGE_COLORS = {
  preventa: '#10B981',
  en_construccion: '#F59E0B',
  entrega_inmediata: '#3B82F6',
  exclusiva: '#8B5CF6',
};

// Pricing Lab · lado VISITANTE (A/B). visitor_id anónimo persistente + aplicación segura del modificador.
function _getVisitorId() {
  try {
    let v = localStorage.getItem('dmx_visitor_id');
    if (!v) { v = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('dmx_visitor_id', v); }
    return v;
  } catch (_) { return 'v_anon'; }
}
function _applyPriceMod(base, mod) {
  const n = Number(base);
  if (!mod || mod.value == null || !Number.isFinite(n)) return base;
  const v = Number(mod.value);
  const out = mod.type === 'percent' ? n * (1 + v / 100)
            : mod.type === 'absolute' ? n + v
            : mod.type === 'fixed' ? v : n;
  // Clamp de seguridad: nunca <=0 ni > 3x el base (jamás romper el embudo con un precio absurdo)
  if (!Number.isFinite(out) || out <= 0 || out > n * 3) return base;
  return Math.round(out);
}

export default function DevelopmentDetail({ user, onLogin, onLogout }) {
  const { t } = useTranslation();
  const { id } = useParams();
  // Ficha consciente: la última búsqueda del comprador → resaltar las unidades que cumplen en la lista de precios.
  const [matchCriteria] = useState(() => readMatchCriteria());
  const [dev, setDev] = useState(null);
  const [pxExp, setPxExp] = useState(null); // experiment_id activo para rastrear el lead
  // Default a 'precios': en un marketplace lo primero que el comprador quiere ver es la lista
  // de precios (unidades + m² + estado). Antes caía en 'descripcion' y la lista quedaba escondida.
  const [tab, setTab] = useState('precios');
  const [finTab, setFinTab] = useState('rento');   // sub-tab de la sección "Tu dinero" (4 calculadoras unificadas)
  const [similares, setSimilares] = useState([]);  // "¿qué más me gusta?" — desarrollos parecidos a este
  const [showPrecio, setShowPrecio] = useState(false);  // detalle del veredicto de precio (BuySignal) colapsable
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [gateContext, setGateContext] = useState(null);
  const [explain, setExplain] = useState(null); // { zoneId, code } | null
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [brochureOpen, setBrochureOpen] = useState(false);
  // W6.MOV.5 — Construction Quality Index (score + breakdown 4 dims)
  const [cqData, setCqData] = useState(null);
  // Copiloto · espinazo: interés agregado del desarrollo (prueba social · k-anon).
  const [interes, setInteres] = useState(null);
  const [searchParams] = useSearchParams();
  const leadId = searchParams.get('lead');
  const contactoId = searchParams.get('contacto');
  const isAdvisor = user?.role && ADVISOR_ROLES.has(user.role);

  // Tema CLARO a nivel <body> (rediseño) → mata el fondo NEGRO residual (#06080F) detrás del LightScope. Antes la ficha
  // dejaba el body oscuro (faltaba esto que sí hacen las demás páginas públicas) → bordes/abajo en negro.
  useEffect(() => {
    document.body.classList.add('public-light');
    return () => document.body.classList.remove('public-light');
  }, []);

  // "¿Qué más me gusta?" — trae desarrollos parecidos (motor /similar, antes huérfano). Engancha: nunca "solo vi este".
  useEffect(() => {
    if (!dev?.id) return;
    let alive = true;
    fetchSimilarDevelopments(dev.id).then((r) => { if (alive) setSimilares(Array.isArray(r) ? r : (r?.similar || [])); }).catch(() => {});
  }, [dev?.id]);

  // W5.x F7 — Behavioral tracker (escucha scroll/time/exit-intent · dispara modal vía CustomEvent)
  useBehavioralTracker({ enabled: !!dev?.id, pageType: 'development', entityId: dev?.id });

  // Copiloto · espinazo: registra la VISTA de ficha + el TIEMPO (dwell) al salir + trae el interés (prueba social).
  useEffect(() => {
    if (!dev?.id) return;
    const t0 = Date.now();
    sendBuyerSignal('ficha_view', { entity_id: dev.id, colonia: dev.colonia });
    fetchInteres(dev.id).then(setInteres);
    return () => {
      const ms = Date.now() - t0;
      if (ms > 1500) sendBuyerSignal('dwell', { entity_id: dev.id, colonia: dev.colonia, dwell_ms: Math.min(ms, 600000) });
    };
  }, [dev?.id, dev?.colonia]);

  useEffect(() => {
    let alive = true;
    fetchDevelopment(id).then(async (d) => {
      if (!alive) return;
      // Pricing Lab · lado VISITANTE: descubre experimento activo, registra la VISTA y aplica
      // la variante de precio para este visitante. Fail-open: si falla, precio base intacto.
      try {
        const px = await resolvePricingExperiment({ visitor_id: _getVisitorId(), project_id: id });
        if (px?.active && d) {
          d = { ...d,
            price_from: _applyPriceMod(d.price_from, px.price_modifier),
            price_to: _applyPriceMod(d.price_to, px.price_modifier),
          };
          if (alive) setPxExp(px.experiment_id);
        }
      } catch (_) { /* fail-open */ }
      if (alive) setDev(d);
    }).catch(() => { if (alive) setDev(null); });
    // Phase 4 Batch 28 — buyer view tracking (silent if not authenticated)
    trackPropertyView(id, 'marketplace');
    // Cross-Portal v2 · fotos REALES del dev (dev_assets) sobre el seed. El endpoint ya filtra
    // del lado servidor a solo tipos de marketing (planos técnicos bloqueados), así que el front
    // confía en lo que llega. Tipos de foto para el carrusel (tour/video/brochure son otra UI).
    const API = process.env.REACT_APP_BACKEND_URL;
    fetchDevelopmentAssets(id)
      .then((data) => {
        if (!alive || !data) return;
        const photoTypes = ['foto_hero', 'foto_render', 'foto_unidad_modelo', 'foto_avance'];
        const realPhotos = (data.assets || [])
          .filter(a => photoTypes.includes(a.asset_type) && a.public_url)
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

  // ALTO INTENTO: si el comprador se logueó tras abrir un gate (agendar/contactar/cotizar/desbloquear), se vuelve
  // lead con su perfil (usa el email del usuario + su visitor_id). El login casual del header NO pasa por aquí.
  const [promoted, setPromoted] = useState(false);
  useEffect(() => {
    if (user && gateContext && !promoted) {
      setPromoted(true);
      setGateOpen(false);
      const API = process.env.REACT_APP_BACKEND_URL;
      fetch(`${API}/api/buyer/promote`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitor_id: visitorId(), dev_id: dev?.id, source: `ficha_${(gateContext && gateContext.source) || 'gate'}` }),
      }).catch(() => {});
    }
  }, [user, gateContext, promoted, dev]);

  if (!dev) {
    return (
      <LightScope>
        <PublicNav />
        <div style={{ padding: 120, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>…</div>
      </LightScope>
    );
  }

  const stageColor = STAGE_COLORS[dev.stage] || '#6366F1';
  const tabs = [
    { k: 'descripcion', label: tc(t('dev.tab_desc')) },
    { k: 'precios', label: tc(t('dev.tab_prices')) },
    { k: 'avance', label: tc(t('dev.tab_progress')) },
    { k: 'amenidades', label: tc(t('dev.tab_amen')) },
    { k: 'localizacion', label: tc(t('dev.tab_loc')) },
    { k: 'tour', label: tc('Tour 360°') },
    { k: 'tour_3d', label: tc('Tour 3D') },
    // 'hipoteca' reubicada → sección "Tu dinero" (sub-tab "Con crédito"), arriba.
  ];

  return (
    <LightScope>
      <PublicNav />
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
        <section style={{ maxWidth: 1600, width: '94%', margin: '0 auto', padding: '20px 0 64px' }}>

          {/* Header */}
          <div style={{ marginBottom: 20 }}>
            <div className="eyebrow" style={{ marginBottom: 10, letterSpacing: '0.14em' }}>
              <Link to="/marketplace" style={{ color: 'var(--cream-3)', textDecoration: 'none' }}>{t('marketplace.page_title')}</Link>
              {' / '}
              {dev.colonia.toUpperCase()} · {dev.alcaldia.toUpperCase()} · CDMX
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 10 }}>
              <h1 data-testid="dev-h1" style={{
                fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 'clamp(34px, 5vw, 60px)',
                letterSpacing: '-0.01em', color: 'var(--cream)', lineHeight: 1.04, margin: 0,
              }}>
                {dev.name}
              </h1>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Copiloto · prueba social del espinazo (interés agregado, k-anon) */}
                {interes && (interes.likes > 0 || interes.saves > 0) && (
                  <span data-testid="dev-interes" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 12px', borderRadius: 9999,
                    background: 'rgba(236,72,153,0.10)', border: '1px solid rgba(236,72,153,0.3)',
                    fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, color: '#DB2777',
                  }}>
                    🔥 {interes.likes >= interes.saves ? `${interes.likes} le dieron like` : `${interes.saves} lo guardaron`}{interes.interes === 'alto' ? ' · muy buscado' : ''}
                  </span>
                )}
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

          {/* ═══ ACTO 1 · HERO DE DATOS — el gancho: precio GIGANTE + lo que importa de un vistazo + siguiente paso. ═══ */}
          {(() => {
            return (
              <div data-testid="dev-hero-stats" style={{
                marginTop: 22, padding: 'clamp(20px,3vw,30px)', borderRadius: 24,
                background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(236,72,153,0.07) 60%, rgba(16,185,129,0.05))',
                border: '1px solid rgba(99,102,241,0.22)', boxShadow: '0 20px 60px rgba(99,102,241,0.10)',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 'clamp(20px,4vw,48px)', flexWrap: 'wrap',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div className="eyebrow" style={{ color: 'var(--theme)', margin: 0 }}>Precio · {t(`marketplace_v2.stage.${dev.stage}`)}</div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(40px,6vw,64px)', lineHeight: 0.92, letterSpacing: '-0.035em', background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', marginTop: 6 }}>
                    {dev.price_from_display || (dev.price_from ? `$${Number(dev.price_from).toLocaleString('es-MX')}` : '—')}
                  </div>
                  {dev.price_to && dev.price_to !== dev.price_from && <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', marginTop: 8 }}>hasta <b style={{ color: 'var(--cream)' }}>${Number(dev.price_to).toLocaleString('es-MX')}</b> · entrega {dev.delivery_estimate}</div>}
                </div>
                {/* (stats recámaras/m²/estac → movidos a Generalidades, abajo, para no duplicar) */}
                <button onClick={() => openGate({ source: 'hero', dev_id: dev.id, dev_name: dev.name })} data-testid="hero-cta"
                  style={{ padding: '15px 28px', borderRadius: 14, border: 'none', background: 'var(--grad)', color: '#fff', fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 16, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 10px 30px rgba(99,102,241,0.3)' }}>
                  Me interesa · ver precios y disponibilidad →
                </button>
              </div>
            );
          })()}

          {/* ═══ 2 COLUMNAS · contenido (izq) + RIEL DE DECISIÓN sticky (der) que te sigue toda la ficha (no solo abajo) ═══ */}
          <div className="ficha-2col" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 36, alignItems: 'start', marginTop: 22 }}>
            {/* —— Columna izquierda: el contenido —— */}
            <div style={{ minWidth: 0 }}>

          {/* ═══ GENERALIDADES — lo esencial del desarrollo PRIMERO (características/entrega/precio-m²/desarrollador/
              amenidades/formas de pago). Lo que un comprador quiere saber al entrar, antes de cualquier análisis. ═══ */}
          <GeneralidadesDev dev={dev} />

          {/* DESCRIPCIÓN editorial — prosa del proyecto arriba (como nolab/kplr), no enterrada en una tab. */}
          {dev.description && (
            <section data-testid="descripcion" style={{ marginTop: 26 }}>
              <div className="eyebrow" style={{ color: 'var(--theme)' }}>El proyecto</div>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 'clamp(15px,1.6vw,17.5px)', lineHeight: 1.75, color: 'var(--cream-2)', margin: '8px 0 0', maxWidth: 760, whiteSpace: 'pre-line' }}>{dev.description}</p>
            </section>
          )}

          {/* ═══ ACTO 2 · LENTE DE PERFIL — '¿para qué lo quieres?' (lo de las tabs de colonia, para ESTE desarrollo). ═══ */}
          <PerfilLente dev={dev}
            onPerfilChange={(p) => setFinTab({ invertir: 'inversion', primera: 'credito', plan: 'plan', vivir: 'rento', familia: 'rento' }[p] || 'rento')}
            onGoTo={(tid) => { const el = document.querySelector(`[data-testid="${tid}"]`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} />

          {/* CORONA · Veredicto del Desarrollo — sube al tope el veredicto (BuySignal) + plusvalía + zona +
              catastral en un hero glanceable, y cierra ciclo (Atlax agéntico / lead → Cerebro). */}
          <VeredictoDesarrollo
            devId={dev.id}
            onContact={() => openGate({ source: 'veredicto_corona', dev_id: dev.id, dev_name: dev.name })}
            onAskAtlax={() => window.dispatchEvent(new CustomEvent('dmx:ask-atlax', { detail: { devId: dev.id, devName: dev.name, colonia: dev.colonia } }))}
          />

          {/* Demanda viva de la zona — social proof honesto (radar de demanda). Solo aparece si hay búsquedas reales. */}
          <DemandaZonaCard colonia={dev.colonia_id || dev.colonia} coloniaNombre={dev.colonia} />

          {/* Detalle del veredicto de precio — el "por qué" (escala obra-nueva, prima de estrenar = valor, catastral, momento).
              Colapsable: el veredicto ya se ve en la corona; aquí el comprador profundiza sin repetir el badge. */}
          <div style={{ marginTop: 14 }}>
            <button onClick={() => setShowPrecio((s) => !s)} data-testid="toggle-precio" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 12,
              border: '1px solid var(--card-border, var(--border))', background: 'var(--surface-card)', cursor: 'pointer',
              fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 14, color: 'var(--cream)',
            }}>
              {showPrecio ? 'Ocultar el análisis de precio' : '¿Por qué este precio es justo? Ver el análisis'}
              <span style={{ transform: showPrecio ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'var(--theme)' }}>▾</span>
            </button>
            {showPrecio && <div style={{ marginTop: 14 }}><BuySignal devId={dev.id} /></div>}
          </div>

          {/* (Score IE "Cómo mide DMX" → removido del marketplace público · es métrica interna del dev, no ayuda a comprar) */}

          {/* ═══ EL VALOR — ¿cuánto vale y hacia dónde va? (valuación + pronóstico + plusvalía-desde-lanzamiento, UNA vez).
              Va ANTES de Tu dinero: primero entiendes el valor, luego cómo pagarlo. ═══ */}
          <section data-testid="valuacion" style={{ marginTop: 24 }}>
            <div className="eyebrow" style={{ color: 'var(--theme)' }}>El valor</div>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(20px,2.8vw,30px)', letterSpacing: '-0.02em', color: 'var(--cream)', margin: '4px 0 18px' }}>¿Cuánto vale y hacia dónde va?</h2>
            <div style={{ display: 'grid', gap: 16 }}>
              <MarketValueCard colonia={dev.colonia_id || dev.colonia} />
              {(dev.colonia_id || dev.colonia) && <ForecastChart mode="zone" slug={dev.colonia_id || dev.colonia} hideIfEmpty />}
              {(dev.colonia_id || dev.colonia) && <ProbabilityCard type="drpi_up" id={dev.colonia_id || dev.colonia} months={12} hideIfEmpty />}
              <PlusvaliaCard
                plusvaliaPct={dev.config?.plusvalia_desde_lanzamiento_pct}
                priceHistory={dev.price_history}
              />
            </div>
          </section>

          {/* TU DINERO — las 4 herramientas financieras (rento/plan/crédito/inversión) DESPUÉS de entender el valor. */}
          <section data-testid="tu-dinero" style={{ marginTop: 28, background: 'var(--surface-card)', border: '1px solid var(--card-border, var(--border))', borderRadius: 18, padding: 'clamp(18px,2.4vw,26px)' }}>
            <div className="eyebrow" style={{ color: 'var(--theme)', marginBottom: 4 }}>Tu dinero</div>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(20px,2.6vw,28px)', letterSpacing: '-0.02em', color: 'var(--cream)', margin: '0 0 4px' }}>¿Cómo te conviene comprarlo?</h2>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', margin: '0 0 16px' }}>Mira la respuesta de cada vía y abre la que te late.</p>
            {/* TIRA DE RESPUESTAS — el número clave de cada vía de un vistazo; clic abre su calculadora (más eficiente que 4 tabs ciegas) */}
            {(() => {
              const _i = 0.1145 / 12, _pf = _i / (1 - (1 + _i) ** (-240));
              const _eng = Math.round((dev.price_from || 0) * 0.20);
              const _mens = dev.price_from ? Math.round((dev.price_from - _eng) * _pf) : 0;
              const _m = (n) => `$${Number(n).toLocaleString('es-MX')}`;
              const CARDS = [
                { k: 'rento', t: '¿Rentar o comprar?', n: 'Compáralo', d: 'patrimonio vs renta' },
                { k: 'plan', t: 'Plan del dev', n: 'En preventa', d: 'enganche + mensualidades' },
                { k: 'credito', t: 'Con crédito', n: _mens ? `${_m(_mens)}/mes` : '—', d: `enganche ${_m(_eng)}` },
                { k: 'inversion', t: 'Como inversión', n: 'ROI y TIR', d: 'vs CETES' },
              ];
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 22 }}>
                  {CARDS.map((c) => {
                    const a = finTab === c.k;
                    return (
                      <button key={c.k} data-testid={`fin-tab-${c.k}`} onClick={() => setFinTab(c.k)} style={{
                        textAlign: 'left', padding: '13px 15px', borderRadius: 14, cursor: 'pointer',
                        border: a ? '1px solid var(--theme)' : '1px solid var(--card-border, var(--border))',
                        background: a ? 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(236,72,153,0.06))' : 'var(--bg, transparent)',
                        boxShadow: a ? '0 0 0 1px var(--theme)' : 'none', transition: 'all 0.15s',
                      }}>
                        <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700, color: a ? 'var(--theme)' : 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.t}</div>
                        <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(15px,1.8vw,19px)', color: 'var(--cream)', marginTop: 5, lineHeight: 1 }}>{c.n}</div>
                        <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 4 }}>{c.d}</div>
                      </button>
                    );
                  })}
                </div>
              );
            })()}
            {finTab === 'rento' && <OwnershipCalculator devId={dev.id} />}
            {finTab === 'plan' && <PublicCotizador formasPago={dev.config?.formas_pago} basePrice={dev.price_from} fechaInicio={dev.config?.fecha_inicio} fechaEntrega={dev.config?.fecha_entrega || dev.delivery_estimate} />}
            {finTab === 'credito' && <MortgageCalculator variant="inline" propiedadId={dev.id} propiedadNombre={dev.name} precioInicial={dev.price_from || 0} />}
            {finTab === 'inversion' && <InvestmentSimulator compact light prefilled={{ precio: dev.price_from, m2: dev.m2_from || 80, colonia: dev.zone_id || 'del-valle' }} />}
          </section>

          {/* ═══ ACTO 6 · CONOCE EL EDIFICIO — servicios/legal del dev + descripción, unidades, avance, amenidades, ubicación. ═══ */}
          <div style={{ marginTop: 38, marginBottom: 2 }}>
            <div className="eyebrow" style={{ color: 'var(--theme)' }}>El edificio</div>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(20px,2.8vw,30px)', letterSpacing: '-0.02em', color: 'var(--cream)', margin: '4px 0 0' }}>Conócelo por dentro</h2>
          </div>

          {/* B2.1 — Lo que el desarrollador configuró: servicios + construcción + legal */}
          <DevConfigSections config={dev.config} />
          {/* (Cotizador público → "Tu dinero" · plan del dev; Plusvalía → Acto 5 "¿Cuánto vale?" — reubicados arriba) */}

          {/* El edificio — tabs a ancho completo de la columna de contenido (el sidebar se movió al riel de decisión) */}
          <div style={{ marginTop: 24 }}>
              {/* Tab nav — estilo institucional (GBM/Dividenz): barra limpia con subrayado de marca · sticky */}
              <div style={{
                display: 'flex', gap: 2,
                borderBottom: '1px solid var(--card-border, var(--border))',
                marginBottom: 24,
                overflowX: 'auto',
                position: 'sticky', top: 60, zIndex: 6,
                background: 'var(--bg, #FAFAFB)',
                scrollSnapType: 'x proximity',
              }} data-testid="tab-nav">
                {tabs.map(t0 => {
                  const active = tab === t0.k;
                  return (
                    <button key={t0.k}
                      data-testid={`tab-${t0.k}`}
                      onClick={() => setTab(t0.k)}
                      style={{
                        position: 'relative',
                        padding: '14px 16px', background: 'transparent', border: 'none',
                        color: active ? 'var(--cream)' : 'var(--cream-3)',
                        fontFamily: 'Outfit, sans-serif', fontWeight: active ? 800 : 600, fontSize: 14,
                        letterSpacing: '-0.01em', cursor: 'pointer', whiteSpace: 'nowrap',
                        scrollSnapAlign: 'start', transition: 'color 0.15s',
                      }}
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = 'var(--cream)'; }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = 'var(--cream-3)'; }}>
                      {t0.label}
                      {active && <span style={{ position: 'absolute', left: 10, right: 10, bottom: -1, height: 3, borderRadius: 3, background: 'var(--grad)' }} />}
                    </button>
                  );
                })}
              </div>

              {/* Active tab content */}
              {tab === 'descripcion' && <DescriptionTab dev={dev} />}
              {tab === 'precios' && (
                <>
                  {/* Resumen por TIPO (estilo kplr) — la foto completa del inventario · luego la tabla detallada (con gate) */}
                  <UnidadesPorTipo dev={dev} />
                  <PriceListTab dev={dev} user={user}
                    onGateOpen={openGate}
                    selectedUnit={selectedUnit}
                    onSelectUnit={setSelectedUnit}
                    matchCriteria={matchCriteria} />
                </>
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
              {/* (Hipoteca reubicada → sección "Tu dinero" · sub-tab "Con crédito") */}
            </div>

          {/* ═══ ACTO 7 · ¿CONFÍAS? — reviews + riesgos honestos (risk-reversal), después de conocer el edificio. ═══ */}
          <div style={{ marginTop: 38, marginBottom: 2 }}>
            <div className="eyebrow" style={{ color: 'var(--theme)' }}>La confianza</div>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(20px,2.8vw,30px)', letterSpacing: '-0.02em', color: 'var(--cream)', margin: '4px 0 0' }}>¿Puedes confiar?</h2>
          </div>
          {/* W6.MOV.3 — Reviews Residentes para el desarrollo */}
          <section data-testid="dev-reviews-residents-section" style={{ marginTop: 16 }}>
            <DevReviewsBlock devId={dev.id} hideIfEmpty />
          </section>
          {/* Riesgos honestos — dato real (Atlas de Riesgos CDMX + preventa + absorción), lectura balanceada. */}
          <RiesgosHonestos dev={dev} />

            </div>{/* —— fin columna izquierda —— */}

            {/* —— RIEL DE DECISIÓN (sticky) — precio + CTAs + AVM, te sigue TODA la ficha (no solo el bloque de precios) —— */}
            <div style={{ position: 'sticky', top: 80, alignSelf: 'start' }}>
              <Sidebar dev={dev} selectedUnit={selectedUnit} onLogin={onLogin} user={user} />
              <div style={{ marginTop: 16 }}>
                <AvmConfidenceRange property_id={`${dev.colonia_slug || dev.colonia || 'cdmx'}_dev_${dev.id}`} />
              </div>
              {isAdvisor && (
                <button data-testid="briefing-ie-cta" onClick={() => setBriefingOpen(true)}
                  style={{ marginTop: 12, width: '100%', padding: '13px 20px', borderRadius: 9999, background: 'var(--grad)', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 8px 22px rgba(236,72,153,0.28)' }}>
                  <Sparkle size={13} /> Briefing IE para cliente
                </button>
              )}
              {isAdvisor && (
                <button data-testid="brochure-generate-cta" onClick={() => setBrochureOpen(true)}
                  style={{ marginTop: 10, width: '100%', padding: '12px 20px', borderRadius: 9999, background: 'transparent', border: '1px solid rgba(240,235,224,0.3)', color: 'var(--cream)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  Generar brochure PDF
                </button>
              )}
            </div>
          </div>{/* —— fin 2 columnas —— */}
        </section>

        {/* ¿QUÉ MÁS ME GUSTA? — desarrollos parecidos a este (motor /similar, antes huérfano). El comprador nunca se va con uno solo. */}
        {similares.length > 0 && (
          <section data-testid="parecidos" style={{ marginTop: 40 }}>
            <div className="eyebrow" style={{ color: 'var(--theme)', marginBottom: 4 }}>¿Te gustó este?</div>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(20px,2.6vw,28px)', letterSpacing: '-0.02em', color: 'var(--cream)', margin: '0 0 18px' }}>Desarrollos parecidos</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 16 }}>
              {similares.slice(0, 6).map((s) => (
                <a key={s.id} href={`/desarrollo/${s.slug || s.id}`} style={{ textDecoration: 'none', borderRadius: 16, border: '1px solid var(--card-border, var(--border))', overflow: 'hidden', background: 'var(--surface-card)', display: 'block', transition: 'transform 0.15s, box-shadow 0.15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 16px 40px rgba(var(--theme-rgb),0.14)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
                  {(s.hero_photo || (s.photos && s.photos[0])) && <img src={s.hero_photo || s.photos[0]} alt={s.name} loading="lazy" style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block', background: '#EDEEF1' }} />}
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 800, color: 'var(--theme)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.colonia}</div>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: '3px 0 6px', lineHeight: 1.15 }}>{s.name}</div>
                    {s.price_from_display && <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: '#059669' }}>desde {s.price_from_display}</div>}
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* ═══ ACTO 8 · SIGUIENTE PASO — cierre fuerte. Hormozi siempre cierra con CTA. ═══ */}
        <section data-testid="cierre-cta" style={{
          marginTop: 44, padding: 'clamp(34px,5vw,60px) clamp(24px,4vw,48px)', borderRadius: 28,
          background: 'var(--grad)', textAlign: 'center', color: '#fff',
          boxShadow: '0 30px 80px rgba(99,102,241,0.28)',
        }}>
          <div style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.85 }}>El siguiente paso</div>
          <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(26px,4vw,44px)', letterSpacing: '-0.03em', margin: '8px auto 10px', maxWidth: 640, lineHeight: 1.05 }}>
            ¿Listo para conocer {dev.name}?
          </h2>
          <p style={{ fontFamily: 'DM Sans', fontSize: 'clamp(14px,1.6vw,16px)', opacity: 0.92, margin: '0 auto 26px', maxWidth: 480, lineHeight: 1.5 }}>
            Agenda una visita sin compromiso. Te acompañamos con datos reales, no con presión.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => openGate({ source: 'cierre', dev_id: dev.id, dev_name: dev.name })} data-testid="cierre-cta-agendar"
              style={{ padding: '16px 34px', borderRadius: 14, border: 'none', background: '#fff', color: '#4F46E5', fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 16, cursor: 'pointer', boxShadow: '0 12px 30px rgba(0,0,0,0.18)' }}>
              Agendar mi visita →
            </button>
            <button onClick={() => window.dispatchEvent(new CustomEvent('dmx:ask-atlax', { detail: { devId: dev.id, devName: dev.name, colonia: dev.colonia } }))} data-testid="cierre-cta-atlax"
              style={{ padding: '16px 30px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.55)', background: 'transparent', color: '#fff', fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
              ✨ Pregúntale a Atlax
            </button>
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
        onCaptured={() => {
          // Pricing Lab · cierra el loop: lead atribuido a la variante de este visitante
          if (pxExp) trackPricingEvent(pxExp, { visitor_id: _getVisitorId(), event: 'lead' }).catch(() => {});
        }}
      />
    </LightScope>
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
          {tc('Tour 3D no disponible')}
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
          {tc('Procesando tour 3D')}
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
          {tc('El procesamiento falló')}
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

