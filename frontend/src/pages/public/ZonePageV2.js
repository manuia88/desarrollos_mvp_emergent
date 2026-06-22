// Página de Zona v2 — TABS ENFOCADAS por motivación (Hormozi). Contexto poderoso → "¿qué vienes a buscar?" → 4 tabs
// (con micro-promesa) → al elegir, la historia de ESE perfil (dolor+sueño) sobre la MISMA data real. La elección dispara
// una SEÑAL DE INTENCIÓN (zone_intent → buyer_signals → lead/demanda/Atlax). Persiste el perfil entre zonas.
// Sistema: memory/ZONA_PAGE_NARRATIVE_SYSTEM.md
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { LightScope, PublicNav, Footer } from '../../components/ui';
import AtlaxBubble from '../../components/landing/AtlaxBubble';
import DevelopmentCard from '../../components/marketplace/DevelopmentCard';
import SaveSearchModal from '../../components/marketplace/SaveSearchModal';
import InversionV4Calculator from '../../components/investment/InversionV4Calculator';
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
const eyebrow = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 800, background: 'linear-gradient(90deg,#6D4AFF,#C026D3)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };
const chapTitle = { fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(25px,3.4vw,36px)', color: INK, letterSpacing: '-0.025em', margin: '8px 0 0', lineHeight: 1.1 };
const lead = { fontFamily: 'DM Sans', fontSize: 16, color: MUT, lineHeight: 1.6, marginTop: 12, maxWidth: 640 };
const grad = { background: 'linear-gradient(120deg,#6D4AFF,#C026D3)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };

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
              <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: '#0E9F6E' }}>★ {p.rating}</span>
              <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: '#A2A6BC' }}>({p.reviews.toLocaleString('es-MX')})</span>
              <span style={{ color: '#6D4AFF', fontWeight: 800, fontFamily: 'Outfit' }}>{open === i ? '−' : '+'}</span>
            </div>
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: MUT, marginTop: 2 }}>{p.meta}</div>
          {open === i && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(16,18,28,0.07)' }}>
              {p.desc && <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: MUT, lineHeight: 1.5 }}>{p.desc}</div>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: p.desc ? 10 : 0 }}>
                <button type="button" onClick={(e) => { e.stopPropagation(); askAtlax(`Cuéntame más de ${p.name} y opciones parecidas cerca.`); }} style={{ border: 'none', background: 'rgba(99,102,241,0.08)', color: '#6D4AFF', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12.5, borderRadius: 9999, padding: '7px 14px', cursor: 'pointer' }}>🤖 Pregúntale a Atlax</button>
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
  const [inv, setInv] = useState(null);
  const [landing, setLanding] = useState(null);
  const [devs, setDevs] = useState([]);
  const [similar, setSimilar] = useState([]);
  const [vida, setVida] = useState(null);
  const [lugares, setLugares] = useState(null);
  const [vehiculos, setVehiculos] = useState([]);
  const [calcDev, setCalcDev] = useState(null);   // calculadora: desarrollo elegido
  const [calcUnits, setCalcUnits] = useState([]); // unidades del desarrollo elegido
  const [calcUnit, setCalcUnit] = useState(null); // unidad específica elegida
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [lens, setLens] = useState(null);     // lente del inversionista: renta / plusvalia / refugio (reencuadra el tab)
  const [capital, setCapital] = useState(null); // "¿con cuánto inviertes?" — recalcula a su monto
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
      get(`/api/market/vehiculos`),
    ]).then(([i, l, d, s, v, lg, vh]) => {
      if (!alive) return;
      setInv(i); setLanding(l); setVida(v); setLugares(lg); setVehiculos((vh && vh.vehiculos) || []);
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
  // Rentar vs comprar (primera casa): renta de la zona vs mensualidad del crédito 80%
  const rentaMes = inv && inv.renta_prom;
  const mensual80 = inv && inv.credito && inv.credito.escenarios && inv.credito.escenarios[2] ? inv.credito.escenarios[2].pago : null;
  // Lente del inversionista (los 7 avatares → 3 puertas) + helper "para ti" que resalta el bloque del avatar elegido.
  const lensCfg = LENSES.find((l) => l.k === lens) || null;
  const paraTi = (tag) => !!(lensCfg && lensCfg.tags.includes(tag));
  const ParaTi = ({ tag }) => paraTi(tag) ? <span style={{ marginLeft: 8, fontFamily: 'DM Sans', fontWeight: 800, fontSize: 10.5, color: '#6D28D9', background: 'rgba(124,92,255,0.12)', borderRadius: 9999, padding: '3px 9px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>✦ para ti</span> : null;
  // ¿Con cuánto inviertes? — escala la comparativa de instrumentos a SU capital (lineal · honesto).
  const ci = inv && inv.comparativa_instrumentos;
  const capCalc = (ci && capital) ? { s: capital / ci.capital,
    inmueble: Math.round(ci.inmueble_gana * (capital / ci.capital)),
    cetes: Math.round(ci.cetes_gana * (capital / ci.capital)),
    bolsa: Math.round(ci.bolsa_gana * (capital / ci.capital)) } : null;
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
    if (!calcDev) { setCalcUnits([]); setCalcUnit(null); return undefined; }
    let alive = true;
    setCalcUnit(null);
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
                        style={{ padding: '15px 18px', borderRadius: 16, border: `1.5px solid ${on ? 'transparent' : 'rgba(16,18,28,0.12)'}`, background: on ? 'linear-gradient(135deg,#6D4AFF,#C026D3)' : '#fff', color: on ? '#fff' : INK, boxShadow: on ? '0 12px 28px rgba(124,92,255,0.3)' : '0 6px 18px rgba(16,18,28,0.05)' }}>
                        <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15 }}>{p.e} {p.label}</div>
                        <div style={{ fontFamily: 'DM Sans', fontSize: 12, marginTop: 3, color: on ? 'rgba(255,255,255,0.9)' : '#8A8FA6' }}>{p.promise}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* La historia del perfil elegido (se despliega) */}
            {S && (
              <div key={profile} className="zv2-up" style={{ marginTop: 28, maxWidth: 760 }}>
                <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(30px,4.6vw,48px)', letterSpacing: '-0.03em', color: INK, margin: 0, lineHeight: 1.05 }}>{S.hookA} <span style={grad}>{S.hookB}</span></h2>
                <p style={{ ...lead, marginTop: 14, maxWidth: 700 }}>{S.sub}</p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
                  <button type="button" onClick={() => askAtlax(`Cuéntame de ${name}: ¿me conviene para ${profLabel}? Precios, plusvalía y cómo se vive.`)} className="zv2-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '13px 24px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#6D4AFF,#C026D3)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 14.5, cursor: 'pointer', boxShadow: '0 10px 26px rgba(124,92,255,0.34)' }}>🤖 Pregúntale a Atlax sobre {name}</button>
                  <button type="button" onClick={() => setSaveOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '13px 22px', borderRadius: 14, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(255,255,255,0.7)', color: '#6D28D9', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>🔔 Vigila esta zona</button>
                </div>
              </div>
            )}
          </div>
        </section>

        {loading ? (
          <section style={{ ...sec, marginTop: 28 }}><div style={{ ...cardBase, padding: 30, textAlign: 'center', color: '#8A8FA6', fontFamily: 'DM Sans' }}>Cargando la historia de {name}…</div></section>
        ) : !S ? (
          <section style={{ ...sec, marginTop: 28 }}><div style={{ ...cardBase, padding: 30, color: '#8A8FA6', fontFamily: 'DM Sans' }}>Aún estamos reuniendo los datos de {name}.</div></section>
        ) : (
        <div key={`body-${profile}`}>
        {/* ── LENTE DEL INVERSIONISTA (Bloque 0 · los 7 avatares → 3 puertas · reencuadra el MISMO tab) ── */}
        {profile === 'invertir' && (
          <section className="zv2-up" style={{ ...sec, marginTop: 30 }}>
            <div style={{ ...cardBase, padding: '18px 22px' }}>
              <div style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13.5, color: INK }}>¿Qué buscas como inversionista? <span style={{ color: '#8A8FA6', fontWeight: 600 }}>— resaltamos lo que más te importa</span></div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                {LENSES.map((l) => {
                  const on = lens === l.k;
                  return <button key={l.k} type="button" onClick={() => setLens(on ? null : l.k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9999, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13, border: on ? '1.5px solid #7C5CFF' : '1px solid rgba(99,102,241,0.2)', background: on ? 'rgba(124,92,255,0.1)' : '#fff', color: on ? '#6D28D9' : '#4B4F66' }}>{l.e} {l.label}</button>;
                })}
              </div>
              {lensCfg && <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: MUT, marginTop: 12, lineHeight: 1.5 }}>{lensCfg.intro}</div>}
            </div>
          </section>
        )}

        {/* ── LA VIDA AQUÍ — PAUSADO: los conteos OSM no son confiables (1 gym en Polanco = falso). Se reactiva con
            datos verificados de Google Places (ingesta de pago, 1 vez). El endpoint /vida ya existe (build-for-endstate). ── */}

        {/* ── VALUE STACK ── */}
        <section id="dinero" className="zv2-up" style={{ ...sec, marginTop: 54 }}>
          <div style={eyebrow}>{tc('Por qué tiene sentido')}</div>
          <h2 style={chapTitle}>{S.stackTitle}</h2>
          <p style={lead}>{S.stackIntro}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 22 }}>
            {[
              { n: 1, h: 'Sube de valor — solo.', big: `+${plus}%`, c: '#0E9F6E',
                copy: <>Cada año tu propiedad vale más. Un depto de {m1(inv.precio_prom)} se aprecia <b>~{k(inv.plusvalia_anual_abs || 0)} al año</b> <Q t="Plusvalía estimada por el motor según el tier y la tendencia de la zona — no es una medición de transacciones históricas." /> — sin que muevas un dedo.</> },
              { n: 2, h: 'Y te paga mientras la tienes.', big: inv.cap_rate_anual_pct != null ? `${inv.cap_rate_anual_pct}%` : '—', c: '#C026D3',
                copy: <>Si la rentas, podría dejarte <b>~${(inv.renta_prom || 0).toLocaleString('es-MX')}/mes</b>. Un cap rate de {inv.cap_rate_anual_pct}% <Q t="Cap rate: lo que rinde la propiedad por su renta (NOI ÷ precio), sin importar cómo la pagues. Estimado por el yield de la zona; no incluye la plusvalía." /> — lo que rinde cada año solo por rentarla.</> },
              { n: 3, h: 'En 5 años, esto es tuyo.', big: `+${inv.ganancia_5y_pct}%`, c: '#0E9F6E',
                copy: <>Si vendes a los 5 años, recuperas tu dinero <b>+ ~{m1(inv.ganancia_5y_abs)}</b> de ganancia. Tu rendimiento real al año: <b>{inv.tir_anual_pct}%</b> <Q t="TIR: tu rendimiento real por año, contando rentas + venta y ajustado al tiempo." />.</> },
            ].map((w) => (
              <div key={w.n} className="zv2-win" style={{ ...cardBase, padding: '22px 24px', display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 320px', minWidth: 260 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#6D4AFF,#C026D3)', color: '#fff', fontFamily: 'Outfit', fontWeight: 800, fontSize: 13 }}>{w.n}</span>
                    <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 19, color: INK }}>{w.h}</span>
                  </div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 14.5, color: MUT, marginTop: 8, lineHeight: 1.55 }}>{w.copy}</div>
                </div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(36px,5vw,52px)', color: w.c, letterSpacing: '-0.04em', lineHeight: 1 }}>{w.big}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── LA VIDA ALREDEDOR (amenidades de ZONA · Google · gated source='google' · "20+" al topar) ── */}
        {vida && vida.fuente === 'google' && vida.amenidades && (() => {
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

        {/* ── ¿DÓNDE PONGO MI DINERO? · vs instrumentos (data NEUTRA honesta + narrativa persuasiva · gated) ── */}
        {profile === 'invertir' && inv.comparativa_instrumentos && (() => {
          const c = inv.comparativa_instrumentos;
          const cols = [
            { k: 'cetes', label: 'CETES', emoji: '🏦', pct: c.cetes_pct, gana: c.cetes_gana, nota: `tasa ${c.cetes_tasa_pct}% · Banxico` },
            { k: 'bolsa', label: 'Bolsa', emoji: '📊', pct: c.bolsa_pct, gana: c.bolsa_gana, nota: `~${c.bolsa_tasa_pct}% · referencia histórica` },
            { k: 'inmueble', label: 'Inmueble aquí', emoji: '🏠', pct: c.inmueble_pct, gana: c.inmueble_gana, nota: 'renta + plusvalía − costos', hero: true },
          ];
          const VENTAJAS = ['Te paga renta cada mes (no al final)', 'Lo tocas, lo rentas, lo heredas', 'Refugio real contra la inflación', 'Apalancamiento: pones poco, controlas mucho', 'Sin los sustos de la bolsa'];
          return (
            <section className="zv2-up" style={{ ...sec, marginTop: 54 }}>
              <div style={eyebrow}>{tc('¿Dónde pongo mi dinero?')}</div>
              <h2 style={chapTitle}>Tu dinero a 5 años, sin maquillaje<ParaTi tag="vs" /></h2>
              <p style={lead}>Te mostramos los números reales — incluso cuando no nos favorecen. Mismo capital ({m1(c.capital)}), a 5 años:</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14, marginTop: 18 }}>
                {cols.map((x) => (
                  <div key={x.k} className="zv2-win" style={{ ...cardBase, padding: '18px 20px', border: x.hero ? '2px solid rgba(124,92,255,0.4)' : cardBase.border }}>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700, color: '#6B6F86' }}>{x.emoji} {x.label}</div>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 30, color: x.hero ? '#7C5CFF' : INK, letterSpacing: '-0.03em', marginTop: 5 }}>+{x.pct}%</div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: MUT, marginTop: 1 }}>+{m1(x.gana)}</div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: '#A2A6BC', marginTop: 4 }}>{x.nota}</div>
                  </div>
                ))}
              </div>
              <div className="zv2-win" style={{ ...cardBase, padding: '20px 24px', marginTop: 16, background: 'linear-gradient(135deg, rgba(124,92,255,0.05), rgba(192,38,211,0.04))' }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: INK }}>Pero CETES y la bolsa son solo un número en una app.</div>
                <p style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: MUT, marginTop: 6, lineHeight: 1.55 }}>El inmueble es lo único que, además de rendir, <b>es TUYO de verdad</b>:</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8, marginTop: 12 }}>
                  {VENTAJAS.map((v) => (
                    <div key={v} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontFamily: 'DM Sans', fontSize: 13, color: '#3A3E55' }}>
                      <span style={{ color: '#0E9F6E', fontWeight: 800 }}>✓</span> {v}
                    </div>
                  ))}
                </div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15.5, color: INK, marginTop: 16 }}>No es dónde rinde más en papel — es dónde construyes <span style={grad}>patrimonio real</span>.</div>
              </div>
            </section>
          );
        })()}

        {/* ── TABLA COMPARATIVA DE VEHÍCULOS (criterios · tasas junio 2026 · CETES vivo Banxico vía cron) ── */}
        {profile === 'invertir' && vehiculos.length > 0 && (
          <section className="zv2-up" style={{ ...sec, marginTop: 54 }}>
            <div style={eyebrow}>{tc('Comparativa real')}<ParaTi tag="vs" /></div>
            <h2 style={chapTitle}>Bienes raíces vs todo lo demás</h2>
            <p style={lead}>Los mismos criterios para cada vehículo, con tasas de hoy (junio 2026 · CETES en vivo de Banxico). Mira dónde gana cada uno:</p>
            <div style={{ overflowX: 'auto', marginTop: 18, borderRadius: 16, border: '1px solid rgba(16,18,28,0.08)' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720, fontFamily: 'DM Sans', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: 'rgba(99,102,241,0.06)' }}>
                    {['Vehículo', 'Rendimiento/año', 'Riesgo', 'Liquidez', 'Te paga c/mes', 'Apalancable', 'Tangible', 'Protege inflación'].map((h, i) => (
                      <th key={h} style={{ textAlign: i === 0 ? 'left' : 'center', padding: '12px 14px', fontWeight: 800, color: '#4B4F66', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(16,18,28,0.1)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vehiculos.map((v) => {
                    const hero = v.hero;
                    const rend = hero ? (inv && inv.roi_anual_pct != null ? `~${inv.roi_anual_pct}%*` : '—') : (v.pct != null ? `${v.pct}%` : '—');
                    const yes = (b) => b ? <span style={{ color: '#0E9F6E', fontWeight: 800 }}>✓</span> : <span style={{ color: '#C7CAD6' }}>—</span>;
                    return (
                      <tr key={v.k} style={{ background: hero ? 'linear-gradient(90deg, rgba(124,92,255,0.08), rgba(192,38,211,0.05))' : '#fff', borderBottom: '1px solid rgba(16,18,28,0.05)' }}>
                        <td style={{ padding: '12px 14px', textAlign: 'left' }}>
                          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13.5, color: hero ? '#6D28D9' : INK }}>{v.nombre}</div>
                          <div style={{ fontSize: 10.5, color: '#A2A6BC' }}>{v.cat}</div>
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center', fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: hero ? '#7C5CFF' : INK }}>{rend}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'center', color: MUT }}>{v.riesgo}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'center', color: MUT }}>{v.liquidez}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>{yes(v.mensual)}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>{yes(v.apalancable)}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>{yes(v.tangible)}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'center', fontSize: 11.5, color: MUT }}>{v.inflacion}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: '#A2A6BC', marginTop: 10, fontStyle: 'italic', lineHeight: 1.5 }}>
              Tasas junio 2026 · CETES en vivo de Banxico (se actualiza solo cada día). Fuentes oficiales: Banxico · cetesdirecto · BMV · GBM · investing.com. Bolsa / FIBRA / Afore = referencia. *Inmueble: rendimiento anual estimado de esta zona (renta + plusvalía); y además, es lo único que controlas, usas y heredas.
            </div>
          </section>
        )}

        {/* ── ¿CON CUÁNTO INVIERTES? (Bloque 3 · recalcula a su capital · escala lineal honesta) ── */}
        {profile === 'invertir' && ci && (
          <section className="zv2-up" style={{ ...sec, marginTop: 40 }}>
            <div className="zv2-win" style={{ ...cardBase, padding: '22px 24px' }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: INK }}>¿Con cuánto quieres invertir?</div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: MUT, marginTop: 4 }}>Ponlo y te decimos qué te dejaría aquí en 5 años, lado a lado con el banco y la bolsa.</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
                {[1000000, 2500000, 5000000, 10000000].map((v) => (
                  <button key={v} type="button" onClick={() => setCapital(v)} style={{ padding: '9px 15px', borderRadius: 10, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13, border: capital === v ? '1.5px solid #7C5CFF' : '1px solid rgba(99,102,241,0.2)', background: capital === v ? 'rgba(124,92,255,0.1)' : '#fff', color: capital === v ? '#6D28D9' : '#4B4F66' }}>{m1(v)}</button>
                ))}
                <span style={{ color: '#A2A6BC', fontSize: 12, fontFamily: 'DM Sans' }}>o</span>
                <input type="text" inputMode="numeric" placeholder="otro monto $" value={capital ? `$${capital.toLocaleString('es-MX')}` : ''} onChange={(e) => { const n = parseInt(String(e.target.value || '').replace(/\D/g, ''), 10); setCapital(Number.isFinite(n) && n > 0 ? n : null); }} style={{ width: 160, padding: '9px 14px', borderRadius: 10, border: '1px solid rgba(99,102,241,0.25)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, color: INK, outline: 'none', background: '#fff' }} />
              </div>
              {capCalc ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginTop: 16 }}>
                  {[['🏠 Inmueble aquí', capCalc.inmueble, '#7C5CFF', true], ['🏦 CETES', capCalc.cetes, '#6B6F86', false], ['📊 Bolsa', capCalc.bolsa, '#6B6F86', false]].map(([l, g, c, hero]) => (
                    <div key={l} style={{ ...cardBase, padding: '14px 16px', border: hero ? '2px solid rgba(124,92,255,0.4)' : cardBase.border }}>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, color: '#6B6F86' }}>{l}</div>
                      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: c, marginTop: 4 }}>+{m1(g)}</div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: '#A2A6BC' }}>ganancia a 5 años</div>
                    </div>
                  ))}
                </div>
              ) : <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: '#A2A6BC', marginTop: 14 }}>Elige un monto ↑</div>}
              <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: '#A2A6BC', marginTop: 10, fontStyle: 'italic' }}>estimado · escala del escenario base de la zona · el cálculo a detalle, con tu enganche y crédito, va en la cotización</div>
            </div>
          </section>
        )}

        {/* ── CATALIZADORES (Bloque 4 · por qué sube · DATO REAL: obra, plusvalía, conectividad, demanda) ── */}
        {profile === 'invertir' && catalizadores.length > 0 && (
          <section className="zv2-up" style={{ ...sec, marginTop: 54 }}>
            <div style={eyebrow}>{tc('Por qué esta zona')}</div>
            <h2 style={chapTitle}>Lo que la está empujando hacia arriba<ParaTi tag="catalizadores" /></h2>
            <p style={lead}>No te pedimos que confíes en un número. Estas son las fuerzas reales detrás de la plusvalía de {name}:</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14, marginTop: 18 }}>
              {catalizadores.map(([e, t, d]) => (
                <div key={t} className="zv2-win" style={{ ...cardBase, padding: '18px 20px' }}>
                  <div style={{ fontSize: 24 }}>{e}</div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: INK, marginTop: 6 }}>{t}</div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: MUT, marginTop: 4, lineHeight: 1.5 }}>{d}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── DEMANDA EN VIVO (Bloque 5 · señal REAL · marketplace_searches) ── */}
        {profile === 'invertir' && inv.demanda_zona && inv.demanda_zona.busquedas >= 3 && (
          <section className="zv2-up" style={{ ...sec, marginTop: 54 }}>
            <div style={eyebrow}>{tc('Demanda en vivo')}</div>
            <h2 style={chapTitle}>No la estás mirando solo tú<ParaTi tag="demanda" /></h2>
            <p style={lead}>Si compras para rentar, lo que importa es que haya quién la quiera. La demanda real en {name}:</p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 18 }}>
              <div className="zv2-win" style={{ ...cardBase, padding: '20px 24px', flex: '1 1 220px' }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 34, color: '#0E9F6E', letterSpacing: '-0.03em' }}>{inv.demanda_zona.busquedas}</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: MUT, marginTop: 2 }}>personas buscaron aquí en nuestra plataforma.</div>
              </div>
              {inv.demanda_zona.con_alerta > 0 && (
                <div className="zv2-win" style={{ ...cardBase, padding: '20px 24px', flex: '1 1 220px' }}>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 34, color: '#7C5CFF', letterSpacing: '-0.03em' }}>{inv.demanda_zona.con_alerta}</div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: MUT, marginTop: 2 }}>dejaron alerta — esperan que entre algo aquí.</div>
                </div>
              )}
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: '#A2A6BC', marginTop: 12, fontStyle: 'italic' }}>señal real de intención de compradores en DesarrollosMX</div>
          </section>
        )}

        {/* ── BLOQUE PROPIO DEL PERFIL (gated por data · solo se ve si hay) ── */}
        {profile === 'invertir' && inv.escenarios_inv && inv.escenarios_inv.length >= 2 && (
          <section className="zv2-up" style={{ ...sec, marginTop: 54 }}>
            <div style={eyebrow}>{tc('Escenarios')}</div>
            <h2 style={chapTitle}>¿Y si el mercado cambia?</h2>
            <p style={lead}>No te vendo solo el mejor caso. Esto rinde tu inversión del escenario conservador al optimista — tú decides con los ojos abiertos:</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 14, marginTop: 18 }}>
              {inv.escenarios_inv.map((e, i) => (
                <div key={e.nombre} className="zv2-win" style={{ ...cardBase, padding: '18px 20px', border: e.nombre === 'Base' ? '2px solid rgba(124,92,255,0.4)' : cardBase.border }}>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, color: '#6B6F86' }}>{e.nombre}{e.nombre === 'Base' ? ' · más probable' : ''}</div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 30, color: i === 0 ? '#E0A33E' : i === 2 ? '#0E9F6E' : '#7C5CFF', letterSpacing: '-0.03em', marginTop: 5 }}>+{e.plusvalia_pct}%</div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: '#A2A6BC', marginTop: 2 }}>plusvalía/año{e.tir_pct != null ? ` · TIR ${e.tir_pct}%` : ''}</div>
                </div>
              ))}
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: '#A2A6BC', marginTop: 12, fontStyle: 'italic' }}>estimado por el motor de inversión (escenarios conservador / base / optimista)</div>
          </section>
        )}
        {/* ── VS LA CIUDAD (Bloque 7 · ¿cara o barata? · dato real agregado) ── */}
        {profile === 'invertir' && inv.vs_ciudad && (() => {
          const p = inv.vs_ciudad.precio_vs_ciudad_pct;
          const caro = p >= 0;
          return (
            <section className="zv2-up" style={{ ...sec, marginTop: 54 }}>
              <div style={eyebrow}>{tc('Vs la ciudad')}</div>
              <h2 style={chapTitle}>¿Cara o barata para lo que es?</h2>
              <p style={lead}>{caro
                ? `El m² aquí cuesta ${Math.abs(p)}% más que el promedio de la CDMX. Es zona consolidada: pagas más, pero el valor es estable y la demanda no falta.`
                : `El m² aquí cuesta ${Math.abs(p)}% menos que el promedio de la CDMX. Punto de entrada accesible, con recorrido de plusvalía por delante.`}</p>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 18 }}>
                <div className="zv2-win" style={{ ...cardBase, padding: '20px 24px', flex: '1 1 200px', borderTop: `3px solid ${caro ? '#7C5CFF' : '#0E9F6E'}` }}>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, color: '#6B6F86' }}>{name} · por m²</div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: INK, marginTop: 4 }}>${Math.round(inv.vs_ciudad.precio_m2_zona).toLocaleString('es-MX')}</div>
                </div>
                <div className="zv2-win" style={{ ...cardBase, padding: '20px 24px', flex: '1 1 200px' }}>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, color: '#6B6F86' }}>Promedio CDMX · por m²</div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: '#6B6F86', marginTop: 4 }}>${Math.round(inv.vs_ciudad.precio_m2_ciudad).toLocaleString('es-MX')}</div>
                </div>
              </div>
            </section>
          );
        })()}

        {/* ── RIESGOS DE FRENTE (Bloque 8 · nombrarlos = confianza = conversión · Hormozi) ── */}
        {profile === 'invertir' && inv && inv.precio_prom && (
          <section className="zv2-up" style={{ ...sec, marginTop: 54 }}>
            <div style={eyebrow}>{tc('Sin letras chiquitas')}</div>
            <h2 style={chapTitle}>Los riesgos, de frente<ParaTi tag="riesgos" /></h2>
            <p style={lead}>Ningún portal te los dice. Nosotros sí — porque confiar es la base de invertir bien:</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14, marginTop: 18 }}>
              {[
                ['💧', 'Liquidez', 'Un inmueble no se vende en un día como un CETES. Plan: horizonte de 3-5 años mínimo.'],
                ['🏠', 'Vacancia', `Puede haber meses sin rentar. Por eso miramos la demanda real${inv.demanda_zona ? ` (${inv.demanda_zona.busquedas} búsquedas aquí)` : ''}.`],
                ['📉', 'El mercado se mueve', 'Los precios pueden bajar a corto plazo. El escenario conservador ya lo contempla.'],
                ['🏦', 'Las tasas', 'Si financias, la tasa pesa. Hoy está alta; cuando baje, tu rendimiento mejora.'],
              ].map(([e, t, d]) => (
                <div key={t} className="zv2-win" style={{ ...cardBase, padding: '16px 18px' }}>
                  <div style={{ fontSize: 20 }}>{e}</div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: INK, marginTop: 4 }}>{t}</div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: MUT, marginTop: 3, lineHeight: 1.5 }}>{d}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── RETORNO NETO DE IMPUESTOS (Bloque 9 · lo que de verdad te queda) ── */}
        {profile === 'invertir' && inv.impuestos && (
          <section className="zv2-up" style={{ ...sec, marginTop: 54 }}>
            <div style={eyebrow}>{tc('Después de impuestos')}</div>
            <h2 style={chapTitle}>Lo que de verdad te queda</h2>
            <p style={lead}>El rendimiento bonito siempre es antes de impuestos. Aquí está el real, ya con el ISR de la renta descontado:</p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 18 }}>
              <div className="zv2-win" style={{ ...cardBase, padding: '20px 24px', flex: '1 1 220px' }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, color: '#6B6F86' }}>Renta neta de ISR</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: '#0E9F6E', marginTop: 4 }}>${inv.impuestos.renta_neta_isr_mes.toLocaleString('es-MX')}<span style={{ fontSize: 14, color: '#A2A6BC' }}>/mes</span></div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: MUT, marginTop: 2 }}>ya descontando ~{inv.impuestos.isr_renta_efectivo_pct}% de ISR de arrendamiento.</div>
              </div>
              <div className="zv2-win" style={{ ...cardBase, padding: '20px 24px', flex: '1 1 220px' }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, color: '#6B6F86' }}>Cap rate neto de ISR</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: '#7C5CFF', marginTop: 4 }}>{inv.impuestos.cap_rate_neto_isr_pct}%</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: MUT, marginTop: 2 }}>lo que rinde la renta ya neta de impuestos.</div>
              </div>
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: '#A2A6BC', marginTop: 12, fontStyle: 'italic' }}>estimado · régimen de arrendamiento con deducción ciega · el ISR de la venta se calcula al cotizar (LISR Art. 126)</div>
          </section>
        )}

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
              <div className="zv2-win" style={{ ...cardBase, padding: '20px 24px', flex: '1 1 240px', borderTop: '3px solid #0E9F6E' }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700, color: '#6B6F86' }}>🔑 Si compras (80% crédito)</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 30, color: '#0E9F6E', letterSpacing: '-0.03em', marginTop: 5 }}>${mensual80.toLocaleString('es-MX')}<span style={{ fontSize: 14, color: '#A2A6BC' }}>/mes</span></div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: MUT, marginTop: 6 }}>Cada pago es TUYO — y el depto sube de valor mientras lo habitas.</div>
              </div>
            </div>
          </section>
        )}
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

        {/* ── CONECTIVIDAD · minutos al metro (real de /lugares · vista previa si no hay · infra lista) ── */}
        {metroData && (
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

        {/* ── CÓMO EMPEZAR ── */}
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
                  <span style={{ flex: 1, textAlign: 'right', fontWeight: 800, color: '#0E9F6E' }}>{k(e.pago)}</span>
                </div>
              ))}
              <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: '#A2A6BC', marginTop: 10, fontStyle: 'italic' }}>Informativo. Con más enganche, menos crédito y menos pagas al mes. Tu tasa y pago reales los define el banco según tu perfil.</div>
            </div>
          )}
        </section>

        {/* ── BANDA ATLAX ── */}
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

        {/* ── NO ERES EL ÚNICO ── */}
        {(comparables.length > 0 || similar.length > 0) && (
          <section style={{ ...sec, marginTop: 58 }}>
            <div style={eyebrow}>{tc('No eres el único')}</div>
            <h2 style={chapTitle}>La gente que sabe, está mirando aquí</h2>
            <p style={lead}>{name} compite con las zonas más buscadas de la ciudad. Si estás comparando, vale la pena verlas al lado:</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 18 }}>
              {(comparables.length ? comparables : similar).slice(0, 5).map((z) => (
                <Link key={z.slug || z.id} to={`/zona/${z.slug || z.id}`} className="zv2-zlink" style={{ textDecoration: 'none', ...cardBase, padding: '14px 20px', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: INK }}>{z.name || tc((z.slug || z.id || '').replace(/-/g, ' '))}</span>
                  <span style={{ color: '#6D4AFF', fontWeight: 800 }}>→</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── EL VEREDICTO + REGISTRO AGÉNTICO (Bloque 13 · cierra el embudo · Vigila/casamentera) ── */}
        {profile === 'invertir' && inv && inv.precio_prom && (() => {
          const v = ({
            renta: ['Para rentar, aquí hay flujo y demanda.', `${name} se renta porque hay quién la busque, y deja renta neta de ISR cada mes. Si buscas ingreso pasivo, esta zona te lo da.`],
            plusvalia: ['Para plusvalía, la zona ya trae inercia.', `${name} sube de precio y tiene obra nueva empujando. Si buscas ganancia de capital, el momento es bueno.`],
            refugio: ['Como refugio, protege tu dinero.', `${name} es un activo real que la inflación no se come, que controlas y heredas — la tranquilidad que CETES no te da.`],
          })[lens] || ['Una inversión sólida, sin humo.', `${name} combina renta, plusvalía y un activo tangible. No es lo que más rinde en papel: es donde construyes patrimonio real.`];
          return (
            <section className="zv2-up" style={{ ...sec, marginTop: 60 }}>
              <div className="zv2-win" style={{ ...cardBase, padding: '30px 32px', background: 'linear-gradient(135deg, rgba(124,92,255,0.07), rgba(192,38,211,0.05))', textAlign: 'center' }}>
                <div style={eyebrow}>{tc('El veredicto')}</div>
                <h2 style={{ ...chapTitle, marginTop: 6 }}>{v[0]}</h2>
                <p style={{ ...lead, maxWidth: 640, margin: '10px auto 0' }}>{v[1]}</p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 22 }}>
                  <button type="button" onClick={() => setSaveOpen(true)} className="zv2-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '14px 26px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#6D4AFF,#C026D3)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 10px 26px rgba(124,92,255,0.34)' }}>🔔 Avísame cuando aparezca la oportunidad</button>
                  <button type="button" onClick={() => askAtlax(`Quiero invertir en ${name}. ¿Por dónde empiezo según mi objetivo (${lensCfg ? lensCfg.label : 'inversión'})?`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '14px 24px', borderRadius: 14, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(255,255,255,0.8)', color: '#6D28D9', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 14.5, cursor: 'pointer' }}>🤖 Pregúntale a Atlax</button>
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: MUT, marginTop: 14, maxWidth: 540, marginLeft: 'auto', marginRight: 'auto' }}>Déjanos tu objetivo y nuestro asistente vigila {name} por ti — cuando entre algo que encaje con lo que buscas, te lo traemos primero.</div>
              </div>
            </section>
          );
        })()}

        {/* ── CALCULADORA INTERACTIVA (Bloque 12 · proyecto → unidad → desglose completo · reusa InvestmentSimulator) ── */}
        {profile === 'invertir' && sortedDevs.length > 0 && (
          <section className="zv2-up" style={{ ...sec, marginTop: 60 }}>
            <div style={eyebrow}>{tc('Calculadora')}</div>
            <h2 style={chapTitle}>Llévalo a números reales</h2>
            <p style={lead}>Elige un desarrollo y una unidad específica de {name}. Te armamos el cálculo completo — enganche, crédito, renta, plusvalía, rendimiento y vs el banco.</p>
            <style>{`
              .zv2-dev{transition:transform .15s,box-shadow .15s,border-color .15s}
              .zv2-dev:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(99,102,241,.14)}
              .zv2-unit{transition:transform .15s,box-shadow .15s,border-color .15s}
              .zv2-unit:hover{transform:translateY(-3px);box-shadow:0 12px 26px rgba(99,102,241,.16);border-color:rgba(124,92,255,.45)!important}
            `}</style>
            <div style={{ marginTop: 18 }}>
              <div style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 11.5, color: '#9499AE', textTransform: 'uppercase', letterSpacing: '0.06em' }}>1 · Elige el desarrollo</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                {sortedDevs.map((d) => { const on = calcDev === d.id; return (
                  <button key={d.id} className="zv2-dev" type="button" onClick={() => setCalcDev(d.id)} style={{ padding: '11px 18px', borderRadius: 12, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13.5, border: on ? '1.5px solid transparent' : '1px solid rgba(99,102,241,0.22)', background: on ? 'linear-gradient(120deg,#6D4AFF,#C026D3)' : '#fff', color: on ? '#fff' : '#4B4F66', boxShadow: on ? '0 8px 20px rgba(124,92,255,.28)' : '0 2px 8px rgba(16,18,28,.04)' }}>{on ? '🏗️ ' : ''}{d.name}</button>
                ); })}
              </div>
            </div>
            {calcDev && (
              <div style={{ marginTop: 22 }}>
                <div style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 11.5, color: '#9499AE', textTransform: 'uppercase', letterSpacing: '0.06em' }}>2 · Elige la unidad</div>
                {calcUnits.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(138px, 1fr))', gap: 9, marginTop: 12 }}>
                    {calcUnits.slice(0, 18).map((u) => { const on = calcUnit && calcUnit.id === u.id; const precio = u.price_display || `$${Math.round(u.price).toLocaleString('es-MX')}`; const m2 = u.m2_total || u.m2_privative; const banos = u.bathrooms || u.banos || u.banos_completos; const estac = u.parking_spots ?? u.parking ?? u.estacionamientos; const pm2 = m2 && u.price ? Math.round(u.price / m2) : null; return (
                      <button key={u.id} className="zv2-unit" type="button" onClick={() => setCalcUnit(u)} style={{ position: 'relative', padding: '11px 12px', borderRadius: 12, cursor: 'pointer', fontFamily: 'DM Sans', textAlign: 'left', border: on ? '1.5px solid #7C5CFF' : '1px solid rgba(16,18,28,0.09)', background: on ? 'linear-gradient(180deg, rgba(124,92,255,0.10), #fff 70%)' : '#fff', boxShadow: on ? '0 8px 20px rgba(124,92,255,.18)' : '0 2px 8px rgba(16,18,28,.05)' }}>
                        {on && <span style={{ position: 'absolute', top: 8, right: 8, width: 16, height: 16, borderRadius: '50%', background: '#7C5CFF', color: '#fff', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>}
                        <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: on ? '#6D28D9' : INK }}>{u.unit_number || u.prototype || 'Unidad'}</div>
                        <div style={{ fontSize: 10, color: '#8A8FA6', marginTop: 2, lineHeight: 1.5 }}>{m2}m² · {u.bedrooms || '—'} rec{banos ? ` · ${banos} baño` : ''}{estac != null && estac !== '' ? ` · ${estac} est` : ''}</div>
                        <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13.5, color: '#0E9F6E', marginTop: 6 }}>{precio}</div>
                        {pm2 ? <div style={{ fontSize: 9.5, color: '#A2A6BC', marginTop: 1 }}>${pm2.toLocaleString('es-MX')}/m²</div> : null}
                      </button>
                    ); })}
                  </div>
                ) : <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: '#A2A6BC', marginTop: 10 }}>Cargando unidades…</div>}
              </div>
            )}
            {calcUnit && (
              <div className="zv2-up" key={calcUnit.id} style={{ marginTop: 22 }}>
                <InversionV4Calculator prefilled={{ precio: calcUnit.price, renta: inv && inv.renta_prom }} lockPrice zoneId={slug} capRateMercado={inv && inv.cap_rate_anual_pct} devUnits={calcUnits.slice(0, 18).map((u) => ({ label: u.unit_number || u.prototype || 'Unidad', precio: u.price, renta: Math.round((u.price || 0) * 0.0045) }))} />
              </div>
            )}
          </section>
        )}

        {/* ── DA EL PRIMER PASO ── */}
        <section id="empezar" style={{ ...sec, marginTop: 64 }}>
          <div id="desarrollos" style={eyebrow}>{tc('Da el primer paso')}</div>
          <h2 style={{ ...chapTitle, marginBottom: 6 }}>{S.cierreTitle}</h2>
          <p style={{ ...lead, marginBottom: 18 }}>{profile === 'primera' ? `Empieza por los más accesibles de ${name}:` : profile === 'invertir' ? `Hasta aquí, los números de la zona. Elige un desarrollo para cotizarlo con los números REALES de esa unidad — tu enganche, tu crédito, tu rendimiento — y compararlo contra el promedio de ${name}.` : `Estos son los desarrollos en ${name} donde puedes empezar hoy.`}</p>
          {sortedDevs.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
              {sortedDevs.map((d, i) => <DevelopmentCard key={d.id} dev={d} index={i} />)}
            </div>
          ) : (
            <div style={{ ...cardBase, padding: 24, fontFamily: 'DM Sans', fontSize: 13.5, color: '#5B5F76' }}>Aún no hay desarrollos publicados en {name}. <button type="button" onClick={() => setSaveOpen(true)} style={{ border: 'none', background: 'none', padding: 0, color: '#6D4AFF', fontWeight: 800, fontFamily: 'DM Sans', fontSize: 13.5, cursor: 'pointer' }}>🔔 Vigila esta zona</button> y te avisamos en cuanto entre el primero.</div>
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
      </div>
      <SaveSearchModal open={saveOpen} onClose={() => setSaveOpen(false)} filters={{ colonia: [slug] }} />
      <AtlaxBubble theme="light" />
      <Footer />
    </LightScope>
  );
}
