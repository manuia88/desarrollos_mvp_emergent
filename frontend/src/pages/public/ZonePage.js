// W4.2D2 — ZonePage.js  (extended W4.2D3 — anti-doorway tier 2)
// Landing page programmatic SEO por colonia: /zona/:slug
// Hero · KPIs · Top 3 IE · Comparables · FAQ · CTAs
// Tier 1 (has IE data): full content. Tier 2 (no IE data): empty state +
// LandingLeadCaptureForm + lista comparables.
// Public route (sin auth). Inyecta JSON-LD Place + FAQPage.
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../../components/landing/Navbar';
import CtaFooter from '../../components/landing/CtaFooter';
import ZoneStructuredData, { buildFaqs } from '../../components/seo/ZoneStructuredData';
import LandingLeadCaptureForm from '../../components/seo/LandingLeadCaptureForm';
import ZoneSubscoresCard from '../../components/zones/ZoneSubscoresCard';
import ForecastChart from '../../components/forecast/ForecastChart';
import NarrativeBlock from '../../components/landing/NarrativeBlock';
import LivePulseZoneWidget from '../../components/shared/LivePulseZoneWidget';
import { useAuth } from '../../App';

const API = process.env.REACT_APP_BACKEND_URL;

// ── Helpers ──────────────────────────────────────────────────────────────────
function nfMxn(value) {
  if (value == null || isNaN(value)) return '—';
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency', currency: 'MXN', maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `$${Math.round(value).toLocaleString('es-MX')}`;
  }
}

function tierColor(tier) {
  const t = (tier || '').toLowerCase();
  if (t === 'green') return '#22C55E';
  if (t === 'yellow') return '#EAB308';
  if (t === 'red' || t === 'orange') return '#EF4444';
  return 'rgba(255,255,255,0.45)';
}

