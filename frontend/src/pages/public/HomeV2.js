import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LightScope, Container, Section, Button, Card, Badge, PublicNav, Aurora } from '../../components/ui';
import FadeUp from '../../components/animations/FadeUp';
import AtlaxBubble from '../../components/landing/AtlaxBubble';
import { COLONIAS } from '../../data/colonias';

/**
 * Home V2 — lenguaje editorial de nistora, CLARO + nuestro morado + auroras + data real.
 * Granularidad real conectada al backend (4 agentes Opus):
 *  · Tarjetas de tipo → /marketplace?tipo=dept|casa / ?stage=preventa|entrega_inmediata (filtros reales).
 *  · Explora por ALCALDÍA → colonias de esa alcaldía → /marketplace?colonia=<slug> (cable arreglado).
 *  · Fichas de colonia ricas (trío de métricas en degradado + momentum + calidad + sparkline + footer).
 * Imágenes Unsplash = placeholders. Preview /v2.
 */
const HEAD = "'Outfit',sans-serif";
const SERIF = { fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic', fontWeight: 600 };
const GRAD = { background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };
const IMG = (id, w = 800) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

const PILL = { borderRadius: 999 };
const h1 = { fontFamily: HEAD, fontWeight: 600, fontSize: 'clamp(46px,7vw,92px)', lineHeight: 1.0, letterSpacing: -2.5, margin: 0 };
const h2 = { fontFamily: HEAD, fontWeight: 600, fontSize: 'clamp(34px,5vw,62px)', lineHeight: 1.04, letterSpacing: -1.6, margin: 0 };
const lead = { fontSize: 'clamp(16px,1.6vw,19px)', color: 'var(--cream-2)', lineHeight: 1.65 };
const Eyebrow = ({ children, center }) => (
  <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 2.4, textTransform: 'uppercase', color: 'var(--cream-3)', marginBottom: 18, textAlign: center ? 'center' : 'left' }}>{children}</div>
);

