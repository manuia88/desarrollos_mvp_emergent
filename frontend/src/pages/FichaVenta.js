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
import { fetchDevelopment, fetchDevelopments, calculateMortgage } from '../api/marketplace';
import { getIsaiComprador, getClosingCost } from '../api/tax_projector';
import { sendBuyerSignal, visitorId } from '../lib/buyerSignal';
import { amenInfo } from '../components/ficha/amenIcons';
// Calculadora de inversión (personal + institucional) — reusa motor inversion-v4 (theme-adaptive dentro de LightScope)
import InversionV4Calculator from '../components/investment/InversionV4Calculator';
// Calculadoras standalone re-vestidas al look v4 (motores intactos): hipotecario (comparador) + ISAI/cierre
import FichaHipotecaComparador from '../components/ficha/FichaHipotecaComparador';
import FichaTaxISAI from '../components/ficha/FichaTaxISAI';
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
  accent: '#6D4AFF',     // ACCIÓN = morado DMX
  accentSoft: '#F1EEFF',
  link: '#6D4AFF',       // enlaces = morado DMX (ya NO azul)
  green: '#1E9E63',      // disponible
  amber: '#C2410C',      // reservado/apartado
  red: '#DC2626',        // vendido/escasez
};
const GRAD = 'linear-gradient(120deg, #6D4AFF, #C63FAE)';   // degradado de marca morado→rosa (v4)
const BLUE = '#2563EB';   // azul para precios en la lista (pedido del founder)
// borde con degradado (double-background, respeta border-radius)
const gradBorder = (fill = '#ffffff', r = R_BTN) => ({ borderRadius: r, border: '1.5px solid transparent', backgroundImage: `linear-gradient(${fill},${fill}), ${GRAD}`, backgroundOrigin: 'border-box', backgroundClip: 'padding-box, border-box', WebkitBackgroundClip: 'padding-box, border-box' });
const R_BTN = 8, R_CARD = 12, MAXW = 1200;   // radios suavizados (upgrade: menos cuadrado) + contenedor
const PAGE_BG = '#f6f7f9';                    // tinte sutil para que las tarjetas blancas resalten
const CARD_LINE = '#e6e7ec';                  // borde de tarjeta más suave que #cacaca
const CARD_SHADOW = '0 1px 2px rgba(16,24,40,0.04), 0 4px 14px rgba(16,24,40,0.05)';
const FONT = "'DM Sans', system-ui, -apple-system, sans-serif";   // cuerpo = igual que el nav
const HEAD = "'Outfit', system-ui, -apple-system, sans-serif";    // títulos/números = igual que el logo del nav
const money = (n) => (n != null && n !== '' ? `$${Number(n).toLocaleString('es-MX')}` : '—');
// TitleCase inteligente: normaliza snake_case/kebab a palabras antes de capitalizar
const tcNice = (s) => titleCase(String(s || '').replace(/[_-]+/g, ' ').trim());
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
  ['destacados', 'El proyecto'],
  ['precios', 'Precios y modelos'],
  ['tarifas', 'Planes de pago'],
  ['tour', 'Recorrido 3D'],
  ['ubicacion', 'Ubicación'],
  ['inversion', 'Inversión'],
];

