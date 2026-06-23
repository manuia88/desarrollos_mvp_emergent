// Página de Zona v2 — TABS ENFOCADAS por motivación (Hormozi). Contexto poderoso → "¿qué vienes a buscar?" → 4 tabs
// (con micro-promesa) → al elegir, la historia de ESE perfil (dolor+sueño) sobre la MISMA data real. La elección dispara
// una SEÑAL DE INTENCIÓN (zone_intent → buyer_signals → lead/demanda/Atlax). Persiste el perfil entre zonas.
// Sistema: memory/ZONA_PAGE_NARRATIVE_SYSTEM.md
import React, { useEffect, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { LightScope, PublicNav, Footer } from '../../components/ui';
import AtlaxBubble from '../../components/landing/AtlaxBubble';
import SaveSearchModal from '../../components/marketplace/SaveSearchModal';
import InversionV4Calculator from '../../components/investment/InversionV4Calculator';
import ZonaPropiedades from '../../components/zona/ZonaPropiedades';
import { sendBuyerSignal } from '../../lib/buyerSignal';
import { tc } from '../../lib/titleCase';

const API = process.env.REACT_APP_BACKEND_URL;
const m1 = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-MX')}`;   // formato completo $1,000,000 (pedido founder)
const k = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-MX')}`;
const get = async (u) => { try { const r = await fetch(API + u); return r.ok ? await r.json() : null; } catch { return null; } };
const askAtlax = (query) => { try { window.dispatchEvent(new CustomEvent('atlax:open', { detail: { query } })); } catch { /* noop */ } };

const INK = '#16182A';
const MUT = '#5B5F76';
const cardBase = { background: '#fff', border: '1px solid rgba(16,18,28,0.07)', borderRadius: 22, boxShadow: '0 18px 50px rgba(99,102,241,0.08), 0 2px 8px rgba(16,18,28,0.04)' };
const eyebrow = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 800, background: 'linear-gradient(90deg,#6366F1,#4F46E5)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };
const chapTitle = { fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(25px,3.4vw,36px)', color: INK, letterSpacing: '-0.025em', margin: '8px 0 0', lineHeight: 1.1 };
const lead = { fontFamily: 'DM Sans', fontSize: 16, color: MUT, lineHeight: 1.6, marginTop: 12, maxWidth: 640 };
const grad = { background: 'linear-gradient(120deg,#6366F1,#4F46E5)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };

const PROFILES = [
  { k: 'invertir', label: 'Invertir', e: '📈', promise: 'Tu dinero, trabajando' },
  { k: 'familia', label: 'Para mi familia', e: '👨‍👩‍👧', promise: 'Raíces, sin mudarte otra vez' },
  { k: 'primera', label: 'Mi primera casa', e: '🏠', promise: 'Deja de rentar' },
  { k: 'vivir', label: 'Vivir mejor', e: '✨', promise: 'La vida que mereces' },
];
// Lentes del inversionista (los 7 avatares colapsan en 3 puertas · reencuadran el MISMO tab Invertir).
const LENSES = [
  { k: 'renta', e: '💸', label: 'Que me pague renta', intro: 'Te enfocamos en flujo: renta mensual neta, cap rate y la demanda real de la zona.', tags: ['renta', 'demanda'] },
  { k: 'plusvalia', e: '📈', label: 'Que suba de valor', intro: 'Te enfocamos en ganancia de capital: plusvalía, por qué sube y los escenarios.', tags: ['plusvalia', 'catalizadores'] },
  { k: 'refugio', e: '🛡️', label: 'Proteger mi dinero', intro: 'Te enfocamos en seguridad: vs CETES/bolsa, refugio de inflación y los riesgos sin maquillaje.', tags: ['vs', 'riesgos'] },
];
// MOCKUP "Lugares destacados" — infra lista; se reemplaza por zone_places reales (Google) cuando se active la zona.
const SAMPLE_LUGARES = {
  familia: { titulo: 'Las mejores escuelas cerca', items: [
    { name: 'Colegio Williams', rating: 4.8, reviews: 1240, meta: 'Bilingüe · a 6 min', desc: '"Excelente nivel académico y trato cercano." De las mejor valoradas de la zona.' },
    { name: 'Liceo Mexicano Japonés', rating: 4.6, reviews: 890, meta: 'a 8 min', desc: '"Disciplina, valores e instalaciones top."' },
    { name: 'Instituto Montessori', rating: 4.7, reviews: 430, meta: 'Preescolar · a 5 min', desc: '"Ideal para los más chicos, mucho cuidado."' },
  ] },
  vivir: { titulo: 'Lo mejor para comer y vivir', items: [
    { name: 'Pujol', rating: 4.7, reviews: 12400, meta: '$$$$ · a 7 min', desc: '"Cocina mexicana de autor, experiencia de otro nivel." Top mundial.' },
    { name: 'Quintonil', rating: 4.7, reviews: 6800, meta: '$$$$ · a 9 min', desc: '"De los mejores de Latinoamérica."' },
    { name: 'Café Nin', rating: 4.6, reviews: 5200, meta: 'Café · a 4 min', desc: '"Brunch perfecto, pan increíble."' },
  ] },
};
function LugaresPreview({ data, isReal }) {
  const [open, setOpen] = useState(-1);
  if (!data) return null;
  return (
    <div style={{ marginTop: 18 }}>
      {data.items.map((p, i) => (
        <div key={p.name} className="zv2-win" style={{ background: '#fff', border: '1px solid rgba(16,18,28,0.07)', borderRadius: 16, boxShadow: '0 8px 22px rgba(99,102,241,0.06)', padding: '14px 18px', marginBottom: 10, cursor: 'pointer' }} onClick={() => setOpen(open === i ? -1 : i)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15.5, color: INK }}>{p.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
              <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: '#10B981' }}>★ {p.rating}</span>
              <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: '#A2A6BC' }}>({p.reviews.toLocaleString('es-MX')})</span>
              <span style={{ color: '#6366F1', fontWeight: 800, fontFamily: 'Outfit' }}>{open === i ? '−' : '+'}</span>
            </div>
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: MUT, marginTop: 2 }}>{p.meta}</div>
          {open === i && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(16,18,28,0.07)' }}>
              {p.desc && <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: MUT, lineHeight: 1.5 }}>{p.desc}</div>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: p.desc ? 10 : 0 }}>
                <button type="button" onClick={(e) => { e.stopPropagation(); askAtlax(`Cuéntame más de ${p.name} y opciones parecidas cerca.`); }} style={{ border: 'none', background: 'rgba(99,102,241,0.08)', color: '#6366F1', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12.5, borderRadius: 9999, padding: '7px 14px', cursor: 'pointer' }}>🤖 Pregúntale a Atlax</button>
                {p.maps_uri && <a href={p.maps_uri} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ background: 'rgba(16,18,28,0.05)', color: INK, fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12.5, borderRadius: 9999, padding: '7px 14px', textDecoration: 'none' }}>Ver reseñas en Google →</a>}
              </div>
            </div>
          )}
        </div>
      ))}
      <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: '#A2A6BC', marginTop: 4, fontStyle: 'italic' }}>{isReal ? 'lugares y calificaciones reales de Google Places' : 'vista previa · se llena con reseñas reales de Google cuando se active la zona'}</div>
    </div>
  );
}
// Amenidades de la ZONA (alrededor · Google Places). key → emoji+label. Tope 20/categoría → se muestra "20+".
const CATS_ZONA = [
  ['restaurante', '🍴', 'restaurantes'], ['cafe', '☕', 'cafés'], ['escuela', '🏫', 'escuelas'],
  ['hospital', '🏥', 'hospitales'], ['parque', '🌳', 'parques'], ['supermercado', '🛒', 'supermercados'],
  ['gimnasio', '🏋️', 'gimnasios'], ['transporte', '🚇', 'transporte'],
];
const fmtN = (n) => (n >= 20 ? '20+' : String(n));
// Amenidades del DESARROLLO (del edificio) — NO confundir con amenidades de zona (Google). Slug → emoji+label.
const AMEN_DEV = { alberca: ['🏊', 'Alberca'], gym: ['🏋️', 'Gimnasio'], roof: ['🌿', 'Roof garden'], cowork: ['💻', 'Coworking'], spa: ['💆', 'Spa'], concierge: ['🛎️', 'Concierge'], sky_lounge: ['🌆', 'Sky lounge'], cava: ['🍷', 'Cava'], business_center: ['💼', 'Business center'], salon_eventos: ['🎉', 'Salón de eventos'], seguridad: ['🛡️', 'Seguridad 24/7'], pet: ['🐾', 'Pet friendly'], area_pets: ['🐾', 'Área para mascotas'], jardines: ['🌳', 'Jardines'], bicicletas: ['🚲', 'Biciestac.'], estacionamiento: ['🚗', 'Estacionamiento'] };

// Contexto de zona: 1-2 líneas potentes, del arquetipo (dato), antes de preguntar el objetivo.
function zoneContext(name, inv) {
  const pm2 = (inv && inv.precio_m2) || 0; const pl = (inv && inv.plusvalia_anual_pct) || 0;
  if (pm2 >= 85000) return `${name} es de las direcciones más codiciadas de la ciudad. Aquí el precio alto no es un defecto — es la prueba de una zona que la gente nunca deja de querer.`;
  if (pm2 > 0 && pm2 < 42000) return `${name} es la zona en alza donde todavía puedes entrar a buen precio — antes de que el resto se dé cuenta.`;
  if (pl >= 7) return `${name} no para de crecer: precios al alza, demanda fuerte y vida de sobra. Una de las apuestas más interesantes de la ciudad ahora mismo.`;
  return `${name} es de esas zonas donde la ciudad se siente hogar: todo cerca, valor estable y una comunidad que se queda.`;
}