// ── Subcomponents ────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, testid }) {
  return (
    <div
      data-testid={testid}
      style={{
        flex: '1 1 180px', minWidth: 160, padding: '18px 20px',
        borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.10)',
        background: 'rgba(255,255,255,0.025)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div style={{
        fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700,
        letterSpacing: '0.12em', textTransform: 'uppercase',
        color: 'var(--cream-3)', marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'Outfit', fontWeight: 800, fontSize: 26,
        color: 'var(--cream)', letterSpacing: '-0.02em',
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function ScoreCard({ score }) {
  const color = tierColor(score.tier);
  return (
    <div style={{
      flex: '1 1 240px', minWidth: 220, padding: '16px 18px',
      borderRadius: 14,
      border: `1px solid ${color}40`,
      background: `${color}10`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <code style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--cream-2)', letterSpacing: '0.04em' }}>
          {score.code}
        </code>
        <div style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
          color, letterSpacing: '-0.02em',
        }}>
          {score.value != null ? Number(score.value).toFixed(0) : '—'}
        </div>
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', lineHeight: 1.5 }}>
        {score.description || 'Indicador IE auditable de DesarrollosMX.'}
      </div>
    </div>
  );
}

function FaqAccordion({ faqs }) {
  const [openIdx, setOpenIdx] = useState(0);
  return (
    <div data-testid="zone-faq" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {faqs.map((f, idx) => {
        const open = openIdx === idx;
        return (
          <div
            key={idx}
            style={{
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.10)',
              background: open ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.02)',
              overflow: 'hidden',
              transition: 'background 0.2s ease',
            }}
          >
            <button
              data-testid={`zone-faq-q-${idx}`}
              onClick={() => setOpenIdx(open ? -1 : idx)}
              style={{
                width: '100%', textAlign: 'left',
                padding: '14px 18px',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--cream)',
                fontFamily: 'Outfit', fontSize: 15, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}
            >
              <span>{f.question}</span>
              <span style={{
                fontFamily: 'DM Sans', fontSize: 18, color: '#a5b4fc',
                transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
                transition: 'transform 0.18s ease',
                flexShrink: 0,
              }}>+</span>
            </button>
            {open && (
              <div style={{
                padding: '0 18px 16px', fontFamily: 'DM Sans', fontSize: 14,
                color: 'var(--cream-2)', lineHeight: 1.7,
              }}>
                {f.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function ZonePage() {
  const { slug } = useParams();
  const { user } = useAuth();
  const [zone, setZone] = useState(null);
  const [subscoresData, setSubscoresData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setZone(null);
    setSubscoresData(null);

    fetch(`${API}/api/public/landing/colonia/${slug}`)
      .then(async r => {
        if (cancelled) return;
        if (r.status === 404) {
          setError('not_found');
          setLoading(false);
          return;
        }
        if (!r.ok) {
          setError('server_error');
          setLoading(false);
          return;
        }
        const data = await r.json();
        if (!cancelled) {
          setZone(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('network_error');
          setLoading(false);
        }
      });

    // W5.2 Sub-B — Fetch sub-scores desagregados (no bloquea render principal)
    fetch(`${API}/api/zones-public/${slug}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d) setSubscoresData(d); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [slug]);

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--cream)' }}>
        <Navbar user={user} />
        <main style={{ maxWidth: 960, margin: '0 auto', padding: '64px 24px' }}>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-3)',
          }}>
            Cargando datos de la zona…
          </div>
        </main>
      </div>
    );
  }

  // ── Tier 2 (W4.2D3) — colonia sin IE data: anti-doorway con lead capture ──
  if (zone && zone.has_ie_data === false) {
    const compsT2 = zone.comparable_colonias || [];
    return (
      <div data-testid="zone-page" data-zone-tier="tier2" data-landing-tier="tier2" style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--cream)' }}>
        <ZoneStructuredData zone={{
          slug: zone.slug,
          name: zone.name,
          alcaldia: zone.alcaldia,
          drpi: { current_value: null, available: false },
          risk_score: { value: null, letter: null, tier: 'unknown' },
          active_developments: 0,
          comparable_zones: compsT2.map(c => ({ slug: c.slug, name: c.name, alcaldia: c.alcaldia })),
        }} />
        <Navbar user={user} />
        <main style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 24px 80px' }}>
          {/* Breadcrumb */}
          <nav aria-label="breadcrumb" style={{
            fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)',
            marginBottom: 18, letterSpacing: '0.04em',
          }}>
            <Link to="/" style={{ color: 'var(--cream-3)', textDecoration: 'none' }}>Inicio</Link>
            <span style={{ margin: '0 8px', color: 'rgba(255,255,255,0.25)' }}>›</span>
            <Link to={`/alcaldia/${zone.alcaldia_slug || ''}`} style={{ color: 'var(--cream-3)', textDecoration: 'none' }}>
              {zone.alcaldia}
            </Link>
            <span style={{ margin: '0 8px', color: 'rgba(255,255,255,0.25)' }}>›</span>
            <span style={{ color: 'var(--cream-2)' }}>{zone.name}</span>
          </nav>

          {/* Hero tier 2 */}
          <header style={{ marginBottom: 28 }}>
            <div style={{
              fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
              textTransform: 'uppercase', marginBottom: 10,
              backgroundImage: 'linear-gradient(90deg, #6366F1, #EC4899)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              {zone.alcaldia} · CDMX
            </div>
            <h1 data-testid="zone-name" style={{
              fontFamily: 'Outfit', fontWeight: 800,
              fontSize: 'clamp(32px, 6vw, 56px)',
              margin: '0 0 14px', letterSpacing: '-0.025em',
            }}>
              {zone.name}
            </h1>
            <p style={{
              fontFamily: 'DM Sans', fontSize: 16, color: 'var(--cream-2)',
              lineHeight: 1.7, margin: 0, maxWidth: 720,
            }}>
              DesarrollosMX cubre {zone.name}, en {zone.alcaldia}, Ciudad de México. Aún no
              publicamos desarrollos verificados aquí — suscríbete y te avisamos en cuanto
              haya inventario auditado, o explora colonias cercanas con datos completos.
            </p>
          </header>

          {/* Anti-doorway: lead capture + comparables */}
          <section style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)',
            gap: 24, marginBottom: 40, alignItems: 'start',
          }}>
            <LandingLeadCaptureForm
              zoneInterest={`zone-${zone.slug}`}
              sourceUrl={`/zona/${zone.slug}`}
              title={`Avísame cuando haya inventario en ${zone.name}`}
              description={`Te enviaremos un correo cuando publiquemos desarrollos verificados en ${zone.name}. DesarrollosMX rastrea el inventario activo en CDMX continuamente.`}
            />

            <div>
              <h2 style={sectionTitleStyle}>Colonias cercanas con datos completos</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {compsT2.length > 0 ? compsT2.map(c => (
                  <Link
                    key={c.slug}
                    to={`/zona/${c.slug}`}
                    data-testid={`zone-compare-${c.slug}`}
                    style={{
                      padding: '14px 16px', borderRadius: 14, textDecoration: 'none',
                      border: '1px solid rgba(99,102,241,0.20)',
                      background: 'rgba(99,102,241,0.05)',
                      transition: 'background 0.18s ease',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.12)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.05)'; }}
                  >
                    <div>
                      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)' }}>
                        {c.name}
                      </div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)' }}>
                        {c.alcaldia}
                      </div>
                    </div>
                    <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#a5b4fc' }}>
                      Ver perfil →
                    </span>
                  </Link>
                )) : (
                  <div style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-3)' }}>
                    Sin colonias cercanas seedeadas todavía.
                  </div>
                )}
              </div>

              <div style={{ marginTop: 18 }}>
                <Link
                  to={`/alcaldia/${zone.alcaldia_slug || ''}`}
                  data-testid="zone-cta-alcaldia"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13.5,
                    padding: '9px 20px', borderRadius: 9999,
                    background: 'transparent', color: 'var(--cream)',
                    textDecoration: 'none',
                    border: '1px solid rgba(255,255,255,0.18)',
                    transition: 'background 0.18s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  Explorar {zone.alcaldia}
                </Link>
              </div>
            </div>
          </section>

          {/* FAQ tier2 (versión adaptada sin métricas reales) */}
          <section
            data-testid="zone-faq"
            style={{ marginBottom: 32 }}
          >
            <h2 style={sectionTitleStyle}>Preguntas frecuentes sobre {zone.name}</h2>
            <FaqAccordion faqs={[
              {
                question: `¿Hay desarrollos en venta en ${zone.name}?`,
                answer: `Por ahora no tenemos inventario verificado publicado en ${zone.name}. Suscríbete para recibir aviso cuando DesarrollosMX integre desarrollos auditados en esta zona.`,
              },
              {
                question: `¿Cuándo tendrá DesarrollosMX datos completos para ${zone.name}?`,
                answer: `Estamos onboardeando colonias progresivamente. ${zone.name} está en nuestro pipeline; las colonias con muestra mínima estadística (DRPI + Risk Score) se priorizan primero.`,
              },
              {
                question: `¿Qué colonias cercanas a ${zone.name} sí tienen datos?`,
                answer: compsT2.length
                  ? `Las colonias más cercanas con análisis completo son: ${compsT2.map(c => c.name).join(', ')}. Tienen DRPI hedónico, Risk Score multi-fuente y desarrollos activos.`
                  : `Estamos integrando colonias cercanas al inicio de cada trimestre.`,
              },
              {
                question: `¿Cómo verifica DesarrollosMX la información de ${zone.alcaldia}?`,
                answer: `Integramos fuentes oficiales: INEGI (demografía), SESNSP (delictivo), CENAPRED (riesgos naturales), DENUE (comercios), SHF/INFONAVIT/RPP (transacciones), todo k-anonymized (k≥5) y LFPDPPP-compliant.`,
              },
              {
                question: `¿Puedo registrar interés sin compromiso?`,
                answer: `Sí. Solo deja tu correo y zona de interés; te avisamos cuando publiquemos inventario verificado. Cero spam, cancelas cuando quieras.`,
              },
            ]} />
          </section>
        </main>

        <CtaFooter />
      </div>
    );
  }

  // ── 404 / error state ─────────────────────────────────────────────────────
  if (error === 'not_found' || !zone) {
    return (
      <div style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--cream)' }}>
        <Navbar user={user} />
        <main style={{ maxWidth: 720, margin: '0 auto', padding: '80px 24px' }}>
          <h1 style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(28px, 5vw, 40px)',
            margin: '0 0 12px', letterSpacing: '-0.025em',
          }}>
            Datos en preparación
          </h1>
          <p style={{ fontFamily: 'DM Sans', fontSize: 16, color: 'var(--cream-2)', lineHeight: 1.7 }}>
            DesarrollosMX cubre Ciudad de México progresivamente. La colonia <strong>{slug}</strong>{' '}
            estará disponible próximamente con DRPI, Risk Score y desarrollos activos.
          </p>
          <Link
            to="/marketplace"
            data-testid="zone-cta-marketplace-fallback"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14,
              padding: '10px 22px', borderRadius: 9999,
              background: 'linear-gradient(90deg, #6366F1, #EC4899)',
              color: '#fff', textDecoration: 'none', marginTop: 20,
            }}
          >
            Ver Marketplace
          </Link>
        </main>
      </div>
    );
  }

  const ieSummary = zone.ie_scores_summary || {};
  const top3 = ieSummary.top_3 || [];
  const drpi = zone.drpi || {};
  const risk = zone.risk_score || {};
  const comparables = zone.comparable_zones || [];
  const faqs = buildFaqs(zone);
  const dataInPreparation = (ieSummary.real_count || 0) < 3;

  // ── KPI values ────────────────────────────────────────────────────────────
  const kpiIe = top3.length > 0
    ? `${top3[0].value != null ? Number(top3[0].value).toFixed(0) : '—'}`
    : '—';
  const kpiIeSub = top3[0]?.code ? `Top: ${top3[0].code}` : 'Datos en preparación';

  const kpiDrpi = drpi.available && drpi.current_value
    ? `${nfMxn(drpi.current_value)}/m²`
    : (drpi.current_value ? `${nfMxn(drpi.current_value)}/m² (seed)` : '—');
  const kpiDrpiSub = drpi.delta_30d_pct != null
    ? `${drpi.delta_30d_pct > 0 ? '+' : ''}${Number(drpi.delta_30d_pct).toFixed(1)}% · 30d`
    : 'Sin variación reportada';

  const kpiRisk = risk.letter ? `${risk.letter} · ${risk.value}` : '—';
  const kpiRiskSub = risk.tier ? `Tier ${risk.tier}` : 'Calculando…';

  const kpiDevs = `${zone.active_developments || 0}`;
  const kpiDevsSub = (zone.active_developments || 0) === 1 ? 'desarrollo activo' : 'desarrollos activos';

  return (
    <div data-testid="zone-page" style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--cream)' }}>
      <ZoneStructuredData zone={zone} />
      <Navbar user={user} />

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* Breadcrumb */}
        <nav
          aria-label="breadcrumb"
          style={{
            fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)',
            marginBottom: 18, letterSpacing: '0.04em',
          }}
        >
          <Link to="/" style={{ color: 'var(--cream-3)', textDecoration: 'none' }}>Inicio</Link>
          <span style={{ margin: '0 8px', color: 'rgba(255,255,255,0.25)' }}>›</span>
          <Link to="/marketplace" style={{ color: 'var(--cream-3)', textDecoration: 'none' }}>Zonas</Link>
          <span style={{ margin: '0 8px', color: 'rgba(255,255,255,0.25)' }}>›</span>
          <span style={{ color: 'var(--cream-2)' }}>{zone.name}</span>
        </nav>

        {/* W5.5 P2 — Live Pulse widget T0 */}
        <div style={{ marginBottom: 24 }}>
          <LivePulseZoneWidget zone_slug={slug} user={user} />
        </div>

        {/* Hero */}
        <header style={{ marginBottom: 36 }}>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
            textTransform: 'uppercase', marginBottom: 10,
            backgroundImage: 'linear-gradient(90deg, #6366F1, #EC4899)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            {zone.alcaldia || 'CDMX'} {zone.tier ? `· ${zone.tier}` : ''}
          </div>
          <h1
            data-testid="zone-name"
            style={{
              fontFamily: 'Outfit', fontWeight: 800,
              fontSize: 'clamp(32px, 6vw, 56px)',
              margin: '0 0 14px', letterSpacing: '-0.025em',
            }}
          >
            {zone.name}
          </h1>
          <p style={{ fontFamily: 'DM Sans', fontSize: 16, color: 'var(--cream-2)', lineHeight: 1.7, margin: 0, maxWidth: 720 }}>
            Análisis completo de {zone.name}: precios DRPI, Risk Score multi-fuente, Intelligence Engine
            scores y desarrollos activos. Datos auditables, k-anonymized y LFPDPPP-compliant.
          </p>
        </header>

        {/* Empty state si no hay IE scores */}
        {dataInPreparation && (
          <div
            data-testid="zone-empty-state"
            style={{
              padding: '14px 18px', borderRadius: 12, marginBottom: 24,
              border: '1px solid rgba(234,179,8,0.30)',
              background: 'rgba(234,179,8,0.06)',
              fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.6,
            }}
          >
            Datos en preparación · DMX cubre esta zona, próximamente publicaremos el Intelligence Engine completo
            con 23+ scores auditables.
          </div>
        )}

        {/* Section 1 — Resumen KPIs */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={sectionTitleStyle}>Resumen</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <KpiCard
              testid="zone-kpi-ie"
              label="Score IE Top"
              value={kpiIe}
              sub={kpiIeSub}
            />
            <KpiCard
              testid="zone-kpi-drpi"
              label="DRPI / m²"
              value={kpiDrpi}
              sub={kpiDrpiSub}
            />
            <KpiCard
              testid="zone-kpi-risk"
              label="Risk Score"
              value={kpiRisk}
              sub={kpiRiskSub}
            />
            <KpiCard
              testid="zone-kpi-devs"
              label="Desarrollos"
              value={kpiDevs}
              sub={kpiDevsSub}
            />
          </div>
        </section>

        {/* W5.2 Sub-B — Sub-scores desagregados */}
        {subscoresData && <ZoneSubscoresCard data={subscoresData} />}

        {/* W5.6 Sub-A — Narrativa AI para la zona */}
        <div style={{ marginBottom: 32 }}>
          <NarrativeBlock entityType="zone" entityId={slug} />
        </div>

        {/* W5.3 Parte 1 — Forecast multi-horizonte para la zona */}
        <ForecastChart mode="zone" slug={slug} />


        {/* Section 2 — Top 3 IE Scores */}
        {top3.length > 0 && (
          <section style={{ marginBottom: 48 }}>
            <h2 style={sectionTitleStyle}>Top 3 indicadores Intelligence Engine</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {top3.map((s, idx) => <ScoreCard key={s.code || idx} score={s} />)}
            </div>
          </section>
        )}

        {/* Section 3 — Comparable zones */}
        {comparables.length > 0 && (
          <section style={{ marginBottom: 48 }}>
            <h2 style={sectionTitleStyle}>Colonias comparables</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {comparables.map(c => (
                <Link
                  key={c.slug}
                  to={`/zona/${c.slug}`}
                  data-testid={`zone-compare-${c.slug}`}
                  style={{
                    flex: '1 1 240px', minWidth: 220, padding: '16px 18px',
                    borderRadius: 14, textDecoration: 'none',
                    border: '1px solid rgba(99,102,241,0.20)',
                    background: 'rgba(99,102,241,0.05)',
                    transition: 'background 0.18s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.12)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.05)'; }}
                >
                  <div style={{
                    fontFamily: 'Outfit', fontWeight: 700, fontSize: 17,
                    color: 'var(--cream)', marginBottom: 4,
                  }}>
                    {c.name}
                  </div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)' }}>
                    {c.alcaldia}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Section 4 — FAQ */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={sectionTitleStyle}>Preguntas frecuentes sobre {zone.name}</h2>
          <FaqAccordion faqs={faqs} />
        </section>

        {/* Section 5 — CTAs */}
        <section
          style={{
            padding: '28px 24px', borderRadius: 18,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.03)',
            backdropFilter: 'blur(16px)',
            display: 'flex', flexWrap: 'wrap', alignItems: 'center',
            justifyContent: 'space-between', gap: 18, marginBottom: 32,
          }}
        >
          <div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', marginBottom: 4 }}>
              Explora {zone.name}
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)' }}>
              Filtra desarrollos activos o suscríbete a alertas Risk Score.
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link
              to={`/marketplace?colonia=${zone.slug}`}
              data-testid="zone-cta-marketplace"
              style={{
                fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14,
                padding: '10px 22px', borderRadius: 9999,
                background: 'linear-gradient(90deg, #6366F1, #EC4899)',
                color: '#fff', textDecoration: 'none',
                transition: 'opacity 0.18s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
            >
              Ver desarrollos en {zone.name}
            </Link>
            <Link
              to={`/inteligencia?zona=${zone.slug}`}
              data-testid="zone-cta-risk"
              style={{
                fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14,
                padding: '10px 22px', borderRadius: 9999,
                background: 'transparent', color: 'var(--cream)',
                textDecoration: 'none',
                border: '1px solid rgba(255,255,255,0.18)',
                transition: 'background 0.18s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              Suscribir alertas Risk
            </Link>
          </div>
        </section>

      </main>

      <CtaFooter />
    </div>
  );
}

const sectionTitleStyle = {
  fontFamily: 'Outfit', fontWeight: 700, fontSize: 20,
  color: 'var(--cream)', margin: '0 0 16px',
  letterSpacing: '-0.015em',
};
