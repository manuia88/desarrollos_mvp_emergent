/**
 * FichaVenta — CLON FIEL de la ficha de apartments.com, adaptado a VENTA de preventa y con el color/marca DMX.
 *
 * Doctrina visual (copiada de apts, NO el editorial DMX):
 *  · Fondo blanco (#fff), NO crema. Tipografía compacta sans (system-ui), NO serif.
 *  · Bordes finos gris (#cacaca), radios chicos (botón 4 / tarjeta 5), tablas densas, íconos de línea.
 *  · Acento = morado DMX (#6D4AFF) donde ellos usan verde. Semántica: disponible verde, agotado gris.
 *  · Layout: hero-carrusel → sub-nav sticky → 2 columnas (contenido + card contacto sticky).
 *  · Secciones en el MISMO orden que apts: Precios y modelos → Tarifas y políticas → Recorrido 3D →
 *    Servicios/amenidades → Detalles → Ubicación (mapa+POIs+escuelas+transporte) → Reseñas → Cercanos.
 *  · UPGRADES DMX (apts no los tiene) marcados con el chip "Solo en DMX": AVM por unidad, Tu dinero
 *    (inversión/TIR), forecast, confianza/riesgo, Atlax agéntico.
 * Reusa los motores vivos (AVM /precio-posicion-batch, calculadoras, riesgo, zona, reseñas, 3D). Ruta ?venta=1.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PublicNav, LightScope } from '../components/ui';
import { fetchDevelopment, fetchDevelopments } from '../api/marketplace';
import { sendBuyerSignal, visitorId } from '../lib/buyerSignal';
import { amenInfo } from '../components/ficha/amenIcons';
// EN STANDBY (founder) hasta terminar el diseño puro — se re-cablean después:
// import SeccionPanorama from '../components/ficha/SeccionPanorama';
// import PlanDePago from '../components/ficha/PlanDePago';
// import SeccionCalcInversion from '../components/ficha/SeccionCalcInversion';
// import SeccionDinero from '../components/ficha/SeccionDinero';
// import SeccionConfianza from '../components/ficha/SeccionConfianza';
// import SeccionUbicacion from '../components/ficha/SeccionUbicacion';
import Tour3DViewer from '../components/tour3d/Tour3DViewer';
import AtlaxBubble from '../components/landing/AtlaxBubble';
import DevStructuredData from '../components/seo/DevStructuredData';
import { tc as titleCase } from '../lib/titleCase';

const API = process.env.REACT_APP_BACKEND_URL;

// ── design tokens (spec del founder · valores exactos) ──────────────────────
const C = {
  ink: '#000000',        // texto principal / precios (spec)
  ink2: '#4c4c4c',       // títulos de sección / secundario (spec)
  faint: '#6b6f7a',      // terciario
  line: '#cacaca',       // bordes y divisores (spec)
  line2: '#e0e0e0',      // divisor más suave
  bg: '#ffffff',
  bgSoft: '#fafafb',     // fondos sutiles
  highlight: '#f2f9e9',  // verde pálido: barra calculadora, respuesta del admin (spec)
  accent: '#6D4AFF',     // ACCIÓN = morado DMX (map del verde de la referencia)
  accentSoft: '#F1EEFF',
  link: '#0576a7',       // enlaces de texto = azul (spec: enlaces nunca verde/acción)
  green: '#1E9E63',      // disponible
  amber: '#C2410C',      // reservado/apartado
  red: '#DC2626',        // vendido/escasez
};
const R_BTN = 4, R_CARD = 5, MAXW = 1200;   // radios y contenedor (spec)
const FONT = "-apple-system, system-ui, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const money = (n) => (n != null && n !== '' ? `$${Number(n).toLocaleString('es-MX')}` : '—');
const STAGE = { preventa: 'Preventa', construccion: 'En construcción', entrega_inmediata: 'Entrega inmediata', terminado: 'Terminado' };
const PROTO = { PH: 'Penthouse', ph: 'Penthouse' };
const protoName = (p) => (p ? (PROTO[p] || `Modelo ${p}`) : 'Modelo');
const m2of = (u) => u.m2_total || u.m2_privative || null;
const ESTADO = { disponible: { l: 'Disponible', c: C.green }, reservado: { l: 'Reservado', c: C.amber }, apartado: { l: 'Apartado', c: C.amber }, vendido: { l: 'Vendido', c: C.faint }, bloqueado: { l: 'No disp.', c: C.faint } };
const AVM_COLOR = { rojo: C.red, naranja: '#ea580c', amarillo: '#d97706', ambar: '#d97706', verde: C.green, gris: C.faint };
const AVM_LABEL = { bajo: 'Buen precio', justo: 'En línea', alto: 'Sobre mercado' };
const planoOf = (dev, u) => u.plano_url || u.render_url || ((dev.config || {}).planos || {})[u.prototype] || null;

// sub-nav — orden de apartments.com
// Nota: Tu dinero (calculadoras), Confianza y el mapa/crédito quedan EN STANDBY (founder) para clonar
// el diseño puro de apartments.com primero. Se re-cablearán después. Se conservan sus imports comentados.
const NAV = [
  ['destacados', 'Destacados'],
  ['precios', 'Precios y modelos'],
  ['tarifas', 'Tarifas y políticas'],
  ['tour', 'Recorrido 3D'],
  ['servicios', 'Servicios'],
  ['detalles', 'Detalles'],
  ['ubicacion', 'Ubicación'],
  ['resenas', 'Reseñas'],
];

// ── átomos UI estilo apts ────────────────────────────────────────────────────
const box = { background: C.bg, border: `1px solid ${C.line}`, borderRadius: R_CARD };
// spec §1.2: títulos de sección 30px, peso Regular (400), line-height ~1.2, gris #4c4c4c
function H2({ children }) { return <h2 style={{ fontFamily: FONT, fontWeight: 400, fontSize: 30, lineHeight: 1.2, color: C.ink2, margin: 0, letterSpacing: 0 }}>{children}</h2>; }
function DmxChip() { return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: FONT, fontSize: 10.5, fontWeight: 700, color: C.accent, background: C.accentSoft, border: `1px solid ${C.accent}33`, borderRadius: 9999, padding: '2px 9px', letterSpacing: '0.02em' }}>✦ Solo en DMX</span>; }
function CtaGrad({ onClick, children }) { return <button onClick={onClick} style={{ width: '100%', padding: '12px', borderRadius: R_BTN, border: `1px solid ${C.accent}`, background: C.accent, color: '#fff', fontFamily: FONT, fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>{children}</button>; }
function CtaGhost({ onClick, children }) { return <button onClick={onClick} style={{ width: '100%', padding: '12px', borderRadius: R_BTN, border: `1px solid ${C.accent}`, background: '#fff', color: C.accent, fontFamily: FONT, fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>{children}</button>; }
const linkA = { background: 'none', border: 'none', padding: 0, color: C.link, fontFamily: FONT, fontWeight: 400, fontSize: 15, cursor: 'pointer' };
const iconBtn = { width: 38, height: 38, borderRadius: 9999, border: `1px solid ${C.line}`, background: '#fff', color: C.ink2, fontSize: 15, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };

// Widget de credibilidad del desarrollador (análogo de "Calificación del arrendatario" para venta)
function DevRating({ developer, onReviews }) {
  const n = developer.projects_delivered;
  if (!n) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ background: C.accent, color: '#fff', fontFamily: FONT, fontWeight: 700, fontSize: 18, borderRadius: R_BTN, padding: '5px 10px', lineHeight: 1 }}>✓</span>
      <div>
        <div style={{ fontFamily: FONT, fontSize: 14, color: C.ink }}>Desarrollador con trayectoria</div>
        <button onClick={onReviews} style={{ ...linkA }}>{n} proyectos entregados{developer.years_experience ? ` · ${developer.years_experience} años` : ''}</button>
      </div>
    </div>
  );
}

// Barra resumen en recuadro de 4 columnas con divisores (spec §4)
function SummaryBar({ price, bedR, bathR, m2R }) {
  const cols = [
    { k: 'Precio desde', v: price, verified: true },
    bedR && { k: 'Recámaras', v: bedR },
    bathR && { k: 'Baños', v: bathR },
    m2R && { k: 'm²', v: m2R },
  ].filter(Boolean);
  return (
    <div style={{ ...box, display: 'flex', marginTop: 14, overflowX: 'auto' }}>
      {cols.map((c, i) => (
        <div key={i} style={{ flex: 1, minWidth: 120, padding: '14px 18px', borderLeft: i ? `1px solid ${C.line}` : 'none' }}>
          <div style={{ fontFamily: FONT, fontWeight: 400, fontSize: 18, color: c.verified ? C.accent : C.ink, display: 'flex', alignItems: 'center', gap: 6 }}>{c.v}{c.verified && <span style={{ color: C.link, fontSize: 13 }}>✓</span>}</div>
          <div style={{ fontFamily: FONT, fontSize: 13, color: C.faint, marginTop: 2 }}>{c.k}</div>
        </div>
      ))}
    </div>
  );
}

function ReadMore({ text, max = 320 }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const long = text.length > max;
  return (
    <p style={{ fontFamily: FONT, fontWeight: 300, fontSize: 16, color: C.ink, lineHeight: 1.7, marginTop: 16, maxWidth: '72ch' }}>
      {open || !long ? text : text.slice(0, max) + '… '}
      {long && <button onClick={() => setOpen((o) => !o)} style={{ ...linkA, fontWeight: 400 }}>{open ? 'Leer menos' : 'Leer más'}</button>}
    </p>
  );
}

function Section({ id, title, refEl, children, note }) {
  return (
    <section id={id} ref={refEl} style={{ scrollMarginTop: 118, paddingTop: 30 }}>
      {title && <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><H2>{title}</H2>{note}</div>}
      {children}
    </section>
  );
}

// ════════════════════ HERO GALERÍA (mosaico + botón "ver todas") ════════════════════
const heroArrow = (side) => ({ position: 'absolute', [side]: 12, top: '50%', transform: 'translateY(-50%)', width: 38, height: 38, borderRadius: 9999, background: 'rgba(255,255,255,0.85)', border: 'none', color: C.ink, fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(16,24,40,0.18)', zIndex: 2 });
// §3 Galería hero: mosaico bento + flechas en la celda grande + overlay 3D + píldora multi-segmento con conteos
function Gallery({ dev, scans = [], hasVideo, onOpen }) {
  const photos = dev.photos || [];
  const [err, setErr] = useState({});
  const [heroI, setHeroI] = useState(0);
  const Img = ({ i, onClick }) => (err[i] || !photos[i])
    ? <div style={{ width: '100%', height: '100%', background: C.bgSoft }} />
    : <img src={photos[i]} alt={`${dev.name} ${i + 1}`} loading={i > 0 ? 'lazy' : 'eager'} onError={() => setErr((e) => ({ ...e, [i]: true }))} onClick={onClick} style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer', display: 'block' }} />;
  const sec = [1, 2, 3, 4];
  const segs = [
    photos.length > 0 && { l: `${photos.length} Fotos`, tab: 'fotos' },
    scans.length > 0 && { l: `${scans.length} Recorridos 3D`, tab: 'tour' },
    hasVideo && { l: 'Video', tab: 'video' },
  ].filter(Boolean);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: photos.length > 1 ? '2fr 1fr 1fr' : '1fr', gridTemplateRows: '1fr 1fr', gap: 4, height: 'clamp(300px,42vw,460px)', borderRadius: 12, overflow: 'hidden', background: C.bgSoft, position: 'relative' }}>
      <div style={{ gridRow: '1 / 3', gridColumn: 1, position: 'relative' }}>
        <Img i={heroI} onClick={() => onOpen(heroI, 'fotos')} />
        {photos.length > 1 && (
          <>
            <button onClick={(e) => { e.stopPropagation(); setHeroI((x) => (x - 1 + photos.length) % photos.length); }} aria-label="Foto anterior" style={heroArrow('left')}>‹</button>
            <button onClick={(e) => { e.stopPropagation(); setHeroI((x) => (x + 1) % photos.length); }} aria-label="Foto siguiente" style={heroArrow('right')}>›</button>
          </>
        )}
        {scans.length > 0 && (
          <button onClick={(e) => { e.stopPropagation(); onOpen(0, 'tour'); }} style={{ position: 'absolute', left: 14, top: 14, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 9999, background: 'rgba(16,18,28,0.6)', border: 'none', color: '#fff', fontFamily: FONT, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', backdropFilter: 'blur(2px)', zIndex: 2 }}>▶ Recorrido 3D</button>
        )}
      </div>
      {photos.length > 1 && sec.map((i, k) => <div key={i} style={{ gridColumn: k < 2 ? 2 : 3, gridRow: k % 2 === 0 ? 1 : 2, position: 'relative' }}><Img i={i} onClick={() => onOpen(i, 'fotos')} /></div>)}
      {segs.length > 0 && (
        <div style={{ position: 'absolute', right: 14, bottom: 14, display: 'flex', alignItems: 'stretch', background: 'rgba(255,255,255,0.96)', border: `1px solid ${C.line}`, borderRadius: 9999, boxShadow: '0 2px 10px rgba(16,24,40,0.16)', overflow: 'hidden' }}>
          {segs.map((s, k) => (
            <button key={s.tab} onClick={() => onOpen(0, s.tab)} style={{ padding: '9px 15px', border: 'none', borderLeft: k ? `1px solid ${C.line}` : 'none', background: 'none', color: C.ink, fontFamily: FONT, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>{s.l}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════ GALERÍA MODAL (tabs de media: Fotos · Planos · 3D · Video) ════════════════════
function GalleryModal({ dev, scans, startAt, startTab, onClose }) {
  const photos = dev.photos || [];
  const planos = [...new Set((dev.units || []).map((u) => planoOf(dev, u)).filter(Boolean))];
  const video = dev.video_url || dev.video || null;
  const tabs = [['fotos', `Fotos (${photos.length})`], planos.length && ['planos', `Planos (${planos.length})`], scans.length && ['tour', `Recorridos 3D (${scans.length})`], video && ['video', 'Video']].filter(Boolean);
  const [tab, setTab] = useState(startTab && tabs.some(([k]) => k === startTab) ? startTab : 'fotos');
  const [i, setI] = useState(startAt || 0);
  const list = tab === 'planos' ? planos : photos;
  useEffect(() => { const onKey = (e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') setI((x) => (x + 1) % list.length); if (e.key === 'ArrowLeft') setI((x) => (x - 1 + list.length) % list.length); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [list.length, onClose]);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: '#fff', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 22px', borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 22, color: C.ink }}>{dev.name}</div>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', fontSize: 24, color: C.ink2, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          {tabs.map(([k, l]) => <button key={k} onClick={() => { setTab(k); setI(0); }} style={{ padding: '9px 4px', marginRight: 14, border: 'none', borderBottom: tab === k ? `2.5px solid ${C.accent}` : '2.5px solid transparent', background: 'none', color: tab === k ? C.accent : C.ink2, fontFamily: FONT, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>{l}</button>)}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 60px', background: C.bgSoft }}>
        {tab === 'tour' && scans[i] ? (
          <div style={{ width: '100%', maxWidth: 1100, height: '100%', borderRadius: 12, overflow: 'hidden', background: '#000' }}><Tour3DViewer scanId={scans[i].scan_id} theme="cream" uiMode="full" /></div>
        ) : tab === 'video' && video ? (
          <video src={video} controls playsInline style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8, background: '#000' }} />
        ) : list[i] ? (
          <img src={list[i]} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }} />
        ) : <div style={{ color: C.faint, fontFamily: FONT }}>Sin elementos</div>}
        {list.length > 1 && tab !== 'tour' && tab !== 'video' && (
          <>
            <button onClick={() => setI((x) => (x - 1 + list.length) % list.length)} aria-label="Anterior" style={navArrow('left')}>‹</button>
            <button onClick={() => setI((x) => (x + 1) % list.length)} aria-label="Siguiente" style={navArrow('right')}>›</button>
            <div style={{ position: 'absolute', bottom: 18, fontFamily: FONT, fontSize: 13, color: C.ink2 }}>{i + 1} / {list.length}</div>
          </>
        )}
      </div>
      {tab !== 'tour' && tab !== 'video' && list.length > 1 && (
        <div style={{ display: 'flex', gap: 8, padding: '12px 22px', overflowX: 'auto', borderTop: `1px solid ${C.line}` }}>
          {list.map((src, k) => <img key={k} src={src} alt="" onClick={() => setI(k)} style={{ width: 96, height: 66, objectFit: 'cover', borderRadius: 6, cursor: 'pointer', flex: 'none', border: k === i ? `2px solid ${C.accent}` : `1px solid ${C.line}` }} />)}
        </div>
      )}
    </div>
  );
}
const navArrow = (side) => ({ position: 'absolute', [side]: 14, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: 9999, background: '#fff', border: `1px solid ${C.line}`, color: C.ink, fontSize: 24, cursor: 'pointer', boxShadow: '0 2px 8px rgba(16,24,40,0.12)' });

// ════════════════════ PRECIOS Y MODELOS ════════════════════
function VentaPrecios({ dev, selectedUnit, onSelectUnit, onAgendar, avm, onOpenModel }) {
  const allUnits = dev.units || [];
  const [expanded, setExpanded] = useState({});
  const [bed, setBed] = useState('all');
  const bedOpts = [...new Set(allUnits.map((u) => u.bedrooms).filter((x) => x != null))].sort((a, b) => a - b);
  const units = bed === 'all' ? allUnits : allUnits.filter((u) => String(u.bedrooms) === String(bed));
  if (!allUnits.length) return <div style={{ ...box, padding: 20, fontFamily: FONT, color: C.faint }}>La lista de precios se publica pronto.</div>;

  const groups = {};
  units.forEach((u) => { const k = u.prototype || '?'; (groups[k] = groups[k] || []).push(u); });
  const models = Object.entries(groups).map(([proto, us]) => {
    const prices = us.map((u) => u.price).filter(Boolean); const m2s = us.map(m2of).filter(Boolean);
    return { proto, us, min: Math.min(...prices), max: Math.max(...prices), m2min: Math.min(...m2s), m2max: Math.max(...m2s), beds: [...new Set(us.map((u) => u.bedrooms).filter((x) => x != null))].sort((a, b) => a - b), baths: [...new Set(us.map((u) => u.bathrooms).filter((x) => x != null))].sort((a, b) => a - b), avail: us.filter((u) => u.status === 'disponible').length };
  }).sort((a, b) => a.min - b.min);
  const bedLabel = (n) => (n === 0 ? 'Estudio' : `${n} rec`);
  const rng = (a, b) => (a === b ? money(a) : `${money(a)} – ${money(b)}`);

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        {bedOpts.length > 1 ? (
          <div style={{ display: 'flex', gap: 0, border: `1px solid ${C.line}`, borderRadius: R_CARD, overflow: 'hidden', width: 'fit-content' }}>
            {[['all', 'Todas'], ...bedOpts.map((n) => [String(n), bedLabel(n)])].map(([k, l], idx) => (
              <button key={k} onClick={() => setBed(k)} style={{ padding: '9px 18px', border: 'none', borderLeft: idx ? `1px solid ${C.line}` : 'none', background: bed === k ? C.accent : '#fff', color: bed === k ? '#fff' : C.ink2, fontFamily: FONT, fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}>{l}</button>
            ))}
          </div>
        ) : <span />}
        <button onClick={onAgendar} style={{ padding: '9px 16px', borderRadius: R_BTN, border: `1px solid ${C.line}`, background: '#fff', color: C.link, fontFamily: FONT, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Ver mapa del sitio de la propiedad</button>
      </div>
      {/* Barra teaser · Calculadora de costos (motor en standby) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.accentSoft, border: `1px solid ${C.line2}`, borderRadius: R_CARD, padding: '12px 16px', marginBottom: 18 }}>
        <span style={{ fontSize: 20, flex: 'none' }}>🧮</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: C.ink }}>Calculadora de costos</div>
          <div style={{ fontFamily: FONT, fontSize: 13, color: C.ink2 }}>Estima tu enganche, mensualidades y gastos de escrituración para cada modelo.</div>
        </div>
        <button onClick={onAgendar} style={{ ...linkA, fontWeight: 700, whiteSpace: 'nowrap' }}>Calcular →</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {models.map((m) => {
          const plano = planoOf(dev, m.us[0]) || (dev.photos || [])[0];
          const show = expanded[m.proto] ? m.us : m.us.slice(0, 3);
          const specs = [m.beds.length ? (m.beds[0] === m.beds[m.beds.length - 1] ? bedLabel(m.beds[0]) : `${m.beds[0]}–${m.beds[m.beds.length - 1]} rec`) : null, m.baths.length ? `${m.baths[0]} baños` : null, m.m2min ? (m.m2min === m.m2max ? `${m.m2min} m²` : `${m.m2min}–${m.m2max} m²`) : null].filter(Boolean).join(' · ');
          return (
            <div key={m.proto} style={{ ...box, overflow: 'hidden' }}>
              <div style={{ display: 'flex', gap: 16, padding: 16, flexWrap: 'wrap' }}>
                <button onClick={() => onOpenModel(m.proto)} style={{ width: 128, height: 96, borderRadius: 8, overflow: 'hidden', flex: 'none', background: C.bgSoft, border: `1px solid ${C.line}`, padding: 0, cursor: 'pointer' }}>
                  {plano ? <img src={plano} alt={`Plano ${protoName(m.proto)}`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontFamily: FONT, color: C.faint }}>{protoName(m.proto)}</span>}
                </button>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 19, color: C.ink }}>{protoName(m.proto)}</div>
                  <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 19, color: C.ink, marginTop: 1 }}>{rng(m.min, m.max)}</div>
                  <div style={{ fontFamily: FONT, fontSize: 14, color: C.ink2, marginTop: 3 }}>{specs}</div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button onClick={() => onOpenModel(m.proto)} style={linkA}>Detalles del modelo</button>
                    <span style={{ color: C.line }}>·</span>
                    <button onClick={() => onSelectUnit(m.us.find((u) => u.status === 'disponible') || m.us[0])} style={linkA}>Ver mis números →</button>
                    <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: m.avail > 0 && m.avail <= 3 ? C.red : m.avail === 0 ? C.faint : C.green, marginLeft: 'auto' }}>{m.avail === 0 ? 'Agotado' : `${m.avail} disponible${m.avail === 1 ? '' : 's'}`}</span>
                  </div>
                </div>
              </div>
              <div style={{ background: C.bgSoft, padding: '8px 10px 10px', borderTop: `1px solid ${C.line2}` }}>
                <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: C.ink, padding: '6px 6px 10px' }}>{m.us.length} unidad{m.us.length === 1 ? '' : 'es'}</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT, minWidth: 560, background: '#fff', borderRadius: 8 }}>
                    <thead><tr>{['Unidad', 'Precio', 'm²', 'Disponibilidad', <span key="a" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>Precio vs mercado <span style={{ fontSize: 9, color: C.accent }}>✦</span></span>, ''].map((h, i) => <th key={i} style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: C.faint, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: `1px solid ${C.line}` }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {show.map((u) => {
                        const est = ESTADO[u.status] || ESTADO.disponible; const a = avm[u.id]; const sel = selectedUnit && selectedUnit.id === u.id;
                        return (
                          <tr key={u.id || u.unit_number} onClick={() => onSelectUnit(u)} style={{ cursor: 'pointer', background: sel ? C.accentSoft : '#fff', borderBottom: `1px solid ${C.line2}` }}>
                            <td style={{ padding: '11px 12px', fontFamily: FONT, fontWeight: 700, fontSize: 13.5, color: C.ink }}>{u.unit_number}</td>
                            <td style={{ padding: '11px 12px', fontFamily: FONT, fontWeight: 700, fontSize: 14, color: C.ink }}>{money(u.price)}</td>
                            <td style={{ padding: '11px 12px', fontSize: 13, color: C.ink2 }}>{m2of(u) ? `${m2of(u)} m²` : '—'}</td>
                            <td style={{ padding: '11px 12px', fontSize: 12.5, fontWeight: 700, color: est.c }}>{est.l}</td>
                            <td style={{ padding: '11px 12px' }}>{a ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: AVM_COLOR[a.color] || C.ink2 }}><span style={{ width: 7, height: 7, borderRadius: 9999, background: AVM_COLOR[a.color] || C.faint }} />{AVM_LABEL[a.etiqueta] || a.etiqueta}{a.diff_pct != null ? ` · ${a.diff_pct > 0 ? '+' : ''}${a.diff_pct}%` : ''}</span> : <span style={{ color: C.faint }}>—</span>}</td>
                            <td style={{ padding: '11px 12px', textAlign: 'right' }}><button onClick={(e) => { e.stopPropagation(); onSelectUnit(u); onOpenModel(u.prototype); }} style={{ padding: '6px 14px', borderRadius: R_BTN, border: `1px solid ${sel ? C.accent : C.line}`, background: sel ? C.accent : '#fff', color: sel ? '#fff' : C.accent, fontFamily: FONT, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Ver detalles</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {m.us.length > 3 && <button onClick={() => setExpanded((e) => ({ ...e, [m.proto]: !e[m.proto] }))} style={{ width: '100%', padding: 11, border: 'none', background: 'none', color: C.accent, fontFamily: FONT, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{expanded[m.proto] ? 'Mostrar menos' : `Mostrar más unidades (${m.us.length - 3})`}</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════ MODAL DE MODELO ════════════════════
function ModeloModal({ dev, models, activeProto, avm, onClose, onSelectUnit, onAgendar }) {
  const [proto, setProto] = useState(activeProto);
  const [tab, setTab] = useState('detalles');
  useLockScroll();
  useEffect(() => { const h = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  const m = models.find((x) => x.proto === proto) || models[0]; if (!m) return null;
  const plano = planoOf(dev, m.us[0]) || (dev.photos || [])[0];
  const rep = m.us.find((u) => u.status === 'disponible') || m.us[0];
  const range = m.min === m.max ? money(m.min) : `${money(m.min)} – ${money(m.max)}`;
  const a = avm[rep && rep.id];
  const interior = (Array.isArray(dev.amenities) ? dev.amenities : []).slice(0, 6).map((x) => amenInfo(x).label);
  const planoRows = [rep && rep.m2_privative && `${rep.m2_privative} m² privativos`, rep && rep.m2_balcony && `${rep.m2_balcony} m² balcón`, rep && rep.m2_terrace && `${rep.m2_terrace} m² terraza`, rep && rep.m2_roof_garden && `${rep.m2_roof_garden} m² roof garden`, rep && rep.level != null && `Piso ${rep.level}`].filter(Boolean);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(255,255,255,0.99)', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1120, margin: '0 auto', padding: '20px 24px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <select value={proto} onChange={(e) => setProto(e.target.value)} aria-label="Elegir modelo" style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14.5, color: C.ink, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 9, padding: '11px 14px', cursor: 'pointer' }}>
            {models.map((x) => <option key={x.proto} value={x.proto}>{protoName(x.proto)} · {x.avail} disponible{x.avail === 1 ? '' : 's'}</option>)}
          </select>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', fontSize: 24, color: C.ink2, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 12, margin: '14px 0 18px', flexWrap: 'wrap' }}>
          <button onClick={() => { onSelectUnit(rep); onClose(); }} style={{ flex: 1, minWidth: 200, padding: 13, borderRadius: R_BTN, border: 'none', background: C.accent, color: '#fff', fontFamily: FONT, fontWeight: 700, fontSize: 14.5, cursor: 'pointer' }}>Ver mis números con esta unidad</button>
          <button onClick={() => { onAgendar(); onClose(); }} style={{ flex: 1, minWidth: 200, padding: 13, borderRadius: R_BTN, border: `1px solid ${C.accent}`, background: '#fff', color: C.accent, fontFamily: FONT, fontWeight: 700, fontSize: 14.5, cursor: 'pointer' }}>Agendar visita</button>
        </div>
        <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.line}`, marginBottom: 22 }}>
          {[['detalles', 'Detalles del modelo'], ['plano', 'Plano']].map(([k, l]) => <button key={k} onClick={() => setTab(k)} style={{ padding: '10px 4px', marginRight: 20, border: 'none', borderBottom: tab === k ? `2.5px solid ${C.accent}` : '2.5px solid transparent', background: 'none', color: tab === k ? C.accent : C.ink2, fontFamily: FONT, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>{l}</button>)}
        </div>
        <div className="dmx-modelo-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 34 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 28, color: C.ink }}>{protoName(m.proto)}</div>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 22, color: C.ink, marginTop: 2 }}>{range}</div>
            <div style={{ fontFamily: FONT, fontSize: 14, color: C.ink2, marginTop: 4 }}>{[m.beds.length && `${m.beds[0]} rec`, m.baths.length && `${m.baths[0]} baños`, m.m2min && `${m.m2min} m²`].filter(Boolean).join(' · ')}</div>
            {a && (
              <div style={{ marginTop: 16, padding: '12px 15px', borderRadius: 10, background: C.accentSoft, border: `1px solid ${C.accent}33` }}>
                <DmxChip /><div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontFamily: FONT, fontWeight: 700, fontSize: 16, color: AVM_COLOR[a.color] || C.ink }}><span style={{ width: 9, height: 9, borderRadius: 9999, background: AVM_COLOR[a.color] || C.faint }} />{AVM_LABEL[a.etiqueta] || a.etiqueta}{a.diff_pct != null ? ` · ${a.diff_pct > 0 ? '+' : ''}${a.diff_pct}% vs zona` : ''}</div>
              </div>
            )}
            <div style={{ height: 1, background: C.line, margin: '20px 0' }} />
            {interior.length > 0 && <><div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 17, color: C.ink, marginBottom: 10 }}>Características</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: '8px 16px' }}>{interior.map((x, i) => <div key={i} style={{ fontFamily: FONT, fontSize: 14, color: C.ink2 }}>· {titleCase(x)}</div>)}</div></>}
            {planoRows.length > 0 && <div style={{ marginTop: 22 }}><div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 17, color: C.ink, marginBottom: 10 }}>Detalles del plano</div>{planoRows.map((x, i) => <div key={i} style={{ fontFamily: FONT, fontSize: 14, color: C.ink2, marginBottom: 5 }}>· {x}</div>)}</div>}
          </div>
          <div><div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden', background: C.bgSoft, aspectRatio: '4/3' }}>{plano ? <img src={plano} alt={`Plano ${protoName(m.proto)}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, color: C.faint }}>{protoName(m.proto)}</div>}</div><div style={{ textAlign: 'center', fontFamily: FONT, fontSize: 13, color: C.faint, marginTop: 8 }}>{protoName(m.proto)}</div></div>
        </div>
        <style>{`@media(max-width:760px){ .dmx-modelo-grid{ grid-template-columns: 1fr !important; } }`}</style>
      </div>
    </div>
  );
}

// ════════════════════ SERVICIOS/AMENIDADES (destacadas + viñetas) ════════════════════
function AmenBullet({ icon, label }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: FONT, fontSize: 15, fontWeight: 300, color: C.ink }}><span style={{ fontSize: 16, width: 20, textAlign: 'center', flex: 'none' }}>{icon}</span>{label}</div>;
}
// §6 Servicios — DOS grupos: "Comodidades de la comunidad" (amenidades) + "Características del apartamento" (datos de unidad)
function VentaServicios({ dev }) {
  const amen = Array.isArray(dev.amenities) ? dev.amenities : [];
  const info = amen.map((a) => amenInfo(a));
  const units = dev.units || [];
  const has = (f) => units.some((u) => Number(u[f]) > 0);
  const rng = (arr, suf = '') => { const v = [...new Set(arr.filter((x) => x != null))].sort((a, b) => a - b); return v.length ? (v[0] === v[v.length - 1] ? `${v[0]}${suf}` : `${v[0]}–${v[v.length - 1]}${suf}`) : null; };
  const bedR = rng(units.map((u) => u.bedrooms)); const bathR = rng(units.map((u) => u.bathrooms));
  const m2R = rng(units.map(m2of)); const parkR = rng(units.map((u) => u.parking_spots));
  const vistas = [...new Set(units.map((u) => u.vista).filter(Boolean))];
  const aptFeat = [
    bedR && ['🛏️', `${bedR} recámaras`],
    bathR && ['🛁', `${bathR} baños`],
    m2R && ['📐', `${m2R} m² de superficie`],
    parkR && ['🚗', `${parkR} cajón(es) de estacionamiento`],
    has('m2_balcony') && ['🌇', 'Balcón privado'],
    has('m2_terrace') && ['🪴', 'Terraza'],
    has('m2_roof_garden') && ['🌿', 'Roof garden privado'],
    vistas.length > 0 && ['👁️', `Vista: ${vistas.map((v) => titleCase(v)).join(', ')}`],
  ].filter(Boolean);
  if (!info.length && !aptFeat.length) return null;
  return (
    <div>
      {info.length > 0 && (
        <>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 17, color: C.ink, marginBottom: 14 }}>Comodidades de la comunidad</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 20 }}>
            {info.slice(0, 4).map((a, i) => <div key={i} style={{ ...box, aspectRatio: '1 / 1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', padding: 12 }}><div style={{ fontSize: 36 }}>{a.icon}</div><div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 600, color: C.ink }}>{titleCase(a.label)}</div></div>)}
          </div>
          <div className="dmx-amen-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px 24px' }}>
            {info.map((a, i) => <AmenBullet key={i} icon={a.icon} label={titleCase(a.label)} />)}
          </div>
        </>
      )}
      {aptFeat.length > 0 && (
        <>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 17, color: C.ink, margin: '26px 0 14px' }}>Características del apartamento</div>
          <div className="dmx-amen-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '12px 24px' }}>
            {aptFeat.map(([ic, l], i) => <AmenBullet key={i} icon={ic} label={l} />)}
          </div>
        </>
      )}
    </div>
  );
}

// ════════════════════ DETALLES ════════════════════
function VentaDetalles({ dev }) {
  const units = dev.units || [];
  const rows = [
    ['Tipo de propiedad', dev.property_type ? titleCase(dev.property_type) : 'Departamentos en preventa'],
    ['Etapa', STAGE[dev.stage] || dev.stage],
    ['Entrega estimada', dev.delivery_estimate || dev.fecha_lanzamiento || null],
    ['Niveles', dev.max_level != null ? `${dev.max_level}` : null],
    ['Unidades totales', dev.units_total || dev.total_units || (units.length || null)],
    ['Modelos', [...new Set(units.map((u) => u.prototype).filter(Boolean))].length || null],
    ['Créditos aceptados', Array.isArray(dev.creditos_aceptados) && dev.creditos_aceptados.length ? dev.creditos_aceptados.map((c) => titleCase(c)).join(' · ') : null],
    ['Dirección', dev.address_full || dev.street || null],
  ].filter(([, v]) => v != null && v !== '');
  if (!rows.length) return null;
  return <div style={{ ...box, padding: '4px 18px' }}>{rows.map(([k, v], i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '13px 0', borderBottom: i < rows.length - 1 ? `1px solid ${C.line2}` : 'none' }}><span style={{ fontFamily: FONT, fontSize: 13.5, color: C.faint }}>{k}</span><span style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 600, color: C.ink, textAlign: 'right' }}>{v}</span></div>)}</div>;
}

// ════════════════════ RESEÑAS ════════════════════
function VentaResenas({ devId }) {
  const [data, setData] = useState(undefined);
  const [sort, setSort] = useState('recientes');
  const [helpful, setHelpful] = useState({});
  const [expandedRv, setExpandedRv] = useState({});
  useEffect(() => { let alive = true; fetch(`${API}/api/reviews/development/${encodeURIComponent(devId)}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive) setData(d || null); }).catch(() => { if (alive) setData(null); }); return () => { alive = false; }; }, [devId]);
  const reviews = (data && (data.reviews || data.items)) || [];
  const avg = data && (data.avg_rating ?? data.average ?? data.rating);
  const total = (data && (data.total ?? data.count)) ?? reviews.length;
  const dist = (data && (data.distribution || data.breakdown)) || null;
  if (data === undefined) return <div style={{ ...box, padding: 20, fontFamily: FONT, color: C.faint }}>Cargando reseñas…</div>;
  if (!reviews.length && !avg) return <div style={{ ...box, padding: '26px 20px', textAlign: 'center' }}><div style={{ fontSize: 26, marginBottom: 8 }}>💬</div><div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 16, color: C.ink }}>Aún no hay reseñas de residentes</div><div style={{ fontFamily: FONT, fontSize: 13.5, color: C.faint, marginTop: 5 }}>Estamos recopilando opiniones verificadas de residentes y vecinos de la zona.</div></div>;
  const maxN = dist ? Math.max(...[5, 4, 3, 2, 1].map((s) => dist[s] || 0), 1) : 1;
  const stars = (n) => '★★★★★☆☆☆☆☆'.slice(5 - Math.round(n || 0), 10 - Math.round(n || 0));
  const sorted = [...reviews].sort((a, b) => sort === 'calificacion' ? (b.rating || b.stars || 0) - (a.rating || a.stars || 0) : 0);
  return (
    <div>
      <div style={{ ...box, padding: '20px 22px', display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ textAlign: 'center', flex: 'none' }}><div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 44, color: C.accent, lineHeight: 1 }}>{avg ? Number(avg).toFixed(1) : '—'}</div><div style={{ color: '#F5A623', fontSize: 16, letterSpacing: 2, marginTop: 4 }}>{stars(avg)}</div><div style={{ fontFamily: FONT, fontSize: 12, color: C.faint, marginTop: 4 }}>{total} reseña{total === 1 ? '' : 's'}</div></div>
        {dist && <div style={{ flex: 1, minWidth: 220 }}>{[5, 4, 3, 2, 1].map((s) => <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '3px 0' }}><span style={{ fontFamily: FONT, fontSize: 12, color: C.faint, width: 60 }}>{s} estrella{s === 1 ? '' : 's'}</span><div style={{ flex: 1, height: 8, borderRadius: 9999, background: C.line2, overflow: 'hidden' }}><div style={{ width: `${((dist[s] || 0) / maxN) * 100}%`, height: '100%', background: C.accent }} /></div><span style={{ fontFamily: FONT, fontSize: 12, color: C.ink2, width: 26, textAlign: 'right' }}>{dist[s] || 0}</span></div>)}</div>}
        <div style={{ flex: 'none' }}><button onClick={() => window.dispatchEvent(new CustomEvent('dmx:atlax-action', { detail: { nav: 'agendar' } }))} style={{ padding: '10px 18px', borderRadius: R_BTN, border: `1px solid ${C.accent}`, background: '#fff', color: C.accent, fontFamily: FONT, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Escribe una evaluación</button></div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <label style={{ fontFamily: FONT, fontSize: 13, color: C.faint, display: 'inline-flex', alignItems: 'center', gap: 8 }}>Ordenar por
          <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ fontFamily: FONT, fontSize: 13, color: C.ink, border: `1px solid ${C.line}`, borderRadius: R_BTN, padding: '6px 10px', background: '#fff', cursor: 'pointer' }}>
            <option value="recientes">Más recientes</option>
            <option value="calificacion">Mejor calificadas</option>
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sorted.slice(0, 6).map((rv, i) => (
          <div key={i} style={{ ...box, padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><span style={{ color: '#F5A623', fontSize: 14, letterSpacing: 2 }}>{stars(rv.rating || rv.stars)}</span><span style={{ fontFamily: FONT, fontSize: 11.5, color: C.faint }}>{rv.date || rv.created_at || rv.source || ''}</span></div>
            {(rv.verified || rv.verified_buyer) && <div style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: 700, color: C.green, marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>✓ Comprador verificado</div>}
            {rv.title && <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: C.ink, marginTop: 8 }}>{rv.title}</div>}
            {(() => { const txt = rv.text || rv.comment || rv.body || ''; const long = txt.length > 240; const shown = expandedRv[i] || !long; return (
              <div style={{ fontFamily: FONT, fontSize: 14, color: C.ink2, marginTop: 6, lineHeight: 1.6 }}>{shown ? txt : txt.slice(0, 240) + '… '}{long && <button onClick={() => setExpandedRv((e) => ({ ...e, [i]: !e[i] }))} style={{ ...linkA, fontSize: 13 }}>{expandedRv[i] ? 'Mostrar menos' : 'Mostrar reseña completa'}</button>}</div>
            ); })()}
            {(rv.owner_reply || rv.reply) && <div style={{ marginTop: 10, padding: '10px 13px', borderRadius: R_BTN, background: C.accentSoft, borderLeft: `3px solid ${C.accent}` }}><b style={{ fontFamily: FONT, fontSize: 12.5, color: C.accent }}>El desarrollador respondió:</b><span style={{ fontFamily: FONT, fontSize: 13, color: C.ink2 }}> {rv.owner_reply || rv.reply}</span></div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, fontFamily: FONT, fontSize: 12.5, color: C.faint }}>
              <span>¿Fue útil esto?</span>
              <button onClick={() => setHelpful((h) => ({ ...h, [i]: h[i] === 'y' ? null : 'y' }))} style={{ ...linkA, color: helpful[i] === 'y' ? C.accent : C.faint, fontWeight: 600 }}>👍 Sí</button>
              <button onClick={() => setHelpful((h) => ({ ...h, [i]: h[i] === 'n' ? null : 'n' }))} style={{ ...linkA, color: helpful[i] === 'n' ? C.accent : C.faint, fontWeight: 600 }}>👎 No</button>
              <button aria-label="Reportar" title="Reportar reseña" style={{ ...linkA, marginLeft: 'auto', fontSize: 13 }}>🚩</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════ MODALES DE CONVERSIÓN (spec §8) ═══════════════
// UI blanca coherente con la ficha. TODOS reusan el MISMO backend /api/buyer/registrar (no duplican motor).
function useLockScroll() {
  useEffect(() => { const p = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = p; }; }, []);
}
const inpV = { padding: '11px 13px', borderRadius: R_BTN, border: `1px solid ${C.line}`, background: '#fff', fontFamily: FONT, fontSize: 15, color: C.ink, outline: 'none', width: '100%', boxSizing: 'border-box' };
const lblV = { display: 'block', fontFamily: FONT, fontSize: 11.5, color: C.faint, marginBottom: 4 };

// Shell centrado con barra de progreso opcional, cierre X / Esc / click-fuera (spec §7 cierre)
function ModalCard({ title, onClose, children, maxW = 460, progress }) {
  useLockScroll();
  useEffect(() => { const h = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 12000, background: 'rgba(16,18,28,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: maxW, background: '#fff', borderRadius: 10, border: `1px solid ${C.line}`, boxShadow: '0 20px 60px rgba(16,24,40,0.28)', overflow: 'hidden' }}>
        {progress != null && <div style={{ height: 4, background: C.line2 }}><div style={{ height: '100%', width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`, background: C.accent, transition: 'width .25s' }} /></div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '15px 20px', borderBottom: `1px solid ${C.line2}` }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 18, color: C.ink }}>{title}</div>
          <button aria-label="Cerrar" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: C.faint, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}
function registrar(dev, unit, payload) {
  return fetch(`${API}/api/buyer/registrar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, body: JSON.stringify({ visitor_id: visitorId(), dev_id: dev.id, unit_number: unit ? unit.unit_number : null, ...payload }) });
}
function nextDays(n) {
  const out = []; const base = new Date();
  const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']; const MON = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  for (let i = 0; i < n; i++) { const d = new Date(base); d.setDate(base.getDate() + i); out.push({ key: d.toISOString().slice(0, 10), dow: i === 0 ? 'Hoy' : DOW[d.getDay()], day: d.getDate(), mon: MON[d.getMonth()] }); }
  return out;
}
const HORAS = ['9:00', '10:30', '12:00', '13:30', '15:00', '16:30', '18:00', '19:00'];

// §8 (a) Agendar recorrido — flujo progresivo: día → (revela) hora → (revela) datos. CTA deshab. hasta completar.
function AgendarModal({ dev, unit, onClose }) {
  const [day, setDay] = useState(null);
  const [hour, setHour] = useState(null);
  const [moreH, setMoreH] = useState(false);
  const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false); const [err, setErr] = useState(false);
  const days = useMemo(() => nextDays(7), []);
  const contactOk = name.trim().length >= 2 && phone.replace(/\D/g, '').length >= 10;
  const ready = day && hour && contactOk;
  const progress = (day ? 0.34 : 0) + (hour ? 0.33 : 0) + (contactOk ? 0.33 : 0);
  const submit = async () => {
    if (!ready || busy) return; setBusy(true); setErr(false);
    try { const r = await registrar(dev, unit, { name: name.trim(), phone: phone.trim(), source: 'ficha_agendar', contexto: `Visita ${day} ${hour}` }); if (!r.ok) throw new Error(); setSent(true); try { sendBuyerSignal('agendar', { entity_id: dev.id, value: `${day} ${hour}` }); } catch (e) { /* noop */ } } catch (e) { setErr(true); }
    setBusy(false);
  };
  if (sent) return (
    <ModalCard title="Visita solicitada" onClose={onClose} progress={1}>
      <div style={{ textAlign: 'center', padding: '8px 4px' }}><div style={{ fontSize: 40 }}>✅</div><div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 20, color: C.ink, marginTop: 8 }}>¡Listo, {name.split(' ')[0]}!</div><p style={{ fontFamily: FONT, fontSize: 14, color: C.ink2, marginTop: 8, lineHeight: 1.6 }}>Un asesor confirma tu visita a {dev.name} el {day} a las {hour} hrs.</p><div style={{ marginTop: 16 }}><CtaGrad onClick={onClose}>Seguir explorando</CtaGrad></div></div>
    </ModalCard>
  );
  return (
    <ModalCard title="Agendar recorrido" onClose={onClose} maxW={520} progress={progress}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: C.ink }}>1 · Selecciona el día</div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 10, paddingBottom: 4 }}>
        {days.map((d) => { const on = day === d.key; return (
          <button key={d.key} onClick={() => { setDay(d.key); setHour(null); }} style={{ flex: 'none', width: 62, padding: '10px 0', borderRadius: R_BTN, border: `1px solid ${on ? C.accent : C.line}`, background: on ? C.accent : '#fff', color: on ? '#fff' : C.ink, cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontFamily: FONT, fontSize: 11, opacity: 0.85 }}>{d.dow}</div>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 18 }}>{d.day}</div>
            <div style={{ fontFamily: FONT, fontSize: 10, opacity: 0.85 }}>{d.mon}</div>
          </button>); })}
      </div>
      <input type="date" onChange={(e) => { setDay(e.target.value); setHour(null); }} style={{ ...inpV, marginTop: 10 }} />
      {day && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: C.ink }}>2 · Selecciona un horario</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, alignItems: 'center' }}>
            {(moreH ? HORAS : HORAS.slice(0, 4)).map((h) => { const on = hour === h; return (
              <button key={h} onClick={() => setHour(h)} style={{ padding: '8px 16px', borderRadius: R_BTN, border: `1px solid ${on ? C.accent : C.line}`, background: on ? C.accent : '#fff', color: on ? '#fff' : C.ink, fontFamily: FONT, fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}>{h}</button>); })}
            {!moreH && <button onClick={() => setMoreH(true)} style={{ ...linkA, padding: '8px 4px' }}>Mostrar más horas</button>}
          </div>
        </div>
      )}
      {day && hour && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: C.ink, marginBottom: 10 }}>3 · Tus datos</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" style={inpV} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="WhatsApp / teléfono" style={inpV} />
          </div>
        </div>
      )}
      {err && <div style={{ marginTop: 12, fontFamily: FONT, fontSize: 13, color: C.red }}>No pudimos enviar. Revisa tu conexión e inténtalo de nuevo.</div>}
      <div style={{ marginTop: 18 }}>
        <button onClick={submit} disabled={!ready || busy} style={{ width: '100%', padding: 13, borderRadius: R_BTN, border: 'none', background: ready && !busy ? C.accent : C.line, color: '#fff', fontFamily: FONT, fontWeight: 700, fontSize: 16, cursor: ready && !busy ? 'pointer' : 'not-allowed' }}>{busy ? 'Enviando…' : 'Siguiente →'}</button>
      </div>
    </ModalCard>
  );
}