const HERO_IMG = IMG('photo-1600596542815-ffad4c1539a9', 1000);
const FACES = ['photo-1500648767791-00dcc994a43e', 'photo-1494790108377-be9c29b29330', 'photo-1507003211169-0a1dd7228f2d'];
// Tarjetas de TIPO → URL con filtro REAL del backend (verificado: tipo / stage)
const TYPES = [
  { t: 'Departamentos', to: '/marketplace?tipo=dept', img: IMG('photo-1502672260266-1c1ef2d93688', 600) },
  { t: 'Casas', to: '/marketplace?tipo=casa', img: IMG('photo-1600585154340-be6161a56a0c', 600) },
  { t: 'Preventa', to: '/marketplace?stage=preventa', img: IMG('photo-1486406146926-c627a92ad1ab', 600) },
  { t: 'Entrega Inmediata', to: '/marketplace?stage=entrega_inmediata', img: IMG('photo-1512917774080-9991f1c4c750', 600) },
];
// Foto por colonia (placeholder)
const COL_IMG = {
  'polanco': IMG('photo-1605146769289-440113cc3d00', 700), 'roma-norte': IMG('photo-1551361415-69c87624334f', 700),
  'condesa': IMG('photo-1518105779142-d975f22f1b0a', 700), 'del-valle-centro': IMG('photo-1566073771259-6a8506099945', 700),
  'juarez': IMG('photo-1502672260266-1c1ef2d93688', 700), 'narvarte-poniente': IMG('photo-1493809842364-78817add7ffb', 700),
  'lomas-chapultepec': IMG('photo-1564013799919-ab600027ffc6', 700), 'napoles': IMG('photo-1545324418-cc1a3fa10c00', 700),
  'coyoacan-centro': IMG('photo-1512917774080-9991f1c4c750', 700), 'santa-fe': IMG('photo-1486406146926-c627a92ad1ab', 700),
  'escandon': IMG('photo-1560448204-e02f11c3d0e2', 700), 'anzures': IMG('photo-1600585154340-be6161a56a0c', 700),
  'roma-sur': IMG('photo-1551361415-69c87624334f', 700), 'cuauhtemoc': IMG('photo-1518105779142-d975f22f1b0a', 700),
  'doctores': IMG('photo-1493809842364-78817add7ffb', 700), 'jardines-del-pedregal': IMG('photo-1564013799919-ab600027ffc6', 700),
};
const COL_FALLBACK = IMG('photo-1518105779142-d975f22f1b0a', 700);
// Las 16 alcaldías de CDMX (orden alfabético). Activas = las que tienen colonias con dato hoy.
const ALCALDIAS_16 = ['Álvaro Obregón', 'Azcapotzalco', 'Benito Juárez', 'Coyoacán', 'Cuajimalpa', 'Cuauhtémoc', 'Gustavo A. Madero', 'Iztacalco', 'Iztapalapa', 'Magdalena Contreras', 'Miguel Hidalgo', 'Milpa Alta', 'Tláhuac', 'Tlalpan', 'Venustiano Carranza', 'Xochimilco'];
const SERVICES = [
  ['🚶', 'Todo a la Mano', 'Súper, café, escuelas y hospitales a pie de tu casa.'],
  ['🛡️', 'Zona Tranquila', 'Qué tan segura es la colonia, según datos reales — no rumores.'],
  ['📈', 'Aquí Tu Dinero Crece', 'Si el precio de la zona viene subiendo o se estancó.'],
  ['🚇', 'Llegas a Todo Rápido', 'Metro, Metrobús y vialidades cerca; menos tráfico.'],
];
const STEPS = [
  ['1', 'Busca Tu Colonia', 'Escribe dónde quieres vivir y mira cómo se vive ahí, en palabras claras.'],
  ['2', 'Compara con Datos', 'Seguridad, plusvalía y servicios de cada zona, lado a lado.'],
  ['3', 'Visita y Decide', 'Un asesor experto te acompaña a las visitas y con tu crédito.'],
];
const TESTIMONIALS = [
  { n: 'Mariana G.', r: 'Compradora · Condesa', q: 'Supe que la colonia era segura y que iba a subir de precio antes de ofertar. Compré tranquila.' },
  { n: 'Carlos D.', r: 'Asesor · Polanco', q: 'Le explico al cliente cómo se vive en la zona en la primera visita. Cierro más rápido.' },
  { n: 'Grupo Vértice', r: 'Desarrolladora', q: 'Vemos qué tan rápido se vende cada zona vs la competencia. Decidimos precio con el mercado.' },
];
const FAQ = [
  ['¿El Reporte de la Colonia Tiene Costo?', 'No. Empiezas gratis y sin registro. Solo pagas si contratas servicios premium.'],
  ['¿De Dónde Sale la Información?', 'De fuentes oficiales: seguridad, valor del suelo, plusvalía, riesgo de sismo e inundación, y servicios cercanos. Lo juntamos y te lo decimos en palabras claras.'],
  ['¿Solo Venden Vivienda Nueva?', 'Sí — preventa y entrega inmediata de desarrolladores verificados en CDMX.'],
  ['¿Es Para Compradores Primerizos?', 'Sí. Te explicamos todo sin tecnicismos y te acompañamos hasta las llaves.'],
];
const ALLIES = ["Christie's", "Sotheby's", 'Lamudi', 'Propiedades.com', 'Habimetro'];

