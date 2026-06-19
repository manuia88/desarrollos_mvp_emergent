// Página de Zona v2 — NARRATIVA POR PERFIL (Hormozi/Brunson). Selector de avatar (Invertir/Familia/Primera casa/Vivir
// mejor): cada uno reescribe la historia con su dolor+sueño, sobre la MISMA data real. Default = arquetipo de la zona.
// Sistema: memory/ZONA_PAGE_NARRATIVE_SYSTEM.md · Reúsa /inversion + landing + developments + similar.
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { LightScope, PublicNav, Footer } from '../../components/ui';
import AtlaxBubble from '../../components/landing/AtlaxBubble';
import DevelopmentCard from '../../components/marketplace/DevelopmentCard';
import SaveSearchModal from '../../components/marketplace/SaveSearchModal';
import { tc } from '../../lib/titleCase';

// Abre Atlax con una pregunta sembrada (reusa el bus 'atlax:open' que ya escucha AtlaxBubble) → cierra a lead.
const askAtlax = (query) => { try { window.dispatchEvent(new CustomEvent('atlax:open', { detail: { query } })); } catch { /* noop */ } };

const API = process.env.REACT_APP_BACKEND_URL;
const m1 = (n) => `$${(n / 1e6).toFixed(1)}M`;
const k = (n) => `$${Math.round(n / 1000).toLocaleString('es-MX')}k`;
const get = async (u) => { try { const r = await fetch(API + u); return r.ok ? await r.json() : null; } catch { return null; } };