// §8 (b) Enviar mensaje — formulario con "Me gustaría" (4 checkboxes) + opt-in
function MensajeModal({ dev, unit, onClose }) {
  const [f, setF] = useState({ nombre: '', apellido: '', email: '', fecha: '', tel: '' });
  const [wants, setWants] = useState({ visita: true, info: false, disp: false, custom: false });
  const [optin, setOptin] = useState(true);
  const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false); const [err, setErr] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const ok = f.nombre.trim() && f.apellido.trim() && /@/.test(f.email);
  const WANTS = [['visita', 'Solicitar una visita'], ['info', 'Solicitar información'], ['disp', 'Confirmar disponibilidad'], ['custom', 'Tengo otra pregunta']];
  const submit = async () => {
    if (!ok || busy) return; setBusy(true); setErr(false);
    const quiero = WANTS.filter(([k]) => wants[k]).map(([, l]) => l).join(', ');
    try { const r = await registrar(dev, unit, { name: `${f.nombre.trim()} ${f.apellido.trim()}`.trim(), email: f.email.trim(), phone: f.tel.trim() || null, source: 'ficha_mensaje', contexto: [quiero, f.fecha ? `Fecha pref: ${f.fecha}` : ''].filter(Boolean).join(' · '), optin }); if (!r.ok) throw new Error(); setSent(true); } catch (e) { setErr(true); }
    setBusy(false);
  };
  if (sent) return (
    <ModalCard title="Mensaje enviado" onClose={onClose}>
      <div style={{ textAlign: 'center', padding: '8px 4px' }}><div style={{ fontSize: 40 }}>✅</div><div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 20, color: C.ink, marginTop: 8 }}>¡Gracias, {f.nombre}!</div><p style={{ fontFamily: FONT, fontSize: 14, color: C.ink2, marginTop: 8, lineHeight: 1.6 }}>Un asesor de {dev.name} te responde muy pronto.</p><div style={{ marginTop: 16 }}><CtaGrad onClick={onClose}>Seguir explorando</CtaGrad></div></div>
    </ModalCard>
  );
  return (
    <ModalCard title="Enviar mensaje" onClose={onClose} maxW={520}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <input value={f.nombre} onChange={set('nombre')} placeholder="Nombre*" style={inpV} />
        <input value={f.apellido} onChange={set('apellido')} placeholder="Apellido*" style={inpV} />
      </div>
      <input value={f.email} onChange={set('email')} inputMode="email" placeholder="Correo electrónico*" style={{ ...inpV, marginTop: 10 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
        <div><label style={lblV}>Fecha preferida</label><input type="date" value={f.fecha} onChange={set('fecha')} style={inpV} /></div>
        <div><label style={lblV}>Teléfono</label><input value={f.tel} onChange={set('tel')} inputMode="tel" placeholder="( ) -" style={inpV} /></div>
      </div>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: C.ink, marginTop: 16 }}>Me gustaría…</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px', marginTop: 10 }}>
        {WANTS.map(([k, l]) => (
          <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontSize: 13.5, color: C.ink2, cursor: 'pointer' }}>
            <input type="checkbox" checked={wants[k]} onChange={(e) => setWants((w) => ({ ...w, [k]: e.target.checked }))} style={{ accentColor: C.accent }} />{l}
          </label>
        ))}
      </div>
      {err && <div style={{ marginTop: 12, fontFamily: FONT, fontSize: 13, color: C.red }}>No pudimos enviar. Inténtalo de nuevo.</div>}
      <div style={{ marginTop: 16 }}>
        <button onClick={submit} disabled={!ok || busy} style={{ width: '100%', padding: 13, borderRadius: R_BTN, border: 'none', background: ok && !busy ? C.accent : C.line, color: '#fff', fontFamily: FONT, fontWeight: 700, fontSize: 16, cursor: ok && !busy ? 'pointer' : 'not-allowed' }}>{busy ? 'Enviando…' : 'Enviar mensaje'}</button>
      </div>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12, fontFamily: FONT, fontSize: 11.5, color: C.faint, cursor: 'pointer' }}>
        <input type="checkbox" checked={optin} onChange={(e) => setOptin(e.target.checked)} style={{ accentColor: C.accent, marginTop: 2 }} />
        Quiero recibir novedades de este y otros desarrollos similares.
      </label>
    </ModalCard>
  );
}