function buildStories(name, inv) {
  const plus = inv.plusvalia_anual_pct; const g5 = inv.ganancia_5y_pct; const pmin = m1(inv.precio_min);
  const mensual30 = inv.credito && inv.credito.escenarios && inv.credito.escenarios[2] ? k(inv.credito.escenarios[2].pago) : null;
  return {
    invertir: {
      hookA: 'Tu dinero, parado en el banco,', hookB: 'pierde contra la inflación.',
      sub: `En ${name} no: sube ~${plus}% al año, te paga renta mientras lo tienes, y en 5 años son +${g5}%. No es especular — es la dirección donde el mercado lleva años apostando. Patrimonio que crece mientras duermes.`,
      vidaTitle: 'Por qué la gente quiere vivir aquí',
      stackTitle: 'Tres formas de ganar, al mismo tiempo', stackIntro: 'Compras una vez. A partir de ahí, tu propiedad trabaja para ti de tres maneras — todas juntas, todos los años.',
      cobrarTitle: 'Lo que cuesta entrar', cobrarCopy: `Entrar a ${name} arranca desde ${pmin}. Con crédito, así se ve el pago — y el rendimiento ya descontó que no lo pagas todo de golpe.`,
      cierreTitle: 'Aquí pones tu dinero a trabajar', cta: 'Ver dónde invertir →',
    },
    familia: {
      hookA: `${name} es donde`, hookB: 'echan raíces de verdad.',
      sub: `El hogar para la familia que están formando — los dos, y los que vengan — en una zona consolidada, sin volver a mudarte. Todo cerca, espacio para crecer, y un patrimonio que sube de valor mientras ustedes construyen su vida.`,
      vidaTitle: 'Todo lo que tu familia necesita, cerca',
      stackTitle: 'Un hogar que además te cuida el patrimonio', stackIntro: 'No tienes que elegir entre un buen lugar para tu familia y una buena decisión de dinero. Aquí van juntas:',
      cobrarTitle: '¿Cuánto para el hogar de tu familia?', cobrarCopy: `Una casa en ${name} arranca desde ${pmin}. Con crédito${mensual30 ? `, desde ~${mensual30}/mes` : ''} — un patrimonio que les dejas, no una renta que se va.`,
      cierreTitle: 'Aquí empieza el hogar de tu familia', cta: 'Ver casas para mi familia →',
    },
    primera: {
      hookA: 'Cada mes de renta', hookB: 'es dinero que no vuelve.',
      sub: `Aquí tu primera casa arranca desde ${pmin}.${mensual30 ? ` Con crédito, ~${mensual30} al mes` : ''} — parecido a lo que ya pagas de renta, pero esta vez es TUYO. Y mientras lo habitas, sube de valor. Dejar de rentar es la puerta a todo lo demás.`,
      vidaTitle: 'El barrio donde vas a vivir, no solo un depto',
      stackTitle: 'Comprar aquí te conviene más que rentar', stackIntro: 'La renta solo se va. Tu primer departamento, en cambio, trabaja para ti desde el día uno:',
      cobrarTitle: 'Más alcanzable de lo que crees', cobrarCopy: `Desde ${pmin}.${mensual30 ? ` La mensualidad (~${mensual30}) se parece a una renta` : ''} — pero cada pago construye TU patrimonio, no el del casero.`,
      cierreTitle: 'Aquí dejas de rentar', cta: 'Ver mi primera casa →',
    },
    vivir: {
      hookA: 'Trabajaste años para llegar aquí.', hookB: 'Que se note dónde vives.',
      sub: `${name} es de las zonas más codiciadas de la ciudad: todo a la mano, una comunidad a tu nivel, y un lugar que no solo se siente bien — también sube de valor contigo. No es una casa: es la prueba de hasta dónde llegaste.`,
      vidaTitle: 'La vida, a la vuelta de la esquina',
      stackTitle: 'Vives mejor — y tu patrimonio sube contigo', stackIntro: 'La buena vida aquí no es un gasto: es una de las decisiones de dinero más sólidas que puedes tomar.',
      cobrarTitle: 'Lo que cuesta esta vida', cobrarCopy: `Vivir en ${name} arranca desde ${pmin}. Con crédito, así se ve el pago de la dirección que mereces.`,
      cierreTitle: 'Aquí empieza la vida que mereces', cta: 'Ver dónde vivir →',
    },
  };
}