const INK = '#16182A';
const MUT = '#5B5F76';
const cardBase = { background: '#fff', border: '1px solid rgba(16,18,28,0.07)', borderRadius: 22, boxShadow: '0 18px 50px rgba(99,102,241,0.08), 0 2px 8px rgba(16,18,28,0.04)' };
const eyebrow = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 800, background: 'linear-gradient(90deg,#6D4AFF,#C026D3)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };
const chapTitle = { fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(25px,3.4vw,36px)', color: INK, letterSpacing: '-0.025em', margin: '8px 0 0', lineHeight: 1.1 };
const lead = { fontFamily: 'DM Sans', fontSize: 16, color: MUT, lineHeight: 1.6, marginTop: 12, maxWidth: 640 };
const grad = { background: 'linear-gradient(120deg,#6D4AFF,#C026D3)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };

const PROFILES = [
  { k: 'invertir', label: 'Invertir', e: '📈' },
  { k: 'familia', label: 'Para mi familia', e: '👨‍👩‍👧' },
  { k: 'primera', label: 'Mi primera casa', e: '🏠' },
  { k: 'vivir', label: 'Vivir mejor', e: '✨' },
];
// amenidades reales (denue_zone_density.by_category, OSM) → etiqueta humana
const CATS = [
  ['restaurante', '🍴', 'restaurantes'], ['cafe', '☕', 'cafés'], ['bar', '🍷', 'bares'],
  ['recreacion', '🌳', 'parques y recreación'], ['escuela', '🏫', 'escuelas'], ['hospital', '🏥', 'hospitales'],
  ['farmacia', '💊', 'farmacias'], ['mercado', '🛒', 'mercados y tiendas'], ['banco', '🏦', 'bancos'],
  ['transporte', '🚇', 'puntos de transporte'], ['gimnasio', '🏋️', 'gimnasios'],
];

// Copy por perfil — dolor + sueño, sobre la misma data real (specific, no genérico)
function buildStories(name, inv) {
  const plus = inv.plusvalia_anual_pct;
  const g5 = inv.ganancia_5y_pct;
  const pmin = m1(inv.precio_min);
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
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [saveOpen, setSaveOpen] = useState(false);  // modal "Vigila esta zona" (watch + casamentera → lead)

  useEffect(() => {
    let alive = true; setLoading(true);
    Promise.all([
      get(`/api/zona/${slug}/inversion`),
      get(`/api/public/landing/colonia/${slug}`),
      get(`/api/developments?colonia=${slug}&limit=12`),
      get(`/api/colonias-similar/${slug}`),
      get(`/api/zona/${slug}/vida`),
    ]).then(([i, l, d, s, v]) => {
      if (!alive) return;
      setInv(i); setLanding(l); setVida(v);
      setDevs(Array.isArray(d) ? d : []);
      setSimilar((s && Array.isArray(s.similar)) ? s.similar : []);
      // default = arquetipo de la zona (del dato)
      const pm2 = (i && i.precio_m2) || 0; const pl = (i && i.plusvalia_anual_pct) || 0;
      const def = pm2 >= 85000 ? 'vivir' : pm2 > 0 && pm2 < 42000 ? 'primera' : pl >= 7 ? 'invertir' : 'familia';
      setProfile(def);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [slug]);

  const name = (landing && landing.name) || tc((slug || '').replace(/-/g, ' '));
  const alcaldia = landing && landing.alcaldia;
  const tier = landing && landing.tier;
  const comparables = (landing && landing.comparable_zones) || [];
  const plus = inv && inv.plusvalia_anual_pct;
  const sec = { maxWidth: 1080, margin: '0 auto', padding: '0 24px' };
  const Q = ({ t }) => (<span className="tip" style={{ position: 'relative' }}><span className="tip-q" style={{ color: '#6366F1' }}>?</span><span className="tip-box">{t}</span></span>);

  const stories = (inv && inv.precio_prom) ? buildStories(name, inv) : null;
  const S = stories ? stories[profile || 'invertir'] : null;

  return (
    <LightScope>
      <style>{`
        @keyframes zv2up { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:none } }
        .zv2-up { animation: zv2up .55s cubic-bezier(.2,.8,.2,1) both }
        .zv2-cta { transition: transform .18s, box-shadow .18s }
        .zv2-cta:hover { transform: translateY(-2px); box-shadow: 0 14px 32px rgba(124,92,255,.42) }
        .zv2-win { transition: transform .22s cubic-bezier(.2,.8,.2,1), box-shadow .22s }
        .zv2-win:hover { transform: translateY(-3px); box-shadow: 0 22px 48px rgba(99,102,241,.14) }
        .zv2-zlink { transition: transform .18s, box-shadow .18s, border-color .18s }
        .zv2-zlink:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(99,102,241,.16); border-color: rgba(99,102,241,.45) !important }
        .zv2-pf { transition: all .16s ease; cursor:pointer }
        .zv2-pf:hover { border-color: rgba(99,102,241,.5) !important }
      `}</style>
      <PublicNav />
      <div data-testid="zona-v2" style={{ minHeight: '100vh', paddingBottom: 80, color: INK }}>

        {/* ───── HOOK + selector de perfil ───── */}
        <section style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(180deg,#FAF9FF 0%,#FFFFFF 94%)' }}>
          <div style={{ position: 'absolute', top: -130, right: -70, width: 480, height: 480, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,92,255,0.20), rgba(124,92,255,0) 70%)', filter: 'blur(22px)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: 30, left: -110, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(192,38,211,0.13), rgba(192,38,211,0) 70%)', filter: 'blur(22px)', pointerEvents: 'none' }} />
          <div style={{ ...sec, position: 'relative', paddingTop: 24, paddingBottom: 36 }}>
            <Link to="/marketplace" style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: '#6B6F86', textDecoration: 'none', fontWeight: 600 }}>← Volver al marketplace</Link>
            <div style={{ ...eyebrow, fontSize: 12, marginTop: 16 }}>{alcaldia ? tc(alcaldia) : 'CDMX'}{tier ? ` · ${tc(tier)}` : ''} · {name}</div>

            {/* Selector de perfil */}
            {S && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: '#8A8FA6', alignSelf: 'center', fontWeight: 600 }}>¿Para qué ves {name}?</span>
                {PROFILES.map((p) => {
                  const on = p.k === profile;
                  return (
                    <button key={p.k} type="button" onClick={() => setProfile(p.k)} className="zv2-pf"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9999, border: `1px solid ${on ? 'transparent' : 'rgba(16,18,28,0.14)'}`, background: on ? 'linear-gradient(135deg,#6D4AFF,#C026D3)' : '#fff', color: on ? '#fff' : '#4B4F66', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5 }}>
                      {p.e} {p.label}
                    </button>
                  );
                })}
              </div>
            )}

            {S ? (
              <div key={profile} className="zv2-up" style={{ marginTop: 18, maxWidth: 780 }}>
                <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(34px,5.4vw,58px)', letterSpacing: '-0.035em', color: INK, margin: 0, lineHeight: 1.04 }}>
                  {S.hookA} <span style={grad}>{S.hookB}</span>
                </h1>
                <p style={{ ...lead, fontSize: 17, marginTop: 16, maxWidth: 700 }}>{S.sub}</p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 22 }}>
                  <a href="#empezar" className="zv2-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '13px 24px', borderRadius: 14, textDecoration: 'none', background: 'linear-gradient(135deg,#6D4AFF,#C026D3)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 14.5, boxShadow: '0 10px 26px rgba(124,92,255,0.34)' }}>{S.cta}</a>
                  <button type="button" onClick={() => askAtlax(`Cuéntame de ${name}: ¿me conviene para ${(PROFILES.find((p) => p.k === profile) || {}).label || 'vivir o invertir'}? Precios, plusvalía y cómo se vive.`)} className="zv2-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '13px 22px', borderRadius: 14, border: '1px solid rgba(99,102,241,0.3)', background: '#fff', color: '#6D28D9', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>🤖 Pregúntale a Atlax</button>
                  <button type="button" onClick={() => setSaveOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '13px 22px', borderRadius: 14, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(255,255,255,0.7)', color: '#6D28D9', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>🔔 Vigila esta zona</button>
                </div>
              </div>
            ) : (
              <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(34px,5.4vw,58px)', color: INK, marginTop: 14 }}>{name}</h1>
            )}
          </div>
        </section>

        {loading ? (
          <section style={{ ...sec, marginTop: 28 }}><div style={{ ...cardBase, padding: 30, textAlign: 'center', color: '#8A8FA6', fontFamily: 'DM Sans' }}>Cargando la historia de {name}…</div></section>
        ) : !S ? (
          <section style={{ ...sec, marginTop: 28 }}><div style={{ ...cardBase, padding: 30, color: '#8A8FA6', fontFamily: 'DM Sans' }}>Aún estamos reuniendo los datos de {name}.</div></section>
        ) : (
        <>
        {/* ───── LA VIDA AQUÍ (amenidades reales, narrado por perfil) ───── */}
        {vida && vida.amenidades && Object.keys(vida.amenidades).length > 0 && (() => {
          const am = vida.amenidades;
          const shown = CATS.filter(([key]) => (am[key] || 0) > 0);
          const intro = profile === 'familia'
            ? `Para tu familia, todo a la mano: ${am.escuela || 0} escuelas, ${am.hospital || 0} hospitales y ${am.recreacion || 0} espacios de recreación cerca. El barrio donde crecen, no solo cuatro paredes.`
            : profile === 'vivir'
              ? `La vida buena, caminando: ${am.restaurante || 0} restaurantes, ${am.cafe || 0} cafés y ${am.bar || 0} bares a tu alrededor. Aquí no manejas para vivir bien — sales por la puerta.`
              : profile === 'primera'
                ? `No compras un depto aislado: compras un barrio vivo, con ${am.restaurante || 0} restaurantes, ${am.cafe || 0} cafés y todo lo que necesitas a unos pasos.`
                : `Lo que hace que la gente quiera vivir aquí — y por eso renta y se revaloriza: ${am.restaurante || 0} restaurantes, ${am.escuela || 0} escuelas, ${am.hospital || 0} hospitales y mucho más, todo cerca.`;
          return (
            <section id="vida" key={`vida-${profile}`} className="zv2-up" style={{ ...sec, marginTop: 54 }}>
              <div style={eyebrow}>{tc('La vida aquí')}</div>
              <h2 style={chapTitle}>{S.vidaTitle}</h2>
              <p style={lead}>{intro}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px,1fr))', gap: 12, marginTop: 18 }}>
                {shown.map(([key, e, label]) => (
                  <div key={key} className="zv2-win" style={{ ...cardBase, padding: '16px 18px' }}>
                    <div style={{ fontSize: 22 }}>{e}</div>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 27, color: INK, letterSpacing: '-0.02em', marginTop: 4 }}>{am[key]}</div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: MUT, marginTop: 1 }}>{label}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: '#A2A6BC', marginTop: 12, fontStyle: 'italic' }}>negocios y lugares reales mapeados en la zona (OpenStreetMap)</div>
            </section>
          );
        })()}

        {/* ───── VALUE STACK (3 formas de ganar) ───── */}
        <section id="dinero" key={`stack-${profile}`} className="zv2-up" style={{ ...sec, marginTop: 54 }}>
          <div style={eyebrow}>{tc('Por qué tiene sentido')}</div>
          <h2 style={chapTitle}>{S.stackTitle}</h2>
          <p style={lead}>{S.stackIntro}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 22 }}>
            {[
              { n: 1, h: 'Sube de valor — solo.', big: `+${plus}%`, c: '#0E9F6E',
                copy: <>Cada año tu propiedad vale más. Un depto de {m1(inv.precio_prom)} se aprecia <b>~${Math.round((inv.plusvalia_anual_abs || 0) / 1000).toLocaleString('es-MX')}k al año</b> — sin que muevas un dedo.</> },
              { n: 2, h: 'Y te paga mientras la tienes.', big: inv.cap_rate_anual_pct != null ? `${inv.cap_rate_anual_pct}%` : '—', c: '#C026D3',
                copy: <>Si la rentas, te deja <b>~${(inv.renta_prom || 0).toLocaleString('es-MX')}/mes</b>. Un cap rate de {inv.cap_rate_anual_pct}% <Q t="Cap rate: lo que rinde la propiedad por su renta (NOI ÷ precio), sin importar cómo la pagues. No incluye la plusvalía." /> — lo que rinde cada año solo por rentarla.</> },
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

        {/* ───── CÓMO EMPEZAR (precio + crédito) ───── */}
        <section key={`cobrar-${profile}`} style={{ ...sec, marginTop: 58 }}>
          <div style={eyebrow}>{tc('Cómo empezar')}</div>
          <h2 style={chapTitle}>{S.cobrarTitle}</h2>
          <p style={lead}>{S.cobrarCopy}</p>
          {inv.credito && inv.credito.escenarios && (
            <div style={{ ...cardBase, padding: 22, marginTop: 18 }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: '#A2A6BC' }}>sobre ~{m1(inv.credito.valor_inmueble)} · a {inv.credito.plazo_anios} años · tasa prom {inv.credito.tasa_prom_pct}%</div>
              <div style={{ display: 'flex', fontFamily: 'DM Sans', fontSize: 9.5, color: '#A2A6BC', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 12, paddingBottom: 6, borderBottom: '1px solid rgba(16,18,28,0.1)' }}>
                <span style={{ flex: '0 0 92px' }}>crédito</span><span style={{ flex: 1, textAlign: 'right' }}>te prestan</span><span style={{ flex: 1, textAlign: 'right' }}>al mes</span><span style={{ flex: 1, textAlign: 'right' }}>pagas en total</span>
              </div>
              {inv.credito.escenarios.map((e) => (
                <div key={e.aforo} style={{ display: 'flex', alignItems: 'baseline', fontFamily: 'DM Sans', fontSize: 13, padding: '9px 0', borderTop: '1px solid rgba(16,18,28,0.05)' }}>
                  <span style={{ flex: '0 0 92px', fontWeight: 800, color: INK }}>{e.aforo}% a crédito</span>
                  <span style={{ flex: 1, textAlign: 'right', color: '#4B4F66' }}>{m1(e.prestamo)}</span>
                  <span style={{ flex: 1, textAlign: 'right', color: '#4B4F66' }}>{k(e.pago)}</span>
                  <span style={{ flex: 1, textAlign: 'right', fontWeight: 800, color: '#C026D3' }}>{m1(e.total)}</span>
                </div>
              ))}
              <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: '#A2A6BC', marginTop: 10, fontStyle: 'italic' }}>Solo informativo. Va con la tasa (el CAT real, con seguros y comisiones, es mayor). Tu pago final lo define el banco según tu perfil.</div>
            </div>
          )}
        </section>

        {/* ───── NO ERES EL ÚNICO ───── */}
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

        {/* ───── BANDA ATLAX (2º punto de conversión → lead) ───── */}
        <section style={{ ...sec, marginTop: 60 }}>
          <div style={{ ...cardBase, padding: '30px 32px', background: 'linear-gradient(135deg, rgba(124,92,255,0.08), rgba(192,38,211,0.06))', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(22px,3vw,30px)', color: INK, letterSpacing: '-0.02em' }}>¿Te queda una duda sobre {name}?</div>
            <p style={{ fontFamily: 'DM Sans', fontSize: 15, color: MUT, marginTop: 8, maxWidth: 540, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.55 }}>Pregúntale a <b>Atlax</b> — conoce los precios, la plusvalía, la vida y los desarrollos de {name}. Te responde al instante.</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 18 }}>
              {[
                `¿${name} me conviene para ${(PROFILES.find((p) => p.k === profile) || {}).label || 'vivir'}?`,
                `¿Cuánto necesito para comprar en ${name}?`,
                comparables[0] ? `¿${name} o ${comparables[0].name}?` : `¿Cómo se vive en ${name}?`,
              ].map((q, i) => (
                <button key={i} type="button" onClick={() => askAtlax(q)} className="zv2-zlink" style={{ ...cardBase, padding: '11px 18px', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, color: '#4B4F66', cursor: 'pointer', border: '1px solid rgba(99,102,241,0.18)' }}>{q}</button>
              ))}
            </div>
          </div>
        </section>

        {/* ───── DA EL PRIMER PASO ───── */}
        <section id="empezar" key={`cierre-${profile}`} style={{ ...sec, marginTop: 64 }}>
          <div id="desarrollos" style={eyebrow}>{tc('Da el primer paso')}</div>
          <h2 style={{ ...chapTitle, marginBottom: 6 }}>{S.cierreTitle}</h2>
          <p style={{ ...lead, marginBottom: 18 }}>Estos son los desarrollos en {name} donde puedes empezar hoy.</p>
          {devs.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
              {devs.map((d, i) => <DevelopmentCard key={d.id} dev={d} index={i} />)}
            </div>
          ) : (
            <div style={{ ...cardBase, padding: 24, fontFamily: 'DM Sans', fontSize: 13.5, color: '#5B5F76' }}>Aún no hay desarrollos publicados en {name}. <button type="button" onClick={() => setSaveOpen(true)} style={{ border: 'none', background: 'none', padding: 0, color: '#6D4AFF', fontWeight: 800, fontFamily: 'DM Sans', fontSize: 13.5, cursor: 'pointer' }}>🔔 Vigila esta zona</button> y te avisamos en cuanto entre el primero.</div>
          )}
        </section>

        {/* ───── FUENTES ───── */}
        <section style={{ ...sec, marginTop: 46 }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: '#A2A6BC', lineHeight: 1.6, borderTop: '1px solid rgba(16,18,28,0.06)', paddingTop: 18 }}>
            Valor y rentabilidad estimados por el motor de inversión de DesarrollosMX (AVM + tasas Banxico) sobre los
            desarrollos reales de la zona. Cifras informativas, no asesoría financiera. Próximamente: cómo se vive
            (amenidades, transporte, escuelas, seguridad) y "pregúntale a Atlax sobre {name}".
          </div>
        </section>
        </>
        )}
      </div>
      {/* Vigila esta zona → guarda búsqueda de la colonia (casamentera + lead). Reúsa SaveSearchModal. */}
      <SaveSearchModal open={saveOpen} onClose={() => setSaveOpen(false)} filters={{ colonia: [slug] }} />
      <AtlaxBubble theme="light" />
      <Footer />
    </LightScope>
  );
}