// §8 (c) Compartir este listado
function CompartirModal({ dev, onClose }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? window.location.href : '';
  const photo = (dev.photos || [])[0];
  const addr = dev.address_full || dev.street || [dev.colonia, dev.alcaldia].filter(Boolean).join(', ');
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (e) { /* noop */ } };
  const mail = `mailto:?subject=${encodeURIComponent(dev.name)}&body=${encodeURIComponent(`Mira este desarrollo: ${dev.name} — ${url}`)}`;
  return (
    <ModalCard title="Compartir este listado" onClose={onClose} maxW={440}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingBottom: 14, borderBottom: `1px solid ${C.line2}` }}>
        {photo && <img src={photo} alt="" style={{ width: 72, height: 56, borderRadius: R_BTN, objectFit: 'cover', border: `1px solid ${C.line}` }} />}
        <div style={{ minWidth: 0 }}><div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: C.ink }}>{dev.name}</div><div style={{ fontFamily: FONT, fontSize: 13, color: C.faint }}>{addr}</div></div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
        <a href={mail} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: R_BTN, border: `1px solid ${C.line}`, textDecoration: 'none', color: C.ink, fontFamily: FONT, fontSize: 14 }}><span style={{ fontSize: 18 }}>✉️</span>Correo electrónico</a>
        <button onClick={copy} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: R_BTN, border: `1px solid ${copied ? C.accent : C.line}`, background: '#fff', color: copied ? C.accent : C.ink, fontFamily: FONT, fontSize: 14, cursor: 'pointer', textAlign: 'left' }}><span style={{ fontSize: 18 }}>🔗</span>{copied ? '¡Enlace copiado!' : 'Copiar enlace'}</button>
      </div>
    </ModalCard>
  );
}

