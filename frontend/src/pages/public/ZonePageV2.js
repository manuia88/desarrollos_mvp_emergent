// Página de Zona v2 — TABS ENFOCADAS por motivación (Hormozi). Contexto poderoso → "¿qué vienes a buscar?" → 4 tabs
// (con micro-promesa) → al elegir, la historia de ESE perfil (dolor+sueño) sobre la MISMA data real. La elección dispara
// una SEÑAL DE INTENCIÓN (zone_intent → buyer_signals → lead/demanda/Atlax). Persiste el perfil entre zonas.
// Sistema: memory/ZONA_PAGE_NARRATIVE_SYSTEM.md
import React, { useEffect, useRef, useState } from 'react';
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
const eyebrow = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 800, background: 'linear-gradient(90deg,#6366F1,#EC4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };
const chapTitle = { fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(25px,3.4vw,36px)', color: INK, letterSpacing: '-0.025em', margin: '8px 0 0', lineHeight: 1.1 };
const lead = { fontFamily: 'DM Sans', fontSize: 16, color: MUT, lineHeight: 1.6, marginTop: 12, maxWidth: 640 };
const grad = { background: 'linear-gradient(120deg,#6366F1,#EC4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };

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
// (rebuild) SAMPLE_LUGARES + LugaresPreview retirados: el lifestyle real (Google Places) vive en el Cap 3 de cada arco.
// Amenidades de la ZONA (alrededor · Google Places). key → emoji+label. Tope 20/categoría → se muestra "20+".
// (auditoría · limpieza) CATS_ZONA + fmtN retirados con el bloque "La vida alrededor".
// Amenidades del DESARROLLO (del edificio) — NO confundir con amenidades de zona (Google). Slug → emoji+label.
const AMEN_DEV = { alberca: ['🏊', 'Alberca'], gym: ['🏋️', 'Gimnasio'], roof: ['🌿', 'Roof garden'], cowork: ['💻', 'Coworking'], spa: ['💆', 'Spa'], concierge: ['🛎️', 'Concierge'], sky_lounge: ['🌆', 'Sky lounge'], cava: ['🍷', 'Cava'], business_center: ['💼', 'Business center'], salon_eventos: ['🎉', 'Salón de eventos'], seguridad: ['🛡️', 'Seguridad 24/7'], pet: ['🐾', 'Pet friendly'], area_pets: ['🐾', 'Área para mascotas'], jardines: ['🌳', 'Jardines'], bicicletas: ['🚲', 'Biciestac.'], estacionamiento: ['🚗', 'Estacionamiento'] };

// Contexto de zona: 1-2 líneas potentes, del arquetipo (dato), antes de preguntar el objetivo.
// ── CAPA DE ARQUETIPO ── el "carácter" de cada colonia sale de SUS datos (precio/m² + plusvalía).
// Misma estructura de historia, pero el arquetipo cambia el tono y las frases. Fuente única de verdad.
function zoneArchetype(inv) {
  const pm2 = (inv && inv.precio_m2) || 0; const pl = (inv && inv.plusvalia_anual_pct) || 0;
  if (pm2 >= 85000) return 'premium';        // consolidada, siempre deseada
  if (pm2 > 0 && pm2 < 42000) return 'emergente'; // en alza, entrar temprano
  if (pl >= 7) return 'momentum';            // en pleno crecimiento
  return 'clasica';                          // establecida, hogar
}
const ARQ = {
  premium: {
    etiqueta: 'Zona consolidada',
    contexto: (n) => `${n} es de las direcciones más codiciadas de la ciudad. Aquí el precio alto no es un defecto — es la prueba de una zona que la gente nunca deja de querer.`,
    heroSub: (n) => <>Una propiedad en {n} pone a trabajar lo que tanto te costó, en una de las direcciones que la ciudad <b style={{ color: '#fff' }}>nunca deja de querer</b> — valor sólido que además se hereda.</>,
    cap2Titulo: <>Hay lugares que la gente<br />nunca deja de querer.</>,
    cap2Cuerpo: (n) => <><b style={{ color: INK }}>{n}</b> es uno de ellos. Cuando una zona siempre tiene quién la busque, lo que tienes ahí <b style={{ color: INK }}>no se devalúa</b> — al contrario: sube tranquilo y constante. No es suerte: es estar donde todos quieren estar.</>,
  },
  emergente: {
    etiqueta: 'Zona en alza',
    contexto: (n) => `${n} es la zona en alza donde todavía puedes entrar a buen precio — antes de que el resto se dé cuenta.`,
    heroSub: (n) => <>Una propiedad en {n} te deja <b style={{ color: '#fff' }}>entrar temprano</b>, cuando todavía está a buen precio — y crecer con la zona antes de que el resto se dé cuenta.</>,
    cap2Titulo: <>Estás temprano.<br />Y eso es lo bueno.</>,
    cap2Cuerpo: (n) => <><b style={{ color: INK }}>{n}</b> apenas está despegando: precios todavía accesibles y la plusvalía empujando fuerte. Entrar hoy aquí es <b style={{ color: INK }}>comprar barato lo que mañana será caro</b>.</>,
  },
  momentum: {
    etiqueta: 'Zona en crecimiento',
    contexto: (n) => `${n} no para de crecer: precios al alza, demanda fuerte y vida de sobra. Una de las apuestas más interesantes de la ciudad ahora mismo.`,
    heroSub: (n) => <>Una propiedad en {n} te sube al <b style={{ color: '#fff' }}>momento</b> de una zona que no para de crecer — demanda fuerte y precios al alza, trabajando para ti.</>,
    cap2Titulo: <>Una zona que no<br />para de crecer.</>,
    cap2Cuerpo: (n) => <><b style={{ color: INK }}>{n}</b> trae inercia: la gente la busca, los precios suben y la vida sobra. Cuando una zona tiene este empuje, <b style={{ color: INK }}>lo que compras hoy vale más mañana</b>.</>,
  },
  clasica: {
    etiqueta: 'Zona establecida',
    contexto: (n) => `${n} es de esas zonas donde la ciudad se siente hogar: todo cerca, valor estable y una comunidad que se queda.`,
    heroSub: (n) => <>Una propiedad en {n} es de las apuestas <b style={{ color: '#fff' }}>seguras</b>: una zona donde la ciudad se siente hogar, con valor estable y una comunidad que se queda.</>,
    cap2Titulo: <>Una buena dirección<br />siempre será buena.</>,
    cap2Cuerpo: (n) => <><b style={{ color: INK }}>{n}</b> es de esas zonas que no fallan: bien ubicada, con todo cerca y demanda constante. <b style={{ color: INK }}>Valor estable</b> que no depende de modas — por eso sube parejo, año con año.</>,
  },
};
function zoneContext(name, inv) { return (ARQ[zoneArchetype(inv)] || ARQ.clasica).contexto(name); }

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

// Herramienta de asequibilidad ÚNICA (reusada por 'mi primera casa' y 'familia'). Desglose paso a paso + globitos (?).
// plural=true → lenguaje familia ('les/su'); false → primera ('te/tu').
function AffordTool({ name, precioMin, ingreso, setIngreso, ahorro, setAhorro, plural }) {
  const tasa = 0.1145, plazo = 240, dti = 0.30;
  const ing = Number(ingreso) || 0;
  const pagoMax = Math.round(ing * dti);
  const i = tasa / 12;
  const prestamoMax = pagoMax > 0 ? Math.round(pagoMax * (1 - Math.pow(1 + i, -plazo)) / i) : 0;
  const precioMax = prestamoMax + (Number(ahorro) || 0);
  const alcanza = precioMin ? precioMax >= precioMin : null;
  const v = plural
    ? { eyb: '¿Cuánto les alcanza?', g: 'gana su hogar', presIntro: 'Eso es lo que les presta el banco', ahoStep: 'Su enganche', precio: 'su propiedad', sub: 'Con lo que entra en casa y lo que tienen ahorrado, les decimos —paso a paso— para qué les alcanza en ', alc: 'Sí les alcanza', noalc: 'esa mensualidad ya sería de ustedes' }
    : { eyb: '¿Cuánto te alcanza?', g: 'ganas', presIntro: 'Eso es lo que te presta el banco', ahoStep: 'Tu enganche', precio: 'tu propiedad', sub: 'Con tu ingreso y lo que tienes ahorrado, te decimos —paso a paso— para qué te alcanza en ', alc: 'Sí te alcanza', noalc: 'esa mensualidad ya sería tuya' };
  const T = ({ t }) => (<span className="tip"><span className="tip-q">?</span><span className="tip-box">{t}</span></span>);
  const inputS = { padding: '10px 13px', borderRadius: 10, border: '1px solid rgba(99,102,241,0.22)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14, color: INK, outline: 'none', background: '#fff', width: 140 };
  const cont = { maxWidth: 1000, margin: '0 auto', padding: '0 28px' };
  const Row = ({ op, label, tip, val, hl }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: hl ? '15px 18px' : '11px 18px', borderRadius: 12, background: hl ? 'linear-gradient(135deg, rgba(99,102,241,0.09), rgba(236,72,153,0.06))' : '#fff', border: hl ? '1.5px solid rgba(99,102,241,0.28)' : '1px solid rgba(16,18,28,0.07)' }}>
      <div style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: hl ? 14.5 : 13, color: hl ? INK : '#4B4F66', display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>{op && <span style={{ color: '#A2A6BC', fontWeight: 800, marginRight: 9, fontFamily: 'Outfit', fontSize: 15 }}>{op}</span>}{label}{tip && <T t={tip} />}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: hl ? 'clamp(22px,3.4vw,30px)' : 16, color: hl ? '#4F46E5' : INK, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{val}</div>
    </div>
  );
  return (
    <section style={{ width: '100%', background: '#fff', padding: 'clamp(56px,8vw,92px) 0', borderBottom: '1px solid rgba(16,18,28,0.06)' }}>
      <div data-rev style={cont}>
        <div style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#EC4899' }}>{v.eyb}</div>
        <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1.04, fontSize: 'clamp(27px,3.8vw,44px)', color: INK, margin: '14px 0 0' }}>Pon {plural ? 'sus' : 'tus'} números.</h2>
        <p style={{ fontFamily: 'DM Sans', fontSize: 'clamp(15px,1.9vw,18px)', color: MUT, maxWidth: 640, marginTop: 14, lineHeight: 1.6 }}>{v.sub}{name}.</p>
        <div className="zv2-win" style={{ background: '#fff', border: '1px solid rgba(16,18,28,0.07)', borderRadius: 22, boxShadow: '0 18px 50px rgba(99,102,241,0.08), 0 2px 8px rgba(16,18,28,0.04)', padding: 'clamp(20px,3vw,28px)', marginTop: 22 }}>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-end', paddingBottom: 20, borderBottom: '1px solid rgba(16,18,28,0.07)' }}>
            <div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 700, color: '#6B6F86', marginBottom: 6 }}>{plural ? 'Ingreso del hogar (al mes)' : 'Tu ingreso del hogar (al mes)'}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {[20000, 30000, 45000, 60000].map((x) => (
                  <button key={x} type="button" onClick={() => setIngreso(x)} style={{ padding: '8px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12.5, border: ing === x ? '1.5px solid #6366F1' : '1px solid rgba(99,102,241,0.2)', background: ing === x ? 'rgba(99,102,241,0.1)' : '#fff', color: ing === x ? '#4F46E5' : '#4B4F66' }}>${(x / 1000)}k</button>
                ))}
                <input type="text" inputMode="numeric" value={`$${ing.toLocaleString('es-MX')}`} onChange={(e) => setIngreso(parseInt(String(e.target.value).replace(/\D/g, ''), 10) || 0)} style={{ ...inputS, width: 110 }} />
              </div>
            </div>
            <div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 700, color: '#6B6F86', marginBottom: 6, display: 'flex', alignItems: 'center' }}>{plural ? 'Lo que tienen ahorrado' : 'Lo que tienes ahorrado'}<T t="El dinero que ya tienes guardado para el enganche — el pago inicial que das de tu bolsa." /></div>
              <input type="text" inputMode="numeric" value={`$${(Number(ahorro) || 0).toLocaleString('es-MX')}`} onChange={(e) => setAhorro(parseInt(String(e.target.value).replace(/\D/g, ''), 10) || 0)} style={inputS} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
            <Row label={`Lo que ${v.g} al mes`} val={`$${ing.toLocaleString('es-MX')}`} />
            <Row op="×" label="El 30% sano para vivienda" tip="Los bancos recomiendan no destinar más del 30% de tu ingreso al pago de la casa — así vives tranquilo, sin ahogarte." val="30%" />
            <Row op="=" label="Tu mensualidad máxima" tip="Lo máximo que pagarías al mes sin apretarte. Es el corazón del cálculo." val={`$${pagoMax.toLocaleString('es-MX')}`} />
            <Row op="→" label={v.presIntro} tip="A 20 años, con una tasa de ~11.45% (la típica de hoy). Es el préstamo máximo que sostiene esa mensualidad." val={m1(prestamoMax)} />
            <Row op="+" label={v.ahoStep} tip="Tu ahorro inicial se suma al préstamo: mientras más enganche, más alcanza." val={m1(Number(ahorro) || 0)} />
            <Row hl op="=" label={`Precio máximo de ${v.precio}`} val={m1(precioMax)} />
          </div>
          {precioMin != null && (
            <div style={{ marginTop: 16, padding: '13px 16px', borderRadius: 12, background: alcanza ? 'rgba(16,185,129,0.08)' : 'rgba(99,102,241,0.07)', fontFamily: 'DM Sans', fontSize: 13.5, color: alcanza ? '#0E7A53' : '#4F46E5', lineHeight: 1.5 }}>
              {alcanza
                ? <>✓ <b>{v.alc} para {name}</b> — desde {m1(precioMin)}. Y {v.noalc} en vez de irse en renta.</>
                : <>En {name} arranca desde <b>{m1(precioMin)}</b> y por ahora alcanza para {m1(precioMax)}. Cerca: súbele al enganche, considera <b>Infonavit/Cofinavit</b> (amplía el monto), o mira zonas más accesibles.</>}
            </div>
          )}
          <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: '#A2A6BC', marginTop: 12, fontStyle: 'italic' }}>Estimado · crédito a 20 años, tasa ~11.45%, mensualidad máx 30% del ingreso. Con Infonavit/Cofinavit puede subir — se afina al cotizar con tus datos reales.</div>
        </div>
      </div>
    </section>
  );
}