// ── átomos UI estilo apts ────────────────────────────────────────────────────
const box = { background: C.bg, border: `1px solid ${CARD_LINE}`, borderRadius: R_CARD, boxShadow: CARD_SHADOW };
// spec §1.2: títulos de sección 30px, peso Regular (400), line-height ~1.2, gris #4c4c4c
function H2({ children }) { return <h2 style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 28, lineHeight: 1.2, color: C.ink, margin: 0, letterSpacing: '-0.01em' }}>{children}</h2>; }
function DmxChip() { return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: FONT, fontSize: 10.5, fontWeight: 700, color: C.accent, background: C.accentSoft, border: `1px solid ${C.accent}33`, borderRadius: 9999, padding: '2px 9px', letterSpacing: '0.02em' }}>✦ Solo en DMX</span>; }
function CtaGrad({ onClick, children }) { return <button className="dmx-press" onClick={onClick} style={{ width: '100%', padding: '12px', borderRadius: R_BTN, border: 'none', background: GRAD, color: '#fff', fontFamily: FONT, fontWeight: 700, fontSize: 16, cursor: 'pointer', boxShadow: '0 8px 20px rgba(109,74,255,0.26)' }}>{children}</button>; }
function CtaGhost({ onClick, children }) { return <button className="dmx-press" onClick={onClick} style={{ width: '100%', padding: '12px', ...gradBorder('#fff', R_BTN), color: C.accent, fontFamily: FONT, fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>{children}</button>; }
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
          <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 19, color: c.verified ? C.accent : C.ink, display: 'flex', alignItems: 'center', gap: 6, letterSpacing: '-0.01em' }}>{c.v}{c.verified && <span style={{ color: C.accent, fontSize: 13 }}>✓</span>}</div>
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
            <div key={m.proto} className="dmx-card" style={{ ...box, overflow: 'hidden' }}>
              <div style={{ display: 'flex', gap: 16, padding: 16, flexWrap: 'wrap' }}>
                <button onClick={() => onOpenModel(m.us.find((u) => u.status === 'disponible') || m.us[0])} style={{ width: 128, height: 96, borderRadius: 8, overflow: 'hidden', flex: 'none', background: C.bgSoft, border: `1px solid ${C.line}`, padding: 0, cursor: 'pointer' }}>
                  {plano ? <img src={plano} alt={`Plano ${protoName(m.proto)}`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontFamily: FONT, color: C.faint }}>{protoName(m.proto)}</span>}
                </button>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 19, color: C.ink, letterSpacing: '-0.01em' }}>{protoName(m.proto)}</div>
                  <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 19, color: BLUE, marginTop: 1, letterSpacing: '-0.01em' }}>{rng(m.min, m.max)}</div>
                  <div style={{ fontFamily: FONT, fontSize: 14, color: C.ink2, marginTop: 3 }}>{specs}</div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button onClick={() => onOpenModel(m.us.find((u) => u.status === 'disponible') || m.us[0])} style={linkA}>Detalles del modelo</button>
                    <span style={{ color: C.line }}>·</span>
                    <button onClick={() => onSelectUnit(m.us.find((u) => u.status === 'disponible') || m.us[0])} style={linkA}>Ver mis números →</button>
                    <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: m.avail > 0 && m.avail <= 3 ? C.red : m.avail === 0 ? C.faint : C.green, marginLeft: 'auto' }}>{m.avail === 0 ? 'Agotado' : `${m.avail} disponible${m.avail === 1 ? '' : 's'}`}</span>
                  </div>
                </div>
              </div>
              <div style={{ background: C.bgSoft, padding: '8px 10px 10px', borderTop: `1px solid ${C.line2}` }}>
                <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: C.ink, padding: '6px 6px 10px' }}>{m.us.length} unidad{m.us.length === 1 ? '' : 'es'}</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT, minWidth: 940, background: '#fff', borderRadius: 8 }}>
                    <thead>
                      <tr>
                        {[['Unidad', 1, '#6b7280', '#f3f4f6'], ['M² desglosados', 5, C.accent, C.accentSoft], ['Características', 3, '#9333ea', '#f5ecff'], ['Precio', 3, BLUE, '#eaf1ff']].map(([l, span, col, bg], i) => (
                          <th key={i} colSpan={span} style={{ padding: '6px 8px', fontSize: 10, fontWeight: 800, color: col, background: bg, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.line}` }}>{l}</th>
                        ))}
                      </tr>
                      <tr>{['Unidad', 'Priv', 'Balcón', 'Terraza', 'RG', 'Totales', 'Rec', 'Baños', 'Cajones', 'Precio', 'Estado', ''].map((h, i) => <th key={i} style={{ padding: '7px 8px', fontSize: 9.5, fontWeight: 700, color: C.faint, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.02em', borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap' }}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {show.map((u) => {
                        const est = ESTADO[u.status] || ESTADO.disponible; const a = avm[u.id]; const sel = selectedUnit && selectedUnit.id === u.id;
                        const td = { padding: '8px 8px', fontSize: 12, color: C.ink2, whiteSpace: 'nowrap' };
                        const mm = (v) => (v ? `${v} m²` : '—');
                        return (
                          <tr key={u.id || u.unit_number} className="dmx-row" onClick={() => onSelectUnit(u)} style={{ cursor: 'pointer', background: sel ? C.accentSoft : '#fff', borderBottom: `1px solid ${C.line2}` }}>
                            <td style={{ ...td, fontWeight: 700, fontSize: 12.5, color: C.ink }}>{u.unit_number}</td>
                            <td style={td}>{mm(u.m2_privative)}</td>
                            <td style={td}>{mm(u.m2_balcony)}</td>
                            <td style={td}>{mm(u.m2_terrace)}</td>
                            <td style={td}>{mm(u.m2_roof_garden)}</td>
                            <td style={{ ...td, fontWeight: 700, color: C.ink }}>{mm(m2of(u))}</td>
                            <td style={td}>{u.bedrooms != null ? u.bedrooms : '—'}</td>
                            <td style={td}>{u.bathrooms != null ? u.bathrooms : '—'}</td>
                            <td style={td}>{u.parking_spots != null ? u.parking_spots : '—'}</td>
                            <td style={{ ...td }}>
                              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 13.5, color: BLUE, letterSpacing: '-0.01em' }}>{money(u.price)}</div>
                              {a && <div style={{ fontSize: 10.5, fontWeight: 700, color: AVM_COLOR[a.color] || C.faint }}>{AVM_LABEL[a.etiqueta] || a.etiqueta}{a.diff_pct != null ? ` ${a.diff_pct > 0 ? '+' : ''}${a.diff_pct}%` : ''}</div>}
                            </td>
                            <td style={{ ...td, fontSize: 11.5, fontWeight: 700, color: est.c }}>{est.l}</td>
                            <td style={{ padding: '8px 8px', textAlign: 'right' }}><button className="dmx-press" onClick={(e) => { e.stopPropagation(); onSelectUnit(u); onOpenModel(u); }} style={{ padding: '5px 11px', borderRadius: R_BTN, border: `1px solid ${sel ? 'transparent' : C.accent}`, background: sel ? GRAD : '#fff', color: sel ? '#fff' : C.accent, fontFamily: FONT, fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>Ver</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {m.us.length > 3 && <button className="dmx-press" onClick={() => setExpanded((e) => ({ ...e, [m.proto]: !e[m.proto] }))} style={{ display: 'block', margin: '12px auto 4px', padding: '9px 20px', borderRadius: 9999, ...gradBorder('#fff', 9999), color: C.accent, fontFamily: FONT, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{expanded[m.proto] ? 'Mostrar menos' : `Mostrar más unidades (${m.us.length - 3})`}</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════ FICHA DE UNIDAD ("Ver detalles" · spec §7.1) ════════════════════
// Shell casi pantalla completa · cabecera fija (selector de unidad agrupado por modelo + tel + X) ·
// grupo de CTAs · 3 pestañas (Detalles de la unidad / Detalles del precio[standby] / Mapa[standby]).
function ModeloModal({ dev, unit: initUnit, avm, scans = [], onClose, onSelectUnit, onConv }) {
  const allUnits = dev.units || [];
  const [uid, setUid] = useState((initUnit && (initUnit.id || initUnit.unit_number)) || (allUnits[0] && (allUnits[0].id || allUnits[0].unit_number)));
  const [tab, setTab] = useState('detalles');
  const [expand, setExpand] = useState(false);
  useLockScroll();
  useEffect(() => { const h = (e) => { if (e.key === 'Escape') { setExpand((ex) => { if (ex) return false; onClose(); return ex; }); } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  const u = allUnits.find((x) => (x.id || x.unit_number) === uid) || initUnit || allUnits[0];
  if (!u) return null;
  const developer = dev.developer || {};
  const plano = planoOf(dev, u) || (dev.photos || [])[0];
  const a = avm[u.id];
  const est = ESTADO[u.status] || ESTADO.disponible;
  const specs = [u.bedrooms != null && `${u.bedrooms} rec`, u.bathrooms != null && `${u.bathrooms} baños`, m2of(u) && `${m2of(u)} m²`, u.parking_spots && `${u.parking_spots} estac.`].filter(Boolean).join(' · ');
  const dispoDate = u.available_date || u.entrega || dev.delivery_estimate || null;
  const feats = [
    u.m2_privative && `${u.m2_privative} m² privativos`,
    u.m2_balcony && `${u.m2_balcony} m² de balcón`,
    u.m2_terrace && `${u.m2_terrace} m² de terraza`,
    u.m2_roof_garden && `${u.m2_roof_garden} m² de roof garden`,
    u.level != null && `Piso ${u.level}`,
    u.vista && `Vista ${titleCase(u.vista)}`,
    u.orientation && `Orientación ${titleCase(u.orientation)}`,
    u.parking_spots && `${u.parking_spots} cajón(es)${u.parking_type ? ` · ${titleCase(u.parking_type)}` : ''}`,
    u.estacionamiento_independiente && 'Cajón independiente',
    u.bodega && (typeof u.bodega === 'string' ? `Bodega ${titleCase(u.bodega)}` : 'Bodega incluida'),
    u.pet_friendly && 'Pet friendly',
    ...(Array.isArray(dev.amenities) ? dev.amenities : []).slice(0, 8).map((x) => titleCase(amenInfo(x).label)),
  ].filter(Boolean);
  const groups = {}; allUnits.forEach((x) => { const k = x.prototype || '?'; (groups[k] = groups[k] || []).push(x); });
  const TABS = [['detalles', 'Detalles de la unidad'], ['precio', 'Detalles del precio'], ['mapa', 'Mapa de la unidad']];
  const StandbyPanel = ({ icon, title, body }) => (
    <div style={{ ...box, padding: '40px 24px', textAlign: 'center', maxWidth: 620, margin: '0 auto' }}>
      <div style={{ fontSize: 34 }}>{icon}</div>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 18, color: C.ink, marginTop: 10 }}>{title}</div>
      <div style={{ fontFamily: FONT, fontSize: 14, color: C.ink2, marginTop: 6, lineHeight: 1.6 }}>{body}</div>
      <div style={{ marginTop: 16 }}><button onClick={() => { onSelectUnit(u); onConv('agendar'); }} style={{ padding: '11px 20px', borderRadius: R_BTN, border: `1px solid ${C.accent}`, background: '#fff', color: C.accent, fontFamily: FONT, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Que un asesor me arme los números</button></div>
    </div>
  );
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(16,18,28,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '4vh 16px', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 1040, background: '#fff', borderRadius: 16, boxShadow: '0 30px 80px rgba(16,24,40,0.35)', padding: '18px 22px 26px', maxHeight: '92vh', overflowY: 'auto' }}>
        {/* CABECERA FIJA: selector de unidad agrupado por modelo + teléfono + X */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', position: 'sticky', top: -18, background: '#fff', paddingTop: 4, paddingBottom: 12, zIndex: 3, marginBottom: 4 }}>
          <select value={uid} onChange={(e) => setUid(e.target.value)} aria-label="Elegir unidad" style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14.5, color: C.ink, background: '#fff', border: `1px solid ${C.line}`, borderRadius: R_BTN, padding: '11px 14px', cursor: 'pointer', maxWidth: '70%' }}>
            {Object.entries(groups).map(([p, us]) => (
              <optgroup key={p} label={`${protoName(p)} · ${us.length} unidad${us.length === 1 ? '' : 'es'} · desde ${money(Math.min(...us.map((x) => x.price || Infinity)))}`}>
                {us.map((x) => <option key={x.id || x.unit_number} value={x.id || x.unit_number}>{x.unit_number} · {money(x.price)} · {(ESTADO[x.status] || ESTADO.disponible).l}</option>)}
              </optgroup>
            ))}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {developer.phone && <a href={`tel:${developer.phone}`} style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: C.link, textDecoration: 'none', whiteSpace: 'nowrap' }}>📱 {developer.phone}</a>}
            <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', fontSize: 24, color: C.ink2, cursor: 'pointer', lineHeight: 1 }}>✕</button>
          </div>
        </div>
        {/* GRUPO DE CTAs */}
        <div style={{ display: 'flex', gap: 12, margin: '4px 0 18px', flexWrap: 'wrap' }}>
          <button className="dmx-press" onClick={() => { onSelectUnit(u); onConv('agendar'); }} style={{ flex: 1, minWidth: 180, padding: 13, borderRadius: R_BTN, border: 'none', background: GRAD, color: '#fff', fontFamily: FONT, fontWeight: 700, fontSize: 14.5, cursor: 'pointer', boxShadow: '0 8px 20px rgba(109,74,255,0.26)' }}>Agendar recorrido</button>
          <button onClick={() => { onSelectUnit(u); onConv('mensaje'); }} style={{ flex: 1, minWidth: 160, padding: 13, borderRadius: R_BTN, border: `1px solid ${C.accent}`, background: '#fff', color: C.accent, fontFamily: FONT, fontWeight: 700, fontSize: 14.5, cursor: 'pointer' }}>Enviar mensaje</button>
          <button onClick={() => { onSelectUnit(u); onConv('agendar'); }} style={{ flex: 1, minWidth: 160, padding: 13, borderRadius: R_BTN, border: `1px solid ${C.accent}`, background: '#fff', color: C.accent, fontFamily: FONT, fontWeight: 700, fontSize: 14.5, cursor: 'pointer' }}>Apartar unidad ↗</button>
        </div>
        {/* BARRA DE PESTAÑAS */}
        <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.line}`, marginBottom: 22, overflowX: 'auto' }}>
          {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} style={{ padding: '10px 4px', marginRight: 24, border: 'none', borderBottom: tab === k ? `2.5px solid ${C.accent}` : '2.5px solid transparent', background: 'none', color: tab === k ? C.accent : C.ink2, fontFamily: FONT, fontWeight: tab === k ? 700 : 500, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>{l}</button>)}
        </div>

        {tab === 'detalles' && (() => {
          const fichaRows = [
            ['Prototipo', protoName(u.prototype)],
            ['Nivel', u.level != null ? `Piso ${u.level}` : null],
            ['M² privativos', u.m2_privative ? `${u.m2_privative} m²` : null],
            ['Balcón', u.m2_balcony ? `${u.m2_balcony} m²` : null],
            ['Terraza', u.m2_terrace ? `${u.m2_terrace} m²` : null],
            ['Roof garden', u.m2_roof_garden ? `${u.m2_roof_garden} m²` : null],
            ['M² totales', m2of(u) ? `${m2of(u)} m²` : null],
            ['Recámaras', u.bedrooms != null ? String(u.bedrooms) : null],
            ['Baños', u.bathrooms != null ? String(u.bathrooms) : null],
            ['Cajones de estacionamiento', u.parking_spots != null ? String(u.parking_spots) : null],
            ['Tipo de cajón', u.parking_type ? titleCase(u.parking_type) : null],
            ['Cajón independiente', u.estacionamiento_independiente ? 'Sí' : null],
            ['Bodega', u.bodega ? (typeof u.bodega === 'string' ? titleCase(u.bodega) : 'Incluida') : null],
            ['Vista', u.vista ? titleCase(u.vista) : null],
            ['Orientación', u.orientation ? titleCase(u.orientation) : null],
          ].filter(([, v]) => v != null && v !== '');
          const amenChips = (Array.isArray(dev.amenities) ? dev.amenities : []);
          return (
          <div className="dmx-modelo-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' }}>
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Resumen */}
              <div className="dmx-card" style={{ ...box, padding: 18 }}>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 26, color: C.ink, letterSpacing: '-0.01em' }}>Unidad {u.unit_number}</div>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 24, color: BLUE, marginTop: 2, letterSpacing: '-0.01em' }}>{money(u.price)}</div>
                <div style={{ fontFamily: FONT, fontSize: 14, color: C.ink2, marginTop: 4 }}>{specs}</div>
                <div style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 700, color: est.c, marginTop: 6 }}>{est.l}{dispoDate ? ` · disponible ${dispoDate}` : ''}</div>
                {a && (
                  <div style={{ marginTop: 14, padding: '12px 15px', borderRadius: R_CARD, background: C.accentSoft, border: `1px solid ${C.accent}33` }}>
                    <DmxChip /><div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontFamily: FONT, fontWeight: 700, fontSize: 15, color: AVM_COLOR[a.color] || C.ink }}><span style={{ width: 9, height: 9, borderRadius: 9999, background: AVM_COLOR[a.color] || C.faint }} />{AVM_LABEL[a.etiqueta] || a.etiqueta}{a.diff_pct != null ? ` · ${a.diff_pct > 0 ? '+' : ''}${a.diff_pct}% vs zona` : ''}</div>
                  </div>
                )}
              </div>
              {/* Ficha de la unidad (todos los datos) */}
              <div className="dmx-card" style={{ ...box, padding: '2px 18px 8px' }}>
                <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 15, color: C.ink, padding: '14px 0 6px' }}>Ficha de la unidad</div>
                {fichaRows.map(([k, v], i) => <DataRow key={i} k={k} v={v} last={i === fichaRows.length - 1} />)}
              </div>
              {/* Precio */}
              <div className="dmx-card" style={{ ...box, padding: 16 }}>
                <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 15, color: C.ink, marginBottom: 8 }}>Precio</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: FONT, fontSize: 14, color: C.ink2 }}><span>Precio de lista</span><b style={{ color: BLUE, fontFamily: HEAD }}>{money(u.price)}</b></div>
                <button onClick={() => setTab('precio')} style={{ ...linkA, marginTop: 8 }}>Calculadora de costos →</button>
              </div>
              {/* Amenidades */}
              {amenChips.length > 0 && (
                <div className="dmx-card" style={{ ...box, padding: 16 }}>
                  <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 15, color: C.ink, marginBottom: 10 }}>Amenidades del desarrollo</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{amenChips.map((x, i) => { const info = amenInfo(x); return <span key={i} style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: C.ink2, background: C.bgSoft, border: `1px solid ${CARD_LINE}`, borderRadius: 9999, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}><span>{info.icon}</span>{titleCase(info.label)}</span>; })}</div>
                </div>
              )}
            </div>
            <div style={{ position: 'sticky', top: 44 }}>
              <div className="dmx-card" style={{ ...box, padding: 12 }}>
                <div style={{ position: 'relative', borderRadius: R_CARD, overflow: 'hidden', background: C.bgSoft, aspectRatio: '4/3' }}>
                  {plano ? <img src={plano} alt={`Plano unidad ${u.unit_number}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, color: C.faint }}>{protoName(u.prototype)}</div>}
                  {plano && <button onClick={() => setExpand(true)} aria-label="Expandir plano" style={{ position: 'absolute', right: 10, bottom: 10, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: R_BTN, border: `1px solid ${C.line}`, background: 'rgba(255,255,255,0.95)', color: C.ink, fontFamily: FONT, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>⤢ Expandir</button>}
                </div>
                <div style={{ textAlign: 'center', fontFamily: HEAD, fontSize: 13, fontWeight: 700, color: C.ink2, marginTop: 10 }}>{protoName(u.prototype)}</div>
                <div style={{ fontFamily: FONT, fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 1.5, textAlign: 'center' }}>Los planos e imágenes son ilustrativos. Medidas, acabados y áreas pueden variar según el contrato de compraventa.</div>
              </div>
            </div>
          </div>
          );
        })()}
        {tab === 'precio' && <StandbyPanel icon="🧮" title="Calculadora de costos" body="Estima enganche, mensualidades durante obra y gastos de escrituración para esta unidad. Estamos afinando la calculadora en vivo — mientras tanto, un asesor te arma los números al detalle." />}
        {tab === 'mapa' && <StandbyPanel icon="🗺️" title="Mapa de la unidad" body={`Ubicación de la unidad ${u.unit_number}${u.level != null ? ` (piso ${u.level})` : ''} dentro del plano del edificio. El plano interactivo del nivel llega pronto.`} />}
        <style>{`@media(max-width:760px){ .dmx-modelo-grid{ grid-template-columns: 1fr !important; } }`}</style>
      </div>
      {expand && plano && (
        <div onClick={() => setExpand(false)} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(16,18,28,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <button onClick={() => setExpand(false)} aria-label="Cerrar" style={{ position: 'absolute', top: 18, right: 22, background: 'none', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer' }}>✕</button>
          <img src={plano} alt={`Plano unidad ${u.unit_number}`} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '95%', maxHeight: '92%', objectFit: 'contain', borderRadius: 8, background: '#fff' }} />
        </div>
      )}
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
        <button onClick={submit} disabled={!ready || busy} style={{ width: '100%', padding: 13, borderRadius: R_BTN, border: 'none', background: ready && !busy ? GRAD : C.line, color: '#fff', fontFamily: FONT, fontWeight: 700, fontSize: 16, cursor: ready && !busy ? 'pointer' : 'not-allowed' }}>{busy ? 'Enviando…' : 'Siguiente →'}</button>
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
        <button onClick={submit} disabled={!ok || busy} style={{ width: '100%', padding: 13, borderRadius: R_BTN, border: 'none', background: ok && !busy ? GRAD : C.line, color: '#fff', fontFamily: FONT, fontWeight: 700, fontSize: 16, cursor: ok && !busy ? 'pointer' : 'not-allowed' }}>{busy ? 'Enviando…' : 'Enviar mensaje'}</button>
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

// ── Servicios y sistema constructivo (etiquetas en lenguaje humano, portadas del portal dev) ──
const SERVICE_META = {
  gas: { icon: '🔥', label: 'Gas', values: { natural: 'Natural (de red)', lp: 'LP', estacionario: 'Estacionario', mixto: 'Mixto' } },
  agua: { icon: '💧', label: 'Agua', values: { red: 'De la red municipal', pozo: 'Pozo propio', ambos: 'Red + pozo', mixta: 'Red + pozo' } },
  energia: { icon: '⚡', label: 'Energía eléctrica', values: { cfe: 'CFE', paneles: 'Paneles solares', hibrido: 'CFE + paneles', subterranea: 'Cableado subterráneo', planta: 'Con planta de emergencia' } },
  agua_caliente: { icon: '♨️', label: 'Agua caliente', values: { boiler: 'Boiler', solar: 'Calentador solar', instantaneo: 'Instantáneo' } },
  drenaje: { icon: '🚿', label: 'Drenaje', values: { municipal: 'Municipal', planta: 'Planta de tratamiento', fosa: 'Fosa séptica' } },
  internet: { icon: '🛜', label: 'Internet', values: { fibra: 'Fibra óptica', cable: 'Cable', preinstalado: 'Preinstalado' } },
  cisterna: { icon: '🪣', label: 'Cisterna', values: {} },
};
const SERVICE_ORDER = ['gas', 'agua', 'cisterna', 'energia', 'agua_caliente', 'drenaje', 'internet'];
const SISTEMA_LABEL = { cajon: 'Cimentación de cajón', losa: 'Losa de cimentación', pilotes: 'Pilotes', zapatas: 'Zapatas', concreto: 'Concreto armado', acero: 'Acero', mixta: 'Mixta', muros: 'Muros de carga', prefabricado: 'Prefabricado' };

// Historial de precios — curva de apreciación desde el lanzamiento (SVG, blanco)
function PriceHistoryChart({ history }) {
  const pts = (history || []).filter((p) => p && p.price);
  if (pts.length < 2) return null;
  const prices = pts.map((p) => p.price);
  const min = Math.min(...prices), max = Math.max(...prices); const rng = (max - min) || 1;
  const W = 640, H = 165, padX = 34, padT = 34, padB = 26;
  const x = (i) => padX + i * (W - 2 * padX) / (pts.length - 1);
  const y = (v) => padT + (1 - (v - min) / rng) * (H - padT - padB);
  const linePts = pts.map((p, i) => `${x(i)},${y(p.price)}`);
  const area = `M${x(0)},${H - padB} L${linePts.join(' L')} L${x(pts.length - 1)},${H - padB} Z`;
  const first = pts[0].price, last = pts[pts.length - 1].price;
  const pct = Math.round(((last - first) / first) * 100);
  const mm = (v) => money(v);   // formato completo $5,800,000 (no abreviado)
  return (
    <div className="dmx-card" style={{ ...box, padding: '18px 16px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6, padding: '0 4px' }}>
        <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 30, color: C.green, letterSpacing: '-0.02em' }}>+{pct}%</span>
        <span style={{ fontFamily: FONT, fontSize: 12.5, color: C.ink2, fontWeight: 600 }}>desde el lanzamiento</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <defs><linearGradient id="phA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgba(109,74,255,0.20)" /><stop offset="1" stopColor="rgba(109,74,255,0.02)" /></linearGradient></defs>
        <path d={area} fill="url(#phA)" />
        <polyline points={linePts.join(' ')} fill="none" stroke="#6D4AFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (<g key={i}>
          <circle cx={x(i)} cy={y(p.price)} r="4" fill="#fff" stroke="#6D4AFF" strokeWidth="2" />
          <text x={x(i)} y={y(p.price) - 10} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#1E2230" fontFamily="Outfit">{mm(p.price)}</text>
          <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#9aa0ae" fontFamily="DM Sans">{p.date}</text>
        </g>))}
      </svg>
      <div style={{ fontSize: 10, color: C.faint, fontStyle: 'italic', textAlign: 'center', marginTop: 4 }}>○ estimado desde el lanzamiento · se afina con cada cambio de precio registrado</div>
    </div>
  );
}

// Avance de obra — timeline de hitos (dots conectados)
function ObraTimeline({ cp }) {
  const phases = Array.isArray(cp.phases) && cp.phases.length ? cp.phases : null;
  const base = phases ? phases : [{ label: 'Cimentación' }, { label: 'Estructura' }, { label: 'Instalaciones' }, { label: 'Acabados' }, { label: 'Entrega final' }];
  const per = 100 / base.length;
  const steps = base.map((p, i) => {
    let pct = p.percentage;
    if (pct == null) pct = (p.status === 'completado' || p.status === 'completed') ? 100 : Math.max(0, Math.min(100, Math.round(((cp.percentage || 0) - i * per) / per * 100)));
    return { label: p.label, pct };
  });
  return (
    <div className="dmx-card" style={{ ...box, padding: 18, background: 'linear-gradient(180deg, #faf8ff, #ffffff)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 30, color: C.ink, letterSpacing: '-0.02em' }}>{cp.percentage}% <span style={{ fontSize: 14, fontWeight: 600, color: C.ink2 }}>completado</span></div>
          {cp.status && <span style={{ display: 'inline-block', marginTop: 6, fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: C.accent, background: C.accentSoft, borderRadius: 9999, padding: '4px 12px' }}>{cp.status}</span>}
        </div>
        {cp.last_update && <div style={{ textAlign: 'right', fontFamily: FONT }}><div style={{ fontSize: 10, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Última actualización</div><div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{cp.last_update}</div></div>}
      </div>
      <div style={{ display: 'flex', overflowX: 'auto' }}>
        {steps.map((s, i) => { const done = s.pct >= 100; const active = s.pct > 0 && s.pct < 100; const on = done || active; return (
          <div key={i} style={{ flex: 1, minWidth: 84, textAlign: 'center', position: 'relative' }}>
            {i > 0 && <div style={{ position: 'absolute', left: '-50%', top: 11, width: '100%', height: 2, background: on ? C.accent : C.line2 }} />}
            <div style={{ position: 'relative', width: 24, height: 24, borderRadius: 9999, margin: '0 auto', background: done ? C.accent : '#fff', border: `2px solid ${on ? C.accent : C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{done ? <span style={{ color: '#fff', fontSize: 12 }}>✓</span> : active ? <span style={{ width: 8, height: 8, borderRadius: 9999, background: C.accent }} /> : null}</div>
            <div style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: 600, color: on ? C.ink : C.faint, marginTop: 6 }}>{s.label}</div>
            <div style={{ fontFamily: HEAD, fontSize: 12, fontWeight: 800, color: on ? C.accent : C.faint }}>{s.pct}%</div>
          </div>
        ); })}
      </div>
    </div>
  );
}