// ════════════════════ FICHA ════════════════════
export default function FichaVenta() {
  const { id } = useParams();
  const [dev, setDev] = useState(null);
  const [loadErr, setLoadErr] = useState(false);
  const [unit, setUnit] = useState(null);
  const [lens, setLens] = useState('invertir');
  const [scans, setScans] = useState([]);
  const [activeScan, setActiveScan] = useState(null);
  const [similars, setSimilars] = useState([]);
  const [savedUnits, setSavedUnits] = useState(() => new Set());
  const [conv, setConv] = useState(null);   // {type:'agendar'|'mensaje'|'compartir'} — modales de conversión §8
  const [devFav, setDevFav] = useState(false);
  const [activeNav, setActiveNav] = useState('destacados');
  const [gallery, setGallery] = useState(null);      // índice inicial del modal de galería
  const [avm, setAvm] = useState({});
  const [openModel, setOpenModel] = useState(null);

  const refs = { destacados: useRef(null), precios: useRef(null), dinero: useRef(null), tarifas: useRef(null), tour: useRef(null), servicios: useRef(null), detalles: useRef(null), ubicacion: useRef(null), resenas: useRef(null), confianza: useRef(null) };
  const scrollTo = useCallback((k) => { const el = refs[k] && refs[k].current; if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [refs]);

  useEffect(() => { let alive = true; setLoadErr(false); setDev(null); fetchDevelopment(id).then((d) => { if (alive) setDev(d); }).catch(() => { if (alive) setLoadErr(true); }); return () => { alive = false; }; }, [id]);
  useEffect(() => { document.body.style.background = '#fff'; return () => { document.body.style.background = ''; }; }, []);
  useEffect(() => {
    if (!dev || !dev.id) return undefined;
    let alive = true;
    fetch(`${API}/api/tour-3dgs/scans?project_slug=${encodeURIComponent(dev.slug || dev.id)}&limit=20`).then((r) => r.json()).then((d) => { if (alive) { const it = d?.items || []; setScans(it); setActiveScan(it[0]?.scan_id || null); } }).catch(() => { if (alive) setScans([]); });
    const colid = dev.colonia_id || dev.colonia; const us = (dev.units || []).filter((u) => u.price && m2of(u));
    if (colid && us.length) fetch(`${API}/api/precio-posicion-batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ colonia: colid, nueva: true, unidades: us.map((u) => ({ id: u.id, precio: u.price, m2: u.m2_privative || u.m2_total, rec: u.bedrooms, ban: u.bathrooms })) }) }).then((r) => r.json()).then((d) => { if (!alive) return; const m = {}; (d.unidades || []).forEach((v) => { if (v.id && v.etiqueta) m[v.id] = v; }); setAvm(m); }).catch(() => {});
    fetchDevelopments({ colonia: colid, limit: 6 }).then((r) => { if (alive) setSimilars((Array.isArray(r) ? r : (r?.developments || [])).filter((x) => x.id !== dev.id).slice(0, 4)); }).catch(() => {});
    try { sendBuyerSignal('ficha_view', { entity_id: dev.id, colonia: colid, value: 'venta' }); } catch (e) { /* noop */ }
    const onScroll = () => { let cur = 'destacados'; for (const [k] of NAV) { const el = refs[k] && refs[k].current; if (el && el.getBoundingClientRect().top <= 130) cur = k; } setActiveNav(cur); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { alive = false; window.removeEventListener('scroll', onScroll); };
  }, [dev && dev.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const agendar = useCallback((reason) => setConv({ type: reason === 'mensaje' ? 'mensaje' : reason === 'compartir' ? 'compartir' : 'agendar' }), []);
  const toggleSaveUnit = useCallback(() => { if (!unit) return; setSavedUnits((s) => { const n = new Set(s); n.has(unit.unit_number) ? n.delete(unit.unit_number) : n.add(unit.unit_number); return n; }); try { sendBuyerSignal('save_unit', { entity_id: dev?.id, unit_number: unit.unit_number }); } catch (e) { /* noop */ } }, [unit, dev]);
  const pickUnit = useCallback((u) => { setUnit(u); if (u) setTimeout(() => scrollTo('dinero'), 60); }, [scrollTo]);

  const navRef = useRef(null);
  useEffect(() => {
    const onAction = (e) => { const nav = e && e.detail && e.detail.nav; const h = navRef.current; if (!nav || !h) return; if (nav === 'agendar') h.agendar(); else if (nav === 'guardar') h.toggleSaveUnit(); else if (nav === 'unidad' || nav === 'comparar') h.scrollTo('precios'); else if (nav === 'dinero') h.scrollTo('dinero'); else if (nav === 'confianza') h.scrollTo('confianza'); else if (nav === 'proyecto') h.scrollTo('destacados'); else if (nav === 'tour') h.scrollTo('tour'); };
    window.addEventListener('dmx:atlax-action', onAction); return () => window.removeEventListener('dmx:atlax-action', onAction);
  }, []);
  navRef.current = { scrollTo, agendar, toggleSaveUnit };
  const atlaxContext = useMemo(() => { if (!dev) return ''; const p = [`Ficha de VENTA de "${dev.name}" en ${titleCase(dev.colonia || '')}. Sección: ${activeNav}.`]; if (unit) p.push(`Ve la unidad ${unit.unit_number} (${money(unit.price)}).`); p.push(`Lente: ${lens === 'invertir' ? 'inversión' : 'vivir'}.`); return p.join(' '); }, [dev, unit, lens, activeNav]);
  const atlaxQuick = useMemo(() => ([{ label: 'Ver modelos', nav: 'unidad' }, { label: 'Mis números', nav: 'dinero' }, { label: 'Agendar', nav: 'agendar' }, { label: '¿Es confiable?', nav: 'confianza' }]), []);

  if (loadErr) return <div style={{ fontFamily: FONT, padding: 120, textAlign: 'center', color: C.faint }}><PublicNav />No pudimos cargar este desarrollo.</div>;
  if (!dev) return <div style={{ fontFamily: FONT, padding: 120, textAlign: 'center', color: C.faint }}><PublicNav />Cargando…</div>;

  const amen = Array.isArray(dev.amenities) ? dev.amenities : [];
  const nUnits = (dev.units || []).length || dev.units_total || dev.total_units || 0;
  const developer = dev.developer || {};
  const seals = [developer.verified_constitution && 'Constitución verificada', developer.no_judicial_records && 'Sin antecedentes judiciales', developer.no_profeco_complaints && 'Sin quejas PROFECO', developer.projects_delivered && `${developer.projects_delivered} proyectos entregados`, developer.years_experience && `${developer.years_experience} años de experiencia`].filter(Boolean);
  const units = dev.units || [];
  const rangeOf = (arr, suf = '') => { const v = [...new Set(arr.filter((x) => x != null))].sort((a, b) => a - b); return v.length ? (v[0] === v[v.length - 1] ? `${v[0]}${suf}` : `${v[0]}–${v[v.length - 1]}${suf}`) : null; };
  const bedR = rangeOf(units.map((u) => u.bedrooms));
  const bathR = rangeOf(units.map((u) => u.bathrooms));
  const m2R = rangeOf(units.map(m2of));
  const groups = {}; units.forEach((u) => { const k = u.prototype || '?'; (groups[k] = groups[k] || []).push(u); });
  const models = Object.entries(groups).map(([proto, us]) => { const prices = us.map((u) => u.price).filter(Boolean); const m2s = us.map(m2of).filter(Boolean); return { proto, us, min: Math.min(...prices), max: Math.max(...prices), m2min: Math.min(...m2s), m2max: Math.max(...m2s), beds: [...new Set(us.map((u) => u.bedrooms).filter((x) => x != null))].sort((a, b) => a - b), baths: [...new Set(us.map((u) => u.bathrooms).filter((x) => x != null))].sort((a, b) => a - b), avail: us.filter((u) => u.status === 'disponible').length }; }).sort((a, b) => a.min - b.min);
  const destak = [
    { i: '🏗️', l: STAGE[dev.stage] || dev.stage, s: dev.delivery_estimate ? `Entrega ${dev.delivery_estimate}` : 'Entrega por confirmar' },
    nUnits > 0 && { i: '🏢', l: `${nUnits} unidades`, s: `${units.filter((u) => u.status === 'disponible').length} disponibles` },
    dev.bedrooms_range && { i: '🛏️', l: `${dev.bedrooms_range} recámaras`, s: 'Según el modelo' },
    dev.m2_range && { i: '📐', l: `${dev.m2_range} m²`, s: 'Superficie' },
    dev.parking_range && { i: '🚗', l: `${dev.parking_range} estac.`, s: null },
    ...amen.slice(0, 3).map((x) => { const a = amenInfo(x); return { i: a.icon, l: titleCase(a.label), s: null }; }),
  ].filter(Boolean);

  return (
    <LightScope>
    <div style={{ background: '#fff', minHeight: '100vh', fontFamily: FONT, color: C.ink }}>
      <DevStructuredData dev={dev} />
      <PublicNav />
      <main style={{ paddingTop: 60 }}>
        {/* HERO */}
        <div style={{ maxWidth: MAXW, width: '95%', margin: '0 auto', paddingTop: 16 }}>
          <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.faint, marginBottom: 10 }}>
            <Link to="/marketplace" style={{ color: C.accent, textDecoration: 'none' }}>Marketplace</Link>{' / '}{[dev.colonia, dev.alcaldia, 'CDMX'].filter(Boolean).map((s) => titleCase(s)).join(' · ')}
          </div>
          <Gallery dev={dev} scans={scans} hasVideo={!!(dev.video_url || dev.video)} onOpen={(i, tab) => setGallery({ i, tab })} />
          {/* ENCABEZADO DE PROPIEDAD (spec §4) */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginTop: 18 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h1 style={{ fontFamily: FONT, fontWeight: 400, fontSize: 'clamp(28px,4vw,40px)', lineHeight: 1.4, color: C.ink, margin: 0, letterSpacing: '0.16px' }}>{dev.name}</h1>
              <div style={{ fontFamily: FONT, fontSize: 16, color: C.ink2, marginTop: 6 }}>{dev.address_full || dev.street || [dev.colonia, dev.alcaldia].filter(Boolean).join(', ')}</div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
                <DevRating developer={developer} onReviews={() => scrollTo('resenas')} />
                {dev.verified && <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 400, color: C.ink2, display: 'inline-flex', alignItems: 'center', gap: 5 }}>🛡️ Verificado</span>}
                <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 400, color: C.ink2, display: 'inline-flex', alignItems: 'center', gap: 5 }}>↻ Actualizado hoy</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <button aria-label="Compartir" onClick={() => setConv({ type: 'compartir' })} style={iconBtn}>↗</button>
              <button aria-label="Guardar en favoritos" onClick={() => { setDevFav((v) => !v); try { sendBuyerSignal('favorite', { entity_id: dev.id }); } catch (e) { /* noop */ } }} style={{ ...iconBtn, color: devFav ? C.accent : C.ink2, borderColor: devFav ? C.accent : C.line }}>{devFav ? '♥' : '♡'}</button>
            </div>
          </div>
          <SummaryBar price={dev.price_from_display || money(dev.price_from)} bedR={bedR} bathR={bathR} m2R={m2R ? `${m2R} m²` : null} />
          <ReadMore text={dev.description} />
        </div>

        {/* SUB-NAV STICKY */}
        <div style={{ position: 'sticky', top: 56, zIndex: 40, background: '#fff', borderBottom: `1px solid ${C.line}`, marginTop: 18 }}>
          <div style={{ maxWidth: MAXW, width: '95%', margin: '0 auto', display: 'flex', gap: 2, overflowX: 'auto' }}>
            {NAV.filter(([k]) => (k !== 'tour' || scans.length > 0) && (k !== 'servicios' || amen.length > 0 || (dev.units || []).length > 0)).map(([k, l]) => (
              <button key={k} onClick={() => scrollTo(k)} style={{ padding: '13px 14px', border: 'none', borderBottom: activeNav === k ? `3px solid ${C.accent}` : '3px solid transparent', background: 'none', color: activeNav === k ? C.accent : C.ink2, fontFamily: FONT, fontWeight: activeNav === k ? 700 : 500, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>{l}</button>
            ))}
          </div>
        </div>

        {/* BODY 2 COLUMNAS */}
        <div className="dmx-venta-grid" style={{ maxWidth: MAXW, width: '95%', margin: '0 auto', padding: '10px 0 90px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 336px', gap: 40, alignItems: 'start' }}>
          <div style={{ minWidth: 0 }}>

            <Section id="destacados" refEl={refs.destacados} title="Puntos destacados">
              <div style={{ ...box, padding: '18px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '14px 22px' }}>
                {destak.map((it, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span style={{ fontSize: 20, width: 26, textAlign: 'center', flex: 'none' }}>{it.i}</span><div style={{ minWidth: 0 }}><div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 600, color: C.ink, lineHeight: 1.25 }}>{it.l}</div>{it.s && <div style={{ fontFamily: FONT, fontSize: 12, color: C.faint }}>{it.s}</div>}</div></div>)}
              </div>
            </Section>

            <Section id="precios" refEl={refs.precios} title="Precios y modelos">
              <VentaPrecios dev={dev} selectedUnit={unit} onSelectUnit={pickUnit} onAgendar={() => agendar('agendar')} avm={avm} onOpenModel={setOpenModel} />
            </Section>

            {/* Tu dinero (calculadoras) → EN STANDBY hasta acabar el diseño puro. */}

            <Section id="tarifas" refEl={refs.tarifas} title="Tarifas y políticas">
              <VentaTarifas dev={dev} />
            </Section>

            {scans.length > 0 && activeScan && (
              <Section id="tour" refEl={refs.tour} title="Recorrido 3D">
                {scans.length > 1 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>{scans.map((s) => <button key={s.scan_id} onClick={() => setActiveScan(s.scan_id)} style={{ padding: '7px 13px', borderRadius: 9999, border: `1px solid ${activeScan === s.scan_id ? C.accent : C.line}`, background: activeScan === s.scan_id ? C.accent : '#fff', color: activeScan === s.scan_id ? '#fff' : C.ink2, fontFamily: FONT, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>{s.unit_id || s.title || 'Modelo'}</button>)}</div>}
                <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.line}`, height: 'clamp(360px,52vw,540px)' }}><Tour3DViewer scanId={activeScan} theme="cream" uiMode="full" /></div>
              </Section>
            )}

            {(amen.length > 0 || (dev.units || []).length > 0) && <Section id="servicios" refEl={refs.servicios} title="Servicios y comodidades"><VentaServicios dev={dev} /></Section>}

            <Section id="detalles" refEl={refs.detalles} title="Detalles"><VentaDetalles dev={dev} /></Section>

            <Section id="ubicacion" refEl={refs.ubicacion} title="Ubicación">
              <div style={{ ...box, padding: 0, overflow: 'hidden' }}>
                <div style={{ height: 280, background: C.bgSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: `1px solid ${C.line}` }}>
                  <div style={{ textAlign: 'center', color: C.faint, fontFamily: FONT }}><div style={{ fontSize: 26 }}>📍</div><div style={{ fontSize: 13, marginTop: 6 }}>Mapa interactivo — próximamente</div></div>
                </div>
                <div style={{ display: 'flex', gap: 8, padding: 12, overflowX: 'auto' }}>
                  {['Escuelas', 'Restaurantes', 'Supermercados', 'Café', 'Transporte', 'Parques'].map((c) => <button key={c} style={{ padding: '8px 14px', borderRadius: 9999, border: `1px solid ${C.line}`, background: '#fff', color: C.ink2, fontFamily: FONT, fontSize: 13, cursor: 'default', whiteSpace: 'nowrap' }}>{c}</button>)}
                </div>
                <div style={{ padding: '14px 16px', fontFamily: FONT, fontSize: 14, color: C.ink2, borderTop: `1px solid ${C.line2}` }}>{dev.address_full || dev.street || [dev.colonia, dev.alcaldia].filter(Boolean).join(', ')}</div>
              </div>
            </Section>

            <Section id="resenas" refEl={refs.resenas} title="Reseñas"><VentaResenas devId={dev.id} /></Section>

            {/* Confianza (riesgo/sellos) → EN STANDBY hasta acabar el diseño puro. */}

            {similars.length > 0 && (
              <Section title="Desarrollos cercanos">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 14 }}>
                  {similars.map((s) => (
                    <Link key={s.id} to={`/desarrollo/${s.id}?venta=1`} className="dmx-sim" style={{ textDecoration: 'none', ...box, overflow: 'hidden', display: 'block' }}>
                      <div style={{ aspectRatio: '4/3', background: C.bgSoft }}>{(s.photos || [])[0] && <img src={s.photos[0]} alt={s.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</div>
                      <div style={{ padding: '11px 13px' }}><div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14.5, color: C.ink }}>{titleCase(s.name)}</div><div style={{ fontFamily: FONT, fontSize: 12.5, color: C.faint, marginTop: 2 }}>{titleCase(s.colonia || '')}</div><div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: C.accent, marginTop: 6 }}>Desde {money(s.price_from)}</div></div>
                    </Link>
                  ))}
                </div>
              </Section>
            )}
          </div>

          {/* CARD CONTACTO STICKY (patrón apts "Comunícate con esta propiedad") */}
          <aside className="dmx-venta-side" style={{ position: 'sticky', top: 122 }}>
            <div style={{ ...box, padding: 20, boxShadow: '0 4px 16px rgba(16,24,40,0.06)' }}>
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 18, color: C.ink, textAlign: 'center' }}>Comunícate con esta propiedad</div>
              <div style={{ fontFamily: FONT, fontSize: 12, color: C.ink2, textAlign: 'center', marginTop: 4 }}>Opciones de recorrido: <b>En persona · Por video</b></div>
              <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 14 }}>{unit ? `Unidad ${unit.unit_number}` : 'Desde'}</div>
              <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 26, color: C.ink, margin: '2px 0' }}>{money(unit ? unit.price : dev.price_from)}</div>
              <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.faint, marginBottom: 14 }}>{STAGE[dev.stage] || dev.stage}{dev.delivery_estimate ? ` · entrega ${dev.delivery_estimate}` : ''}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                <CtaGrad onClick={() => agendar('agendar')}>Agendar recorrido</CtaGrad>
                <CtaGhost onClick={() => agendar('mensaje')}>Enviar mensaje</CtaGhost>
                {unit && <button onClick={toggleSaveUnit} style={{ width: '100%', padding: 12, borderRadius: R_BTN, border: `1px solid ${C.line}`, background: '#fff', color: C.ink2, fontFamily: FONT, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>{savedUnits.has(unit.unit_number) ? '♥ Guardada' : `Guardar la ${unit.unit_number}`}</button>}
              </div>
              {/* Teléfono como enlace con ícono, precedido de divisor (spec §5) */}
              {developer.phone && <a href={`tel:${developer.phone}`} onClick={() => { try { sendBuyerSignal('phone_click', { entity_id: dev.id }); } catch (e) { /* noop */ } }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderTop: `1px solid ${C.line2}`, marginTop: 14, paddingTop: 14, fontFamily: FONT, fontWeight: 700, fontSize: 18, color: C.link, textDecoration: 'none' }}>📱 {developer.phone}</a>}
              {/* Recorrido + idioma + horario (patrón apts §5) */}
              <div style={{ borderTop: `1px solid ${C.line2}`, marginTop: 14, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontFamily: FONT, fontSize: 12.5, color: C.faint, width: 84, flex: 'none' }}>🌐 Idioma</span><span style={{ fontFamily: FONT, fontSize: 13, color: C.ink }}>Español · Inglés</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontFamily: FONT, fontSize: 12.5, color: C.faint, width: 84, flex: 'none' }}>🕐 Horario</span><span style={{ fontFamily: FONT, fontSize: 13, color: C.ink }}><b style={{ color: C.green }}>Abierto</b> · Lun–Sáb 9:00–19:00</span></div>
                <button onClick={() => agendar('agendar')} style={{ ...linkA, alignSelf: 'flex-start', marginLeft: 92, fontSize: 12.5 }}>Ver todas las horas</button>
              </div>
              <div style={{ borderTop: `1px solid ${C.line2}`, marginTop: 14, paddingTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 36, height: 36, borderRadius: 9999, background: C.accent, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: FONT, fontWeight: 800, fontSize: 14 }}>{(developer.name || dev.name || 'D')[0]}</span>
                <div style={{ minWidth: 0 }}><div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: C.ink }}>{developer.name || 'Tu asesor DMX'}</div><div style={{ fontFamily: FONT, fontSize: 11.5, color: C.faint }}>{developer.projects_delivered ? `${developer.projects_delivered} proyectos entregados` : 'Desarrollador verificado'}</div></div>
              </div>
              <div style={{ marginTop: 12, fontFamily: FONT, fontSize: 12, color: C.faint, textAlign: 'center' }}>✦ ¿Dudas? Pregúntale a <b style={{ color: C.accent }}>Atlax</b> — conoce esta unidad.</div>
            </div>
          </aside>
        </div>
      </main>

      {/* barra móvil — 3 acciones con etiquetas abreviadas (spec §10) */}
      <div className="dmx-venta-mobilebar" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 55, display: 'none', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#fff', borderTop: `1px solid ${C.line}`, boxShadow: '0 -4px 16px rgba(16,24,40,0.08)' }}>
        <button onClick={() => agendar('agendar')} style={{ flex: 1, padding: '11px 8px', borderRadius: R_BTN, border: 'none', background: C.accent, color: '#fff', fontFamily: FONT, fontWeight: 700, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>Recorrido</button>
        <button onClick={() => agendar('mensaje')} style={{ flex: 1, padding: '11px 8px', borderRadius: R_BTN, border: `1px solid ${C.accent}`, background: '#fff', color: C.accent, fontFamily: FONT, fontWeight: 700, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>Mensaje</button>
        {developer.phone
          ? <a href={`tel:${developer.phone}`} style={{ flex: 1, padding: '11px 8px', borderRadius: R_BTN, border: `1px solid ${C.accent}`, background: '#fff', color: C.accent, fontFamily: FONT, fontWeight: 700, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'center', textDecoration: 'none' }}>Llamar</a>
          : <button onClick={() => agendar('mensaje')} style={{ flex: 1, padding: '11px 8px', borderRadius: R_BTN, border: `1px solid ${C.accent}`, background: '#fff', color: C.accent, fontFamily: FONT, fontWeight: 700, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>Llamar</button>}
      </div>

      <style>{`@media(max-width:940px){ .dmx-venta-grid{ grid-template-columns: minmax(0,1fr) !important; } .dmx-venta-side{ position: static !important; } .dmx-venta-mobilebar{ display: flex !important; } } @media(max-width:600px){ .dmx-amen-3{ grid-template-columns: repeat(2,1fr) !important; } .dmx-amen-2{ grid-template-columns: 1fr !important; } } .dmx-sim{ transition: box-shadow .15s, transform .15s; } .dmx-sim:hover{ box-shadow: 0 8px 22px rgba(16,24,40,0.10); transform: translateY(-2px); }`}</style>

      {gallery && <GalleryModal dev={dev} scans={scans} startAt={gallery.i} startTab={gallery.tab} onClose={() => setGallery(null)} />}
      {openModel && <ModeloModal dev={dev} models={models} activeProto={openModel} avm={avm} onClose={() => setOpenModel(null)} onSelectUnit={pickUnit} onAgendar={() => agendar('agendar')} />}
      <AtlaxBubble theme="light" context={atlaxContext} quickActions={atlaxQuick} dev={dev} unit={unit} lens={lens} />
      {conv?.type === 'agendar' && <AgendarModal dev={dev} unit={unit} onClose={() => setConv(null)} />}
      {conv?.type === 'mensaje' && <MensajeModal dev={dev} unit={unit} onClose={() => setConv(null)} />}
      {conv?.type === 'compartir' && <CompartirModal dev={dev} onClose={() => setConv(null)} />}
    </div>
    </LightScope>
  );
}

function Stat({ k, v }) { return <div><div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 22, color: C.ink }}>{v}</div><div style={{ fontFamily: FONT, fontSize: 12, color: C.faint }}>{k}</div></div>; }

// ════════════════════ TARIFAS Y POLÍTICAS (sub-tabs estilo apts) ════════════════════
function VentaTarifas({ dev }) {
  const [tab, setTab] = useState('pago');
  const creds = Array.isArray(dev.creditos_aceptados) ? dev.creditos_aceptados : [];
  const tabs = [['pago', 'Formas de pago'], ['gastos', 'Gastos de escrituración'], ['politicas', 'Políticas']];
  return (
    <div>
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.line}`, marginBottom: 18 }}>
        {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} style={{ padding: '10px 4px', marginRight: 22, border: 'none', borderBottom: tab === k ? `2.5px solid ${C.accent}` : '2.5px solid transparent', background: 'none', color: tab === k ? C.accent : C.ink2, fontFamily: FONT, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>{l}</button>)}
      </div>
      {tab === 'pago' && (
        <div style={{ ...box, padding: '4px 18px' }}>
          {[['Apartado', 'Reserva tu unidad · reembolsable según contrato'], ['Enganche', 'Se define por esquema de pago · ver "Tu dinero"'], ['Mensualidades', 'Durante la construcción, sin intereses'], ['Contra entrega / crédito', creds.length ? creds.map((c) => titleCase(c)).join(' · ') : 'Contado o crédito hipotecario'], ['Escrituración', 'Al finalizar la obra']].map(([k, v], i, arr) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '13px 0', borderBottom: i < arr.length - 1 ? `1px solid ${C.line2}` : 'none' }}><span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 600, color: C.ink }}>{k}</span><span style={{ fontFamily: FONT, fontSize: 13.5, color: C.ink2, textAlign: 'right', maxWidth: '60%' }}>{v}</span></div>
          ))}
        </div>
      )}
      {tab === 'gastos' && <div style={{ ...box, padding: '16px 18px', fontFamily: FONT, fontSize: 14, color: C.ink2, lineHeight: 1.7 }}>Los gastos de escrituración (notario, impuesto de adquisición ISAI, registro, avalúo) rondan el <b style={{ color: C.ink }}>4–7% del valor</b> y corren por cuenta del comprador. El desglose exacto lo calcula el simulador en <b style={{ color: C.accent }}>Tu dinero → esquema de pago</b>.</div>}
      {tab === 'politicas' && <div style={{ ...box, padding: '4px 18px' }}>{[['Mascotas', amenInfo && (dev.amenities || []).some((a) => /pet|mascota/i.test(a)) ? 'Pet friendly' : 'Consultar con el desarrollador'], ['Entrega', dev.delivery_estimate || 'Por confirmar'], ['Preventa', 'Precio de lista sujeto a etapa de venta']].map(([k, v], i, arr) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '13px 0', borderBottom: i < arr.length - 1 ? `1px solid ${C.line2}` : 'none' }}><span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 600, color: C.ink }}>{k}</span><span style={{ fontFamily: FONT, fontSize: 13.5, color: C.ink2, textAlign: 'right' }}>{v}</span></div>)}</div>}
    </div>
  );
}