export default function ZonePageV2() {
  const { slug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  // TAB de la página unificada · 'propiedades' | 'zona' (Conoce la zona). Default 'zona' por ahora (Propiedades = Fase 3).
  const ver = searchParams.get('ver') === 'propiedades' ? 'propiedades' : 'zona';
  const setVer = (v) => { const n = new URLSearchParams(searchParams); if (v === 'zona') n.delete('ver'); else n.set('ver', v); setSearchParams(n); };
  const progressRef = useRef(null);   // barra de progreso de scroll (upgrade) — se actualiza por ref, sin re-render
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
      // on-demand: si la zona se está ingestando en bg (1ª visita), reintenta una vez para que ESTE visitante ya vea los lugares
      if (lg && lg.cargando) {
        setTimeout(() => { if (alive) get(`/api/zona/${slug}/lugares`).then((r) => { if (alive && r && r.lugares && Object.keys(r.lugares).length) setLugares(r); }).catch(() => {}); }, 13000);
      }
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

  // ⬆ Upgrade: barra de progreso de scroll (orienta en la historia larga). Se actualiza por ref (sin re-render).
  useEffect(() => {
    const onScroll = () => {
      const el = progressRef.current; if (!el) return;
      const h = document.documentElement; const max = (h.scrollHeight - h.clientHeight) || 1;
      el.style.width = `${Math.min(100, Math.max(0, (h.scrollTop / max) * 100))}%`;
    };
    onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Elegir perfil = persistir + DISPARAR señal de intención (zone_intent → buyer_signals → lead/demanda/Atlax). Cierra ciclo.
  const pickProfile = (kk) => {
    setProfile(kk);
    try { localStorage.setItem('dmx_zone_profile', kk); } catch { /* noop */ }
    sendBuyerSignal('zone_intent', { colonia: slug, value: kk });
  };

  const name = (landing && landing.name) || tc((slug || '').replace(/-/g, ' '));
  // Cobertura de CUALQUIER colonia: full (tiene mercado) · descubrimiento (catálogo, sin mercado) · no-encontrada (404).
  const tieneMercado = !!(inv && inv.tiene_mercado);
  const esReal = !!landing || tieneMercado;
  const noEncontrada = !loading && !esReal;                 // ni en SEED ni en catálogo → slug inválido
  const descubrimiento = esReal && !tieneMercado;           // colonia real del catálogo, aún sin precios/desarrollos
  const zScores = (landing && landing.scores_reales) || null;
  const arcRebuilt = profile === 'invertir' || profile === 'familia' || profile === 'primera' || profile === 'vivir';  // los 4 perfiles con arco nuevo → ocultan los bloques viejos
  const alcaldia = landing && landing.alcaldia;
  const tier = landing && landing.tier;
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
  // (rebuild) La maquinaria vieja de "lugares preview" (realLugares/lugaresData/LugaresPreview/SAMPLE_LUGARES) se retiró:
  // el lifestyle real (lugares.lugares de Google Places) ahora vive dentro del Cap 3 de cada arco de perfil.
  // Conectividad: minutos caminando al metro (real de /lugares · cae a vista previa si no hay)
  // (auditoría · limpieza) metroReal/metroData/metroEsReal retirados con el bloque "Conectividad" (el transporte ya sale en el lifestyle real).
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
  const ParaTi = ({ tag }) => paraTi(tag) ? <span style={{ marginLeft: 8, fontFamily: 'DM Sans', fontWeight: 800, fontSize: 10.5, color: '#4F46E5', background: 'rgba(99,102,241,0.12)', borderRadius: 9999, padding: '3px 9px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>✦ para ti</span> : null;
  // Catalizadores de la zona (por qué sube) — derivados de DATO REAL (pipeline de obra, plusvalía, conectividad).
  const catalizadores = (() => {
    if (profile !== 'invertir') return [];
    const out = [];
    const enObra = (devs || []).filter((d) => ['preventa', 'en_construccion'].includes(d.stage)).length;
    if (enObra >= 1) out.push(['🏗️', `${enObra} ${enObra === 1 ? 'desarrollo nuevo' : 'desarrollos nuevos'} en marcha`, 'Obra nueva = capital apostando por la zona. La oferta de calidad jala precio.']);
    if (inv && inv.plusvalia_anual_pct >= 5) out.push(['📈', `Precios subiendo ~${inv.plusvalia_anual_pct}% al año`, 'La zona ya trae inercia de plusvalía, no apuesta a futuro.']);
    if ((lugares && lugares.metro) || (vida && vida.fuente === 'google' && (vida.amenidades || {}).transporte >= 10)) out.push(['🚇', 'Bien conectada al transporte', 'La conectividad sostiene la demanda de renta y el valor.']);
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
        .zv2-glow:hover { transform: translateY(-4px); border-color: rgba(168,139,250,0.55) !important; box-shadow: 0 16px 42px rgba(99,102,241,0.22) }
        .zv2-bar { transform-origin: bottom; transition: transform .8s cubic-bezier(.2,.8,.2,1) }
        .zv2-rev .zv2-bar { transform: scaleY(0.03) }
        .zv2-rev.in .zv2-bar { transform: scaleY(1) }
        .zv2-imgz { overflow: hidden }
        .zv2-imgz img { transition: transform .6s cubic-bezier(.2,.8,.2,1) }
        .zv2-imgz:hover img { transform: scale(1.045) }
        @media (prefers-reduced-motion: reduce) { .zv2-rev { opacity:1 !important; transform:none !important; transition:none } .zv2-bar { transform:none !important; transition:none } }
        .zv2-cta { transition: transform .18s, box-shadow .18s }
        .zv2-cta:hover { transform: translateY(-2px); box-shadow: 0 14px 32px rgba(99,102,241,.42) }
        .zv2-win { transition: transform .22s cubic-bezier(.2,.8,.2,1), box-shadow .22s }
        .zv2-win:hover { transform: translateY(-3px); box-shadow: 0 22px 48px rgba(99,102,241,.14) }
        .zv2-zlink { transition: transform .18s, box-shadow .18s, border-color .18s }
        .zv2-zlink:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(99,102,241,.16); border-color: rgba(99,102,241,.45) !important }
        .zv2-tab { transition: all .16s ease; cursor:pointer; text-align:left }
        .zv2-tab:hover { border-color: rgba(99,102,241,.5) !important; transform: translateY(-2px) }
      `}</style>
      <PublicNav />
      <div data-testid="zona-v2" style={{ minHeight: '100vh', paddingBottom: 80, color: INK }}>
        {noEncontrada ? (
          <section style={{ ...sec, paddingTop: 'clamp(60px,10vw,110px)', paddingBottom: 'clamp(60px,10vw,110px)', textAlign: 'center' }}>
            <div style={{ fontSize: 48 }}>🗺️</div>
            <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(26px,4vw,40px)', color: INK, margin: '14px 0 0', letterSpacing: '-0.03em' }}>No encontramos esa colonia</h1>
            <p style={{ fontFamily: 'DM Sans', fontSize: 16, color: MUT, maxWidth: 480, margin: '12px auto 0', lineHeight: 1.6 }}>Puede que el enlace esté mal escrito. Busca tu zona o explora todas las colonias de la ciudad.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 28 }}>
              <Link to="/colonias" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '14px 26px', borderRadius: 14, background: 'linear-gradient(135deg,#6366F1,#EC4899)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 15, textDecoration: 'none', boxShadow: '0 12px 30px rgba(99,102,241,0.34)' }}>🔎 Explorar colonias</Link>
              <Link to="/mapa" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '14px 24px', borderRadius: 14, border: '1px solid rgba(99,102,241,0.3)', background: '#fff', color: '#4F46E5', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 14.5, textDecoration: 'none' }}>🗺️ Ver el mapa</Link>
            </div>
          </section>
        ) : (<>

        {/* ───── CONTEXTO + ¿QUÉ BUSCAS? + TABS ───── */}
        <section style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(180deg,#FAF9FF 0%,#FFFFFF 96%)' }}>
          <div style={{ position: 'absolute', top: -130, right: -70, width: 480, height: 480, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.20), rgba(99,102,241,0) 70%)', filter: 'blur(22px)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: 30, left: -110, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.13), rgba(99,102,241,0) 70%)', filter: 'blur(22px)', pointerEvents: 'none' }} />
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

            {/* Snapshot de la zona · tira de stats premium (solo si hay mercado real · no en descubrimiento) */}
            {inv && tieneMercado && (
              <div style={{ display: 'inline-flex', flexWrap: 'wrap', marginTop: 22, background: '#fff', border: '1px solid rgba(16,18,28,0.08)', borderRadius: 18, boxShadow: '0 12px 34px rgba(99,102,241,0.09), 0 2px 8px rgba(16,18,28,0.04)', overflow: 'hidden' }}>
                {[
                  ['Precio desde', m1(inv.precio_min || inv.precio_prom), INK],
                  ['Plusvalía / año', inv.plusvalia_anual_pct != null ? `+${inv.plusvalia_anual_pct}%` : '—', '#10B981'],
                  ...(inv.renta_prom ? [['Renta típica', `~$${Math.round(inv.renta_prom).toLocaleString('es-MX')}/mes`, INK]] : []),
                  ...(inv.cap_rate_anual_pct != null ? [['Cap rate', `${inv.cap_rate_anual_pct}%`, INK]] : []),
                ].map(([l, v, c], i) => (
                  <div key={l} style={{ padding: '15px 26px', borderLeft: i ? '1px solid rgba(16,18,28,0.07)' : 'none' }}>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: '#8A8FA6', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{l}</div>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 23, color: c, letterSpacing: '-0.02em', marginTop: 3 }}>{v}</div>
                  </div>
                ))}
              </div>
            )}

            {/* La pregunta + las 4 tabs (cada una con micro-promesa) · oculto en descubrimiento (no hay lentes que aplicar) */}
            {S && !descubrimiento && (
              <div style={{ marginTop: 26 }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(18px,2.4vw,24px)', color: INK, letterSpacing: '-0.02em' }}>{name} es muchas cosas para mucha gente. <span style={grad}>¿Qué es para ti?</span></div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: '#8A8FA6', marginTop: 5 }}>Elige y te contamos su historia con esos ojos.</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 12, marginTop: 14 }}>
                  {PROFILES.map((p) => {
                    const on = p.k === profile;
                    return (
                      <button key={p.k} type="button" onClick={() => pickProfile(p.k)} className="zv2-tab"
                        style={{ padding: '15px 18px', borderRadius: 16, border: `1.5px solid ${on ? 'transparent' : 'rgba(16,18,28,0.12)'}`, background: on ? 'linear-gradient(135deg,#6366F1,#EC4899)' : '#fff', color: on ? '#fff' : INK, boxShadow: on ? '0 12px 28px rgba(99,102,241,0.3)' : '0 6px 18px rgba(16,18,28,0.05)' }}>
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

        {/* ───── TAB BAR · sticky bajo el nav + highlight (no se pierde al hacer scroll) ───── */}
        <div style={{ position: 'sticky', top: 63, zIndex: 40, background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(16,18,28,0.07)', boxShadow: '0 6px 20px rgba(16,18,28,0.05)' }}>
          <div style={{ ...sec, paddingTop: 11, paddingBottom: 11, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'inline-flex', gap: 5, background: 'rgba(99,102,241,0.08)', borderRadius: 9999, padding: 5, border: '1px solid rgba(99,102,241,0.16)' }}>
              {[['propiedades', `🏠 Propiedades${devs.length ? ` (${devs.length}${devs.length >= 12 ? '+' : ''})` : ''}`], ['zona', '📖 Conoce la zona']].map(([v, l]) => {
                const on = ver === v;
                return (
                  <button key={v} type="button" onClick={() => setVer(v)} className="zv2-cta" style={{ padding: '10px 22px', borderRadius: 9999, border: 'none', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13.5, background: on ? 'linear-gradient(135deg,#6366F1,#EC4899)' : 'transparent', color: on ? '#fff' : '#4F46E5', boxShadow: on ? '0 8px 20px rgba(99,102,241,0.36)' : 'none', transition: 'background .18s, box-shadow .18s, transform .18s' }}>{l}</button>
                );
              })}
            </div>
            <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600, color: '#9499AE' }}>{ver === 'zona' ? '— la historia de ' : '— en venta en '}{name}</span>
            {ver === 'zona' && profile === 'invertir' && tieneMercado && (
              <button type="button" onClick={() => { const el = document.getElementById('calculadora'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="zv2-cta" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9999, border: '1.5px solid rgba(99,102,241,0.35)', background: '#fff', color: '#4F46E5', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>🧮 Calcular mi inversión</button>
            )}
          </div>
          <div style={{ position: 'absolute', left: 0, bottom: 0, height: 2.5, width: '100%', background: 'rgba(99,102,241,0.1)' }}>
            <div ref={progressRef} style={{ height: '100%', width: '0%', background: 'linear-gradient(90deg,#6366F1,#10B981)', transition: 'width .1s linear' }} />
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
        {/* (auditoría · código muerto retirado) Intro-gancho del header: era para perfiles sin arco; los 4 ya tienen su Cap 1 hero → !arcRebuilt siempre false. */}

        {loading ? (
          <section style={{ ...sec, marginTop: 28 }}><div style={{ ...cardBase, padding: 30, textAlign: 'center', color: '#8A8FA6', fontFamily: 'DM Sans' }}>Cargando la historia de {name}…</div></section>
        ) : descubrimiento ? (
          <div data-rev style={{ ...sec, marginTop: 30 }}>
            <div style={eyebrow}>{tc('Conoce la zona')}</div>
            <h2 style={chapTitle}>Así es {name}.</h2>
            <p style={lead}>Todavía no tenemos desarrollos en venta aquí, pero esto es lo que sí sabemos de la zona — con datos reales:</p>
            {zScores && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 14, marginTop: 24 }}>
                {[['🛡️', 'Seguridad', 'seguridad'], ['🎓', 'Educación', 'educacion'], ['🛍️', 'Comercio', 'comercio'], ['🚇', 'Movilidad', 'movilidad']].map(([ic, label, key]) => {
                  const v = zScores[key]; if (v == null) return null;
                  return (
                    <div key={key} className="zv2-win" style={{ ...cardBase, padding: '16px 18px' }}>
                      <div style={{ fontSize: 20 }}>{ic}</div>
                      <div style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, color: '#6B6F86', marginTop: 6 }}>{label}</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 3 }}>
                        <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: v >= 70 ? '#0E7A53' : v >= 40 ? '#6366F1' : '#6B6F86' }}>{v}</div>
                        <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: '#A2A6BC' }}>/100</div>
                      </div>
                      <div style={{ height: 5, borderRadius: 9999, background: 'rgba(99,102,241,0.1)', marginTop: 8, overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.max(2, v)}%`, background: v >= 70 ? '#10B981' : 'linear-gradient(90deg,#6366F1,#EC4899)' }} /></div>
                    </div>
                  );
                })}
              </div>
            )}
            {lugares && lugares.fuente === 'google' && lugares.lugares && (() => {
              const cats = [['🏫', 'escuela', 'Escuelas'], ['🌳', 'parque', 'Parques'], ['🏥', 'hospital', 'Salud'], ['🛒', 'supermercado', 'El súper'], ['🍴', 'restaurante', 'Para salir a comer'], ['🚇', 'transporte', 'Transporte']]
                .map(([ic, k, l]) => [ic, l, (lugares.lugares[k] || []).filter((p) => p && p.name).slice(0, 3)]).filter(([, , a]) => a.length);
              if (!cats.length) return null;
              return (
                <div style={{ marginTop: 38 }}>
                  <div style={eyebrow}>{tc('Así se vive aquí')}</div>
                  <h2 style={chapTitle}>A la vuelta de la esquina.</h2>
                  <p style={lead}>Lo que de verdad tienes cerca — toca cualquiera para verlo en el mapa:</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14, marginTop: 20 }}>
                    {cats.map(([ic, l, arr]) => (
                      <div key={l} className="zv2-win" style={{ ...cardBase, padding: '16px 18px' }}>
                        <div style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13, color: INK, display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 17 }}>{ic}</span> {l}</div>
                        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {arr.map((p) => (
                            <a key={p.name} href={p.maps_uri || '#'} target="_blank" rel="noopener noreferrer" className="zv2-zlink" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, textDecoration: 'none', padding: '7px 10px', borderRadius: 9, border: '1px solid rgba(16,18,28,0.06)' }}>
                              <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, color: '#3A3E55', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                              {p.rating ? <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 12, color: '#0E7A53', whiteSpace: 'nowrap' }}>★{p.rating}</span> : null}
                            </a>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: '#A2A6BC', marginTop: 14, fontStyle: 'italic' }}>Lugares y calificaciones reales de Google Places.</div>
                </div>
              );
            })()}
            <div style={{ ...cardBase, padding: '26px 28px', marginTop: 38, textAlign: 'center', background: 'linear-gradient(135deg, rgba(99,102,241,0.05), rgba(236,72,153,0.04))' }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(18px,2.4vw,24px)', color: INK, letterSpacing: '-0.02em' }}>Aún no hay desarrollos en venta en {name}</div>
              <p style={{ fontFamily: 'DM Sans', fontSize: 14.5, color: MUT, maxWidth: 520, margin: '8px auto 0', lineHeight: 1.55 }}>Te avisamos en cuanto entre el primero. Mientras, explora las zonas que ya tienen propiedades disponibles.</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 20 }}>
                <button type="button" onClick={() => setSaveOpen(true)} className="zv2-cta" style={{ padding: '13px 24px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#6366F1,#EC4899)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 14.5, cursor: 'pointer', boxShadow: '0 10px 26px rgba(99,102,241,0.3)' }}>🔔 Vigila {name}</button>
                <Link to="/colonias" style={{ padding: '13px 22px', borderRadius: 14, border: '1px solid rgba(99,102,241,0.3)', background: '#fff', color: '#4F46E5', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 14, textDecoration: 'none' }}>Explorar zonas con propiedades</Link>
              </div>
            </div>
          </div>
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
          const aq = ARQ[zoneArchetype(inv)] || ARQ.clasica;   // carácter de ESTA colonia → cambia el tono de la historia
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
                  <div style={eyb('#A5B4FC')}>Invertir · {name} · {aq.etiqueta}</div>
                  <h2 style={{ ...giant, fontSize: 'clamp(28px,4vw,48px)', margin: '20px 0 0', color: '#fff', maxWidth: 760 }}>
                    Trabajaste años por ese dinero.<br />
                    <span style={{ color: 'rgba(255,255,255,0.42)' }}>Guardado en el banco, rinde para ellos.</span><br />
                    Aquí, por fin, <span style={{ background: 'linear-gradient(90deg,#A5B4FC,#F0ABFC)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>rinde para ti</span>.
                  </h2>
                  <p style={{ fontFamily: 'DM Sans', fontSize: 'clamp(15px,1.9vw,19px)', color: 'rgba(255,255,255,0.78)', maxWidth: 560, marginTop: 22, lineHeight: 1.55 }}>{aq.heroSub(name)}</p>
                  {bridge('Déjame mostrarte por qué aquí', true)}
                </div>
              </section>

              {/* ─── CAP 2 · LA OPORTUNIDAD (claro · por qué este lugar protege y crece · gráfica + imagen · pocos números) ─── */}
              <section style={{ width: '100%', background: '#fff', padding: 'clamp(56px,8vw,92px) 0', borderBottom: '1px solid rgba(16,18,28,0.06)' }}>
                <div data-rev style={cont}>
                  <div style={eyb('#6366F1')}>Por qué aquí</div>
                  <h2 style={{ ...giant, fontSize: 'clamp(27px,3.8vw,44px)', color: INK, margin: '14px 0 0' }}>{aq.cap2Titulo}</h2>
                  <p style={{ fontFamily: 'DM Sans', fontSize: 'clamp(15px,1.9vw,18px)', color: MUT, maxWidth: 620, marginTop: 16, lineHeight: 1.6 }}>{aq.cap2Cuerpo(name)}</p>
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

        {/* ════════ ARCO FAMILIA (mismo sistema de diseño · contenido: raíces / escuelas / seguridad / espacio) ════════ */}
        {profile === 'familia' && S && (() => {
          const cont = { maxWidth: 1000, margin: '0 auto', padding: '0 28px' };
          const giant = { fontFamily: 'Outfit', fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1.04 };
          const eyb = (c) => ({ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: c });
          const bridge = (txt, dark) => (<div style={{ marginTop: 34, fontFamily: 'DM Sans', fontSize: 'clamp(14px,1.8vw,17px)', fontWeight: 600, fontStyle: 'italic', color: dark ? 'rgba(255,255,255,0.82)' : '#4B4F66', display: 'flex', alignItems: 'center', gap: 9 }}>{txt} <span style={{ fontSize: 17, fontStyle: 'normal', color: dark ? '#F0ABFC' : '#EC4899' }}>↓</span></div>);
          const aq = ARQ[zoneArchetype(inv)] || ARQ.clasica;
          const realFotos = (Array.isArray(devs) ? devs : []).flatMap((d) => [d.hero_photo, ...((d.photos) || [])]).filter((p) => p && !/picsum|placehold|seed\//i.test(p));
          const STOCK = ['164', '1076', '1067'].map((id) => `https://picsum.photos/id/${id}/1280/760`);
          const img = (i) => (realFotos.length > i ? realFotos[i] : STOCK[i % STOCK.length]);
          const FAM = {
            premium: { t: <>Aquí tus hijos<br />crecen seguros.</>, c: (n) => <><b style={{ color: INK }}>{n}</b> es de las zonas más cuidadas de la ciudad: tranquila, con todo cerca y gente que la cuida. El tipo de lugar donde quieres que crezcan.</> },
            clasica: { t: <>Una zona hecha<br />para quedarse.</>, c: (n) => <><b style={{ color: INK }}>{n}</b> es de esas zonas de toda la vida: escuelas, parques y vecinos que se conocen. Aquí las familias echan raíces y se quedan generaciones.</> },
            emergente: { t: <>Más espacio para<br />los tuyos.</>, c: (n) => <>En <b style={{ color: INK }}>{n}</b> tu familia tiene más por lo mismo: más metros, más aire, más patio — en una zona que apenas va para arriba.</> },
            momentum: { t: <>Una zona que<br />mejora con ustedes.</>, c: (n) => <><b style={{ color: INK }}>{n}</b> va para arriba: cada año con más servicios y mejor para los tuyos. Crecen juntos.</> },
          };
          const fa = FAM[zoneArchetype(inv)] || FAM.clasica;
          // Lifestyle REAL (Google Places · nombre + ★ + reseñas + link a Maps). Solo si hay datos reales de la zona.
          const LG = (lugares && lugares.lugares) || {};
          const lgReal = !!(lugares && lugares.fuente === 'google');
          const lifeCats = [['🏫', 'escuela', 'Escuelas'], ['🌳', 'parque', 'Parques'], ['🏥', 'hospital', 'Salud cerca'], ['🛒', 'supermercado', 'El súper'], ['🍴', 'restaurante', 'Para salir a comer'], ['🚇', 'transporte', 'Transporte']]
            .map(([ic, key, label]) => [ic, label, (LG[key] || []).filter((p) => p && p.name).slice(0, 3)]).filter(([, , arr]) => arr.length);
          return (
            <>
              {/* CAP 1 · EL HÉROE Y SU ERROR (oscuro + foto · conectar → mudarse otra vez → echar raíces) */}
              <section style={{ width: '100%', background: `linear-gradient(102deg, #0C0B1E 0%, rgba(12,11,30,0.95) 44%, rgba(26,24,64,0.62) 100%), url(${img(0)}) right center / cover`, color: '#fff', padding: 'clamp(58px,7.5vw,90px) 0', position: 'relative', overflow: 'hidden' }}>
                <div data-rev style={{ ...cont, position: 'relative' }}>
                  <div style={eyb('#A5B4FC')}>Para mi familia · {name} · {aq.etiqueta}</div>
                  <h2 style={{ ...giant, fontSize: 'clamp(28px,4vw,48px)', margin: '20px 0 0', color: '#fff', maxWidth: 760 }}>
                    Tu familia creció.<br />
                    <span style={{ color: 'rgba(255,255,255,0.42)' }}>El espacio donde viven, no.</span><br />
                    Aquí cada quien tiene <span style={{ background: 'linear-gradient(90deg,#A5B4FC,#F0ABFC)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>su lugar</span>.
                  </h2>
                  <p style={{ fontFamily: 'DM Sans', fontSize: 'clamp(15px,1.9vw,19px)', color: 'rgba(255,255,255,0.78)', maxWidth: 580, marginTop: 22, lineHeight: 1.55 }}>Un hogar para que los niños <b style={{ color: '#fff' }}>crezcan en un solo lugar</b> — su cuarto, su escuela, sus amigos — en una zona <b style={{ color: '#fff' }}>segura y con todo cerca</b>. Donde la familia echa raíces y se queda.</p>
                  {bridge('¿Por qué aquí para los tuyos?', true)}
                </div>
              </section>

              {/* CAP 2 · POR QUÉ AQUÍ (claro + foto + escuelas reales · archetype-flavored) */}
              <section style={{ width: '100%', background: '#fff', padding: 'clamp(56px,8vw,92px) 0', borderBottom: '1px solid rgba(16,18,28,0.06)' }}>
                <div data-rev style={cont}>
                  <div style={eyb('#EC4899')}>Por qué aquí</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,0.9fr)', gap: 'clamp(18px,3vw,36px)', alignItems: 'center', marginTop: 14 }}>
                    <div>
                      <h2 style={{ ...giant, fontSize: 'clamp(27px,3.8vw,44px)', color: INK }}>{fa.t}</h2>
                      <p style={{ fontFamily: 'DM Sans', fontSize: 'clamp(15px,1.9vw,18px)', color: MUT, maxWidth: 540, marginTop: 16, lineHeight: 1.6 }}>{fa.c(name)}</p>
                    </div>
                    <div className="zv2-imgz" style={{ borderRadius: 18, boxShadow: '0 18px 40px rgba(16,18,28,0.14)' }}>
                      <img src={img(1)} alt="" loading="lazy" style={{ width: '100%', height: 'clamp(180px,26vw,250px)', objectFit: 'cover', display: 'block' }} onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }} />
                    </div>
                  </div>
                  {bridge(lgReal && lifeCats.length ? 'Y mira todo lo que tienes a la vuelta de tu casa' : 'Y eso es apenas el principio de lo que gana tu familia')}
                </div>
              </section>

              {/* CAP 2.5 · ASÍ SE VIVE AQUÍ (claro · lifestyle REAL de Google Places · nombre + ★ + reseñas + link a Maps) */}
              {lgReal && lifeCats.length > 0 && (
                <section style={{ width: '100%', background: 'linear-gradient(180deg,#FAFAFE,#F3F2FB)', padding: 'clamp(56px,8vw,92px) 0', borderBottom: '1px solid rgba(16,18,28,0.06)' }}>
                  <div data-rev style={cont}>
                    <div style={eyb('#EC4899')}>Así se vive aquí</div>
                    <h2 style={{ ...giant, fontSize: 'clamp(27px,3.8vw,44px)', color: INK, margin: '14px 0 0' }}>A la vuelta de tu casa.</h2>
                    <p style={{ fontFamily: 'DM Sans', fontSize: 'clamp(15px,1.9vw,18px)', color: MUT, maxWidth: 620, marginTop: 14, lineHeight: 1.6 }}>Esto es lo que de verdad tienes cerca en {name} — con nombre y calificación real. Toca cualquiera para verlo en el mapa:</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 16, marginTop: 28 }}>
                      {lifeCats.map(([ic, label, arr]) => (
                        <div key={label} style={{ ...cardBase, padding: '18px 20px' }}>
                          <div style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13, color: INK, display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 18 }}>{ic}</span> {label}</div>
                          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
                            {arr.map((p) => (
                              <a key={p.name} href={p.maps_uri || '#'} target="_blank" rel="noopener noreferrer" className="zv2-zlink" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, textDecoration: 'none', padding: '8px 11px', borderRadius: 10, border: '1px solid rgba(16,18,28,0.06)' }}>
                                <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, color: '#3A3E55', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                                {p.rating ? <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 12.5, color: '#0E7A53', whiteSpace: 'nowrap' }}>★{p.rating}{p.reviews ? <span style={{ color: '#A2A6BC', fontWeight: 600 }}> · {p.reviews > 999 ? `${Math.round(p.reviews / 1000)}k` : p.reviews}</span> : ''}</span> : <span style={{ fontSize: 13, color: '#C7CAD6' }}>›</span>}
                              </a>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: '#A2A6BC', marginTop: 16, fontStyle: 'italic' }}>Lugares y calificaciones reales de Google Places, a ~1 km del centro de {name}.</div>
                    {bridge('Y eso es apenas el principio de lo que gana tu familia')}
                  </div>
                </section>
              )}

              {/* CAP 3 · LO QUE GANA TU FAMILIA (oscuro · beneficios, sin números) */}
              <section style={{ width: '100%', background: 'linear-gradient(180deg,#15132E,#0C0B1E)', color: '#fff', padding: 'clamp(56px,8vw,92px) 0' }}>
                <div data-rev style={cont}>
                  <div style={eyb('#A5B4FC')}>Lo que gana tu familia</div>
                  <h2 style={{ ...giant, fontSize: 'clamp(27px,3.8vw,44px)', color: '#fff', margin: '14px 0 0' }}>Lo que un hogar propio<br />le da a los tuyos.</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 16, marginTop: 32 }}>
                    {[
                      ['🛏️', 'Un cuarto para cada quien', 'Espacio de verdad: que cada hijo tenga el suyo, un lugar para jugar y otro para la familia que venga.'],
                      ['🏫', 'La misma escuela, los mismos amigos', 'Se acaban las mudanzas. Los niños echan raíces — crecen en un solo lugar, sin empezar de cero cada año.'],
                      ['🛡️', 'Dormir tranquilos', 'Una zona segura, con todo cerca, y un techo que es suyo — no a merced del próximo aumento del casero.'],
                    ].map(([ic, t, d]) => (
                      <div key={t} className="zv2-glow" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '22px 22px' }}>
                        <div style={{ fontSize: 30 }}>{ic}</div>
                        <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18.5, color: '#fff', marginTop: 12 }}>{t}</div>
                        <div style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'rgba(255,255,255,0.66)', marginTop: 7, lineHeight: 1.58 }}>{d}</div>
                      </div>
                    ))}
                  </div>
                  {bridge('¿Y les alcanza para su hogar aquí? Veámoslo', true)}
                </div>
              </section>

              {/* CAP 4 · ¿LES ALCANZA? (herramienta única AffordTool · desglose paso a paso + globitos) */}
              <AffordTool name={name} precioMin={inv && inv.precio_min} ingreso={pcIngreso} setIngreso={setPcIngreso} ahorro={pcAhorro} setAhorro={setPcAhorro} plural />

              {/* CAP 5 · AQUÍ EMPIEZA SU HOGAR (cierre + urgencia · familia) */}
              <section style={{ width: '100%', background: 'linear-gradient(135deg,#1B1448 0%,#2A1B5E 52%,#3A1F63 100%)', color: '#fff', padding: 'clamp(60px,9vw,108px) 0', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', bottom: -180, left: -120, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.22), rgba(236,72,153,0) 70%)', pointerEvents: 'none' }} />
                <div data-rev style={{ maxWidth: 760, margin: '0 auto', padding: '0 28px', textAlign: 'center', position: 'relative' }}>
                  <div style={eyb('#C4B5FD')}>Su próximo capítulo</div>
                  <h2 style={{ ...giant, fontSize: 'clamp(28px,4vw,46px)', color: '#fff', margin: '12px 0 0', lineHeight: 1.06 }}>Aquí empieza el hogar<br />de tu familia.</h2>
                  <p style={{ fontFamily: 'DM Sans', fontSize: 'clamp(15px,1.9vw,18px)', color: 'rgba(255,255,255,0.78)', maxWidth: 600, margin: '14px auto 0', lineHeight: 1.6 }}>En {name} dejan de mudarse, los niños crecen en un solo lugar, y cada peso construye lo suyo — no el patrimonio de alguien más.</p>
                  <div style={{ display: 'inline-block', marginTop: 22, padding: '10px 18px', borderRadius: 9999, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)', fontFamily: 'DM Sans', fontSize: 13.5, fontWeight: 700, color: '#FBCFE8' }}>⏳ Los niños crecen rápido y la casa correcta no espera. Cada mes de renta es uno que no vuelve.</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 26 }}>
                    <button type="button" onClick={() => setVer('propiedades')} className="zv2-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '15px 28px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#6366F1,#EC4899)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 12px 30px rgba(99,102,241,0.45)' }}>🏠 Ver las propiedades de {name}</button>
                    <button type="button" onClick={() => setSaveOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '15px 26px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 14.5, cursor: 'pointer' }}>🔔 Avísame de algo para mi familia</button>
                  </div>
                </div>
              </section>
            </>
          );
        })()}

        {/* (rebuild) El "lente del inversionista" se absorbió en el arco de la historia (Cap 1-4). lens queda en null → el veredicto usa su mensaje por defecto. */}

        {/* ── LA VIDA AQUÍ — PAUSADO: los conteos OSM no son confiables (1 gym en Polanco = falso). Se reactiva con
            datos verificados de Google Places (ingesta de pago, 1 vez). El endpoint /vida ya existe (build-for-endstate). ── */}

        {/* (auditoría · código muerto retirado) VALUE STACK + LA VIDA ALREDEDOR: eran para perfiles sin arco; los 4 ya
            tienen su Cap 3 de beneficios + su Cap de lifestyle real → !arcRebuilt siempre false, nunca renderizaban. */}

        {/* (dedup) "¿dónde pongo mi dinero" · "tabla vehículos" · "¿con cuánto inviertes" se movieron a la calculadora
            (Pentágono de inversiones + vs CETES/Bolsa + dimensionar por capital) — la página no los repite. */}

        {/* (rebuild) Catalizadores + Demanda + Vs-ciudad se FUNDIERON en el Cap 4 "La prueba real" del arco (datos reales por colonia, dentro de la historia). */}

        {/* (reorden espina) "Los riesgos, de frente" se movió DESPUÉS de la calculadora (objeciones antes del cierre · Hormozi) */}

        {/* (dedup) "retorno neto de impuestos" se movió a la calculadora (ISR de renta + ISR de venta art.152/RESICO). */}

        {/* ════════ ARCO MI PRIMERA CASA (mismo sistema · contenido: dejar de rentar / lo tuyo / accesible) ════════ */}
        {profile === 'primera' && S && tieneMercado && (() => {
          const cont = { maxWidth: 1000, margin: '0 auto', padding: '0 28px' };
          const giant = { fontFamily: 'Outfit', fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1.04 };
          const eyb = (c) => ({ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: c });
          const bridge = (txt, dark) => (<div style={{ marginTop: 34, fontFamily: 'DM Sans', fontSize: 'clamp(14px,1.8vw,17px)', fontWeight: 600, fontStyle: 'italic', color: dark ? 'rgba(255,255,255,0.82)' : '#4B4F66', display: 'flex', alignItems: 'center', gap: 9 }}>{txt} <span style={{ fontSize: 17, fontStyle: 'normal', color: dark ? '#F0ABFC' : '#EC4899' }}>↓</span></div>);
          const aq = ARQ[zoneArchetype(inv)] || ARQ.clasica;
          const realFotos = (Array.isArray(devs) ? devs : []).flatMap((d) => [d.hero_photo, ...((d.photos) || [])]).filter((p) => p && !/picsum|placehold|seed\//i.test(p));
          const STOCK = ['164', '1076', '1067'].map((id) => `https://picsum.photos/id/${id}/1280/760`);
          const img = (i) => (realFotos.length > i ? realFotos[i] : STOCK[i % STOCK.length]);
          const PRIM = {
            premium: { t: <>Empezar aquí<br />es empezar en grande.</>, c: (n) => <><b style={{ color: INK }}>{n}</b> no es la más barata — pero es de las que nunca bajan. Tu primera propiedad aquí es un patrimonio que solo crece.</> },
            clasica: { t: <>Tu primer lugar,<br />en una zona de verdad.</>, c: (n) => <><b style={{ color: INK }}>{n}</b> tiene todo para empezar: bien ubicada, segura y con vida. Un primer hogar del que no te vas a querer ir.</> },
            emergente: { t: <>Aquí sí alcanza<br />tu primera.</>, c: (n) => <><b style={{ color: INK }}>{n}</b> todavía tiene precio de entrada — perfecto para tu primera propiedad. Entras accesible y creces con la zona.</> },
            momentum: { t: <>Entra antes<br />de que suba.</>, c: (n) => <><b style={{ color: INK }}>{n}</b> va para arriba. Lo que compras hoy, mañana vale más — el mejor momento para tu primera es antes que el resto.</> },
          };
          const pr = PRIM[zoneArchetype(inv)] || PRIM.clasica;
          return (
            <>
              {/* CAP 1 · HERO (oscuro + foto · años rentando → la renta no vuelve → lo tuyo) */}
              <section style={{ width: '100%', background: `linear-gradient(102deg, #0C0B1E 0%, rgba(12,11,30,0.95) 44%, rgba(26,24,64,0.62) 100%), url(${img(0)}) right center / cover`, color: '#fff', padding: 'clamp(58px,7.5vw,90px) 0', position: 'relative', overflow: 'hidden' }}>
                <div data-rev style={{ ...cont, position: 'relative' }}>
                  <div style={eyb('#A5B4FC')}>Mi primera casa · {name} · {aq.etiqueta}</div>
                  <h2 style={{ ...giant, fontSize: 'clamp(28px,4vw,48px)', margin: '20px 0 0', color: '#fff', maxWidth: 760 }}>
                    Llevas años pagando una hipoteca.<br />
                    <span style={{ color: 'rgba(255,255,255,0.42)' }}>El detalle: es la de tu casero, no la tuya.</span><br />
                    Es hora de que la próxima sea <span style={{ background: 'linear-gradient(90deg,#A5B4FC,#F0ABFC)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>tuya</span>.
                  </h2>
                  <p style={{ fontFamily: 'DM Sans', fontSize: 'clamp(15px,1.9vw,19px)', color: 'rgba(255,255,255,0.78)', maxWidth: 580, marginTop: 22, lineHeight: 1.55 }}>Tu primera propiedad: la misma mensualidad que hoy se va en renta, mañana es <b style={{ color: '#fff' }}>tu patrimonio</b>. Y comprar tu primer lugar es más alcanzable de lo que crees — aquí te lo mostramos sin enredos.</p>
                  {bridge('¿Por qué empezar aquí?', true)}
                </div>
              </section>

              {/* CAP 2 · POR QUÉ AQUÍ (claro · archetype primera) */}
              <section style={{ width: '100%', background: '#fff', padding: 'clamp(56px,8vw,92px) 0', borderBottom: '1px solid rgba(16,18,28,0.06)' }}>
                <div data-rev style={cont}>
                  <div style={eyb('#EC4899')}>Por qué aquí</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,0.9fr)', gap: 'clamp(18px,3vw,36px)', alignItems: 'center', marginTop: 14 }}>
                    <div>
                      <h2 style={{ ...giant, fontSize: 'clamp(27px,3.8vw,44px)', color: INK }}>{pr.t}</h2>
                      <p style={{ fontFamily: 'DM Sans', fontSize: 'clamp(15px,1.9vw,18px)', color: MUT, maxWidth: 540, marginTop: 16, lineHeight: 1.6 }}>{pr.c(name)}</p>
                    </div>
                    <div className="zv2-imgz" style={{ borderRadius: 18, boxShadow: '0 18px 40px rgba(16,18,28,0.14)' }}>
                      <img src={img(1)} alt="" loading="lazy" style={{ width: '100%', height: 'clamp(180px,26vw,250px)', objectFit: 'cover', display: 'block' }} onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }} />
                    </div>
                  </div>
                  {bridge('Mira tu nueva vida aquí')}
                </div>
              </section>

              {/* CAP 3 · LIFESTYLE REAL (Google Places · on-demand) */}
              {lugares && lugares.fuente === 'google' && lugares.lugares && (() => {
                const cats = [['🚇', 'transporte', 'Transporte'], ['🛒', 'supermercado', 'El súper'], ['🍴', 'restaurante', 'Para salir'], ['☕', 'cafe', 'Cafés'], ['🌳', 'parque', 'Parques'], ['🏥', 'hospital', 'Salud']]
                  .map(([ic, k, l]) => [ic, l, (lugares.lugares[k] || []).filter((p) => p && p.name).slice(0, 3)]).filter(([, , a]) => a.length);
                if (!cats.length) return null;
                return (
                  <section style={{ width: '100%', background: 'linear-gradient(180deg,#FAFAFE,#F3F2FB)', padding: 'clamp(56px,8vw,92px) 0', borderBottom: '1px solid rgba(16,18,28,0.06)' }}>
                    <div data-rev style={cont}>
                      <div style={eyb('#EC4899')}>Así se vive aquí</div>
                      <h2 style={{ ...giant, fontSize: 'clamp(27px,3.8vw,44px)', color: INK, margin: '14px 0 0' }}>Tu nueva vida, a la mano.</h2>
                      <p style={{ fontFamily: 'DM Sans', fontSize: 'clamp(15px,1.9vw,18px)', color: MUT, maxWidth: 620, marginTop: 14, lineHeight: 1.6 }}>Lo que de verdad tienes cerca en {name} — toca cualquiera para verlo en el mapa:</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14, marginTop: 20 }}>
                        {cats.map(([ic, l, arr]) => (
                          <div key={l} className="zv2-win" style={{ ...cardBase, padding: '16px 18px' }}>
                            <div style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13, color: INK, display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 17 }}>{ic}</span> {l}</div>
                            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {arr.map((p) => (
                                <a key={p.name} href={p.maps_uri || '#'} target="_blank" rel="noopener noreferrer" className="zv2-zlink" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, textDecoration: 'none', padding: '7px 10px', borderRadius: 9, border: '1px solid rgba(16,18,28,0.06)' }}>
                                  <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, color: '#3A3E55', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                                  {p.rating ? <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 12, color: '#0E7A53', whiteSpace: 'nowrap' }}>★{p.rating}</span> : null}
                                </a>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: '#A2A6BC', marginTop: 14, fontStyle: 'italic' }}>Lugares y calificaciones reales de Google Places.</div>
                    </div>
                  </section>
                );
              })()}
            </>
          );
        })()}

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
        {/* ── ¿CUÁNTO TE ALCANZA? (herramienta única AffordTool · desglose paso a paso + globitos) ── */}
        {profile === 'primera' && tieneMercado && (
          <AffordTool name={name} precioMin={inv && inv.precio_min} ingreso={pcIngreso} setIngreso={setPcIngreso} ahorro={pcAhorro} setAhorro={setPcAhorro} plural={false} />
        )}

        {/* CAP 6 · AQUÍ DEJAS DE RENTAR (cierre + urgencia · primera) */}
        {profile === 'primera' && tieneMercado && (
          <section style={{ width: '100%', background: 'linear-gradient(135deg,#1B1448 0%,#2A1B5E 52%,#3A1F63 100%)', color: '#fff', padding: 'clamp(60px,9vw,108px) 0', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', bottom: -180, left: -120, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.22), rgba(236,72,153,0) 70%)', pointerEvents: 'none' }} />
            <div data-rev style={{ maxWidth: 760, margin: '0 auto', padding: '0 28px', textAlign: 'center', position: 'relative' }}>
              <div style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#C4B5FD' }}>Tu primer paso</div>
              <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.06, fontSize: 'clamp(28px,4vw,46px)', color: '#fff', margin: '12px 0 0' }}>Aquí dejas de rentar.</h2>
              <p style={{ fontFamily: 'DM Sans', fontSize: 'clamp(15px,1.9vw,18px)', color: 'rgba(255,255,255,0.78)', maxWidth: 600, margin: '14px auto 0', lineHeight: 1.6 }}>En {name}, cada mensualidad ya es tuya — y en unos años, lo que pagas hoy vale más. Tu primer patrimonio empieza aquí.</p>
              <div style={{ display: 'inline-block', marginTop: 22, padding: '10px 18px', borderRadius: 9999, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)', fontFamily: 'DM Sans', fontSize: 13.5, fontWeight: 700, color: '#FBCFE8' }}>⏳ Cada mes que sigues rentando es dinero que no vuelve. El mejor momento para empezar es hoy.</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 26 }}>
                <button type="button" onClick={() => setVer('propiedades')} className="zv2-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '15px 28px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#6366F1,#EC4899)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 12px 30px rgba(99,102,241,0.45)' }}>🏠 Ver lo que hay en {name}</button>
                <button type="button" onClick={() => setSaveOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '15px 26px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 14.5, cursor: 'pointer' }}>🔔 Avísame de algo para empezar</button>
              </div>
            </div>
          </section>
        )}
        {/* ════════ ARCO VIVIR MEJOR (mismo sistema · aspiracional: la vida que mereces) ════════ */}
        {profile === 'vivir' && S && tieneMercado && (() => {
          const cont = { maxWidth: 1000, margin: '0 auto', padding: '0 28px' };
          const giant = { fontFamily: 'Outfit', fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1.04 };
          const eyb = (c) => ({ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: c });
          const bridge = (txt, dark) => (<div style={{ marginTop: 34, fontFamily: 'DM Sans', fontSize: 'clamp(14px,1.8vw,17px)', fontWeight: 600, fontStyle: 'italic', color: dark ? 'rgba(255,255,255,0.82)' : '#4B4F66', display: 'flex', alignItems: 'center', gap: 9 }}>{txt} <span style={{ fontSize: 17, fontStyle: 'normal', color: dark ? '#F0ABFC' : '#EC4899' }}>↓</span></div>);
          const aq = ARQ[zoneArchetype(inv)] || ARQ.clasica;
          const realFotos = (Array.isArray(devs) ? devs : []).flatMap((d) => [d.hero_photo, ...((d.photos) || [])]).filter((p) => p && !/picsum|placehold|seed\//i.test(p));
          const STOCK = ['164', '1076', '1067'].map((id) => `https://picsum.photos/id/${id}/1280/760`);
          const img = (i) => (realFotos.length > i ? realFotos[i] : STOCK[i % STOCK.length]);
          const VIV = {
            premium: { t: <>A la altura de<br />donde llegaste.</>, c: (n) => <><b style={{ color: INK }}>{n}</b> es de las direcciones que dicen algo de ti: servicios, prestigio y una vida cuidada al detalle. Donde mereces estar.</> },
            clasica: { t: <>Una zona con alma,<br />para vivir bien.</>, c: (n) => <><b style={{ color: INK }}>{n}</b> tiene ese equilibrio difícil: tranquila pero viva, con todo cerca y carácter propio. Se vive a gusto y se presume.</> },
            emergente: { t: <>Lo nuevo y con onda,<br />antes que nadie.</>, c: (n) => <><b style={{ color: INK }}>{n}</b> es donde está pasando: lugares con energía fresca y vida nueva. Vivir aquí es estar en el momento.</> },
            momentum: { t: <>Una zona que sube,<br />y tú con ella.</>, c: (n) => <><b style={{ color: INK }}>{n}</b> está en su mejor momento: cada vez con más vida y mejores lugares. Vives bien hoy y aún mejor mañana.</> },
          };
          const vv = VIV[zoneArchetype(inv)] || VIV.clasica;
          return (
            <>
              {/* CAP 1 · HERO (oscuro + foto · trabajaste para llegar aquí → vive donde mereces) */}
              <section style={{ width: '100%', background: `linear-gradient(102deg, #0C0B1E 0%, rgba(12,11,30,0.95) 44%, rgba(26,24,64,0.62) 100%), url(${img(0)}) right center / cover`, color: '#fff', padding: 'clamp(58px,7.5vw,90px) 0', position: 'relative', overflow: 'hidden' }}>
                <div data-rev style={{ ...cont, position: 'relative' }}>
                  <div style={eyb('#A5B4FC')}>Vivir mejor · {name} · {aq.etiqueta}</div>
                  <h2 style={{ ...giant, fontSize: 'clamp(28px,4vw,48px)', margin: '20px 0 0', color: '#fff', maxWidth: 760 }}>
                    Trabajaste para llegar aquí.<br />
                    <span style={{ color: 'rgba(255,255,255,0.42)' }}>No tiene por qué notarse menos.</span><br />
                    Vive donde <span style={{ background: 'linear-gradient(90deg,#A5B4FC,#F0ABFC)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>mereces</span>.
                  </h2>
                  <p style={{ fontFamily: 'DM Sans', fontSize: 'clamp(15px,1.9vw,19px)', color: 'rgba(255,255,255,0.78)', maxWidth: 580, marginTop: 22, lineHeight: 1.55 }}>Tu casa dice quién eres. En {name}, una propiedad <b style={{ color: '#fff' }}>a la altura de la vida que construiste</b> — con todo lo que importa a la mano.</p>
                  {bridge('¿Por qué aquí? Déjame mostrarte', true)}
                </div>
              </section>

              {/* CAP 2 · POR QUÉ AQUÍ (claro · archetype vivir) */}
              <section style={{ width: '100%', background: '#fff', padding: 'clamp(56px,8vw,92px) 0', borderBottom: '1px solid rgba(16,18,28,0.06)' }}>
                <div data-rev style={cont}>
                  <div style={eyb('#EC4899')}>Por qué aquí</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,0.9fr)', gap: 'clamp(18px,3vw,36px)', alignItems: 'center', marginTop: 14 }}>
                    <div>
                      <h2 style={{ ...giant, fontSize: 'clamp(27px,3.8vw,44px)', color: INK }}>{vv.t}</h2>
                      <p style={{ fontFamily: 'DM Sans', fontSize: 'clamp(15px,1.9vw,18px)', color: MUT, maxWidth: 540, marginTop: 16, lineHeight: 1.6 }}>{vv.c(name)}</p>
                    </div>
                    <div className="zv2-imgz" style={{ borderRadius: 18, boxShadow: '0 18px 40px rgba(16,18,28,0.14)' }}>
                      <img src={img(1)} alt="" loading="lazy" style={{ width: '100%', height: 'clamp(180px,26vw,250px)', objectFit: 'cover', display: 'block' }} onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }} />
                    </div>
                  </div>
                  {bridge('Lo que tienes a la puerta')}
                </div>
              </section>

              {/* CAP 3 · LIFESTYLE REAL (lo mejor de la zona · Google Places) */}
              {lugares && lugares.fuente === 'google' && lugares.lugares && (() => {
                const cats = [['🍴', 'restaurante', 'Dónde comer'], ['☕', 'cafe', 'Cafés'], ['🌳', 'parque', 'Parques'], ['🛒', 'supermercado', 'El súper'], ['🏥', 'hospital', 'Salud'], ['🚇', 'transporte', 'Transporte']]
                  .map(([ic, k, l]) => [ic, l, (lugares.lugares[k] || []).filter((p) => p && p.name).slice(0, 3)]).filter(([, , a]) => a.length);
                if (!cats.length) return null;
                return (
                  <section style={{ width: '100%', background: 'linear-gradient(180deg,#FAFAFE,#F3F2FB)', padding: 'clamp(56px,8vw,92px) 0', borderBottom: '1px solid rgba(16,18,28,0.06)' }}>
                    <div data-rev style={cont}>
                      <div style={eyb('#EC4899')}>A la puerta</div>
                      <h2 style={{ ...giant, fontSize: 'clamp(27px,3.8vw,44px)', color: INK, margin: '14px 0 0' }}>Lo bueno, a la vuelta.</h2>
                      <p style={{ fontFamily: 'DM Sans', fontSize: 'clamp(15px,1.9vw,18px)', color: MUT, maxWidth: 620, marginTop: 14, lineHeight: 1.6 }}>Lo mejor de {name}, con calificación real — toca cualquiera para verlo en el mapa:</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14, marginTop: 20 }}>
                        {cats.map(([ic, l, arr]) => (
                          <div key={l} className="zv2-win" style={{ ...cardBase, padding: '16px 18px' }}>
                            <div style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13, color: INK, display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 17 }}>{ic}</span> {l}</div>
                            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {arr.map((p) => (
                                <a key={p.name} href={p.maps_uri || '#'} target="_blank" rel="noopener noreferrer" className="zv2-zlink" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, textDecoration: 'none', padding: '7px 10px', borderRadius: 9, border: '1px solid rgba(16,18,28,0.06)' }}>
                                  <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, color: '#3A3E55', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                                  {p.rating ? <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 12, color: '#0E7A53', whiteSpace: 'nowrap' }}>★{p.rating}</span> : null}
                                </a>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: '#A2A6BC', marginTop: 14, fontStyle: 'italic' }}>Lugares y calificaciones reales de Google Places.</div>
                    </div>
                  </section>
                );
              })()}

              {/* CAP 4 · A TU ALTURA (amenidades reales de los desarrollos · oscuro) */}
              {devAmen.length > 0 && (
                <section style={{ width: '100%', background: 'linear-gradient(180deg,#15132E,#0C0B1E)', color: '#fff', padding: 'clamp(56px,8vw,92px) 0' }}>
                  <div data-rev style={cont}>
                    <div style={eyb('#A5B4FC')}>A tu altura</div>
                    <h2 style={{ ...giant, fontSize: 'clamp(27px,3.8vw,44px)', color: '#fff', margin: '14px 0 0' }}>Lo que te espera<br />en casa.</h2>
                    <p style={{ fontFamily: 'DM Sans', fontSize: 'clamp(15px,1.9vw,18px)', color: 'rgba(255,255,255,0.7)', maxWidth: 600, marginTop: 14, lineHeight: 1.6 }}>Los desarrollos de {name} no son cuatro paredes — vienen con todo para vivir como mereces:</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14, marginTop: 24 }}>
                      {devAmen.map(([s, count]) => (
                        <div key={s} className="zv2-glow" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '18px 18px' }}>
                          <div style={{ fontSize: 24 }}>{AMEN_DEV[s][0]}</div>
                          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16.5, color: '#fff', marginTop: 8 }}>{AMEN_DEV[s][1]}</div>
                          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>en {count} {count === 1 ? 'desarrollo' : 'desarrollos'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {/* CAP 5 · TU SIGUIENTE NIVEL (cierre · vivir) */}
              <section style={{ width: '100%', background: 'linear-gradient(135deg,#1B1448 0%,#2A1B5E 52%,#3A1F63 100%)', color: '#fff', padding: 'clamp(60px,9vw,108px) 0', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', bottom: -180, left: -120, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.22), rgba(236,72,153,0) 70%)', pointerEvents: 'none' }} />
                <div data-rev style={{ maxWidth: 760, margin: '0 auto', padding: '0 28px', textAlign: 'center', position: 'relative' }}>
                  <div style={eyb('#C4B5FD')}>Tu siguiente nivel</div>
                  <h2 style={{ ...giant, fontSize: 'clamp(28px,4vw,46px)', color: '#fff', margin: '12px 0 0' }}>La vida que mereces<br />empieza aquí.</h2>
                  <p style={{ fontFamily: 'DM Sans', fontSize: 'clamp(15px,1.9vw,18px)', color: 'rgba(255,255,255,0.78)', maxWidth: 600, margin: '14px auto 0', lineHeight: 1.6 }}>En {name} no solo tienes dónde vivir — tienes cómo vivir. A la altura de lo que construiste.</p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 26 }}>
                    <button type="button" onClick={() => setVer('propiedades')} className="zv2-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '15px 28px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#6366F1,#EC4899)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 12px 30px rgba(99,102,241,0.45)' }}>🏠 Ver las propiedades de {name}</button>
                    <button type="button" onClick={() => setSaveOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '15px 26px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 14.5, cursor: 'pointer' }}>🔔 Avísame de algo a mi altura</button>
                  </div>
                </div>
              </section>
            </>
          );
        })()}

        {/* (auditoría · código muerto retirado) Conectividad · Lo-mejor-cerca · Cómo-empezar/crédito · Banda Atlax ·
            No-eres-el-único: eran bloques para perfiles SIN arco. Con los 4 perfiles ya rebuilt, !arcRebuilt es siempre
            false → nunca renderizaban. Su contenido vive ahora dentro del arco de cada perfil (lifestyle/herramienta/cierre). */}

        {/* (reorden espina) El VEREDICTO se movió DESPUÉS de la calculadora + riesgos (el cierre va al final del arco) */}

        {/* ── CALCULADORA INTERACTIVA (Bloque 12 · proyecto → unidad → desglose completo · reusa InvestmentSimulator) ── */}
        {profile === 'invertir' && sortedDevs.length > 0 && (
          <section id="calculadora" style={{ width: '100%', background: 'linear-gradient(180deg,#F4F5FF 0%,#EBEDFE 100%)', padding: 'clamp(50px,7vw,86px) 0', borderTop: '1px solid rgba(99,102,241,0.16)', borderBottom: '1px solid rgba(99,102,241,0.16)' }}>
            <div data-rev style={sec}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#6366F1,#EC4899)', color: '#fff', padding: '8px 18px', borderRadius: 9999, fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12.5, letterSpacing: '0.04em', boxShadow: '0 10px 24px rgba(99,102,241,0.34)' }}>🧮 Calculadora interactiva</div>
            <h2 style={{ ...chapTitle, marginTop: 16 }}>Veamos qué tan tuyo puede ser</h2>
            <p style={lead}>Elige un desarrollo y una unidad de {name}. Armamos el cálculo completo con TUS datos — tu enganche, tu crédito, lo que te deja al mes y cuánto vale en unos años.</p>
            <style>{`
              .zv2-dev{transition:transform .15s,box-shadow .15s,border-color .15s}
              .zv2-dev:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(99,102,241,.14)}
              .zv2-unit{transition:transform .15s,box-shadow .15s,border-color .15s}
              .zv2-unit:hover{transform:translateY(-3px);box-shadow:0 12px 26px rgba(99,102,241,.16);border-color:rgba(99,102,241,.45)!important}
            `}</style>
            {/* PASO 1 · tipo de inversión (decide todo el flow: 1 depa vs varios) */}
            <div style={{ marginTop: 18 }}>
              <div style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 11.5, color: '#9499AE', textTransform: 'uppercase', letterSpacing: '0.06em' }}>1 · ¿Para ti o institucional?</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                {[['individual', '👤 Para ti', 'Compras 1 departamento'], ['institucional', '🏛️ Institucional', 'Un fondo compra 2 o más']].map(([v, l, d]) => { const on = calcMode === v; return (
                  <button key={v} className="zv2-dev" type="button" onClick={() => { setCalcMode(v); setCalcUnit(null); setCalcSelUnits([]); }} style={{ padding: '11px 18px', borderRadius: 12, cursor: 'pointer', fontFamily: 'DM Sans', textAlign: 'left', border: on ? '1.5px solid transparent' : '1px solid rgba(99,102,241,0.22)', background: on ? 'linear-gradient(120deg,#6366F1,#EC4899)' : '#fff', color: on ? '#fff' : '#4B4F66', boxShadow: on ? '0 8px 20px rgba(99,102,241,.28)' : '0 2px 8px rgba(16,18,28,.04)' }}>
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
                  <button key={d.id} className="zv2-dev" type="button" onClick={() => setCalcDev(d.id)} style={{ padding: '11px 18px', borderRadius: 12, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13.5, border: on ? '1.5px solid transparent' : '1px solid rgba(99,102,241,0.22)', background: on ? 'linear-gradient(120deg,#6366F1,#EC4899)' : '#fff', color: on ? '#fff' : '#4B4F66', boxShadow: on ? '0 8px 20px rgba(99,102,241,.28)' : '0 2px 8px rgba(16,18,28,.04)' }}>{on ? '🏗️ ' : ''}{d.name}</button>
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
                      <button key={u.id} className="zv2-unit" type="button" onClick={toggle} style={{ position: 'relative', padding: '11px 12px', borderRadius: 12, cursor: 'pointer', fontFamily: 'DM Sans', textAlign: 'left', border: on ? '1.5px solid #6366F1' : '1px solid rgba(16,18,28,0.09)', background: on ? 'linear-gradient(180deg, rgba(99,102,241,0.10), #fff 70%)' : '#fff', boxShadow: on ? '0 8px 20px rgba(99,102,241,.18)' : '0 2px 8px rgba(16,18,28,.05)' }}>
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
            </div>
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
              <div style={{ position: 'absolute', bottom: -180, left: -120, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.22), rgba(99,102,241,0) 70%)', pointerEvents: 'none' }} />
              <div data-rev style={{ maxWidth: 760, margin: '0 auto', padding: '0 28px', textAlign: 'center', position: 'relative' }}>
                <div style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#A5B4FC' }}>Tu jugada</div>
                <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.06, fontSize: 'clamp(28px,4vw,46px)', color: '#fff', margin: '12px 0 0' }}>{v[0]}</h2>
                <p style={{ fontFamily: 'DM Sans', fontSize: 'clamp(15px,1.9vw,18px)', color: 'rgba(255,255,255,0.78)', maxWidth: 620, margin: '14px auto 0', lineHeight: 1.6 }}>{v[1]}</p>
                <div style={{ display: 'inline-block', marginTop: 22, padding: '10px 18px', borderRadius: 9999, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)', fontFamily: 'DM Sans', fontSize: 13.5, fontWeight: 700, color: '#A5B4FC' }}>⏳ Cada año que pasa, entrar cuesta más. El mejor momento fue ayer; el segundo, hoy.</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 26 }}>
                  <button type="button" onClick={() => setSaveOpen(true)} className="zv2-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '15px 28px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#6366F1,#818CF8)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 12px 30px rgba(99,102,241,0.45)' }}>🔔 Avísame cuando aparezca la oportunidad</button>
                  <button type="button" onClick={() => askAtlax(`Quiero invertir en ${name}. ¿Por dónde empiezo según mi objetivo (${lensCfg ? lensCfg.label : 'inversión'})?`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '15px 26px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 14.5, cursor: 'pointer' }}>🤖 Pregúntale a Atlax</button>
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 16, maxWidth: 540, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>Déjanos tu objetivo y nuestro asistente vigila {name} por ti — cuando entre algo que encaje, te lo traemos primero.</div>
              </div>
            </section>
          );
        })()}

        {/* ── DA EL PRIMER PASO (solo invertir · su embudo a propiedades tras el veredicto · los demás cierran en su arco) ── */}
        {profile === 'invertir' && (
        <section id="empezar" style={{ ...sec, marginTop: 64 }}>
          <div id="desarrollos" style={eyebrow}>{tc('Da el primer paso')}</div>
          <h2 style={{ ...chapTitle, marginBottom: 6 }}>{S.cierreTitle}</h2>
          <p style={{ ...lead, marginBottom: 18 }}>{profile === 'primera' ? `Empieza por los más accesibles de ${name}:` : profile === 'invertir' ? `Hasta aquí, los números de la zona. Elige un desarrollo para cotizarlo con los números REALES de esa unidad — tu enganche, tu crédito, tu rendimiento — y compararlo contra el promedio de ${name}.` : `Estos son los desarrollos en ${name} donde puedes empezar hoy.`}</p>
          {sortedDevs.length > 0 ? (
            <button type="button" onClick={() => setVer('propiedades')} className="zv2-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '16px 28px', borderRadius: 16, border: 'none', background: 'linear-gradient(135deg,#6366F1,#EC4899)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 15.5, cursor: 'pointer', boxShadow: '0 12px 30px rgba(99,102,241,0.34)' }}>
              🏠 Ver las {devs.length}{devs.length >= 12 ? '+' : ''} propiedades de {name} →
            </button>
          ) : (
            <div style={{ ...cardBase, padding: 24, fontFamily: 'DM Sans', fontSize: 13.5, color: '#5B5F76' }}>Aún no hay desarrollos publicados en {name}. <button type="button" onClick={() => setSaveOpen(true)} style={{ border: 'none', background: 'none', padding: 0, color: '#6366F1', fontWeight: 800, fontFamily: 'DM Sans', fontSize: 13.5, cursor: 'pointer' }}>🔔 Vigila esta zona</button> y te avisamos en cuanto entre el primero.</div>
          )}
        </section>
        )}

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
        </>)}
      </div>
      <SaveSearchModal open={saveOpen} onClose={() => setSaveOpen(false)} filters={{ colonia: [slug] }} />
      <AtlaxBubble theme="light" />
      <Footer />
    </LightScope>
  );
}
