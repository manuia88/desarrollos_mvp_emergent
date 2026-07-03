/**
 * FichaVenta — rediseño de la ficha del desarrollo con la ESTRUCTURA/UX de apartments.com
 * adaptada a VENTA de preventa, en el lenguaje visual claro/editorial de DMX (LightScope).
 *
 * Reglas: reusa TODOS los motores/secciones que ya viven (cero motor nuevo, cero dato inventado) y
 * PRENDE lo que estaba apagado en la ficha default: recorrido 3D, reseñas de residentes, sellos del
 * desarrollador. Layout apartments.com: hero-galería con contadores de media → columna sticky de
 * contacto/agendar → scroll de secciones (highlights · precios por modelo · tu dinero · recorrido 3D ·
 * amenidades · reseñas · la zona · confianza · similares) con sub-nav de anclas.
 * Ruta: /desarrollo/:id?venta=1 (preview) — no toca la ficha default hasta que el founder la promueva.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { LightScope, PublicNav } from '../components/ui';
import { fetchDevelopment, fetchDevelopments } from '../api/marketplace';
import { sendBuyerSignal } from '../lib/buyerSignal';
import { Card, SERIF, SANS, HEAD } from '../components/ficha/ui';
import { amenInfo } from '../components/ficha/amenIcons';
import PhotoGallery from '../components/dev/PhotoGallery';
import SeccionLente from '../components/ficha/SeccionLente';
import SeccionUnidades from '../components/ficha/SeccionUnidades';
import SeccionPanorama from '../components/ficha/SeccionPanorama';
import PlanDePago from '../components/ficha/PlanDePago';
import SeccionCalcInversion from '../components/ficha/SeccionCalcInversion';
import SeccionDinero from '../components/ficha/SeccionDinero';
import SeccionConfianza from '../components/ficha/SeccionConfianza';
import SeccionUbicacion from '../components/ficha/SeccionUbicacion';
import LeadCaptureModal from '../components/ficha/LeadCaptureModal';
import Tour3DViewer from '../components/tour3d/Tour3DViewer';
import DevReviewsBlock from '../components/property/DevReviewsBlock';
import { ComplianceBadgeInline } from '../components/marketplace/ComplianceBadge';
import AtlaxBubble from '../components/landing/AtlaxBubble';
import DevStructuredData from '../components/seo/DevStructuredData';
import { tc as titleCase } from '../lib/titleCase';

const API = process.env.REACT_APP_BACKEND_URL;
const money = (n) => (n ? `$${Number(n).toLocaleString('es-MX')}` : '—');
const STAGE = { preventa: 'Preventa', construccion: 'En construcción', entrega_inmediata: 'Entrega inmediata', terminado: 'Terminado' };

// Sub-nav de anclas (apartments.com fija una barra de secciones bajo el header)
const NAV = [
  ['proyecto', 'El proyecto'],
  ['precios', 'Precios y modelos'],
  ['dinero', 'Tu dinero'],
  ['tour', 'Recorrido 3D'],
  ['amenidades', 'Amenidades'],
  ['resenas', 'Reseñas'],
  ['zona', 'La zona'],
  ['confianza', 'Confianza'],
];

// ── Envoltura de sección: ancla + título serif + subtítulo opcional ─────────────
function Section({ id, title, sub, refEl, children, first }) {
  return (
    <section id={id} ref={refEl} style={{ scrollMarginTop: 120, paddingTop: first ? 0 : 30, marginTop: first ? 0 : 8 }}>
      {title && (
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 'clamp(22px,3vw,30px)', color: 'var(--cream)', letterSpacing: '-0.01em', margin: 0, lineHeight: 1.1 }}>{title}</h2>
          {sub && <div style={{ fontFamily: SANS, fontSize: 14, color: 'var(--cream-3)', marginTop: 5, maxWidth: '64ch' }}>{sub}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

function StatCell({ k, v }) {
  return (
    <div style={{ padding: '2px 0' }}>
      <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{k}</div>
      <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 16, color: 'var(--cream)', marginTop: 2 }}>{v}</div>
    </div>
  );
}

function Loading({ msg }) {
  return (
    <LightScope>
      <PublicNav />
      <div style={{ padding: 120, textAlign: 'center', color: 'var(--cream-3)', fontFamily: SANS }}>{msg}</div>
    </LightScope>
  );
}

export default function FichaVenta({ user, onLogin }) {
  const { id } = useParams();
  const [dev, setDev] = useState(null);
  const [loadErr, setLoadErr] = useState(false);
  const [unit, setUnit] = useState(null);
  const [lens, setLens] = useState('invertir');
  const [invMode] = useState('individual');
  const [scans, setScans] = useState([]);
  const [activeScan, setActiveScan] = useState(null);
  const [similars, setSimilars] = useState([]);
  const [savedUnits, setSavedUnits] = useState(() => new Set());
  const [leadModal, setLeadModal] = useState(null);
  const [activeNav, setActiveNav] = useState('proyecto');

  // refs de secciones para el scroll-to (usado por la sub-nav y por Atlax agéntico)
  const refs = {
    proyecto: useRef(null), precios: useRef(null), dinero: useRef(null), tour: useRef(null),
    amenidades: useRef(null), resenas: useRef(null), zona: useRef(null), confianza: useRef(null),
  };
  const scrollTo = useCallback((key) => {
    const el = refs[key] && refs[key].current;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [refs]);

  // ── Data ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    setLoadErr(false); setDev(null);
    fetchDevelopment(id).then((d) => { if (alive) setDev(d); }).catch(() => { if (alive) setLoadErr(true); });
    return () => { alive = false; };
  }, [id]);

  // recorridos 3D del proyecto (PRENDE lo que estaba solo en la ficha legacy)
  useEffect(() => {
    if (!dev || !dev.id) return undefined;
    let alive = true;
    const slug = dev.slug || dev.id;
    fetch(`${API}/api/tour-3dgs/scans?project_slug=${encodeURIComponent(slug)}&limit=20`)
      .then((r) => r.json())
      .then((d) => { if (alive) { const items = d?.items || []; setScans(items); setActiveScan(items[0]?.scan_id || null); } })
      .catch(() => { if (alive) setScans([]); });
    return () => { alive = false; };
  }, [dev && dev.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // similares
  useEffect(() => {
    if (!dev || !dev.id) return undefined;
    let alive = true;
    fetchDevelopments({ colonia: dev.colonia_id || dev.colonia, limit: 6 })
      .then((r) => { if (alive) setSimilars((Array.isArray(r) ? r : (r?.developments || [])).filter((x) => x.id !== dev.id).slice(0, 3)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [dev && dev.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // vista de ficha (señal de comprador) + scroll-spy de la sub-nav
  useEffect(() => {
    if (!dev || !dev.id) return undefined;
    try { sendBuyerSignal('ficha_view', { entity_id: dev.id, colonia: dev.colonia_id || dev.colonia, value: 'venta' }); } catch (e) { /* noop */ }
    const onScroll = () => {
      let cur = 'proyecto';
      for (const [k] of NAV) { const el = refs[k] && refs[k].current; if (el && el.getBoundingClientRect().top <= 140) cur = k; }
      setActiveNav(cur);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [dev && dev.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Acciones ──────────────────────────────────────────────────────────────
  const agendar = useCallback((reason) => setLeadModal({ reason: reason || 'agendar', unit: unit?.unit_number }), [unit]);
  const toggleSaveUnit = useCallback(() => {
    if (!unit) return;
    setSavedUnits((s) => { const n = new Set(s); n.has(unit.unit_number) ? n.delete(unit.unit_number) : n.add(unit.unit_number); return n; });
    try { sendBuyerSignal('save_unit', { entity_id: dev?.id, unit_number: unit.unit_number }); } catch (e) { /* noop */ }
  }, [unit, dev]);
  const pickUnit = useCallback((u) => { setUnit(u); if (u) setTimeout(() => scrollTo('dinero'), 60); }, [scrollTo]);

  // ── Atlax agéntico (reusa el ciclo de la ficha: evento dmx:atlax-action → navRef) ──
  const navRef = useRef(null);
  useEffect(() => {
    const onAction = (e) => {
      const nav = e && e.detail && e.detail.nav; const h = navRef.current; if (!nav || !h) return;
      if (nav === 'agendar') h.agendar();
      else if (nav === 'guardar') h.toggleSaveUnit();
      else if (nav === 'unidad' || nav === 'comparar') h.scrollTo('precios');
      else if (nav === 'dinero') h.scrollTo('dinero');
      else if (nav === 'confianza') h.scrollTo('confianza');
      else if (nav === 'proyecto') h.scrollTo('proyecto');
      else if (nav === 'tour') h.scrollTo('tour');
    };
    window.addEventListener('dmx:atlax-action', onAction);
    return () => window.removeEventListener('dmx:atlax-action', onAction);
  }, []);
  navRef.current = { scrollTo, agendar, toggleSaveUnit };

  const atlaxContext = useMemo(() => {
    if (!dev) return '';
    const parts = [`Ficha de VENTA de "${dev.name}" en ${titleCase(dev.colonia || '')}, ${titleCase(dev.alcaldia || '')}. Sección: ${activeNav}.`];
    if (unit) parts.push(`El comprador está viendo la unidad ${unit.unit_number} (${money(unit.price)}).`);
    parts.push(`Lente activo: ${lens === 'invertir' ? 'inversión' : 'vivir'}.`);
    return parts.join(' ');
  }, [dev, unit, lens, activeNav]);

  const atlaxQuickActions = useMemo(() => ([
    { label: 'Ver modelos', nav: 'unidad' },
    { label: 'Mis números', nav: 'dinero' },
    { label: 'Agendar visita', nav: 'agendar' },
    { label: '¿Es confiable?', nav: 'confianza' },
  ]), []);

  if (loadErr) return <Loading msg="No pudimos cargar este desarrollo. Recarga la página." />;
  if (!dev) return <Loading msg="Cargando el desarrollo…" />;

  const nUnits = (dev.units || []).length || dev.units_total || dev.total_units || 0;
  const amen = Array.isArray(dev.amenities) ? dev.amenities : [];
  const priceMain = unit ? money(unit.price) : (dev.price_from_display || money(dev.price_from));
  const developer = dev.developer || {};
  const seals = [
    developer.verified_constitution && 'Constitución verificada',
    developer.no_judicial_records && 'Sin antecedentes judiciales',
    developer.no_profeco_complaints && 'Sin quejas PROFECO',
    developer.projects_delivered && `${developer.projects_delivered} proyectos entregados`,
    developer.years_experience && `${developer.years_experience} años de experiencia`,
  ].filter(Boolean);

  const sideBtn = (grad) => ({ width: '100%', padding: '12px 14px', borderRadius: 12, border: grad ? 'none' : '1px solid var(--card-border, var(--border))', background: grad ? 'var(--grad)' : 'transparent', color: grad ? '#fff' : 'var(--cream-2)', fontFamily: HEAD, fontWeight: 800, fontSize: 14, cursor: 'pointer', marginTop: 9, boxShadow: grad ? '0 10px 24px rgba(109,74,255,0.24)' : 'none' });

  return (
    <LightScope>
      <DevStructuredData dev={dev} />
      <PublicNav />
      <main style={{ paddingTop: 64 }}>

        {/* ── HERO GALERÍA (mosaico revista + contadores de media estilo apartments.com) ── */}
        <div style={{ maxWidth: 1320, width: '94%', margin: '0 auto', paddingTop: 16 }}>
          <div className="eyebrow" style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--cream-3)', marginBottom: 10 }}>
            <Link to="/marketplace" style={{ color: 'var(--cream-3)', textDecoration: 'none' }}>Marketplace</Link>
            {' / '}{[dev.colonia, dev.alcaldia, 'CDMX'].filter(Boolean).map((s) => titleCase(s)).join(' · ')}
          </div>
          <PhotoGallery dev={dev} />
          {/* contadores de media */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {(dev.photos || []).length > 0 && <span style={mediaChip}>📷 {(dev.photos || []).length} fotos</span>}
            {scans.length > 0 && <button onClick={() => scrollTo('tour')} style={{ ...mediaChip, cursor: 'pointer' }}>🎦 {scans.length} recorrido{scans.length === 1 ? '' : 's'} 3D</button>}
            <ComplianceBadgeInline devId={dev.id} />
          </div>
        </div>

        {/* ── SUB-NAV pegajosa de anclas ── */}
        <div style={{ position: 'sticky', top: 56, zIndex: 30, background: 'var(--surface, #faf9f7)', borderBottom: '1px solid var(--card-border, var(--border))', backdropFilter: 'saturate(1.2) blur(6px)', marginTop: 20 }}>
          <div style={{ maxWidth: 1320, width: '94%', margin: '0 auto', display: 'flex', gap: 3, overflowX: 'auto', padding: '2px 0' }}>
            {NAV.filter(([k]) => (k !== 'tour' || scans.length > 0) && (k !== 'amenidades' || amen.length > 0)).map(([k, label]) => (
              <button key={k} onClick={() => scrollTo(k)} style={{ padding: '12px 14px', border: 'none', borderBottom: activeNav === k ? '2.5px solid var(--theme)' : '2.5px solid transparent', background: 'transparent', color: activeNav === k ? 'var(--theme)' : 'var(--cream-2)', fontFamily: HEAD, fontWeight: 800, fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</button>
            ))}
          </div>
        </div>

        {/* ── BODY: contenido + columna sticky de contacto ── */}
        <div className="dmx-venta-grid" style={{ maxWidth: 1320, width: '94%', margin: '0 auto', padding: '26px 0 90px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 34, alignItems: 'start' }}>
          <div style={{ minWidth: 0 }}>

            {/* TÍTULO + STATS RÁPIDAS */}
            <Section id="proyecto" refEl={refs.proyecto} first>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
                <h1 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 'clamp(30px,5vw,50px)', color: 'var(--cream)', letterSpacing: '-0.01em', margin: 0, lineHeight: 1.04 }}>{dev.name}</h1>
                {dev.verified && <span style={badgeV}>✓ Verificado</span>}
                <span style={badgeS}>{STAGE[dev.stage] || dev.stage}</span>
              </div>
              <div style={{ fontFamily: SANS, fontSize: 15, color: 'var(--cream-2)', marginTop: 6 }}>
                {dev.address_full || dev.street || [dev.colonia, dev.alcaldia].filter(Boolean).join(', ')}
              </div>
              <Card style={{ marginTop: 16, padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 18 }}>
                <div style={{ padding: '2px 0' }}>
                  <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Precio</div>
                  <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 19, color: 'var(--theme)', marginTop: 2 }}>{priceMain}{!unit && dev.price_to ? ` – ${money(dev.price_to)}` : ''}</div>
                </div>
                {dev.bedrooms_range && <StatCell k="Recámaras" v={dev.bedrooms_range} />}
                {dev.bathrooms_range && <StatCell k="Baños" v={dev.bathrooms_range} />}
                {dev.m2_range && <StatCell k="m²" v={dev.m2_range} />}
                {dev.parking_range && <StatCell k="Estac." v={dev.parking_range} />}
                {nUnits > 0 && <StatCell k="Unidades" v={nUnits} />}
              </Card>
              {/* highlights / lente */}
              <div style={{ marginTop: 22 }}><SeccionLente dev={dev} lens={lens} /></div>
            </Section>

            {/* PRECIOS Y MODELOS (con AVM por unidad) */}
            <Section id="precios" refEl={refs.precios} title="Precios y modelos" sub="Lista de precios real por unidad, con su posición vs el mercado (AVM). Elige una para ver tus números exactos.">
              <SeccionUnidades dev={dev} selectedUnit={unit} onSelectUnit={pickUnit} onGoTo={scrollTo} plusvalia={null} />
            </Section>

            {/* TU DINERO — las calculadoras (super importantes) */}
            <Section id="dinero" refEl={refs.dinero} title="Tu dinero" sub="Cómo pagas al desarrollador y qué rendimiento esperar. Todo calculado con datos reales, por unidad.">
              <div style={{ display: 'inline-flex', gap: 4, padding: 4, background: 'var(--surface-2, rgba(0,0,0,0.04))', borderRadius: 12, marginBottom: 16 }}>
                {[['invertir', 'Como inversión'], ['vivir', 'Para vivir']].map(([k, l]) => (
                  <button key={k} onClick={() => setLens(k)} style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: lens === k ? 'var(--grad)' : 'transparent', color: lens === k ? '#fff' : 'var(--cream-2)', fontFamily: HEAD, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>{l}</button>
                ))}
              </div>
              {!unit && <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 12, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.20)', fontFamily: SANS, fontSize: 13.5, color: 'var(--cream-2)' }}>Elige una unidad arriba en <b>Precios y modelos</b> para ver tus números exactos.</div>}
              {/* wizard de asequibilidad */}
              <div style={{ marginBottom: 22 }}><SeccionPanorama dev={dev} unit={unit} onSelectUnit={setUnit} /></div>
              {/* esquema de pago al dev */}
              <PlanDePago dev={dev} unit={unit} />
              {/* rendimiento / renta-vs-compra según el lente — requiere unidad elegida (las calcs leen unit.*) */}
              {unit && (lens === 'invertir' ? (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--theme)', letterSpacing: '0.07em', marginBottom: 10, textTransform: 'uppercase' }}>Análisis de inversión</div>
                  <SeccionCalcInversion dev={dev} unit={unit} mode={invMode} onGoTo={scrollTo} />
                </div>
              ) : (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--theme)', letterSpacing: '0.07em', marginBottom: 10, textTransform: 'uppercase' }}>¿Rentar o comprar?</div>
                  <SeccionDinero dev={dev} unit={unit} intent="vivir" defaultTab="rentobuy" />
                </div>
              ))}
            </Section>

            {/* RECORRIDO 3D (prendido) */}
            {scans.length > 0 && activeScan && (
              <Section id="tour" refEl={refs.tour} title="Recorrido 3D" sub="Camina el departamento por dentro, como si estuvieras ahí.">
                {scans.length > 1 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    {scans.map((s) => (
                      <button key={s.scan_id} onClick={() => setActiveScan(s.scan_id)} style={{ padding: '7px 13px', borderRadius: 9999, border: '1px solid var(--card-border, var(--border))', background: activeScan === s.scan_id ? 'var(--theme)' : 'transparent', color: activeScan === s.scan_id ? '#fff' : 'var(--cream-2)', fontFamily: HEAD, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>{s.unit_id || s.title || 'Modelo'}</button>
                    ))}
                  </div>
                )}
                <div style={{ borderRadius: 18, overflow: 'hidden', border: '1px solid var(--card-border, var(--border))', height: 'clamp(360px,52vw,560px)' }}>
                  <Tour3DViewer scanId={activeScan} theme="cream" uiMode="full" />
                </div>
              </Section>
            )}

            {/* AMENIDADES */}
            {amen.length > 0 && (
              <Section id="amenidades" refEl={refs.amenidades} title="Amenidades" sub="Lo que trae el edificio y tu departamento.">
                <Card style={{ padding: '18px 20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: '12px 18px' }}>
                    {amen.map((a, i) => { const { label } = amenInfo(a); return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: SANS, fontSize: 14, color: 'var(--cream-2)' }}>
                        <span style={{ width: 6, height: 6, borderRadius: 9999, background: 'var(--theme)', flex: 'none' }} />{titleCase(label)}
                      </div>
                    ); })}
                  </div>
                </Card>
              </Section>
            )}

            {/* RESEÑAS (prendido · reseñas de residentes de la zona/desarrollo) */}
            <Section id="resenas" refEl={refs.resenas} title="Reseñas" sub="Lo que dicen residentes y vecinos de la zona.">
              <DevReviewsBlock devId={dev.id} hideIfEmpty={false} />
            </Section>

            {/* LA ZONA */}
            <Section id="zona" refEl={refs.zona} title="La zona" sub="Cómo se vive alrededor: caminabilidad, transporte, lugares.">
              <SeccionUbicacion dev={dev} />
            </Section>

            {/* CONFIANZA (riesgo honesto + sellos del desarrollador) */}
            <Section id="confianza" refEl={refs.confianza} title="Confianza" sub="Riesgos reales del inmueble y quién lo construye — sin letra chica.">
              {seals.length > 0 && (
                <Card style={{ padding: '16px 20px', marginBottom: 18 }}>
                  <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>El desarrollador{developer.name ? ` · ${developer.name}` : ''}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {seals.map((s, i) => (
                      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9999, background: 'rgba(31,160,106,0.08)', border: '1px solid rgba(31,160,106,0.28)', fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: '#1FA06A' }}>✓ {s}</span>
                    ))}
                  </div>
                </Card>
              )}
              <SeccionConfianza dev={dev} />
            </Section>

            {/* SIMILARES */}
            {similars.length > 0 && (
              <Section id="similares" title="Desarrollos parecidos" sub="Otras opciones en la misma zona.">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 16 }}>
                  {similars.map((s) => (
                    <Link key={s.id} to={`/desarrollo/${s.id}?venta=1`} className="dmx-venta-simcard" style={{ textDecoration: 'none', display: 'block', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--card-border, var(--border))', background: 'var(--surface-card)' }}>
                      <div style={{ aspectRatio: '4/3', background: '#EDEEF1', overflow: 'hidden' }}>
                        {(s.photos || [])[0] && <img src={s.photos[0]} alt={s.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                      </div>
                      <div style={{ padding: '12px 14px' }}>
                        <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>{titleCase(s.name)}</div>
                        <div style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-3)', marginTop: 2 }}>{titleCase(s.colonia || '')}</div>
                        <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 14, color: 'var(--theme)', marginTop: 6 }}>Desde {money(s.price_from)}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </Section>
            )}
          </div>

          {/* ── COLUMNA STICKY: contacto / agendar / Atlax ── */}
          <aside className="dmx-venta-side" style={{ position: 'sticky', top: 130 }}>
            <Card style={{ padding: '20px 20px' }}>
              <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{unit ? `Unidad ${unit.unit_number}` : 'Desde'}</div>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 28, color: 'var(--cream)', margin: '2px 0 2px' }}>{money(unit ? unit.price : dev.price_from)}</div>
              <div style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-3)', marginBottom: 6 }}>{STAGE[dev.stage] || dev.stage}{dev.delivery_estimate ? ` · entrega ${dev.delivery_estimate}` : ''}</div>
              <button onClick={() => agendar('agendar')} style={sideBtn(true)}>Agendar visita</button>
              <button onClick={() => agendar('mensaje')} style={sideBtn(false)}>Enviar mensaje</button>
              {unit && <button onClick={toggleSaveUnit} style={sideBtn(false)}>{savedUnits.has(unit.unit_number) ? '♥ Guardada' : `Guardar la ${unit.unit_number}`}</button>}
              <div style={{ borderTop: '1px solid var(--card-border, var(--border))', margin: '14px 0 0', paddingTop: 12, fontFamily: SANS, fontSize: 12, color: 'var(--cream-3)', textAlign: 'center' }}>
                ✨ ¿Dudas? Pregúntale a <b style={{ color: 'var(--theme)' }}>Atlax</b> abajo a la derecha — sabe de esta unidad.
              </div>
            </Card>
            <div style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-3)', textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
              Datos reales, sin presión. Tu asesor recibe exactamente lo que ves aquí.
            </div>
          </aside>
        </div>
      </main>

      {/* barra de acción fija en móvil */}
      <div className="dmx-venta-mobilebar" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 55, display: 'none', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 16px', background: 'var(--surface, #fff)', borderTop: '1px solid var(--card-border, var(--border))', boxShadow: '0 -6px 20px rgba(16,18,28,0.10)' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 17, color: 'var(--cream)' }}>{money(unit ? unit.price : dev.price_from)}</div>
          <div style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-3)' }}>{unit ? `Unidad ${unit.unit_number}` : (STAGE[dev.stage] || dev.stage)}</div>
        </div>
        <button onClick={() => agendar('agendar')} style={{ padding: '11px 20px', borderRadius: 12, border: 'none', background: 'var(--grad)', color: '#fff', fontFamily: HEAD, fontWeight: 800, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>Agendar visita</button>
      </div>

      <style>{`
        @media (max-width: 940px){
          .dmx-venta-grid{ grid-template-columns: minmax(0,1fr) !important; }
          .dmx-venta-side{ position: static !important; }
          .dmx-venta-mobilebar{ display: flex !important; }
        }
        .dmx-venta-simcard{ transition: transform .16s ease, box-shadow .16s ease; }
        .dmx-venta-simcard:hover{ transform: translateY(-2px); box-shadow: 0 12px 26px rgba(16,18,28,0.10); }
      `}</style>

      {/* Atlax flotante, consciente de la unidad/lente/sección (context vivo + acciones agénticas) */}
      <AtlaxBubble theme="light" context={atlaxContext} quickActions={atlaxQuickActions} dev={dev} unit={unit} lens={lens} />

      {leadModal && (() => {
        const wu = leadModal.unit;
        const leadUnit = wu ? ((dev.units || []).find((u) => u.unit_number === wu) || { unit_number: wu }) : unit;
        return <LeadCaptureModal dev={dev} unit={leadUnit} reason={leadModal.reason} onClose={() => setLeadModal(null)} />;
      })()}
    </LightScope>
  );
}

// estilos de badges (coherentes con FichaCockpit)
const mediaChip = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 9999, background: 'var(--surface-card, rgba(0,0,0,0.03))', border: '1px solid var(--card-border, var(--border))', color: 'var(--cream-2)', fontFamily: SANS, fontSize: 12.5, fontWeight: 600 };
const badgeV = { padding: '4px 11px', borderRadius: 9999, background: 'rgba(31,160,106,0.10)', border: '1px solid rgba(31,160,106,0.32)', color: '#1FA06A', fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' };
const badgeS = { padding: '4px 11px', borderRadius: 9999, background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.30)', color: 'var(--theme)', fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em' };