// ── Helpers de ficha de colonia (data real, lenguaje de beneficio) ──
const AXIS = { vida: ['Mucha Vida', '🌿'], movilidad: ['Llegas Rápido', '🚇'], seguridad: ['Tranquila', '🛡️'], comercio: ['Todo a la Mano', '🛍️'], plusvalia: ['Tu Dinero Crece', '📈'], educacion: ['Buenas Escuelas', '🎓'] };
const TIER_ES = { Premium: 'Premium', Luxury: 'Lujo', Trendy: 'De Moda', Emerging: 'En Ascenso', Revival: 'Renaciendo', Central: 'Céntrica', 'Up-and-coming': 'Promesa', Established: 'Consolidada', Family: 'Familiar', Bohemian: 'Bohemia' };
function topAxes(scores, n = 3) {
  return Object.entries(AXIS).map(([k, [label, ic]]) => [scores[k] || 0, label, ic]).sort((a, b) => b[0] - a[0]).slice(0, n);
}
function quality(scores) {
  const keys = ['vida', 'movilidad', 'seguridad', 'comercio', 'plusvalia', 'educacion'];
  const avg = keys.reduce((s, k) => s + (scores[k] || 0), 0) / keys.length;
  if (avg >= 87) return ['A', 'Excelente', 'var(--ok,#1FA06A)'];
  if (avg >= 80) return ['B', 'Muy Buena', 'var(--theme)'];
  if (avg >= 72) return ['C', 'Buena', 'var(--warm,#E2982E)'];
  return ['D', 'Media', 'var(--cream-3)'];
}
function Sparkline({ trend, up }) {
  const w = 128, h = 34, min = Math.min(...trend), max = Math.max(...trend), range = max - min || 1;
  const pts = trend.map((v, i) => `${(i / (trend.length - 1)) * w},${h - ((v - min) / range) * (h - 6) - 3}`);
  const col = up ? 'var(--ok,#1FA06A)' : 'var(--theme)';
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: h, display: 'block' }} preserveAspectRatio="none">
      <path d={`M${pts.join(' L')} L${w},${h} L0,${h} Z`} fill={col} opacity="0.12" />
      <path d={`M${pts.join(' L')}`} fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ColoniaCard({ c }) {
  const [ql, qw, qc] = quality(c.scores);
  const trio = topAxes(c.scores);
  const up = c.momentumPositive;
  return (
    <Link to={`/marketplace?colonia=${encodeURIComponent(c.key)}`} className="dmx-glow"
      style={{ textDecoration: 'none', display: 'block', borderRadius: 22, overflow: 'hidden', background: '#fff', border: '1px solid var(--card-border)' }}>
      {/* Foto + overlay claro + nombre en tinta + calidad + momentum */}
      <div className="dmx-photo" style={{ position: 'relative', aspectRatio: '16/10' }}>
        <img src={COL_IMG[c.key] || COL_FALLBACK} alt={c.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(255,255,255,0.94) 8%, rgba(255,255,255,0) 50%)' }} />
        {c.tier && <span style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(255,255,255,0.92)', color: 'var(--theme)', fontFamily: HEAD, fontWeight: 700, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, borderRadius: 999, padding: '4px 10px' }}>{TIER_ES[c.tier] || c.tier}</span>}
        <span style={{ position: 'absolute', top: 12, right: 12, background: up ? 'var(--ok,#1FA06A)' : 'var(--theme)', color: '#fff', fontFamily: HEAD, fontWeight: 800, fontSize: 12, borderRadius: 999, padding: '4px 10px' }}>{up ? '▲' : '▼'} {c.momentum}</span>
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 21, color: 'var(--cream)', lineHeight: 1 }}>{c.name}</div>
            <div style={{ fontSize: 12, color: 'var(--cream-3)' }}>{c.alcaldia}</div>
          </div>
          <span title={`Calidad de Zona: ${qw}`} style={{ flexShrink: 0, width: 38, height: 38, borderRadius: '50%', border: `2px solid ${qc}`, color: qc, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: HEAD, fontWeight: 800, fontSize: 16 }}>{ql}</span>
        </div>
      </div>
      {/* Trío de métricas con número en degradado */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid var(--card-border)' }}>
        {trio.map(([score, label, ic], i) => (
          <div key={label} style={{ padding: '12px 8px', textAlign: 'center', borderRight: i < 2 ? '1px solid var(--card-border)' : 'none' }}>
            <div style={{ fontSize: 15, marginBottom: 2 }}>{ic}</div>
            <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 19, ...GRAD }}>{score}</div>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: 'var(--cream-3)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
      {/* Sparkline plusvalía + endpoints */}
      <div style={{ padding: '12px 16px 4px' }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--cream-3)', marginBottom: 4 }}>Plusvalía · 2 Años</div>
        <Sparkline trend={c.trend} up={up} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--cream-3)', marginTop: 2 }}>
          <span>${c.trend[0]}k</span><span style={{ color: up ? 'var(--ok,#1FA06A)' : 'var(--cream-2)', fontWeight: 700 }}>→ ${c.trend[c.trend.length - 1]}k/m²</span>
        </div>
      </div>
      {/* Footer: precio/m² + inventario + flecha */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 16px' }}>
        <div style={{ display: 'flex', gap: 22 }}>
          <div><div style={{ fontSize: 9.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Desde</div><div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15 }}>{c.priceM2}/m²</div></div>
          <div><div style={{ fontSize: 9.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Inventario</div><div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15 }}>{c.inventory}</div></div>
        </div>
        <span style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--grad)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>→</span>
      </div>
    </Link>
  );
}