// ═══════════════ TAB 1 · EL PROYECTO (datos generales del desarrollo) ═══════════════
function Fact({ icon, label, value }) {
  if (value == null || value === '') return null;
  return (
    <div className="dmx-card" style={{ ...box, padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: FONT, fontSize: 12, color: C.faint }}><span style={{ fontSize: 14 }}>{icon}</span>{label}</div>
      <div style={{ fontFamily: HEAD, fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>{value}</div>
    </div>
  );
}
function DataBlock({ title, children, first }) {
  return <div style={{ marginTop: first ? 0 : 30 }}><div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 17, color: C.ink, marginBottom: 12, letterSpacing: '-0.01em' }}>{title}</div>{children}</div>;
}
function DataRow({ k, v, last }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: last ? 'none' : `1px solid ${C.line2}` }}><span style={{ fontFamily: FONT, fontSize: 13.5, color: C.faint }}>{k}</span><span style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 600, color: C.ink, textAlign: 'right' }}>{v}</span></div>;
}
function TabGeneral({ dev }) {
  const units = dev.units || [];
  const rng = (arr, suf = '') => { const v = [...new Set(arr.filter((x) => x != null))].sort((a, b) => a - b); return v.length ? (v[0] === v[v.length - 1] ? `${v[0]}${suf}` : `${v[0]}–${v[v.length - 1]}${suf}`) : null; };
  // rango real desde unidades (dev.*_range son sumas agregadas, no rangos — no usar)
  const bedR = rng(units.map((u) => u.bedrooms)) || dev.bedrooms_range;
  const bathR = rng(units.map((u) => u.bathrooms)) || dev.bathrooms_range;
  const parkR = rng(units.map((u) => u.parking_spots)) || dev.parking_range;
  const m2R = rng(units.map(m2of)) || dev.m2_range;
  const nUnits = dev.units_total || dev.total_units || units.length || null;
  const protos = [...new Set(units.map((u) => u.prototype).filter(Boolean))].length || null;
  const tipo = dev.property_type ? titleCase(dev.property_type) : 'Departamentos';
  const pm2s = units.map((u) => (u.price && m2of(u)) ? u.price / m2of(u) : null).filter(Boolean).sort((a, b) => a - b);
  const pm2 = pm2s.length ? pm2s[Math.floor(pm2s.length / 2)] : null;
  const ph = Array.isArray(dev.price_history) ? dev.price_history : [];
  let plusv = null;
  if (ph.length >= 2) { const a = ph[0].price, b = ph[ph.length - 1].price; if (a && b && b > a) plusv = `+${Math.round(((b - a) / a) * 100)}%`; }
  const tec = dev.tecnica || (dev.config || {}).tecnica || {};
  const memoria = Array.isArray(dev.memoria_acabados) ? dev.memoria_acabados : [];
  const creds = Array.isArray(dev.creditos_aceptados) ? dev.creditos_aceptados : [];
  const cp = dev.construction_progress || {};
  const developer = dev.developer || {};
  const total = dev.units_total || nUnits || 0;
  const sold = dev.units_sold || 0; const res = dev.units_reserved || 0;
  const avail = dev.units_available != null ? dev.units_available : units.filter((u) => u.status === 'disponible').length;
  const chip = { fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: C.ink2, background: C.bgSoft, border: `1px solid ${CARD_LINE}`, borderRadius: 9999, padding: '6px 13px' };
  const amen = (dev.config || {}).amenidades || dev.amenities || [];
  const levels = [...new Set(units.map((u) => u.level).filter((x) => x != null))].length;
  const depasPiso = (levels && nUnits) ? Math.round(nUnits / levels) : null;
  const GREY = '#9aa0ae';   // vendidas (gris legible, no se confunde con vacío)
  const Leg = ({ color, label, n }) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: FONT, fontSize: 13, color: C.ink2 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: color, flex: 'none' }} /><b style={{ color: C.ink }}>{n}</b> {label}</span>;
  const seg = (n) => `${(n / total) * 100}%`;
  const fg = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12 };
  const uFeatures = Array.isArray(dev.unit_features) ? dev.unit_features : [];
  // servicios y sistema constructivo (portados del portal dev; objeto config.* o top-level)
  const serviciosObj = (dev.config && dev.config.servicios) || (dev.servicios && !Array.isArray(dev.servicios) ? dev.servicios : null);
  const sistemaObj = (dev.config && dev.config.sistema_constructivo) || dev.sistema_constructivo || (typeof (tec.Estructura || tec.estructura) === 'string' ? { estructura: tec.Estructura || tec.estructura, cimentacion: tec.Cimentacion || tec.cimentacion } : null);
  const ph2 = Array.isArray(dev.price_history) ? dev.price_history : [];
  const grouped = {}; units.forEach((u) => { const k = u.prototype || '?'; (grouped[k] = grouped[k] || []).push(u); });
  const protoList = Object.entries(grouped).map(([p, us]) => { const prices = us.map((u) => u.price).filter(Boolean); const m2s = us.map(m2of).filter(Boolean); const bed = [...new Set(us.map((u) => u.bedrooms).filter((x) => x != null))].sort((a, b) => a - b); const bath = [...new Set(us.map((u) => u.bathrooms).filter((x) => x != null))].sort((a, b) => a - b); return { proto: p, n: us.length, avail: us.filter((u) => u.status === 'disponible').length, minP: prices.length ? Math.min(...prices) : null, bed, bath, m2min: m2s.length ? Math.min(...m2s) : null, m2max: m2s.length ? Math.max(...m2s) : null }; }).sort((a, b) => (a.minP || 1e15) - (b.minP || 1e15));
  const soldPct = total > 0 ? Math.round(((sold + res) / total) * 100) : null;
  return (
    <div>
      {/* ── PLUSVALÍA (dato clave, resaltado) ── */}
      {plusv && (
        <div style={{ ...gradBorder('#fff', R_CARD), padding: 2, marginBottom: 4 }}>
          <div style={{ background: '#fff', borderRadius: R_CARD - 2, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 34, letterSpacing: '-0.02em', background: GRAD, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{plusv}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 15, color: C.ink }}>Plusvalía desde el lanzamiento</div>
              <div style={{ fontFamily: FONT, fontSize: 13, color: C.ink2 }}>El precio ya subió {plusv} desde que abrió preventa — entrar hoy captura esa apreciación.</div>
            </div>
          </div>
        </div>
      )}

      {/* ── CARACTERÍSTICAS DE LOS DEPARTAMENTOS ── */}
      <DataBlock title="Características de los departamentos" first={!plusv}>
        <div style={fg}>
          <Fact icon="🛏️" label="Recámaras" value={bedR} />
          <Fact icon="🛁" label="Baños" value={bathR} />
          <Fact icon="🚗" label="Estacionamientos" value={parkR} />
          <Fact icon="📐" label="Superficie" value={m2R ? `${m2R} m²` : null} />
          <Fact icon="💵" label="Precio por m²" value={pm2 ? money(Math.round(pm2)) : null} />
        </div>
        {uFeatures.length > 0 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>{uFeatures.map((f, i) => <span key={i} style={chip}>{tcNice(typeof f === 'string' ? f : (f.label || f.nombre || ''))}</span>)}</div>}
      </DataBlock>

      {/* ── EL DESARROLLO ── */}
      <DataBlock title="El desarrollo">
        <div style={fg}>
          <Fact icon="🏢" label="Tipo de propiedad" value={tipo} />
          <Fact icon="🏗️" label="Niveles" value={dev.max_level != null ? String(dev.max_level) : (levels || null)} />
          <Fact icon="🏬" label="Depas por piso" value={depasPiso} />
          <Fact icon="🔢" label="Unidades totales" value={nUnits ? String(nUnits) : null} />
          <Fact icon="🗂️" label="Prototipos" value={protos ? String(protos) : null} />
          <Fact icon="🏷️" label="Etapa" value={STAGE[dev.stage] || dev.stage} />
          <Fact icon="🚀" label="Lanzamiento" value={dev.fecha_lanzamiento} />
          <Fact icon="🔑" label="Entrega estimada" value={dev.delivery_estimate} />
        </div>
      </DataBlock>

      {/* ── PROTOTIPOS ── */}
      {protoList.length > 0 && (
        <DataBlock title="Prototipos">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
            {protoList.map((m) => (
              <div key={m.proto} className="dmx-card" style={{ ...box, padding: '14px 16px' }}>
                <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 15, color: C.ink }}>{protoName(m.proto)}</div>
                <div style={{ fontFamily: FONT, fontSize: 13, color: C.ink2, marginTop: 4 }}>{[m.bed.length && `${m.bed[0]}${m.bed.length > 1 ? '–' + m.bed[m.bed.length - 1] : ''} rec`, m.bath.length && `${m.bath[0]} baño${m.bath[0] === 1 ? '' : 's'}`, m.m2min && `${m.m2min}${m.m2max !== m.m2min ? '–' + m.m2max : ''} m²`].filter(Boolean).join(' · ')}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                  <span style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 15, color: C.accent }}>{m.minP ? `Desde ${money(m.minP)}` : ''}</span>
                  <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: m.avail > 0 ? C.green : C.faint }}>{m.avail > 0 ? `${m.avail} disp.` : 'Agotado'}</span>
                </div>
              </div>
            ))}
          </div>
        </DataBlock>
      )}

      {/* ── AMENIDADES ── */}
      {(amen.length > 0 || uFeatures.length > 0) && (
        <DataBlock title="Amenidades y características">
          {amen.length > 0 && (<>
            <div style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Del desarrollo (comunes)</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{amen.map((a, i) => { const info = amenInfo(a); return <span key={i} className="dmx-chiph" style={{ ...chip, display: 'inline-flex', alignItems: 'center', gap: 7 }}><span>{info.icon}</span>{titleCase(info.label)}</span>; })}</div>
          </>)}
          {uFeatures.length > 0 && (<>
            <div style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '16px 0 8px' }}>Internas (por unidad)</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{uFeatures.map((f, i) => <span key={i} className="dmx-chiph" style={chip}>{tcNice(typeof f === 'string' ? f : (f.label || f.nombre || ''))}</span>)}</div>
          </>)}
        </DataBlock>
      )}

      {/* ── HISTORIAL DE PRECIOS ── */}
      {ph2.length >= 2 && (
        <DataBlock title="Historial de precios">
          <PriceHistoryChart history={ph2} />
        </DataBlock>
      )}

      {/* ── DISPONIBILIDAD ── */}
      {total > 0 && (avail + sold + res) > 0 && (
        <DataBlock title="Disponibilidad">
          <div className="dmx-card" style={{ ...box, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
              <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 26, color: C.green }}>{avail}</span>
              <span style={{ fontFamily: FONT, fontSize: 14, color: C.ink2 }}>de {total} unidades disponibles</span>
              {soldPct != null && soldPct > 0 && <span style={{ marginLeft: 'auto', fontFamily: FONT, fontSize: 13, fontWeight: 700, color: C.accent }}>{soldPct}% colocado</span>}
            </div>
            <div style={{ display: 'flex', height: 14, borderRadius: 9999, overflow: 'hidden', background: C.line2, gap: 2 }}>
              {avail > 0 && <div style={{ width: seg(avail), background: C.green }} />}
              {res > 0 && <div style={{ width: seg(res), background: C.amber }} />}
              {sold > 0 && <div style={{ width: seg(sold), background: GREY }} />}
            </div>
            <div style={{ display: 'flex', gap: 22, marginTop: 14, flexWrap: 'wrap' }}>
              <Leg color={C.green} label="Disponibles" n={avail} />
              {res > 0 && <Leg color={C.amber} label="Apartadas" n={res} />}
              {sold > 0 && <Leg color={GREY} label="Vendidas" n={sold} />}
            </div>
          </div>
        </DataBlock>
      )}

      {/* ── SERVICIOS DEL DESARROLLO ── */}
      {serviciosObj && Object.values(serviciosObj).some(Boolean) && (
        <DataBlock title="Servicios del desarrollo">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 12 }}>
            {SERVICE_ORDER.map((k) => { const meta = SERVICE_META[k]; const v = serviciosObj[k]; const set = v && v !== 'no_especificado'; const valLabel = set ? (meta.values[v] || tcNice(v)) : 'No especificado'; return (
              <div key={k} className={set ? 'dmx-card' : undefined} style={{ ...box, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', opacity: set ? 1 : 0.6 }}>
                <span style={{ fontSize: 22, lineHeight: 1 }}>{meta.icon}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: FONT, fontSize: 11, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{meta.label}</div>
                  <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 14, color: set ? C.accent : C.faint }}>{valLabel}</div>
                </div>
              </div>
            ); })}
          </div>
        </DataBlock>
      )}

      {/* ── SISTEMA CONSTRUCTIVO ── */}
      {sistemaObj && (sistemaObj.cimentacion || sistemaObj.estructura) && (
        <DataBlock title="Sistema constructivo">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[sistemaObj.cimentacion && ['Cimentación', sistemaObj.cimentacion], sistemaObj.estructura && ['Estructura', sistemaObj.estructura]].filter(Boolean).map(([lbl, val], i) => (
              <div key={i} className="dmx-card" style={{ ...box, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 2, borderColor: 'rgba(30,158,99,0.35)', background: 'rgba(30,158,99,0.05)' }}>
                <span style={{ fontFamily: FONT, fontSize: 10.5, color: C.green, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>🛡️ {lbl}</span>
                <span style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 15, color: C.ink }}>{SISTEMA_LABEL[val] || tcNice(val)}</span>
              </div>
            ))}
          </div>
        </DataBlock>
      )}

      {memoria.length > 0 && (
        <DataBlock title="Memoria de acabados">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12 }}>
            {memoria.map((m, i) => <div key={i} className="dmx-card" style={{ ...box, padding: '14px 16px' }}><div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: C.ink }}>{titleCase(m.area || '')}</div><div style={{ fontFamily: FONT, fontSize: 13, color: C.ink2, marginTop: 4, lineHeight: 1.5 }}>{m.detalle}</div></div>)}
          </div>
        </DataBlock>
      )}

      {creds.length > 0 && (
        <DataBlock title="Créditos que aceptan">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{creds.map((c, i) => <span key={i} style={chip}>{tcNice(c)}</span>)}</div>
        </DataBlock>
      )}

      {cp.percentage != null && (
        <DataBlock title="Avance de obra">
          <ObraTimeline cp={cp} />
          {Array.isArray(cp.log) && cp.log.length > 0 && (
            <div className="dmx-card" style={{ ...box, padding: '14px 18px', marginTop: 12 }}>
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13, color: C.ink, marginBottom: 8 }}>Bitácora de obra</div>
              {cp.log.slice(0, 6).map((e, i) => <div key={i} style={{ display: 'flex', gap: 12, padding: '7px 0', fontFamily: FONT, fontSize: 12.5, borderTop: i ? `1px solid ${C.line2}` : 'none' }}><span style={{ color: C.faint, minWidth: 84, flex: 'none' }}>{e.date}</span><span style={{ color: C.ink2 }}>{e.description}</span></div>)}
            </div>
          )}
        </DataBlock>
      )}

      {developer.name && (
        <DataBlock title="Desarrollador">
          <div className="dmx-card" style={{ ...box, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ width: 46, height: 46, borderRadius: 9999, background: GRAD, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: HEAD, fontWeight: 800, fontSize: 18 }}>{titleCase(developer.name)[0]}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: C.ink }}>{titleCase(developer.name)}</div>
              <div style={{ fontFamily: FONT, fontSize: 13, color: C.faint }}>{[developer.projects_delivered && `${developer.projects_delivered} proyectos entregados`, developer.founded_year && `desde ${developer.founded_year}`].filter(Boolean).join(' · ')}</div>
            </div>
          </div>
        </DataBlock>
      )}

      {dev.description && (
        <DataBlock title="La historia">
          <p style={{ fontFamily: FONT, fontWeight: 400, fontSize: 16, color: C.ink, lineHeight: 1.7, maxWidth: '72ch' }}>{dev.description}</p>
        </DataBlock>
      )}
    </div>
  );
}