export default function ZonePageV2() {
  const { slug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  // TAB de la página unificada · 'propiedades' | 'zona' (Conoce la zona). Default 'zona' por ahora (Propiedades = Fase 3).
  const ver = searchParams.get('ver') === 'propiedades' ? 'propiedades' : 'zona';
  const setVer = (v) => { const n = new URLSearchParams(searchParams); if (v === 'zona') n.delete('ver'); else n.set('ver', v); setSearchParams(n); };
  // tabs montados-ocultos: una vez visitado un tab, queda vivo (no se pierde estado: filtros, scroll). Lazy la 1ª vez.
  const [visited, setVisited] = useState({ zona: true });
  useEffect(() => { setVisited((s) => (s[ver] ? s : { ...s, [ver]: true })); }, [ver]);
  // SEO: canónico apunta SIEMPRE a /zona/{slug} (sin ?ver) → consolida los redirects (/colonia, /marketplace?colonia) aquí.
  useEffect(() => {
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) { link = document.createElement('link'); link.setAttribute('rel', 'canonical'); document.head.appendChild(link); }
    link.setAttribute('href', `https://desarrollosmx.io/zona/${slug}`);
  }, [slug]);
  const [inv, setInv] = useState(null);
  const [landing, setLanding] = useState(null);
  const [devs, setDevs] = useState([]);
  const [similar, setSimilar] = useState([]);
  const [vida, setVida] = useState(null);
  const [lugares, setLugares] = useState(null);
  const [calcMode, setCalcMode] = useState('individual'); // calculadora: 'individual' (1 depa) | 'institucional' (2+ depas)
  const [calcDev, setCalcDev] = useState(null);   // calculadora: desarrollo elegido
  const [calcUnits, setCalcUnits] = useState([]); // unidades del desarrollo elegido
  const [calcUnit, setCalcUnit] = useState(null); // unidad específica elegida (modo individual)
  const [calcSelUnits, setCalcSelUnits] = useState([]); // unidades elegidas (modo institucional · multi-select)
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [lens] = useState(null);     // lente del inversionista (renta/plusvalia/refugio) · el selector se absorbió en el arco; queda null → veredicto usa su mensaje por defecto
  const [saveOpen, setSaveOpen] = useState(false);

  useEffect(() => {
    let alive = true; setLoading(true);
    Promise.all([
      get(`/api/zona/${slug}/inversion`),
      get(`/api/public/landing/colonia/${slug}`),
      get(`/api/developments?colonia=${slug}&limit=12`),
      get(`/api/colonias-similar/${slug}`),
      get(`/api/zona/${slug}/vida`),
      get(`/api/zona/${slug}/lugares`),
    ]).then(([i, l, d, s, v, lg]) => {
      if (!alive) return;
      setInv(i); setLanding(l); setVida(v); setLugares(lg);
      setDevs(Array.isArray(d) ? d : []);
      setSimilar((s && Array.isArray(s.similar)) ? s.similar : []);
      // default = perfil persistido (continuidad entre zonas) || arquetipo de la zona (del dato)
      const pm2 = (i && i.precio_m2) || 0; const pl = (i && i.plusvalia_anual_pct) || 0;
      const arch = pm2 >= 85000 ? 'vivir' : pm2 > 0 && pm2 < 42000 ? 'primera' : pl >= 7 ? 'invertir' : 'familia';
      let persisted = null; try { persisted = localStorage.getItem('dmx_zone_profile'); } catch { /* noop */ }
      setProfile(PROFILES.some((p) => p.k === persisted) ? persisted : arch);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [slug]);

  // ⬆ Upgrade: scroll-reveal cinematográfico de los capítulos de la historia (refuerza el "te lleva slide por slide").
  // Fail-safe: sin IntersectionObserver, o si algo falla, todo queda visible a los 4s (nunca contenido atorado invisible).
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const els = Array.from(document.querySelectorAll('[data-rev]'));
    if (!els.length) return undefined;
    els.forEach((el) => { if (!el.classList.contains('in')) el.classList.add('zv2-rev'); });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
    els.forEach((el) => io.observe(el));
    const safety = setTimeout(() => els.forEach((el) => el.classList.add('in')), 4000);
    return () => { io.disconnect(); clearTimeout(safety); };
  }, [profile, inv, ver]);

  // Elegir perfil = persistir + DISPARAR señal de intención (zone_intent → buyer_signals → lead/demanda/Atlax). Cierra ciclo.
  const pickProfile = (kk) => {
    setProfile(kk);
    try { localStorage.setItem('dmx_zone_profile', kk); } catch { /* noop */ }
    sendBuyerSignal('zone_intent', { colonia: slug, value: kk });
  };

  const name = (landing && landing.name) || tc((slug || '').replace(/-/g, ' '));
  const alcaldia = landing && landing.alcaldia;
  const tier = landing && landing.tier;
  const comparables = (landing && landing.comparable_zones) || [];
  const plus = inv && inv.plusvalia_anual_pct;
  const sec = { maxWidth: 1080, margin: '0 auto', padding: '0 24px' };
  const Q = ({ t }) => (<span className="tip" style={{ position: 'relative' }}><span className="tip-q" style={{ color: '#6366F1' }}>?</span><span className="tip-box">{t}</span></span>);

  const stories = (inv && inv.precio_prom) ? buildStories(name, inv) : null;
  const S = stories ? stories[profile || 'invertir'] : null;
  const profLabel = (PROFILES.find((p) => p.k === profile) || {}).label || 'vivir';
  // oferta adaptada al perfil: primera casa → más accesibles primero
  const sortedDevs = profile === 'primera' ? [...devs].sort((a, b) => (a.price_from || 0) - (b.price_from || 0)) : devs;
  // Amenidades del DESARROLLO agregadas por zona (real, dev.amenities) — prueba para familia/vivir
  const devAmen = (() => {
    const c = {}; devs.forEach((d) => (d.amenities || []).forEach((a) => { c[a] = (c[a] || 0) + 1; }));
    return Object.entries(c).filter(([s]) => AMEN_DEV[s]).sort((a, b) => b[1] - a[1]).slice(0, 8);
  })();
  // Lugares destacados: data REAL de Google (zone_places) si existe → cae al SAMPLE (vista previa) si no.
  const PRICE_TXT = { PRICE_LEVEL_INEXPENSIVE: '$', PRICE_LEVEL_MODERATE: '$$', PRICE_LEVEL_EXPENSIVE: '$$$', PRICE_LEVEL_VERY_EXPENSIVE: '$$$$' };
  const realLugares = (() => {
    if (!lugares || !lugares.lugares) return null;
    const catFor = profile === 'familia' ? 'escuela' : 'restaurante';
    const items = (lugares.lugares[catFor] || []).filter((p) => p.name && p.rating).slice(0, 5).map((p) => ({
      name: p.name, rating: p.rating, reviews: p.reviews || 0,
      meta: [PRICE_TXT[p.price_level], `${p.reviews || 0} reseñas`].filter(Boolean).join(' · '),
      maps_uri: p.maps_uri,
    }));
    if (!items.length) return null;
    return { titulo: profile === 'familia' ? 'Las mejores escuelas cerca' : 'Lo mejor para comer y vivir', items };
  })();
  const lugaresData = realLugares || (SAMPLE_LUGARES[profile] || null);
  const lugaresEsReal = !!realLugares;
  // Conectividad: minutos caminando al metro (real de /lugares · cae a vista previa si no hay)
  const metroReal = lugares && lugares.metro ? lugares.metro : null;
  const metroData = metroReal || { nombre: 'Metro Insurgentes', min_caminando: 6 };
  const metroEsReal = !!metroReal;
  // Carácter del barrio: chips CUALITATIVOS de los conteos REALES de Google (/vida · 253 colonias). Sin número subjetivo
  // (no repetimos el error de los scores). Gated en source='google' → solo donde hay dato verificado.
  const vibe = (() => {
    if (!vida || vida.fuente !== 'google' || !vida.amenidades) return [];
    const a = vida.amenidades, chips = [];
    if ((a.restaurante || 0) + (a.cafe || 0) >= 25) chips.push(['🍴', 'Vida de barrio activa']);
    if ((a.transporte || 0) >= 10) chips.push(['🚇', 'Bien conectado']);
    if ((a.parque || 0) >= 8) chips.push(['🌳', 'Áreas verdes cerca']);
    if ((a.supermercado || 0) >= 10) chips.push(['🛒', 'Todo a la mano']);
    if ((a.escuela || 0) >= 12) chips.push(['🎓', 'Muchas escuelas']);
    return chips.slice(0, 4);
  })();
  // Mi primera casa · "¿cuánto me alcanza?" — ingreso del hogar + ahorro → precio máximo (DTI 30%, crédito 20 años)
  const [pcIngreso, setPcIngreso] = useState(30000);
  const [pcAhorro, setPcAhorro] = useState(300000);
  // Rentar vs comprar (primera casa): renta de la zona vs mensualidad del crédito 80%
  const rentaMes = inv && inv.renta_prom;
  const mensual80 = inv && inv.credito && inv.credito.escenarios && inv.credito.escenarios[2] ? inv.credito.escenarios[2].pago : null;
  // Lente del inversionista (los 7 avatares → 3 puertas) + helper "para ti" que resalta el bloque del avatar elegido.
  const lensCfg = LENSES.find((l) => l.k === lens) || null;
  const paraTi = (tag) => !!(lensCfg && lensCfg.tags.includes(tag));
  const ParaTi = ({ tag }) => paraTi(tag) ? <span style={{ marginLeft: 8, fontFamily: 'DM Sans', fontWeight: 800, fontSize: 10.5, color: '#4F46E5', background: 'rgba(124,92,255,0.12)', borderRadius: 9999, padding: '3px 9px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>✦ para ti</span> : null;
  // Catalizadores de la zona (por qué sube) — derivados de DATO REAL (pipeline de obra, plusvalía, conectividad).
  const catalizadores = (() => {
    if (profile !== 'invertir') return [];
    const out = [];
    const enObra = (devs || []).filter((d) => ['preventa', 'en_construccion'].includes(d.stage)).length;
    if (enObra >= 1) out.push(['🏗️', `${enObra} ${enObra === 1 ? 'desarrollo nuevo' : 'desarrollos nuevos'} en marcha`, 'Obra nueva = capital apostando por la zona. La oferta de calidad jala precio.']);
    if (inv && inv.plusvalia_anual_pct >= 5) out.push(['📈', `Precios subiendo ~${inv.plusvalia_anual_pct}% al año`, 'La zona ya trae inercia de plusvalía, no apuesta a futuro.']);
    if (metroEsReal || (vida && vida.fuente === 'google' && (vida.amenidades || {}).transporte >= 10)) out.push(['🚇', 'Bien conectada al transporte', 'La conectividad sostiene la demanda de renta y el valor.']);
    if (inv && inv.demanda_zona && inv.demanda_zona.busquedas >= 10) out.push(['🔥', 'Zona muy buscada', `${inv.demanda_zona.busquedas} personas la buscaron aquí mismo.`]);
    return out;
  })();

  useEffect(() => {
    if (!calcDev) { setCalcUnits([]); setCalcUnit(null); setCalcSelUnits([]); return undefined; }
    let alive = true;
    setCalcUnit(null); setCalcSelUnits([]);
    get(`/api/developments/${calcDev}/units`).then((r) => {
      if (!alive) return;
      const u = Array.isArray(r) ? r : ((r && (r.units || r.results)) || []);
      setCalcUnits(u.filter((x) => x && x.price));
    });
    return () => { alive = false; };
  }, [calcDev]);

  return (
    <LightScope>
      <style>{`
        @keyframes zv2up { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:none } }
        .zv2-up { animation: zv2up .5s cubic-bezier(.2,.8,.2,1) both }
        .zv2-rev { opacity:0; transform:translateY(30px); transition:opacity .75s cubic-bezier(.2,.8,.2,1), transform .75s cubic-bezier(.2,.8,.2,1) }
        .zv2-rev.in { opacity:1; transform:none }
        .zv2-glow { transition: transform .26s cubic-bezier(.2,.8,.2,1), box-shadow .26s, border-color .26s }
        .zv2-glow:hover { transform: translateY(-4px); border-color: rgba(168,139,250,0.55) !important; box-shadow: 0 16px 42px rgba(124,92,255,0.22) }
        .zv2-bar { transform-origin: bottom; transition: transform .8s cubic-bezier(.2,.8,.2,1) }
        .zv2-rev .zv2-bar { transform: scaleY(0.03) }
        .zv2-rev.in .zv2-bar { transform: scaleY(1) }
        .zv2-imgz { overflow: hidden }
        .zv2-imgz img { transition: transform .6s cubic-bezier(.2,.8,.2,1) }
        .zv2-imgz:hover img { transform: scale(1.045) }
        @media (prefers-reduced-motion: reduce) { .zv2-rev { opacity:1 !important; transform:none !important; transition:none } .zv2-bar { transform:none !important; transition:none } }
        .zv2-cta { transition: transform .18s, box-shadow .18s }
        .zv2-cta:hover { transform: translateY(-2px); box-shadow: 0 14px 32px rgba(124,92,255,.42) }
        .zv2-win { transition: transform .22s cubic-bezier(.2,.8,.2,1), box-shadow .22s }
        .zv2-win:hover { transform: translateY(-3px); box-shadow: 0 22px 48px rgba(99,102,241,.14) }
        .zv2-zlink { transition: transform .18s, box-shadow .18s, border-color .18s }
        .zv2-zlink:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(99,102,241,.16); border-color: rgba(99,102,241,.45) !important }
        .zv2-tab { transition: all .16s ease; cursor:pointer; text-align:left }
        .zv2-tab:hover { border-color: rgba(99,102,241,.5) !important; transform: translateY(-2px) }
      `}</style>
      <PublicNav />
      <div data-testid="zona-v2" style={{ minHeight: '100vh', paddingBottom: 80, color: INK }}>

        {/* ───── CONTEXTO + ¿QUÉ BUSCAS? + TABS ───── */}
        <section style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(180deg,#FAF9FF 0%,#FFFFFF 96%)' }}>
          <div style={{ position: 'absolute', top: -130, right: -70, width: 480, height: 480, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,92,255,0.20), rgba(124,92,255,0) 70%)', filter: 'blur(22px)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: 30, left: -110, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(192,38,211,0.13), rgba(192,38,211,0) 70%)', filter: 'blur(22px)', pointerEvents: 'none' }} />
          <div style={{ ...sec, position: 'relative', paddingTop: 24, paddingBottom: 34 }}>
            <Link to="/marketplace" style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: '#6B6F86', textDecoration: 'none', fontWeight: 600 }}>← Volver al marketplace</Link>
            <div style={{ ...eyebrow, fontSize: 12, marginTop: 16 }}>{alcaldia ? tc(alcaldia) : 'CDMX'}{tier ? ` · ${tc(tier)}` : ''}</div>
            <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(40px,6.5vw,68px)', letterSpacing: '-0.035em', color: INK, margin: '4px 0 0', lineHeight: 1.02 }}>{name}</h1>
            {S && <p style={{ ...lead, fontSize: 17, marginTop: 14, maxWidth: 700 }}>{zoneContext(name, inv)}</p>}
            {vibe.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                {vibe.map(([e, l]) => (
                  <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, color: '#4B4F66', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.16)', borderRadius: 9999, padding: '6px 13px' }}>{e} {l}</span>
                ))}
              </div>
            )}

            {/* Snapshot de la zona · resumen general (arriba de los tabs) */}
            {inv && (
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 18, alignItems: 'flex-end' }}>
                {[
                  ['Precio desde', m1(inv.precio_min || inv.precio_prom)],
                  ['Plusvalía / año', inv.plusvalia_anual_pct != null ? `+${inv.plusvalia_anual_pct}%` : '—'],
                  ...(inv.renta_prom ? [['Renta típica', `~$${Math.round(inv.renta_prom).toLocaleString('es-MX')}/mes`]] : []),
                  ...(inv.cap_rate_anual_pct != null ? [['Cap rate', `${inv.cap_rate_anual_pct}%`]] : []),
                ].map(([l, v]) => (
                  <div key={l}>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: '#8A8FA6', fontWeight: 700 }}>{l}</div>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: INK, letterSpacing: '-0.02em', marginTop: 1 }}>{v}</div>
                  </div>
                ))}
              </div>
            )}

            {/* La pregunta + las 4 tabs (cada una con micro-promesa) */}
            {S && (
              <div style={{ marginTop: 26 }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(18px,2.4vw,24px)', color: INK, letterSpacing: '-0.02em' }}>{name} es muchas cosas para mucha gente. <span style={grad}>¿Qué es para ti?</span></div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: '#8A8FA6', marginTop: 5 }}>Elige y te contamos su historia con esos ojos.</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 12, marginTop: 14 }}>
                  {PROFILES.map((p) => {
                    const on = p.k === profile;
                    return (
                      <button key={p.k} type="button" onClick={() => pickProfile(p.k)} className="zv2-tab"
                        style={{ padding: '15px 18px', borderRadius: 16, border: `1.5px solid ${on ? 'transparent' : 'rgba(16,18,28,0.12)'}`, background: on ? 'linear-gradient(135deg,#6366F1,#4F46E5)' : '#fff', color: on ? '#fff' : INK, boxShadow: on ? '0 12px 28px rgba(124,92,255,0.3)' : '0 6px 18px rgba(16,18,28,0.05)' }}>
                        <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15 }}>{p.e} {p.label}</div>
                        <div style={{ fontFamily: 'DM Sans', fontSize: 12, marginTop: 3, color: on ? 'rgba(255,255,255,0.9)' : '#8A8FA6' }}>{p.promise}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        </section>

        {/* ───── TAB BAR · Propiedades | Conoce la zona (URL ?ver=) ───── */}
        <div style={{ ...sec, marginTop: 4 }}>
          <div style={{ display: 'inline-flex', gap: 4, background: 'rgba(16,18,28,0.05)', borderRadius: 9999, padding: 4 }}>
            {[['propiedades', `🏠 Propiedades${devs.length ? ` (${devs.length}${devs.length >= 12 ? '+' : ''})` : ''}`], ['zona', '📖 Conoce la zona']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setVer(v)} style={{ padding: '9px 20px', borderRadius: 9999, border: 'none', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13.5, background: ver === v ? '#fff' : 'transparent', color: ver === v ? '#4F46E5' : '#6B6F86', boxShadow: ver === v ? '0 2px 8px rgba(16,18,28,0.1)' : 'none' }}>{l}</button>
            ))}
          </div>
        </div>

        {/* ───── TAB · PROPIEDADES (marketplace colonia-scoped · montado-oculto) ───── */}
        {visited.propiedades && (
          <div style={{ display: ver === 'propiedades' ? 'block' : 'none' }}>
            <ZonaPropiedades colonia={slug} colonias={[]} profile={profile} zonaName={name} onVerZona={() => setVer('zona')} />
          </div>
        )}

        {/* ───── TAB · CONOCE LA ZONA (historia del perfil + todos los bloques · montado-oculto) ───── */}
        {visited.zona && (<div style={{ display: ver === 'zona' ? 'block' : 'none' }}>
        {/* Intro-gancho del header: solo perfiles no-invertir (en invertir, el Cap 1 del arco ES el hero, sin CTAs arriba) */}
        {S && profile !== 'invertir' && (
          <section style={{ ...sec, marginTop: 24 }}>
            <div key={profile} className="zv2-up" style={{ maxWidth: 760 }}>
              <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(30px,4.6vw,48px)', letterSpacing: '-0.03em', color: INK, margin: 0, lineHeight: 1.05 }}>{S.hookA} <span style={grad}>{S.hookB}</span></h2>
              <p style={{ ...lead, marginTop: 14, maxWidth: 700 }}>{S.sub}</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
                <button type="button" onClick={() => askAtlax(`Cuéntame de ${name}: ¿me conviene para ${profLabel}? Precios, plusvalía y cómo se vive.`)} className="zv2-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '13px 24px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#6366F1,#4F46E5)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 14.5, cursor: 'pointer', boxShadow: '0 10px 26px rgba(124,92,255,0.34)' }}>🤖 Pregúntale a Atlax sobre {name}</button>
                <button type="button" onClick={() => setSaveOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '13px 22px', borderRadius: 14, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(255,255,255,0.7)', color: '#4F46E5', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>🔔 Vigila esta zona</button>
              </div>
            </div>
          </section>
        )}

        {loading ? (
          <section style={{ ...sec, marginTop: 28 }}><div style={{ ...cardBase, padding: 30, textAlign: 'center', color: '#8A8FA6', fontFamily: 'DM Sans' }}>Cargando la historia de {name}…</div></section>
        ) : !S ? (
          <section style={{ ...sec, marginTop: 28 }}><div style={{ ...cardBase, padding: 30, color: '#8A8FA6', fontFamily: 'DM Sans' }}>Aún estamos reuniendo los datos de {name}.</div></section>
        ) : (
        <div key={`body-${profile}`}>
        {/* ════════ MUESTRA REDISEÑO (estilo Dividenz/GBM) · arco full-bleed, fondos alternados, números enormes ════════ */}
        {profile === 'invertir' && S && (() => {
          const plus = inv.plusvalia_anual_pct;
          const precio = inv.precio_prom || 0;
          const f = 1 + (plus || 0) / 100;
          const serie = [0, 1, 2, 3, 4, 5].map((y) => ({ y, v: Math.round(precio * Math.pow(f, y)) }));
          const vmax = serie[serie.length - 1].v || 1;
          const m1c = (n) => { n = Math.round(Number(n) || 0); return n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${n}`; };
          // imágenes: preferimos fotos REALES de los desarrollos; si solo hay placeholders, usamos un fallback curado y relevante (skyline/edificio/interior)
          const realFotos = (Array.isArray(devs) ? devs : []).flatMap((d) => [d.hero_photo, ...((d.photos) || [])]).filter((p) => p && !/picsum|placehold|seed\//i.test(p));
          const STOCK = ['1067', '1076', '164'].map((id) => `https://picsum.photos/id/${id}/1280/760`);
          const img = (i) => (realFotos.length > i ? realFotos[i] : STOCK[i % STOCK.length]);
          const cont = { maxWidth: 1000, margin: '0 auto', padding: '0 28px' };
          const giant = { fontFamily: 'Outfit', fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1.04 };
          const eyb = (c) => ({ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: c });
          const bridge = (txt, dark) => (<div style={{ marginTop: 34, fontFamily: 'DM Sans', fontSize: 'clamp(14px,1.8vw,17px)', fontWeight: 600, fontStyle: 'italic', color: dark ? 'rgba(255,255,255,0.8)' : '#4B4F66', display: 'flex', alignItems: 'center', gap: 9 }}>{txt} <span style={{ fontSize: 17, fontStyle: 'normal', color: dark ? '#A5B4FC' : '#6366F1' }}>↓</span></div>);
          return (
            <>
              {/* ─── CAP 1 · EL HÉROE Y SU ERROR (oscuro + imagen · conectar → nombrar el error → el giro) ─── */}
              <section style={{ width: '100%', background: `linear-gradient(102deg, #0A0C24 0%, rgba(12,11,30,0.95) 44%, rgba(26,24,64,0.62) 100%), url(${img(0)}) right center / cover`, color: '#fff', padding: 'clamp(58px,7.5vw,90px) 0', position: 'relative', overflow: 'hidden' }}>
                <div data-rev style={{ ...cont, position: 'relative' }}>
                  <div style={eyb('#A5B4FC')}>Invertir · {name}</div>
                  <h2 style={{ ...giant, fontSize: 'clamp(28px,4vw,48px)', margin: '20px 0 0', color: '#fff', maxWidth: 760 }}>
                    Trabajaste años por ese dinero.<br />
                    <span style={{ color: 'rgba(255,255,255,0.42)' }}>Guardado en el banco, rinde para ellos.</span><br />
                    Aquí, por fin, <span style={{ background: 'linear-gradient(90deg,#A5B4FC,#818CF8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>rinde para ti</span>.
                  </h2>
                  <p style={{ fontFamily: 'DM Sans', fontSize: 'clamp(15px,1.9vw,19px)', color: 'rgba(255,255,255,0.78)', maxWidth: 560, marginTop: 22, lineHeight: 1.55 }}>Una propiedad en {name} toma lo que tanto te costó juntar y lo vuelve algo que <b style={{ color: '#fff' }}>crece solo</b>, te da <b style={{ color: '#fff' }}>ingresos cada mes</b> y <b style={{ color: '#fff' }}>siempre será tuyo</b>.</p>
                  {bridge('Déjame mostrarte por qué aquí', true)}
                </div>
              </section>

              {/* ─── CAP 2 · LA OPORTUNIDAD (claro · por qué este lugar protege y crece · gráfica + imagen · pocos números) ─── */}
              <section style={{ width: '100%', background: '#fff', padding: 'clamp(56px,8vw,92px) 0', borderBottom: '1px solid rgba(16,18,28,0.06)' }}>
                <div data-rev style={cont}>
                  <div style={eyb('#6366F1')}>Por qué aquí</div>
                  <h2 style={{ ...giant, fontSize: 'clamp(27px,3.8vw,44px)', color: INK, margin: '14px 0 0' }}>Hay lugares que la gente<br />nunca deja de querer.</h2>
                  <p style={{ fontFamily: 'DM Sans', fontSize: 'clamp(15px,1.9vw,18px)', color: MUT, maxWidth: 620, marginTop: 16, lineHeight: 1.6 }}>{name} es uno de ellos. Y cuando un lugar siempre tiene quién lo busque, lo que tienes ahí <b style={{ color: INK }}>no se devalúa</b> — al contrario: vale un poco más cada año, tranquilo y constante. No es suerte. Es lo que pasa aquí.</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,0.85fr)', gap: 'clamp(18px,3vw,36px)', alignItems: 'center', marginTop: 34 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'clamp(5px,1.4vw,14px)', height: 'clamp(150px,22vw,210px)' }}>
                        {serie.map((p, i) => {
                          const last = i === serie.length - 1;
                          const show = i === 0 || last;
                          const h = 36 + (p.v / vmax) * 64;
                          return (
                            <div key={p.y} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(10px,1.4vw,13px)', color: last ? '#059669' : '#B7BAC8', marginBottom: 6, visibility: show ? 'visible' : 'hidden' }}>{m1c(p.v)}</div>
                              <div className="zv2-bar" style={{ width: '100%', maxWidth: 64, height: `${h}%`, borderRadius: '9px 9px 0 0', background: last ? 'linear-gradient(180deg,#10B981,#059669)' : 'linear-gradient(180deg,#D1FAE5,#A7F3D0)', transitionDelay: `${0.12 + i * 0.08}s` }} />
                              <div style={{ fontFamily: 'DM Sans', fontSize: 'clamp(9px,1.3vw,11px)', color: '#A2A6BC', marginTop: 8, fontWeight: 600 }}>{p.y === 0 ? 'Hoy' : p.y === 5 ? '+5 años' : ''}</div>
                            </div>
                          );
                        })}
                      </div>
                      <p style={{ fontFamily: 'DM Sans', fontSize: 14.5, color: MUT, marginTop: 18, lineHeight: 1.55 }}>Entrar mañana siempre cuesta más que entrar hoy. <b style={{ color: INK }}>El mejor momento para empezar es ahora.</b></p>
                    </div>
                    <div className="zv2-imgz" style={{ borderRadius: 18, boxShadow: '0 18px 40px rgba(16,18,28,0.14)' }}>
                      <img src={img(1)} alt="" loading="lazy" style={{ width: '100%', height: 'clamp(180px,26vw,250px)', objectFit: 'cover', display: 'block' }} onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }} />
                    </div>
                  </div>
                  {bridge('Y ganar valor es apenas el principio de lo que hace por ti')}
                </div>
              </section>

              {/* ─── CAP 3 · LOS BENEFICIOS (oscuro · lo que GANAS, sin números · imagen) ─── */}
              <section style={{ width: '100%', background: `linear-gradient(180deg,#0E1230,#0A0C24)`, color: '#fff', padding: 'clamp(56px,8vw,92px) 0' }}>
                <div data-rev style={cont}>
                  <div style={eyb('#A5B4FC')}>Lo que ganas</div>
                  <h2 style={{ ...giant, fontSize: 'clamp(27px,3.8vw,44px)', color: '#fff', margin: '14px 0 0' }}>Tres cosas que el banco<br />nunca podrá darte.</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 16, marginTop: 32 }}>
                    {[
                      ['🌱', 'Crece mientras vives', 'Tu propiedad se vuelve más valiosa con el tiempo, sin que hagas nada. Tu dinero trabaja incluso cuando tú descansas.'],
                      ['💸', 'Te paga cada mes', 'Alguien la habita y te deja un ingreso. Dinero que entra sin que tengas que cambiar tus horas por pesos.'],
                      ['🔑', 'Es tuyo, y de los tuyos', 'No es un papel ni una promesa. Es algo real que disfrutas hoy y le heredas a quien más quieres mañana.'],
                    ].map(([ic, t, d]) => (
                      <div key={t} className="zv2-glow" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '22px 22px' }}>
                        <div style={{ fontSize: 30 }}>{ic}</div>
                        <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18.5, color: '#fff', marginTop: 12 }}>{t}</div>
                        <div style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'rgba(255,255,255,0.66)', marginTop: 7, lineHeight: 1.58 }}>{d}</div>
                      </div>
                    ))}
                  </div>
                  <div className="zv2-imgz" style={{ borderRadius: 18, marginTop: 22, border: '1px solid rgba(255,255,255,0.1)' }}>
                    <img src={img(2)} alt="" loading="lazy" style={{ width: '100%', height: 'clamp(140px,20vw,200px)', objectFit: 'cover', display: 'block' }} onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }} />
                  </div>
                  {bridge('Suena bien. Pero, ¿por qué aquí y no en cualquier otro lado?', true)}
                </div>
              </section>

              {/* ─── CAP 4 · LA PRUEBA REAL (claro · datos ESPECÍFICOS de esta colonia — personalización real, no seed genérico) ─── */}
              <section style={{ width: '100%', background: 'linear-gradient(180deg,#FAFAFE,#F3F2FB)', padding: 'clamp(56px,8vw,92px) 0', borderBottom: '1px solid rgba(16,18,28,0.06)' }}>
                <div data-rev style={cont}>
                  <div style={eyb('#6366F1')}>No es promesa, es {name}</div>
                  <h2 style={{ ...giant, fontSize: 'clamp(27px,3.8vw,44px)', color: INK, margin: '14px 0 0' }}>Por qué aquí, y no<br />en cualquier lado.</h2>
                  <p style={{ fontFamily: 'DM Sans', fontSize: 'clamp(15px,1.9vw,18px)', color: MUT, maxWidth: 620, marginTop: 16, lineHeight: 1.6 }}>Cada zona tiene su propia historia. Estas son las fuerzas reales que sostienen el valor de {name} — y que la hacen distinta a las demás:</p>
                  {catalizadores.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginTop: 26 }}>
                      {catalizadores.slice(0, 4).map(([e, t, d]) => (
                        <div key={t} className="zv2-win" style={{ ...cardBase, padding: '18px 20px' }}>
                          <div style={{ fontSize: 24 }}>{e}</div>
                          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: INK, marginTop: 7 }}>{t}</div>
                          <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: MUT, marginTop: 4, lineHeight: 1.5 }}>{d}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {(inv.demanda_zona && inv.demanda_zona.busquedas >= 3) && (
                    <p style={{ fontFamily: 'DM Sans', fontSize: 'clamp(15px,1.9vw,18px)', color: MUT, maxWidth: 640, marginTop: 24, lineHeight: 1.6 }}>Y no eres el único que la mira: <b style={{ color: INK }}>{inv.demanda_zona.busquedas} personas</b> buscaron propiedad en {name} aquí mismo{inv.demanda_zona.con_alerta > 0 ? `, y ${inv.demanda_zona.con_alerta} dejaron una alerta esperando que entre algo` : ''}. Donde hay quién la quiera, hay con quién rentar y a quién vender mañana.</p>
                  )}
                  {inv.vs_ciudad && (() => {
                    const p = inv.vs_ciudad.precio_vs_ciudad_pct; const caro = p >= 0;
                    return (<p style={{ fontFamily: 'DM Sans', fontSize: 'clamp(15px,1.9vw,18px)', color: MUT, maxWidth: 640, marginTop: 14, lineHeight: 1.6 }}>{caro ? <>Aquí cada metro vale más que el promedio de la ciudad — y lo vale: es zona consolidada, con valor estable y demanda que no falla.</> : <>Y todavía estás a tiempo: aquí entrar cuesta <b style={{ color: '#059669' }}>menos que el promedio de la ciudad</b>, con todo el recorrido de crecimiento por delante.</>}</p>);
                  })()}
                  {bridge('Ya viste por qué. Ahora veamos qué tan tuyo puede ser')}
                </div>
              </section>
            </>
          );
        })()}

        {/* (rebuild) El "lente del inversionista" se absorbió en el arco de la historia (Cap 1-4). lens queda en null → el veredicto usa su mensaje por defecto. */}

        {/* ── LA VIDA AQUÍ — PAUSADO: los conteos OSM no son confiables (1 gym en Polanco = falso). Se reactiva con
            datos verificados de Google Places (ingesta de pago, 1 vez). El endpoint /vida ya existe (build-for-endstate). ── */}

        {/* ── VALUE STACK (no-invertir · el arco de invertir ya tiene su Cap 3 "Lo que ganas") ── */}
        {profile !== 'invertir' && (
        <section id="dinero" className="zv2-up" style={{ ...sec, marginTop: 54 }}>
          <div style={eyebrow}>{tc('Por qué tiene sentido')}</div>
          <h2 style={chapTitle}>{S.stackTitle}</h2>
          <p style={lead}>{S.stackIntro}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 22 }}>
            {[
              { n: 1, h: 'Sube de valor — solo.', big: `+${plus}%`, c: '#10B981',
                copy: <>Cada año tu propiedad vale más. Un depto de {m1(inv.precio_prom)} se aprecia <b>~{k(inv.plusvalia_anual_abs || 0)} al año</b> <Q t="Plusvalía estimada por el motor según el tier y la tendencia de la zona — no es una medición de transacciones históricas." /> — sin que muevas un dedo.</> },
              { n: 2, h: 'Y te paga mientras la tienes.', big: inv.cap_rate_anual_pct != null ? `${inv.cap_rate_anual_pct}%` : '—', c: '#4F46E5',
                copy: <>Si la rentas, podría dejarte <b>~${(inv.renta_prom || 0).toLocaleString('es-MX')}/mes</b>. Un cap rate de {inv.cap_rate_anual_pct}% <Q t="Cap rate: lo que rinde la propiedad por su renta (NOI ÷ precio), sin importar cómo la pagues. Estimado por el yield de la zona; no incluye la plusvalía." /> — lo que rinde cada año solo por rentarla.</> },
              { n: 3, h: 'En 5 años, esto es tuyo.', big: `+${inv.ganancia_5y_pct}%`, c: '#10B981',
                copy: <>Si vendes a los 5 años, recuperas tu dinero <b>+ ~{m1(inv.ganancia_5y_abs)}</b> de ganancia. Tu rendimiento real al año: <b>{inv.tir_anual_pct}%</b> <Q t="TIR: tu rendimiento real por año, contando rentas + venta y ajustado al tiempo." />.</> },
            ].map((w) => (
              <div key={w.n} className="zv2-win" style={{ ...cardBase, padding: '22px 24px', display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 320px', minWidth: 260 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#6366F1,#4F46E5)', color: '#fff', fontFamily: 'Outfit', fontWeight: 800, fontSize: 13 }}>{w.n}</span>
                    <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 19, color: INK }}>{w.h}</span>
                  </div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 14.5, color: MUT, marginTop: 8, lineHeight: 1.55 }}>{w.copy}</div>
                </div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(36px,5vw,52px)', color: w.c, letterSpacing: '-0.04em', lineHeight: 1 }}>{w.big}</div>
              </div>
            ))}
          </div>
        </section>
        )}

        {/* ── LA VIDA ALREDEDOR (amenidades de ZONA · Google · no-invertir) ── */}
        {profile !== 'invertir' && vida && vida.fuente === 'google' && vida.amenidades && (() => {
          const am = vida.amenidades;
          const shown = CATS_ZONA.filter(([key]) => (am[key] || 0) > 0);
          if (!shown.length) return null;
          const intro = profile === 'familia'
            ? `Todo lo que tu familia necesita, a unos pasos: ${fmtN(am.escuela || 0)} escuelas, ${fmtN(am.hospital || 0)} hospitales y ${fmtN(am.parque || 0)} parques alrededor. El barrio donde crecen, no solo cuatro paredes.`
            : profile === 'vivir'
              ? `La buena vida, caminando: ${fmtN(am.restaurante || 0)} restaurantes y ${fmtN(am.cafe || 0)} cafés a tu alrededor. Aquí sales por la puerta y todo está cerca.`
              : profile === 'primera'
                ? `No compras un depto aislado — compras un barrio vivo: ${fmtN(am.restaurante || 0)} restaurantes, ${fmtN(am.cafe || 0)} cafés y todo lo que necesitas a unos pasos.`
                : `Lo que hace que la gente quiera vivir aquí (y por eso renta y se revaloriza): ${fmtN(am.restaurante || 0)} restaurantes, ${fmtN(am.escuela || 0)} escuelas, ${fmtN(am.hospital || 0)} hospitales y más, todo cerca.`;
          return (
            <section className="zv2-up" style={{ ...sec, marginTop: 54 }}>
              <div style={eyebrow}>{tc('La vida alrededor')}</div>
              <h2 style={chapTitle}>{S.vidaTitle}</h2>
              <p style={lead}>{intro}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginTop: 18 }}>
                {shown.map(([key, e, label]) => (
                  <div key={key} className="zv2-win" style={{ ...cardBase, padding: '16px 18px' }}>
                    <div style={{ fontSize: 22 }}>{e}</div>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: INK, marginTop: 4, letterSpacing: '-0.02em' }}>{fmtN(am[key])}</div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: MUT, marginTop: 1 }}>{label}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: '#A2A6BC', marginTop: 12, fontStyle: 'italic' }}>lugares reales a ~1.2 km a la redonda (Google Places)</div>
            </section>
          );
        })()}

        {/* (dedup) "¿dónde pongo mi dinero" · "tabla vehículos" · "¿con cuánto inviertes" se movieron a la calculadora
            (Pentágono de inversiones + vs CETES/Bolsa + dimensionar por capital) — la página no los repite. */}

        {/* (rebuild) Catalizadores + Demanda + Vs-ciudad se FUNDIERON en el Cap 4 "La prueba real" del arco (datos reales por colonia, dentro de la historia). */}

        {/* (reorden espina) "Los riesgos, de frente" se movió DESPUÉS de la calculadora (objeciones antes del cierre · Hormozi) */}

        {/* (dedup) "retorno neto de impuestos" se movió a la calculadora (ISR de renta + ISR de venta art.152/RESICO). */}

        {profile === 'primera' && rentaMes && mensual80 && (
          <section className="zv2-up" style={{ ...sec, marginTop: 54 }}>
            <div style={eyebrow}>{tc('Rentar vs comprar')}</div>
            <h2 style={chapTitle}>La renta se va. Tu mensualidad se queda.</h2>
            <p style={lead}>Mira la diferencia real entre seguir rentando y empezar a construir lo tuyo en {name}:</p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 18 }}>
              <div className="zv2-win" style={{ ...cardBase, padding: '20px 24px', flex: '1 1 240px', borderTop: '3px solid #DC2626' }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700, color: '#6B6F86' }}>🏚️ Si rentas aquí</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 30, color: '#DC2626', letterSpacing: '-0.03em', marginTop: 5 }}>${rentaMes.toLocaleString('es-MX')}<span style={{ fontSize: 14, color: '#A2A6BC' }}>/mes</span></div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: MUT, marginTop: 6 }}>En 5 años: ~{m1(rentaMes * 60)} que se van y nunca vuelven.</div>
              </div>
              <div className="zv2-win" style={{ ...cardBase, padding: '20px 24px', flex: '1 1 240px', borderTop: '3px solid #10B981' }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700, color: '#6B6F86' }}>🔑 Si compras (80% crédito)</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 30, color: '#10B981', letterSpacing: '-0.03em', marginTop: 5 }}>${mensual80.toLocaleString('es-MX')}<span style={{ fontSize: 14, color: '#A2A6BC' }}>/mes</span></div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: MUT, marginTop: 6 }}>Cada pago es TUYO — y el depto sube de valor mientras lo habitas.</div>
              </div>
            </div>
          </section>
        )}
        {/* ── ¿CUÁNTO TE ALCANZA? (herramienta propia de "Mi primera casa") ── */}
        {profile === 'primera' && (() => {
          const tasa = 0.1145, plazo = 240, dti = 0.30;
          const ing = Number(pcIngreso) || 0;
          const pagoMax = Math.round(ing * dti);
          const i = tasa / 12;
          const prestamoMax = pagoMax > 0 ? Math.round(pagoMax * (1 - Math.pow(1 + i, -plazo)) / i) : 0;
          const precioMax = prestamoMax + (Number(pcAhorro) || 0);
          const precioMin = inv && inv.precio_min;
          const alcanza = precioMin ? precioMax >= precioMin : null;
          const lbl = { fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 700, color: '#6B6F86', marginBottom: 6 };
          const inputS = { padding: '10px 13px', borderRadius: 10, border: '1px solid rgba(99,102,241,0.22)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14, color: INK, outline: 'none', background: '#fff', width: 150 };
          return (
            <section className="zv2-up" style={{ ...sec, marginTop: 54 }}>
              <div style={eyebrow}>{tc('¿Cuánto te alcanza?')}</div>
              <h2 style={chapTitle}>Pon tus números — te decimos para qué te alcanza</h2>
              <p style={lead}>Con el ingreso de tu hogar y lo que tienes ahorrado, calculamos tu precio máximo y tu mensualidad — y si te alcanza para {name}.</p>
              <div className="zv2-win" style={{ ...cardBase, padding: '24px 26px', marginTop: 18 }}>
                <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div>
                    <div style={lbl}>Ingreso del hogar (al mes)</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      {[20000, 30000, 45000, 60000].map((v) => (
                        <button key={v} type="button" onClick={() => setPcIngreso(v)} style={{ padding: '8px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12.5, border: pcIngreso === v ? '1.5px solid #6366F1' : '1px solid rgba(99,102,241,0.2)', background: pcIngreso === v ? 'rgba(124,92,255,0.1)' : '#fff', color: pcIngreso === v ? '#4F46E5' : '#4B4F66' }}>${(v / 1000)}k</button>
                      ))}
                      <input type="text" inputMode="numeric" value={`$${Number(pcIngreso || 0).toLocaleString('es-MX')}`} onChange={(e) => setPcIngreso(parseInt(String(e.target.value).replace(/\D/g, ''), 10) || 0)} style={{ ...inputS, width: 120 }} />
                    </div>
                  </div>
                  <div>
                    <div style={lbl}>Lo que tienes ahorrado (enganche)</div>
                    <input type="text" inputMode="numeric" value={`$${Number(pcAhorro || 0).toLocaleString('es-MX')}`} onChange={(e) => setPcAhorro(parseInt(String(e.target.value).replace(/\D/g, ''), 10) || 0)} style={inputS} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14, marginTop: 20 }}>
                  {[['Te alcanza para', m1(precioMax), '#6366F1', 'precio máximo de la casa'], ['Mensualidad', `$${pagoMax.toLocaleString('es-MX')}`, '#16182A', '~30% de tu ingreso (sano)'], ['Tu enganche', m1(Number(pcAhorro) || 0), '#10B981', 'lo que ya tienes']].map(([l, v, c, sub]) => (
                    <div key={l} style={{ ...cardBase, padding: '16px 18px' }}>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 700, color: '#6B6F86' }}>{l}</div>
                      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: c, letterSpacing: '-0.02em', marginTop: 3 }}>{v}</div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: '#A2A6BC', marginTop: 2 }}>{sub}</div>
                    </div>
                  ))}
                </div>
                {precioMin != null && (
                  <div style={{ marginTop: 16, padding: '13px 16px', borderRadius: 12, background: alcanza ? 'rgba(14,159,110,0.08)' : 'rgba(224,163,62,0.1)', fontFamily: 'DM Sans', fontSize: 13.5, color: alcanza ? '#0E7A53' : '#8A6A1E', lineHeight: 1.5 }}>
                    {alcanza
                      ? <>✓ <b>Sí te alcanza para {name}</b> — desde {m1(precioMin)}. Tu mensualidad (~${pagoMax.toLocaleString('es-MX')}) en vez de renta ya construye <b>tu patrimonio</b>.</>
                      : <>En {name} arranca desde <b>{m1(precioMin)}</b> y por ahora te alcanza para {m1(precioMax)}. Cerca: súbele al enganche, considera <b>Infonavit/Cofinavit</b> (amplía el monto), o mira zonas más accesibles.</>}
                  </div>
                )}
                <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: '#A2A6BC', marginTop: 12, fontStyle: 'italic' }}>Estimado · crédito a 20 años, tasa ~11.45%, mensualidad máx 30% del ingreso (regla sana). Con Infonavit/Cofinavit el monto puede subir — se afina al cotizar con tus datos.</div>
              </div>
            </section>
          );
        })()}
        {(profile === 'familia' || profile === 'vivir') && devAmen.length > 0 && (
          <section className="zv2-up" style={{ ...sec, marginTop: 54 }}>
            <div style={eyebrow}>{profile === 'familia' ? tc('Para los tuyos') : tc('A tu nivel')}</div>
            <h2 style={chapTitle}>{profile === 'familia' ? 'Lo que ofrecen los desarrollos aquí' : 'Desarrollos a tu altura'}</h2>
            <p style={lead}>{profile === 'familia' ? `No solo cuatro paredes: los proyectos en ${name} vienen con amenidades pensadas para la familia.` : `Vivir bien empieza en casa. Esto es lo que ofrecen los desarrollos de ${name}.`}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginTop: 18 }}>
              {devAmen.map(([s, count]) => (
                <div key={s} className="zv2-win" style={{ ...cardBase, padding: '16px 18px' }}>
                  <div style={{ fontSize: 22 }}>{AMEN_DEV[s][0]}</div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: INK, marginTop: 4 }}>{AMEN_DEV[s][1]}</div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: '#A2A6BC', marginTop: 1 }}>en {count} {count === 1 ? 'desarrollo' : 'desarrollos'}</div>
                </div>
              ))}
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: '#A2A6BC', marginTop: 12, fontStyle: 'italic' }}>amenidades reales de los desarrollos en la zona</div>
          </section>
        )}

        {/* ── CONECTIVIDAD · minutos al metro (no-invertir) ── */}
        {profile !== 'invertir' && metroData && (
          <section className="zv2-up" style={{ ...sec, marginTop: 40 }}>
            <div className="zv2-win" style={{ ...cardBase, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 28 }}>🚇</div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: INK }}>{metroData.nombre} a ~{metroData.min_caminando} min caminando</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: MUT, marginTop: 2 }}>
                  {profile === 'primera' ? 'Llegas al trabajo sin coche — sin gastar en gasolina ni estacionamiento.'
                    : profile === 'invertir' ? 'Cerca del transporte = se renta más fácil y más caro.'
                    : profile === 'familia' ? 'Todo a la mano y los traslados cortos para los tuyos.'
                    : 'Todo a la mano, sin depender del coche.'}
                </div>
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: '#A2A6BC', fontStyle: 'italic' }}>{metroEsReal ? 'distancia real · a pie (aprox)' : 'vista previa'}</div>
            </div>
          </section>
        )}

        {/* ── LO MEJOR CERCA (mockup · clickable con reseñas · infra lista para datos reales de Google) ── */}
        {(profile === 'familia' || profile === 'vivir') && lugaresData && (
          <section className="zv2-up" style={{ ...sec, marginTop: 54 }}>
            <div style={eyebrow}>{tc('Lo mejor cerca')}</div>
            <h2 style={chapTitle}>{lugaresData.titulo}</h2>
            <p style={lead}>{profile === 'familia' ? 'Toca cada lugar para ver reseñas, calificación y a cuántos minutos está de aquí.' : 'Los favoritos de la zona, con calificación real. Toca cualquiera para ver más.'}</p>
            <LugaresPreview data={lugaresData} isReal={lugaresEsReal} />
          </section>
        )}

        {/* ── CÓMO EMPEZAR (crédito · no-invertir · en invertir lo cubre la calculadora) ── */}
        {profile !== 'invertir' && (
        <section style={{ ...sec, marginTop: 58 }}>
          <div style={eyebrow}>{tc('Cómo empezar')}</div>
          <h2 style={chapTitle}>{S.cobrarTitle}</h2>
          <p style={lead}>{S.cobrarCopy}</p>
          {inv.credito && inv.credito.escenarios && (
            <div style={{ ...cardBase, padding: 22, marginTop: 18 }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: '#A2A6BC' }}>sobre ~{m1(inv.credito.valor_inmueble)} · a {inv.credito.plazo_anios} años · tasa prom {inv.credito.tasa_prom_pct}%</div>
              <div style={{ display: 'flex', fontFamily: 'DM Sans', fontSize: 9.5, color: '#A2A6BC', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 12, paddingBottom: 6, borderBottom: '1px solid rgba(16,18,28,0.1)' }}>
                <span style={{ flex: '0 0 92px' }}>crédito</span><span style={{ flex: 1, textAlign: 'right' }}>enganche</span><span style={{ flex: 1, textAlign: 'right' }}>te prestan</span><span style={{ flex: 1, textAlign: 'right' }}>al mes</span>
              </div>
              {inv.credito.escenarios.map((e) => (
                <div key={e.aforo} style={{ display: 'flex', alignItems: 'baseline', fontFamily: 'DM Sans', fontSize: 13, padding: '9px 0', borderTop: '1px solid rgba(16,18,28,0.05)' }}>
                  <span style={{ flex: '0 0 92px', fontWeight: 800, color: INK }}>{e.aforo}% a crédito</span>
                  <span style={{ flex: 1, textAlign: 'right', color: '#4B4F66' }}>{m1(e.enganche)}</span>
                  <span style={{ flex: 1, textAlign: 'right', color: '#4B4F66' }}>{m1(e.prestamo)}</span>
                  <span style={{ flex: 1, textAlign: 'right', fontWeight: 800, color: '#10B981' }}>{k(e.pago)}</span>
                </div>
              ))}
              <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: '#A2A6BC', marginTop: 10, fontStyle: 'italic' }}>Informativo. Con más enganche, menos crédito y menos pagas al mes. Tu tasa y pago reales los define el banco según tu perfil.</div>
            </div>
          )}
        </section>
        )}

        {/* ── BANDA ATLAX (no-invertir · en invertir el cierre ya tiene "pregúntale a Atlax") ── */}
        {profile !== 'invertir' && (
        <section style={{ ...sec, marginTop: 58 }}>
          <div style={{ ...cardBase, padding: '30px 32px', background: 'linear-gradient(135deg, rgba(124,92,255,0.08), rgba(192,38,211,0.06))', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(22px,3vw,30px)', color: INK, letterSpacing: '-0.02em' }}>¿Te queda una duda sobre {name}?</div>
            <p style={{ fontFamily: 'DM Sans', fontSize: 15, color: MUT, marginTop: 8, maxWidth: 540, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.55 }}>Pregúntale a <b>Atlax</b> — conoce los precios, la plusvalía, la vida y los desarrollos de {name}. Te responde al instante.</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 18 }}>
              {[`¿${name} me conviene para ${profLabel}?`, `¿Cuánto necesito para comprar en ${name}?`, comparables[0] ? `¿${name} o ${comparables[0].name}?` : `¿Cómo se vive en ${name}?`].map((q, i) => (
                <button key={i} type="button" onClick={() => askAtlax(q)} className="zv2-zlink" style={{ ...cardBase, padding: '11px 18px', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, color: '#4B4F66', cursor: 'pointer', border: '1px solid rgba(99,102,241,0.18)' }}>{q}</button>
              ))}
            </div>
          </div>
        </section>
        )}

        {/* ── NO ERES EL ÚNICO (no-invertir) ── */}
        {profile !== 'invertir' && (comparables.length > 0 || similar.length > 0) && (
          <section style={{ ...sec, marginTop: 58 }}>
            <div style={eyebrow}>{tc('No eres el único')}</div>
            <h2 style={chapTitle}>La gente que sabe, está mirando aquí</h2>
            <p style={lead}>{name} compite con las zonas más buscadas de la ciudad. Si estás comparando, vale la pena verlas al lado:</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 18 }}>
              {(comparables.length ? comparables : similar).slice(0, 5).map((z) => (
                <Link key={z.slug || z.id} to={`/zona/${z.slug || z.id}`} className="zv2-zlink" style={{ textDecoration: 'none', ...cardBase, padding: '14px 20px', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: INK }}>{z.name || tc((z.slug || z.id || '').replace(/-/g, ' '))}</span>
                  <span style={{ color: '#6366F1', fontWeight: 800 }}>→</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* (reorden espina) El VEREDICTO se movió DESPUÉS de la calculadora + riesgos (el cierre va al final del arco) */}

        {/* ── CALCULADORA INTERACTIVA (Bloque 12 · proyecto → unidad → desglose completo · reusa InvestmentSimulator) ── */}
        {profile === 'invertir' && sortedDevs.length > 0 && (
          <section className="zv2-up" style={{ ...sec, marginTop: 60 }}>
            <div style={eyebrow}>{tc('Ahora sí · tus números')}</div>
            <h2 style={chapTitle}>Veamos qué tan tuyo puede ser</h2>
            <p style={lead}>Elige un desarrollo y una unidad de {name}. Armamos el cálculo completo con TUS datos — tu enganche, tu crédito, lo que te deja al mes y cuánto vale en unos años.</p>
            <style>{`
              .zv2-dev{transition:transform .15s,box-shadow .15s,border-color .15s}
              .zv2-dev:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(99,102,241,.14)}
              .zv2-unit{transition:transform .15s,box-shadow .15s,border-color .15s}
              .zv2-unit:hover{transform:translateY(-3px);box-shadow:0 12px 26px rgba(99,102,241,.16);border-color:rgba(124,92,255,.45)!important}
            `}</style>
            {/* PASO 1 · tipo de inversión (decide todo el flow: 1 depa vs varios) */}
            <div style={{ marginTop: 18 }}>
              <div style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 11.5, color: '#9499AE', textTransform: 'uppercase', letterSpacing: '0.06em' }}>1 · ¿Para ti o institucional?</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                {[['individual', '👤 Para ti', 'Compras 1 departamento'], ['institucional', '🏛️ Institucional', 'Un fondo compra 2 o más']].map(([v, l, d]) => { const on = calcMode === v; return (
                  <button key={v} className="zv2-dev" type="button" onClick={() => { setCalcMode(v); setCalcUnit(null); setCalcSelUnits([]); }} style={{ padding: '11px 18px', borderRadius: 12, cursor: 'pointer', fontFamily: 'DM Sans', textAlign: 'left', border: on ? '1.5px solid transparent' : '1px solid rgba(99,102,241,0.22)', background: on ? 'linear-gradient(120deg,#6366F1,#4F46E5)' : '#fff', color: on ? '#fff' : '#4B4F66', boxShadow: on ? '0 8px 20px rgba(124,92,255,.28)' : '0 2px 8px rgba(16,18,28,.04)' }}>
                    <div style={{ fontWeight: 800, fontSize: 13.5 }}>{l}</div>
                    <div style={{ fontSize: 10.5, fontWeight: 600, opacity: on ? 0.85 : 0.65, marginTop: 1 }}>{d}</div>
                  </button>
                ); })}
              </div>
            </div>
            {/* PASO 2 · desarrollo */}
            <div style={{ marginTop: 22 }}>
              <div style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 11.5, color: '#9499AE', textTransform: 'uppercase', letterSpacing: '0.06em' }}>2 · Elige el desarrollo</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                {sortedDevs.map((d) => { const on = calcDev === d.id; return (
                  <button key={d.id} className="zv2-dev" type="button" onClick={() => setCalcDev(d.id)} style={{ padding: '11px 18px', borderRadius: 12, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13.5, border: on ? '1.5px solid transparent' : '1px solid rgba(99,102,241,0.22)', background: on ? 'linear-gradient(120deg,#6366F1,#4F46E5)' : '#fff', color: on ? '#fff' : '#4B4F66', boxShadow: on ? '0 8px 20px rgba(124,92,255,.28)' : '0 2px 8px rgba(16,18,28,.04)' }}>{on ? '🏗️ ' : ''}{d.name}</button>
                ); })}
              </div>
            </div>
            {/* PASO 3 · unidad (individual=1) o unidades (institucional=2+) — UN SOLO selector */}
            {calcDev && (
              <div style={{ marginTop: 22 }}>
                <div style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 11.5, color: '#9499AE', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{calcMode === 'institucional' ? '3 · Elige las unidades · 1 o más' : '3 · Elige la unidad'}</div>
                {calcUnits.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(138px, 1fr))', gap: 9, marginTop: 12 }}>
                    {calcUnits.slice(0, 18).map((u) => { const on = calcMode === 'institucional' ? calcSelUnits.some((x) => x.id === u.id) : (calcUnit && calcUnit.id === u.id); const toggle = () => (calcMode === 'institucional' ? setCalcSelUnits((s) => s.some((x) => x.id === u.id) ? s.filter((x) => x.id !== u.id) : [...s, u]) : setCalcUnit(u)); const precio = u.price_display || `$${Math.round(u.price).toLocaleString('es-MX')}`; const m2 = u.m2_total || u.m2_privative; const banos = u.bathrooms || u.banos || u.banos_completos; const estac = u.parking_spots ?? u.parking ?? u.estacionamientos; const pm2 = m2 && u.price ? Math.round(u.price / m2) : null; return (
                      <button key={u.id} className="zv2-unit" type="button" onClick={toggle} style={{ position: 'relative', padding: '11px 12px', borderRadius: 12, cursor: 'pointer', fontFamily: 'DM Sans', textAlign: 'left', border: on ? '1.5px solid #6366F1' : '1px solid rgba(16,18,28,0.09)', background: on ? 'linear-gradient(180deg, rgba(124,92,255,0.10), #fff 70%)' : '#fff', boxShadow: on ? '0 8px 20px rgba(124,92,255,.18)' : '0 2px 8px rgba(16,18,28,.05)' }}>
                        {on && <span style={{ position: 'absolute', top: 8, right: 8, width: 16, height: 16, borderRadius: '50%', background: '#6366F1', color: '#fff', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>}
                        <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: on ? '#4F46E5' : INK }}>{u.unit_number || u.prototype || 'Unidad'}</div>
                        <div style={{ fontSize: 10, color: '#8A8FA6', marginTop: 2, lineHeight: 1.5 }}>{m2}m² · {u.bedrooms || '—'} rec{banos ? ` · ${banos} baño` : ''}{estac != null && estac !== '' ? ` · ${estac} est` : ''}</div>
                        <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13.5, color: '#10B981', marginTop: 6 }}>{precio}</div>
                        {pm2 ? <div style={{ fontSize: 9.5, color: '#A2A6BC', marginTop: 1 }}>${pm2.toLocaleString('es-MX')}/m²</div> : null}
                      </button>
                    ); })}
                  </div>
                ) : <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: '#A2A6BC', marginTop: 10 }}>Cargando unidades…</div>}
                {calcMode === 'institucional' && <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: calcSelUnits.length >= 1 ? '#4F46E5' : '#A2A6BC', marginTop: 10, fontWeight: 700 }}>{calcSelUnits.length >= 1 ? `✓ ${calcSelUnits.length} ${calcSelUnits.length === 1 ? 'unidad elegida' : 'unidades elegidas'}` : 'Elige 1 o más unidades (un fondo también puede comprar una).'}</div>}
              </div>
            )}
            {/* MOUNT · individual con 1 unidad, o institucional con 1+ */}
            {((calcMode === 'individual' && calcUnit) || (calcMode === 'institucional' && calcSelUnits.length >= 1)) && (
              <div className="zv2-up" key={`${calcMode}-${calcUnit ? calcUnit.id : ''}-${calcSelUnits.length}`} style={{ marginTop: 22 }}>
                <InversionV4Calculator mode={calcMode} prefilled={calcMode === 'individual' && calcUnit ? { precio: calcUnit.price, renta: inv && inv.renta_prom } : {}} portfolioUnits={calcMode === 'institucional' ? calcSelUnits.map((u) => ({ label: u.unit_number || u.prototype || 'Unidad', precio: u.price, renta: Math.round((u.price || 0) * 0.0045) })) : []} lockPrice zoneId={slug} capRateMercado={inv && inv.cap_rate_anual_pct} devId={calcDev} numDesarrollos={Array.isArray(devs) ? devs.length : null} />
              </div>
            )}
          </section>
        )}

        {/* ── CAP 6 · RIESGOS (full-bleed oscuro · objeciones de frente, lenguaje simple) ── */}
        {profile === 'invertir' && inv && inv.precio_prom && (
          <section style={{ width: '100%', background: 'linear-gradient(180deg,#0E1230,#0A0C24)', color: '#fff', padding: 'clamp(56px,8vw,92px) 0' }}>
            <div data-rev style={{ maxWidth: 1000, margin: '0 auto', padding: '0 28px' }}>
              <div style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#A5B4FC' }}>Sin letra chiquita<ParaTi tag="riesgos" /></div>
              <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1.06, fontSize: 'clamp(27px,3.8vw,44px)', color: '#fff', margin: '14px 0 0' }}>Ninguna inversión es magia.<br />Esto es lo que debes saber.</h2>
              <p style={{ fontFamily: 'DM Sans', fontSize: 'clamp(15px,1.9vw,18px)', color: 'rgba(255,255,255,0.7)', maxWidth: 600, marginTop: 16, lineHeight: 1.6 }}>Ningún portal te lo dice. Nosotros sí — porque la confianza es la base de invertir bien:</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16, marginTop: 28 }}>
                {[
                  ['💧', 'No es dinero inmediato', 'Una propiedad no se vende en un día. La idea es tenerla unos años — por eso rinde.'],
                  ['🏠', 'Puede haber meses vacíos', `A veces tarda en rentarse. Por eso cuidamos que de verdad haya quién la quiera${inv.demanda_zona && inv.demanda_zona.busquedas ? ` — aquí ${inv.demanda_zona.busquedas} la buscaron` : ''}.`],
                  ['📉', 'El precio se mueve', 'A corto plazo puede bajar. A varios años, la tendencia aquí es subir.'],
                  ['🏦', 'Si pides crédito, la tasa pesa', 'Hoy está alta; cuando baje, lo tuyo rinde todavía más.'],
                ].map(([e, t, d]) => (
                  <div key={t} className="zv2-glow" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '20px 20px' }}>
                    <div style={{ fontSize: 24 }}>{e}</div>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16.5, color: '#fff', marginTop: 9 }}>{t}</div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(255,255,255,0.62)', marginTop: 5, lineHeight: 1.55 }}>{d}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── CAP 7 · TU JUGADA (full-bleed · cierre + urgencia + registro agéntico) ── */}
        {profile === 'invertir' && inv && inv.precio_prom && (() => {
          const v = ({
            renta: ['Para rentar, aquí hay con quién y con qué.', `${name} se renta porque siempre hay quién la busque, y te deja algo cada mes. Si lo que quieres es un ingreso, esta zona te lo da.`],
            plusvalia: ['Para que suba de valor, ya trae el empuje.', `${name} viene subiendo y con obra nueva detrás. Si lo que buscas es que valga más con el tiempo, el momento es bueno.`],
            refugio: ['Como refugio, cuida lo tuyo.', `${name} es algo real que la inflación no se come, que tú controlas y heredas — esa tranquilidad no te la da el banco.`],
          })[lens] || ['Una inversión sólida, sin humo.', `${name} junta las tres cosas: renta, que suba de valor, y algo tuyo de verdad. No es lo que más promete en papel: es donde construyes patrimonio real.`];
          return (
            <section style={{ width: '100%', background: 'linear-gradient(135deg,#10143A 0%,#1E2252 52%,#262A5E 100%)', color: '#fff', padding: 'clamp(60px,9vw,108px) 0', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', bottom: -180, left: -120, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(192,38,211,0.22), rgba(192,38,211,0) 70%)', pointerEvents: 'none' }} />
              <div data-rev style={{ maxWidth: 760, margin: '0 auto', padding: '0 28px', textAlign: 'center', position: 'relative' }}>
                <div style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#A5B4FC' }}>Tu jugada</div>
                <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.06, fontSize: 'clamp(28px,4vw,46px)', color: '#fff', margin: '12px 0 0' }}>{v[0]}</h2>
                <p style={{ fontFamily: 'DM Sans', fontSize: 'clamp(15px,1.9vw,18px)', color: 'rgba(255,255,255,0.78)', maxWidth: 620, margin: '14px auto 0', lineHeight: 1.6 }}>{v[1]}</p>
                <div style={{ display: 'inline-block', marginTop: 22, padding: '10px 18px', borderRadius: 9999, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)', fontFamily: 'DM Sans', fontSize: 13.5, fontWeight: 700, color: '#A5B4FC' }}>⏳ Cada año que pasa, entrar cuesta más. El mejor momento fue ayer; el segundo, hoy.</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 26 }}>
                  <button type="button" onClick={() => setSaveOpen(true)} className="zv2-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '15px 28px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#6366F1,#818CF8)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 12px 30px rgba(124,92,255,0.45)' }}>🔔 Avísame cuando aparezca la oportunidad</button>
                  <button type="button" onClick={() => askAtlax(`Quiero invertir en ${name}. ¿Por dónde empiezo según mi objetivo (${lensCfg ? lensCfg.label : 'inversión'})?`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '15px 26px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 14.5, cursor: 'pointer' }}>🤖 Pregúntale a Atlax</button>
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 16, maxWidth: 540, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>Déjanos tu objetivo y nuestro asistente vigila {name} por ti — cuando entre algo que encaje, te lo traemos primero.</div>
              </div>
            </section>
          );
        })()}

        {/* ── DA EL PRIMER PASO ── */}
        <section id="empezar" style={{ ...sec, marginTop: 64 }}>
          <div id="desarrollos" style={eyebrow}>{tc('Da el primer paso')}</div>
          <h2 style={{ ...chapTitle, marginBottom: 6 }}>{S.cierreTitle}</h2>
          <p style={{ ...lead, marginBottom: 18 }}>{profile === 'primera' ? `Empieza por los más accesibles de ${name}:` : profile === 'invertir' ? `Hasta aquí, los números de la zona. Elige un desarrollo para cotizarlo con los números REALES de esa unidad — tu enganche, tu crédito, tu rendimiento — y compararlo contra el promedio de ${name}.` : `Estos son los desarrollos en ${name} donde puedes empezar hoy.`}</p>
          {sortedDevs.length > 0 ? (
            <button type="button" onClick={() => setVer('propiedades')} className="zv2-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '16px 28px', borderRadius: 16, border: 'none', background: 'linear-gradient(135deg,#6366F1,#4F46E5)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 15.5, cursor: 'pointer', boxShadow: '0 12px 30px rgba(124,92,255,0.34)' }}>
              🏠 Ver las {devs.length}{devs.length >= 12 ? '+' : ''} propiedades de {name} →
            </button>
          ) : (
            <div style={{ ...cardBase, padding: 24, fontFamily: 'DM Sans', fontSize: 13.5, color: '#5B5F76' }}>Aún no hay desarrollos publicados en {name}. <button type="button" onClick={() => setSaveOpen(true)} style={{ border: 'none', background: 'none', padding: 0, color: '#6366F1', fontWeight: 800, fontFamily: 'DM Sans', fontSize: 13.5, cursor: 'pointer' }}>🔔 Vigila esta zona</button> y te avisamos en cuanto entre el primero.</div>
          )}
        </section>

        {/* ── FUENTES ── */}
        <section style={{ ...sec, marginTop: 46 }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: '#A2A6BC', lineHeight: 1.6, borderTop: '1px solid rgba(16,18,28,0.06)', paddingTop: 18 }}>
            Valor y rentabilidad estimados por el motor de inversión de DesarrollosMX (AVM + tasas Banxico) sobre los
            desarrollos reales de la zona. Amenidades de zona reales (Google Places). Cifras estimadas e informativas, no asesoría financiera.
          </div>
        </section>
        </div>
        )}
        </div>)}
      </div>
      <SaveSearchModal open={saveOpen} onClose={() => setSaveOpen(false)} filters={{ colonia: [slug] }} />
      <AtlaxBubble theme="light" />
      <Footer />
    </LightScope>
  );
}