export default function HomeV2() {
  const nav = useNavigate();
  const [zona, setZona] = useState('');
  const [faq, setFaq] = useState(0);
  const go = () => nav(`/marketplace${zona ? `?colonia=${encodeURIComponent(zona)}` : ''}`);
  // Abre Atlax (la IA, ya viva en /api/atlax/query) sembrando la pregunta del hero.
  const askAI = () => window.dispatchEvent(new CustomEvent('atlax:open', { detail: { query: zona || '' } }));

  // Colonias agrupadas por alcaldía (data real) — para el explorador Alcaldía → Colonias.
  const byAlc = COLONIAS.reduce((m, c) => { (m[c.alcaldia] = m[c.alcaldia] || []).push(c); return m; }, {});
  const activeAlcaldias = ALCALDIAS_16.filter((a) => byAlc[a]);
  const [alc, setAlc] = useState(activeAlcaldias.includes('Cuauhtémoc') ? 'Cuauhtémoc' : activeAlcaldias[0]);

  return (
    <LightScope>
      <style>{`
        @keyframes dmxTicker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        .dmx-photo{overflow:hidden}
        .dmx-photo img{transition:transform .6s cubic-bezier(.22,1,.36,1)}
        .dmx-photo:hover img{transform:scale(1.06)}
        .dmx-glow{transition:transform .3s ease, box-shadow .3s ease, border-color .3s ease}
        .dmx-glow:hover{transform:translateY(-5px); box-shadow:0 20px 48px rgba(var(--theme-rgb),.16); border-color:rgba(var(--theme-rgb),.30)}
        .dmx-type:hover .dmx-arrow{background:var(--theme); color:#fff}
      `}</style>
      <PublicNav />

      {/* HERO */}
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <Aurora intensity={0.95} />
        <Container style={{ position: 'relative' }}>
          <Section py={48}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.08fr) minmax(0,0.92fr)', gap: 48, alignItems: 'center' }}>
              <FadeUp>
                <Eyebrow>Vivienda Nueva en la Ciudad de México</Eyebrow>
                <h1 style={h1}>Encuentra Tu <span style={{ ...SERIF, ...GRAD }}>Hogar</span> Ideal.</h1>
                <p style={{ ...lead, margin: '22px 0 28px', maxWidth: 500 }}>
                  Vivienda nueva verificada — y por primera vez, sabes <b style={{ color: 'var(--cream)' }}>cómo se vive en cada colonia</b> antes de mudarte.
                </p>
                <div style={{ background: '#fff', border: '1px solid var(--card-border)', borderRadius: 18, boxShadow: '0 16px 44px rgba(var(--theme-rgb),0.14)', padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', maxWidth: 560 }}>
                  <input value={zona} onChange={(e) => setZona(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()}
                    placeholder="¿En Qué Colonia Quieres Vivir?"
                    style={{ flex: 1, minWidth: 160, border: 'none', outline: 'none', background: 'transparent', fontFamily: "'DM Sans',sans-serif", fontSize: 15.5, color: 'var(--cream)', padding: '10px 12px' }} />
                  <Button size="lg" onClick={go} style={PILL}>Buscar</Button>
                </div>
                {/* Acceso a la IA (Atlax, ya viva) — convierte el hero en buscador conversacional */}
                <button onClick={askAI} style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(var(--theme-rgb),0.08)', border: '1px solid rgba(var(--theme-rgb),0.22)', color: 'var(--theme)', borderRadius: 999, padding: '9px 16px', fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  ✨ O pregúntale a la IA: "¿Dónde me conviene vivir?"
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 28 }}>
                  <div style={{ display: 'flex' }}>
                    {FACES.map((f, i) => <img key={f} src={IMG(f, 80)} alt="" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff', marginLeft: i ? -12 : 0 }} />)}
                  </div>
                  <div>
                    <div style={{ color: 'var(--warm,#E2982E)', fontSize: 14, letterSpacing: 1 }}>★★★★★</div>
                    <div style={{ fontSize: 13, color: 'var(--cream-3)' }}>Compradores que eligieron con datos</div>
                  </div>
                </div>
              </FadeUp>

              <FadeUp delay={0.12}>
                <div className="dmx-photo" style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', aspectRatio: '4/5', boxShadow: '0 40px 90px rgba(var(--theme-rgb),0.22)' }}>
                  <img src={HERO_IMG} alt="Hogar nuevo en CDMX" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', borderRadius: 16, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 15 }}>Roma Norte</span>
                      <Badge tone="green" size="xs">● En Vivo</Badge>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {['Todo a la Mano', 'Mucha Vida', 'Tu Dinero Crece'].map((b) => (
                        <span key={b} style={{ fontSize: 11, fontWeight: 700, color: 'var(--theme)', background: 'rgba(var(--theme-rgb),0.10)', borderRadius: 999, padding: '4px 9px' }}>{b}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </FadeUp>
            </div>
          </Section>
        </Container>
      </div>

      {/* TICKER */}
      <div style={{ borderTop: '1px solid var(--card-border)', borderBottom: '1px solid var(--card-border)', overflow: 'hidden', padding: '12px 0' }}>
        <div style={{ display: 'flex', gap: 40, whiteSpace: 'nowrap', width: 'max-content', animation: 'dmxTicker 36s linear infinite' }}>
          {[...Array(2)].flatMap(() => ['Roma Norte · Mucha Vida', 'Polanco · Tu Dinero Crece', 'Condesa · Todo a la Mano', 'Del Valle · Más Tranquila', 'Juárez · Subiendo Fuerte', 'Nápoles · 12 Proyectos Nuevos']).map((t, i) => (
            <span key={i} style={{ fontSize: 13, color: 'var(--cream-2)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok,#1FA06A)' }} />{t}
            </span>
          ))}
        </div>
      </div>

      {/* VALOR (números honestos) */}
      <Section py={80}>
        <Container>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,0.85fr) minmax(0,1.15fr)', gap: 56, alignItems: 'start' }}>
            <FadeUp>
              <Eyebrow>Por Qué DesarrollosMX</Eyebrow>
              <div className="dmx-photo" style={{ borderRadius: 20, overflow: 'hidden', aspectRatio: '5/4', marginBottom: 28 }}>
                <img src={IMG('photo-1556761175-b413da4baf72', 700)} alt="Equipo" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                {[['16', 'Alcaldías'], ['117', 'Variables'], ['50+', 'Fuentes']].map(([k, v]) => (
                  <div key={v}>
                    <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 'clamp(28px,3.4vw,42px)', letterSpacing: -1, ...GRAD }}>{k}</div>
                    <div style={{ fontSize: 13, color: 'var(--cream-3)' }}>{v}</div>
                  </div>
                ))}
              </div>
            </FadeUp>
            <FadeUp delay={0.1}>
              <h2 style={{ ...h2 }}>Compra con la verdad de la colonia, <span style={SERIF}>no a ciegas</span>.</h2>
              <p style={{ ...lead, margin: '24px 0 0', maxWidth: 600 }}>
                Cruzamos 117 variables de cada colonia de la CDMX —seguridad, plusvalía, servicios, riesgo y movilidad— y te lo decimos en palabras simples. Para que elijas tu vivienda nueva sabiendo dónde vas a vivir, no solo cuánto cuesta.
              </p>
              <div style={{ marginTop: 28 }}>
                <Link to="/colonias" style={{ textDecoration: 'none' }}><Button size="lg" style={PILL}>Conoce las Colonias →</Button></Link>
              </div>
              <div style={{ marginTop: 44, paddingTop: 28, borderTop: '1px solid var(--card-border)' }}>
                <div style={{ fontSize: 12, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Operamos junto a</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'center' }}>
                  {ALLIES.map((a) => <span key={a} style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 17, color: 'var(--cream-3)' }}>{a}</span>)}
                </div>
              </div>
            </FadeUp>
          </div>
        </Container>
      </Section>

      {/* CATEGORÍAS (con filtro real) */}
      <Section py={40}>
        <Container>
          <FadeUp><Eyebrow center>¿Qué Buscas?</Eyebrow><h2 style={{ ...h2, textAlign: 'center', marginBottom: 36 }}>Explora <span style={SERIF}>por Tipo</span></h2></FadeUp>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 18 }}>
            {TYPES.map((ty, i) => (
              <FadeUp key={ty.t} delay={i * 0.06}>
                <Link to={ty.to} className="dmx-type" style={{ textDecoration: 'none', display: 'block' }}>
                  <div className="dmx-photo" style={{ borderRadius: 20, overflow: 'hidden', aspectRatio: '3/4', marginBottom: 14 }}>
                    <img src={ty.img} alt={ty.t} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 18 }}>{ty.t}</span>
                    <span className="dmx-arrow" style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cream)', transition: 'all .25s ease' }}>↗</span>
                  </div>
                </Link>
              </FadeUp>
            ))}
          </div>
        </Container>
      </Section>

      {/* EXPLORA POR ALCALDÍA → Colonias → Proyectos */}
      <Section py={64} style={{ background: 'var(--surface-card)' }}>
        <Container>
          <FadeUp>
            <Eyebrow center>Las 16 Alcaldías de la CDMX</Eyebrow>
            <h2 style={{ ...h2, textAlign: 'center' }}>Explora <span style={SERIF}>por Alcaldía</span></h2>
            <p style={{ ...lead, textAlign: 'center', maxWidth: 560, margin: '16px auto 28px' }}>Elige una alcaldía y descubre sus colonias — cómo se vive, cuánto cuesta y hacia dónde va.</p>
          </FadeUp>
          {/* Selector de alcaldías (16 · activas vs próximamente) */}
          <FadeUp>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 32 }}>
              {ALCALDIAS_16.map((a) => {
                const active = !!byAlc[a]; const sel = alc === a;
                return (
                  <button key={a} disabled={!active} onClick={() => active && setAlc(a)}
                    style={{ cursor: active ? 'pointer' : 'default', fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, fontWeight: 600, padding: '8px 14px', borderRadius: 999,
                      border: '1px solid ' + (sel ? 'transparent' : 'var(--card-border)'),
                      background: sel ? 'var(--grad)' : (active ? '#fff' : 'transparent'),
                      color: sel ? '#fff' : (active ? 'var(--cream)' : 'var(--cream-3)'),
                      opacity: active ? 1 : 0.55 }}>
                    {a}{active ? ` · ${byAlc[a].length}` : ''}{!active && ' · pronto'}
                  </button>
                );
              })}
            </div>
          </FadeUp>
          {/* Colonias de la alcaldía seleccionada */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px,1fr))', gap: 18 }}>
            {(byAlc[alc] || []).map((c, i) => <FadeUp key={c.key} delay={i * 0.05}><ColoniaCard c={c} /></FadeUp>)}
          </div>
          <FadeUp>
            <div style={{ textAlign: 'center', marginTop: 32 }}>
              <Link to={`/marketplace?alcaldia=${encodeURIComponent(alc)}`} style={{ textDecoration: 'none' }}>
                <Button size="lg" variant="secondary" style={PILL}>Ver Todos los Proyectos en {alc} →</Button>
              </Link>
            </div>
          </FadeUp>
        </Container>
      </Section>

      {/* SERVICIOS */}
      <Section py={72}>
        <Container>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,0.8fr) minmax(0,1.2fr)', gap: 48, alignItems: 'center' }}>
            <FadeUp>
              <Eyebrow>Lo Que Te Damos</Eyebrow>
              <h2 style={h2}>De cada colonia, en <span style={SERIF}>palabras claras</span>.</h2>
              <p style={{ ...lead, margin: '22px 0 28px' }}>Nada de "índice 80/100". Te decimos qué significa para tu día a día.</p>
              <Link to="/colonias" style={{ textDecoration: 'none' }}><Button size="lg" variant="secondary" style={PILL}>Ver Todas las Colonias →</Button></Link>
            </FadeUp>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px,1fr))', gap: 16 }}>
              {SERVICES.map(([ic, t, b], i) => (
                <FadeUp key={t} delay={i * 0.06}>
                  <Card pad={24} className="dmx-glow" style={{ height: '100%' }}>
                    <div style={{ fontSize: 28, marginBottom: 12 }}>{ic}</div>
                    <h3 style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 17, margin: '0 0 6px' }}>{t}</h3>
                    <p style={{ fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.55, margin: 0 }}>{b}</p>
                  </Card>
                </FadeUp>
              ))}
            </div>
          </div>
        </Container>
      </Section>

      {/* PROCESO */}
      <Section py={72} style={{ background: 'var(--surface-card)' }}>
        <Container>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 48, alignItems: 'center' }}>
            <FadeUp>
              <div className="dmx-photo" style={{ borderRadius: 20, overflow: 'hidden', aspectRatio: '4/3' }}>
                <img src={IMG('photo-1560518883-ce09059eeffa', 800)} alt="Comprar con DesarrollosMX" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
            </FadeUp>
            <FadeUp delay={0.1}>
              <Eyebrow>Cómo Funciona</Eyebrow>
              <h2 style={{ ...h2, marginBottom: 28 }}>Comprar es <span style={SERIF}>simple</span>.</h2>
              {STEPS.map(([n, t, b]) => (
                <div key={n} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 20 }}>
                  <span style={{ flexShrink: 0, width: 42, height: 42, borderRadius: '50%', background: 'var(--grad)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: HEAD, fontWeight: 800, fontSize: 18 }}>{n}</span>
                  <div>
                    <h3 style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 18, margin: '4px 0 4px' }}>{t}</h3>
                    <p style={{ fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.55, margin: 0 }}>{b}</p>
                  </div>
                </div>
              ))}
            </FadeUp>
          </div>
        </Container>
      </Section>

      {/* TESTIMONIOS */}
      <Section py={72}>
        <Container>
          <FadeUp><Eyebrow center>Lo Que Dicen</Eyebrow><h2 style={{ ...h2, textAlign: 'center', marginBottom: 40 }}>Quien decide con datos, <span style={SERIF}>decide tranquilo</span></h2></FadeUp>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 18 }}>
            {TESTIMONIALS.map((tm, i) => (
              <FadeUp key={tm.n} delay={i * 0.06}>
                <Card pad={26} className="dmx-glow">
                  <div style={{ color: 'var(--warm,#E2982E)', fontSize: 15, letterSpacing: 1, marginBottom: 12 }}>★★★★★</div>
                  <div style={{ fontSize: 16, color: 'var(--cream)', lineHeight: 1.6, marginBottom: 18 }}>“{tm.q}”</div>
                  <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 14 }}>{tm.n}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--cream-3)' }}>{tm.r}</div>
                </Card>
              </FadeUp>
            ))}
          </div>
        </Container>
      </Section>

      {/* ASESORES + DESARROLLADORES */}
      <Section py={40}>
        <Container>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px,1fr))', gap: 20 }}>
            {[
              { tag: 'Para Asesores', t: 'Vende más con información que nadie más tiene.', cta: 'Únete como Asesor', to: '/asesores', img: IMG('photo-1556761175-b413da4baf72', 700) },
              { tag: 'Para Desarrolladores', t: 'Vende tu proyecto donde el dato dice que sí.', cta: 'Publica Tu Proyecto', to: '/desarrolladores', img: IMG('photo-1486406146926-c627a92ad1ab', 700) },
            ].map((b) => (
              <FadeUp key={b.tag}>
                <div className="dmx-photo dmx-glow" style={{ position: 'relative', borderRadius: 22, overflow: 'hidden', aspectRatio: '16/10', border: '1px solid var(--card-border)' }}>
                  <img src={b.img} alt={b.tag} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(11,11,18,0.82), rgba(11,11,18,0.15) 60%, transparent)' }} />
                  <div style={{ position: 'absolute', left: 24, right: 24, bottom: 22 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>{b.tag}</div>
                    <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 'clamp(20px,2.4vw,26px)', color: '#fff', lineHeight: 1.15, marginBottom: 16, maxWidth: 360 }}>{b.t}</div>
                    <Link to={b.to} style={{ textDecoration: 'none' }}><Button size="md" style={{ ...PILL, background: '#fff', color: 'var(--theme-2)' }}>{b.cta} →</Button></Link>
                  </div>
                </div>
              </FadeUp>
            ))}
          </div>
        </Container>
      </Section>

      {/* FAQ */}
      <Section py={72} style={{ background: 'var(--surface-card)' }}>
        <Container max={820}>
          <FadeUp><Eyebrow center>Preguntas</Eyebrow><h2 style={{ ...h2, textAlign: 'center', marginBottom: 36 }}>Respuestas a lo <span style={SERIF}>más común</span></h2></FadeUp>
          {FAQ.map(([q, a], i) => {
            const open = faq === i;
            return (
              <FadeUp key={q} delay={i * 0.04}>
                <div onClick={() => setFaq(open ? -1 : i)} style={{ cursor: 'pointer', borderRadius: 16, marginBottom: 12, padding: '18px 22px', border: '1px solid var(--card-border)', background: open ? 'var(--grad)' : '#fff', color: open ? '#fff' : 'var(--cream)', transition: 'background .25s ease' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                    <span style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 16.5 }}>{q}</span>
                    <span style={{ fontSize: 22, lineHeight: 1, opacity: 0.8 }}>{open ? '–' : '+'}</span>
                  </div>
                  {open && <p style={{ fontSize: 14.5, lineHeight: 1.6, margin: '12px 0 0', color: 'rgba(255,255,255,0.92)' }}>{a}</p>}
                </div>
              </FadeUp>
            );
          })}
        </Container>
      </Section>

      {/* CTA */}
      <Section py={72}>
        <Container max={1100}>
          <div style={{ position: 'relative', borderRadius: 28, overflow: 'hidden', padding: 'clamp(40px,6vw,72px) clamp(28px,5vw,64px)', textAlign: 'center', background: 'var(--grad)', boxShadow: '0 40px 90px rgba(var(--theme-rgb),0.30)' }}>
            <Aurora intensity={0.4} />
            <div style={{ position: 'relative' }}>
              <Eyebrow center><span style={{ color: 'rgba(255,255,255,0.8)' }}>Empieza Hoy</span></Eyebrow>
              <h2 style={{ ...h2, color: '#fff', maxWidth: 760, margin: '0 auto 18px' }}>Tu nuevo hogar <span style={{ ...SERIF, color: '#fff' }}>te está esperando</span>.</h2>
              <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.92)', maxWidth: 480, margin: '0 auto 30px', lineHeight: 1.6 }}>Empieza por la colonia que sueñas. Gratis y en segundos.</p>
              <Link to="/marketplace" style={{ textDecoration: 'none' }}><Button size="lg" style={{ ...PILL, background: '#fff', color: 'var(--theme-2)' }}>Buscar Mi Hogar →</Button></Link>
            </div>
          </div>
        </Container>
      </Section>

      <Container style={{ paddingTop: 24, paddingBottom: 48, textAlign: 'center', borderTop: '1px solid var(--card-border)' }}>
        <span style={{ fontSize: 12.5, color: 'var(--cream-3)' }}>DesarrollosMX · Vivienda Nueva en CDMX · 16 Alcaldías · 117 Variables por Colonia · Vista Previa /v2</span>
      </Container>

      {/* Atlax — el asistente de IA (ya vivo en /api/atlax/query), ahora en el home nuevo · tema claro */}
      <AtlaxBubble theme="light" />
    </LightScope>
  );
}