// ═══════════════ TAB · PLANES DE PAGO (esquema del dev + crédito hipotecario + ISAI) ═══════════════
// Reusa motores backend: /api/public/payment-schemes, /api/public/mortgage/calculate, /api/tax/*
function TabPlanesPago({ dev, unit }) {
  const [schemes, setSchemes] = useState(undefined);
  const basePrice = (unit && unit.price) || dev.price_from || 0;
  useEffect(() => { let alive = true; fetch(`${API}/api/public/payment-schemes/${encodeURIComponent(dev.id)}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive) setSchemes((d && (d.schemes || d.items)) || []); }).catch(() => { if (alive) setSchemes([]); }); return () => { alive = false; }; }, [dev.id]);
  // Solo UNA forma de pago: Precio de lista (sin descuento)
  const lista = Array.isArray(schemes) ? (schemes.find((s) => /precio de lista/i.test(s.nombre || '') || !s.descuento_pct) || schemes[0]) : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {lista && (
        <div>
          <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 17, color: C.ink, marginBottom: 12, letterSpacing: '-0.01em' }}>Forma de pago · Precio de lista</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12 }}>
            {[
              lista.apartado_mxn != null && { icon: '🔒', label: 'Apartado', v: money(lista.apartado_mxn) },
              lista.firma_pct != null && { icon: '✍️', label: 'Enganche', v: `${lista.firma_pct}%` },
              lista.mensualidades_pct != null && { icon: '📅', label: 'Mensualidades (obra)', v: `${lista.mensualidades_pct}%` },
              lista.escritura_pct != null && { icon: '🔑', label: 'Contra escritura', v: `${lista.escritura_pct}%` },
            ].filter(Boolean).map((c, i) => (
              <div key={i} className="dmx-card" style={{ ...box, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: FONT, fontSize: 12, color: C.faint }}><span style={{ fontSize: 14 }}>{c.icon}</span>{c.label}</div>
                <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 20, color: C.ink, marginTop: 4, letterSpacing: '-0.01em' }}>{c.v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <FichaHipotecaComparador basePrice={basePrice} devName={dev.name} />
      <FichaTaxISAI basePrice={basePrice} />
    </div>
  );
}

// ═══════════════ TAB · INVERSIÓN (personal + institucional) ═══════════════
// Reusa SeccionCalcInversion (motor inversion-v4). Toggle 👤/🏛️ + multi-select de fondo.
function TabInversion({ dev, unit, onGoTo }) {
  const [mode, setMode] = useState('individual');
  const [fundIds, setFundIds] = useState(() => new Set());
  const [pickedKey, setPickedKey] = useState(null);
  const units = (dev.units || []).filter((u) => u.price);
  const dispo = units.filter((u) => u.status === 'disponible');
  const choices = dispo.length ? dispo : units;
  const picked = choices.find((u) => (u.id || u.unit_number) === pickedKey);
  const defUnit = picked || unit || choices[0];
  const fundUnits = units.filter((u) => fundIds.has(u.id || u.unit_number)).map((u) => ({ id: u.id, unit_number: u.unit_number, price: u.price }));
  const toggleFund = (u) => setFundIds((s) => { const n = new Set(s); const k = u.id || u.unit_number; n.has(k) ? n.delete(k) : n.add(k); return n; });
  return (
    <div>
      <div style={{ display: 'flex', gap: 0, border: `1px solid ${C.line}`, borderRadius: R_BTN, overflow: 'hidden', width: 'fit-content', marginBottom: 18 }}>
        {[['individual', '👤 Para ti'], ['institucional', '🏛️ Institucional']].map(([k, l], i) => (
          <button key={k} className="dmx-press" onClick={() => setMode(k)} style={{ padding: '10px 20px', border: 'none', borderLeft: i ? `1px solid ${C.line}` : 'none', background: mode === k ? GRAD : '#fff', color: mode === k ? '#fff' : C.ink2, fontFamily: FONT, fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>{l}</button>
        ))}
      </div>
      {/* Selector de unidad (modo individual) — tarjetas pequeñas, al elegir recalcula solo */}
      {mode === 'individual' && choices.length > 1 && (
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: C.ink2, display: 'block', marginBottom: 8 }}>Elige la unidad a calcular</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(148px,1fr))', gap: 8 }}>
            {choices.map((u) => { const on = defUnit && (u.id || u.unit_number) === (defUnit.id || defUnit.unit_number); return (
              <button key={u.id || u.unit_number} className="dmx-card" onClick={() => setPickedKey(u.id || u.unit_number)} style={{ padding: '10px 12px', borderRadius: R_CARD, textAlign: 'left', cursor: 'pointer', ...(on ? { border: 'none', background: C.accentSoft, boxShadow: `inset 0 0 0 1.5px ${C.accent}` } : { border: `1px solid ${CARD_LINE}`, background: '#fff' }) }}>
                <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 13.5, color: C.ink }}>{u.unit_number}</div>
                <div style={{ fontFamily: HEAD, fontSize: 14, fontWeight: 800, color: C.accent, marginTop: 1, letterSpacing: '-0.01em' }}>{money(u.price)}</div>
                <div style={{ fontFamily: FONT, fontSize: 11, color: C.faint, marginTop: 1 }}>{[u.prototype ? protoName(u.prototype) : null, m2of(u) ? `${m2of(u)} m²` : null].filter(Boolean).join(' · ')}</div>
              </button>
            ); })}
          </div>
        </div>
      )}
      {mode === 'institucional' && (
        <div className="dmx-card" style={{ ...box, padding: 16, marginBottom: 18 }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: C.ink, marginBottom: 10 }}>Arma tu fondo — elige unidades ({fundUnits.length} seleccionadas)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 8 }}>
            {dispo.map((u) => { const on = fundIds.has(u.id || u.unit_number); return (
              <button key={u.id || u.unit_number} onClick={() => toggleFund(u)} style={{ padding: '9px 12px', borderRadius: R_BTN, border: `1px solid ${on ? C.accent : C.line}`, background: on ? C.accentSoft : '#fff', color: C.ink, fontFamily: FONT, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>{on ? '☑' : '☐'} {u.unit_number} · {money(u.price)}</button>
            ); })}
          </div>
        </div>
      )}
      {(mode === 'individual' && !defUnit) ? (
        <div style={{ ...box, padding: 20, fontFamily: FONT, color: C.faint }}>Elige una unidad en “Precios y modelos” para calcular tu inversión.</div>
      ) : (mode === 'institucional' && fundUnits.length === 0) ? (
        <div style={{ ...box, padding: 20, fontFamily: FONT, color: C.faint }}>Selecciona al menos una unidad para armar tu fondo.</div>
      ) : mode === 'individual' ? (
        <InversionV4Calculator key={`ind-${defUnit.id || defUnit.unit_number}`} mode="individual" prefilled={{ precio: defUnit.price }} lockPrice zoneId={dev.colonia_id || dev.colonia} devId={dev.id} noStickyBar />
      ) : (
        <InversionV4Calculator key={`inst-${fundUnits.map((u) => u.id || u.unit_number).join('_')}`} mode="institucional" portfolioUnits={fundUnits.map((u) => ({ label: u.unit_number, precio: u.price, renta: Math.round(u.price * 0.0045) }))} zoneId={dev.colonia_id || dev.colonia} devId={dev.id} noStickyBar />
      )}
    </div>
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


  useEffect(() => { let alive = true; setLoadErr(false); setDev(null); fetchDevelopment(id).then((d) => { if (alive) setDev(d); }).catch(() => { if (alive) setLoadErr(true); }); return () => { alive = false; }; }, [id]);
  useEffect(() => { document.body.style.background = PAGE_BG; return () => { document.body.style.background = ''; }; }, []);
  useEffect(() => {
    if (!dev || !dev.id) return undefined;
    let alive = true;
    fetch(`${API}/api/tour-3dgs/scans?project_slug=${encodeURIComponent(dev.slug || dev.id)}&limit=20`).then((r) => r.json()).then((d) => { if (alive) { const it = d?.items || []; setScans(it); setActiveScan(it[0]?.scan_id || null); } }).catch(() => { if (alive) setScans([]); });
    const colid = dev.colonia_id || dev.colonia; const us = (dev.units || []).filter((u) => u.price && m2of(u));
    if (colid && us.length) fetch(`${API}/api/precio-posicion-batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ colonia: colid, nueva: true, unidades: us.map((u) => ({ id: u.id, precio: u.price, m2: u.m2_privative || u.m2_total, rec: u.bedrooms, ban: u.bathrooms })) }) }).then((r) => r.json()).then((d) => { if (!alive) return; const m = {}; (d.unidades || []).forEach((v) => { if (v.id && v.etiqueta) m[v.id] = v; }); setAvm(m); }).catch(() => {});
    fetchDevelopments({ colonia: colid, limit: 6 }).then((r) => { if (alive) setSimilars((Array.isArray(r) ? r : (r?.developments || [])).filter((x) => x.id !== dev.id).slice(0, 4)); }).catch(() => {});
    try { sendBuyerSignal('ficha_view', { entity_id: dev.id, colonia: colid, value: 'venta' }); } catch (e) { /* noop */ }
    return () => { alive = false; };
  }, [dev && dev.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tabs = paneles (cada tab su propio espacio, NO scroll infinito). Al cambiar, re-fija la barra bajo el nav.
  const panelTopRef = useRef(null);
  const goTab = useCallback((k) => {
    setActiveNav(k);
    requestAnimationFrame(() => { const el = panelTopRef.current; if (!el) return; const y = el.getBoundingClientRect().top + window.scrollY - 56; if (window.scrollY > y) window.scrollTo({ top: y, behavior: 'auto' }); });
  }, []);

  const agendar = useCallback((reason) => setConv({ type: reason === 'mensaje' ? 'mensaje' : reason === 'compartir' ? 'compartir' : 'agendar' }), []);
  const toggleSaveUnit = useCallback(() => { if (!unit) return; setSavedUnits((s) => { const n = new Set(s); n.has(unit.unit_number) ? n.delete(unit.unit_number) : n.add(unit.unit_number); return n; }); try { sendBuyerSignal('save_unit', { entity_id: dev?.id, unit_number: unit.unit_number }); } catch (e) { /* noop */ } }, [unit, dev]);
  const pickUnit = useCallback((u) => { setUnit(u); }, []);

  const navRef = useRef(null);
  useEffect(() => {
    const onAction = (e) => { const nav = e && e.detail && e.detail.nav; const h = navRef.current; if (!nav || !h) return; if (nav === 'agendar') h.agendar(); else if (nav === 'guardar') h.toggleSaveUnit(); else if (nav === 'unidad' || nav === 'comparar') h.goTab('precios'); else if (nav === 'dinero') h.goTab('precios'); else if (nav === 'confianza') h.goTab('detalles'); else if (nav === 'proyecto') h.goTab('destacados'); else if (nav === 'tour') h.goTab('tour'); };
    window.addEventListener('dmx:atlax-action', onAction); return () => window.removeEventListener('dmx:atlax-action', onAction);
  }, []);
  navRef.current = { goTab, agendar, toggleSaveUnit };
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

  return (
    <LightScope>
    <div style={{ background: PAGE_BG, minHeight: '100vh', fontFamily: FONT, color: C.ink }}>
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
              <h1 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(28px,4vw,42px)', lineHeight: 1.15, color: C.ink, margin: 0, letterSpacing: '-0.02em' }}>{titleCase(dev.name)}</h1>
              <div style={{ fontFamily: FONT, fontSize: 16, color: C.ink2, marginTop: 6 }}>{dev.address_full || dev.street || [dev.colonia, dev.alcaldia].filter(Boolean).join(', ')}</div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
                <DevRating developer={developer} onReviews={() => goTab('resenas')} />
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

        {/* marcador de anclaje para re-fijar la barra al cambiar de tab */}
        <div ref={panelTopRef} style={{ height: 0 }} />
        {/* SUB-NAV STICKY (tabs) */}
        <div style={{ position: 'sticky', top: 56, zIndex: 40, background: '#fff', borderBottom: `1px solid ${CARD_LINE}`, marginTop: 18, boxShadow: '0 2px 8px rgba(16,24,40,0.04)' }}>
          <div style={{ maxWidth: MAXW, width: '95%', margin: '0 auto', display: 'flex', gap: 2, overflowX: 'auto' }}>
            {NAV.filter(([k]) => (k !== 'tour' || scans.length > 0)).map(([k, l]) => (
              <button key={k} className="dmx-navtab" onClick={() => goTab(k)} style={{ padding: '13px 14px', border: 'none', borderBottom: activeNav === k ? `3px solid ${C.accent}` : '3px solid transparent', background: 'none', color: activeNav === k ? C.accent : C.ink2, fontFamily: FONT, fontWeight: activeNav === k ? 700 : 500, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>{l}</button>
            ))}
          </div>
        </div>

        {/* BODY 2 COLUMNAS */}
        <div className="dmx-venta-grid" style={{ maxWidth: MAXW, width: '95%', margin: '0 auto', padding: '10px 0 90px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 336px', gap: 40, alignItems: 'start' }}>
          <div style={{ minWidth: 0 }}>

            {/* PANEL POR TAB — cada tab tiene su propio espacio (no scroll infinito) */}
            {activeNav === 'destacados' && (
              <Section title="El proyecto">
                <TabGeneral dev={dev} />
              </Section>
            )}

            {activeNav === 'precios' && (
              <Section title="Precios y modelos">
                <VentaPrecios dev={dev} selectedUnit={unit} onSelectUnit={pickUnit} onAgendar={() => agendar('agendar')} avm={avm} onOpenModel={setOpenModel} />
              </Section>
            )}

            {activeNav === 'tarifas' && (
              <Section title="Planes de pago">
                <TabPlanesPago dev={dev} unit={unit} />
              </Section>
            )}

            {activeNav === 'tour' && scans.length > 0 && activeScan && (
              <Section title="Recorrido 3D">
                {scans.length > 1 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>{scans.map((s) => <button key={s.scan_id} onClick={() => setActiveScan(s.scan_id)} style={{ padding: '7px 13px', borderRadius: 9999, border: `1px solid ${activeScan === s.scan_id ? C.accent : C.line}`, background: activeScan === s.scan_id ? C.accent : '#fff', color: activeScan === s.scan_id ? '#fff' : C.ink2, fontFamily: FONT, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>{s.unit_id || s.title || 'Modelo'}</button>)}</div>}
                <div style={{ borderRadius: R_CARD, overflow: 'hidden', border: `1px solid ${CARD_LINE}`, height: 'clamp(360px,52vw,540px)' }}><Tour3DViewer scanId={activeScan} theme="cream" uiMode="full" /></div>
              </Section>
            )}



            {activeNav === 'ubicacion' && (
              <Section title="Ubicación">
                <div style={{ ...box, padding: 0, overflow: 'hidden' }}>
                  <div style={{ height: 280, background: C.bgSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: `1px solid ${CARD_LINE}` }}>
                    <div style={{ textAlign: 'center', color: C.faint, fontFamily: FONT }}><div style={{ fontSize: 26 }}>📍</div><div style={{ fontSize: 13, marginTop: 6 }}>Mapa interactivo — próximamente</div></div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, padding: 12, overflowX: 'auto' }}>
                    {['Escuelas', 'Restaurantes', 'Supermercados', 'Café', 'Transporte', 'Parques'].map((c) => <button key={c} style={{ padding: '8px 14px', borderRadius: 9999, border: `1px solid ${C.line}`, background: '#fff', color: C.ink2, fontFamily: FONT, fontSize: 13, cursor: 'default', whiteSpace: 'nowrap' }}>{c}</button>)}
                  </div>
                  <div style={{ padding: '14px 16px', fontFamily: FONT, fontSize: 14, color: C.ink2, borderTop: `1px solid ${C.line2}` }}>{dev.address_full || dev.street || [dev.colonia, dev.alcaldia].filter(Boolean).join(', ')}</div>
                </div>
              </Section>
            )}

            {activeNav === 'inversion' && (
              <Section title="Calculadora de inversión">
                <TabInversion dev={dev} unit={unit} onGoTo={goTab} />
              </Section>
            )}

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
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 26, color: C.ink, margin: '2px 0', letterSpacing: '-0.01em' }}>{money(unit ? unit.price : dev.price_from)}</div>
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
                <div style={{ minWidth: 0 }}><div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: C.ink }}>{developer.name ? titleCase(developer.name) : 'Tu asesor DMX'}</div><div style={{ fontFamily: FONT, fontSize: 11.5, color: C.faint }}>{developer.projects_delivered ? `${developer.projects_delivered} proyectos entregados` : 'Desarrollador verificado'}</div></div>
              </div>
              <div style={{ marginTop: 12, fontFamily: FONT, fontSize: 12, color: C.faint, textAlign: 'center' }}>✦ ¿Dudas? Pregúntale a <b style={{ color: C.accent }}>Atlax</b> — conoce esta unidad.</div>
            </div>
          </aside>
        </div>
      </main>

      {/* barra móvil — 3 acciones con etiquetas abreviadas (spec §10) */}
      <div className="dmx-venta-mobilebar" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 55, display: 'none', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#fff', borderTop: `1px solid ${C.line}`, boxShadow: '0 -4px 16px rgba(16,24,40,0.08)' }}>
        <button className="dmx-press" onClick={() => agendar('agendar')} style={{ flex: 1, padding: '11px 8px', borderRadius: R_BTN, border: 'none', background: GRAD, color: '#fff', fontFamily: FONT, fontWeight: 700, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>Recorrido</button>
        <button onClick={() => agendar('mensaje')} style={{ flex: 1, padding: '11px 8px', borderRadius: R_BTN, border: `1px solid ${C.accent}`, background: '#fff', color: C.accent, fontFamily: FONT, fontWeight: 700, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>Mensaje</button>
        {developer.phone
          ? <a href={`tel:${developer.phone}`} style={{ flex: 1, padding: '11px 8px', borderRadius: R_BTN, border: `1px solid ${C.accent}`, background: '#fff', color: C.accent, fontFamily: FONT, fontWeight: 700, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'center', textDecoration: 'none' }}>Llamar</a>
          : <button onClick={() => agendar('mensaje')} style={{ flex: 1, padding: '11px 8px', borderRadius: R_BTN, border: `1px solid ${C.accent}`, background: '#fff', color: C.accent, fontFamily: FONT, fontWeight: 700, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>Llamar</button>}
      </div>

      <style>{`
        @media(max-width:940px){ .dmx-venta-grid{ grid-template-columns: minmax(0,1fr) !important; } .dmx-venta-side{ position: static !important; } .dmx-venta-mobilebar{ display: flex !important; } }
        @media(max-width:600px){ .dmx-amen-grid{ grid-template-columns: repeat(3,1fr) !important; } }
        .dmx-card{ transition: box-shadow .18s ease, transform .18s ease, border-color .18s ease; }
        .dmx-card:hover{ transform: translateY(-2px); box-shadow: 0 10px 26px rgba(109,74,255,0.13), 0 2px 8px rgba(16,24,40,0.06); border-color: #d9d0ff; }
        .dmx-sim{ transition: box-shadow .18s ease, transform .18s ease, border-color .18s ease; }
        .dmx-sim:hover{ transform: translateY(-2px); box-shadow: 0 10px 26px rgba(109,74,255,0.13), 0 2px 8px rgba(16,24,40,0.06); border-color: #d9d0ff; }
        .dmx-row{ transition: background .13s ease; }
        .dmx-row:hover{ background: ${C.accentSoft} !important; }
        .dmx-navtab{ position: relative; transition: color .15s ease; }
        .dmx-navtab:hover{ color: ${C.accent} !important; }
        .dmx-linkh{ transition: opacity .15s ease; }
        .dmx-linkh:hover{ opacity: .68; text-decoration: underline; }
        .dmx-press{ transition: transform .08s ease, box-shadow .15s ease, filter .15s ease; }
        .dmx-press:hover{ filter: brightness(1.04); }
        .dmx-press:active{ transform: scale(.975); }
        .dmx-chiph{ transition: border-color .15s ease, color .15s ease, background .15s ease; }
        .dmx-chiph:hover{ border-color: ${C.accent} !important; color: ${C.accent} !important; }
      `}</style>

      {gallery && <GalleryModal dev={dev} scans={scans} startAt={gallery.i} startTab={gallery.tab} onClose={() => setGallery(null)} />}
      {openModel && <ModeloModal dev={dev} unit={openModel} avm={avm} scans={scans} onClose={() => setOpenModel(null)} onSelectUnit={pickUnit} onConv={(t) => { setOpenModel(null); agendar(t); }} />}
      <AtlaxBubble theme="light" context={atlaxContext} quickActions={atlaxQuick} dev={dev} unit={unit} lens={lens} />
      {conv?.type === 'agendar' && <AgendarModal dev={dev} unit={unit} onClose={() => setConv(null)} />}
      {conv?.type === 'mensaje' && <MensajeModal dev={dev} unit={unit} onClose={() => setConv(null)} />}
      {conv?.type === 'compartir' && <CompartirModal dev={dev} onClose={() => setConv(null)} />}
    </div>
    </LightScope>
  );
}


