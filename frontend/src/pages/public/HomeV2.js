import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LightScope, Container, Section, Button, Card, Badge, PublicNav, Aurora } from '../../components/ui';
import FadeUp from '../../components/animations/FadeUp';
import { COLONIAS_BY_KEY } from '../../data/colonias';

/**
 * Home V2 — siguiendo el lenguaje EDITORIAL de nistora (tipografía gigante, mucho aire, eyebrows
 * en mayúsculas, layouts asimétricos, tarjetas de categoría foto+nombre+flecha, off-white con
 * íconos, botones pill, palabra serif itálica) — pero CLARO, con NUESTRO morado + auroras + data real.
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
const TYPES = [
  { t: 'Departamentos', img: IMG('photo-1502672260266-1c1ef2d93688', 600) },
  { t: 'Casas', img: IMG('photo-1600585154340-be6161a56a0c', 600) },
  { t: 'Penthouses', img: IMG('photo-1545324418-cc1a3fa10c00', 600) },
  { t: 'Preventa', img: IMG('photo-1486406146926-c627a92ad1ab', 600) },
];
const COL_KEYS = ['polanco', 'roma-norte', 'condesa', 'del-valle-centro', 'juarez', 'narvarte'];
const COL_IMG = {
  'polanco': IMG('photo-1605146769289-440113cc3d00'), 'roma-norte': IMG('photo-1551361415-69c87624334f'),
  'condesa': IMG('photo-1518105779142-d975f22f1b0a'), 'del-valle-centro': IMG('photo-1566073771259-6a8506099945'),
  'juarez': IMG('photo-1502672260266-1c1ef2d93688'), 'narvarte': IMG('photo-1493809842364-78817add7ffb'),
};
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

function benefitsOf(s) {
  return [[s.comercio, 'Todo a la Mano'], [s.movilidad, 'Llegas Rápido'], [s.seguridad, 'Tranquila'], [s.plusvalia, 'Tu Dinero Crece'], [s.vida, 'Mucha Vida'], [s.educacion, 'Buenas Escuelas']]
    .sort((a, b) => b[0] - a[0]).slice(0, 2).map((x) => x[1]);
}
function Sparkline({ trend, up }) {
  const w = 110, h = 30, min = Math.min(...trend), max = Math.max(...trend), range = max - min || 1;
  const pts = trend.map((v, i) => `${(i / (trend.length - 1)) * w},${h - ((v - min) / range) * (h - 6) - 3}`);
  const col = up ? 'var(--ok,#1FA06A)' : 'var(--theme)';
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h, display: 'block' }}>
      <path d={`M${pts.join(' L')} L${w},${h} L0,${h} Z`} fill={col} opacity="0.10" />
      <path d={`M${pts.join(' L')}`} fill="none" stroke={col} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function HomeV2() {
  const nav = useNavigate();
  const [zona, setZona] = useState('');
  const [faq, setFaq] = useState(0);
  const go = () => nav(`/marketplace${zona ? `?zona=${encodeURIComponent(zona)}` : ''}`);
  const cols = COL_KEYS.map((k) => COLONIAS_BY_KEY[k]).filter(Boolean);

  return (
    <LightScope>
      <style>{`
        @keyframes dmxTicker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        .dmx-photo{overflow:hidden}
        .dmx-photo img{transition:transform .6s cubic-bezier(.22,1,.36,1)}
        .dmx-photo:hover img{transform:scale(1.06)}
        .dmx-glow{transition:transform .3s ease, box-shadow .3s ease, border-color .3s ease}
        .dmx-glow:hover{transform:translateY(-5px); box-shadow:0 20px 48px rgba(var(--theme-rgb),.16); border-color:rgba(var(--theme-rgb),.30)}
        .dmx-type:hover .dmx-arrow{background:var(--theme); color:#fff; transform:rotate(0deg)}
      `}</style>
      <PublicNav />

      {/* ════ HERO editorial ════ */}
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
                    style={{ flex: 1, minWidth: 180, border: 'none', outline: 'none', background: 'transparent', fontFamily: "'DM Sans',sans-serif", fontSize: 15.5, color: 'var(--cream)', padding: '10px 12px' }} />
                  <Button size="lg" onClick={go} style={PILL}>Buscar</Button>
                </div>
                {/* prueba social */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 28 }}>
                  <div style={{ display: 'flex' }}>
                    {FACES.map((f, i) => (
                      <img key={f} src={IMG(f, 80)} alt="" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff', marginLeft: i ? -12 : 0 }} />
                    ))}
                  </div>
                  <div>
                    <div style={{ color: 'var(--warm,#E2982E)', fontSize: 14, letterSpacing: 1 }}>★★★★★</div>
                    <div style={{ fontSize: 13, color: 'var(--cream-3)' }}>590K+ búsquedas atendidas en CDMX</div>
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

      {/* ════ VALOR (editorial · texto gigante + stats + aliados) ════ */}
      <Section py={80}>
        <Container>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,0.85fr) minmax(0,1.15fr)', gap: 56, alignItems: 'start' }}>
            <FadeUp>
              <Eyebrow>Por Qué DesarrollosMX</Eyebrow>
              <div className="dmx-photo" style={{ borderRadius: 20, overflow: 'hidden', aspectRatio: '5/4', marginBottom: 28 }}>
                <img src={IMG('photo-1556761175-b413da4baf72', 700)} alt="Equipo" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                {[['1,524', 'Colonias'], ['117', 'Variables'], ['50+', 'Fuentes']].map(([k, v]) => (
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

      {/* ════ CATEGORÍAS (foto vertical + nombre + flecha) ════ */}
      <Section py={40}>
        <Container>
          <FadeUp><Eyebrow center>¿Qué Buscas?</Eyebrow><h2 style={{ ...h2, textAlign: 'center', marginBottom: 36 }}>Explora <span style={SERIF}>por Tipo</span></h2></FadeUp>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 18 }}>
            {TYPES.map((ty, i) => (
              <FadeUp key={ty.t} delay={i * 0.06}>
                <Link to="/marketplace" className="dmx-type" style={{ textDecoration: 'none', display: 'block' }}>
                  <div className="dmx-photo" style={{ borderRadius: 20, overflow: 'hidden', aspectRatio: '3/4', marginBottom: 14 }}>
                    <img src={ty.img} alt={ty.t} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 19 }}>{ty.t}</span>
                    <span className="dmx-arrow" style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cream)', transition: 'all .25s ease' }}>↗</span>
                  </div>
                </Link>
              </FadeUp>
            ))}
          </div>
        </Container>
      </Section>

      {/* ════ EXPLORA POR COLONIA · data real ════ */}
      <Section py={64} style={{ background: 'var(--surface-card)' }}>
        <Container>
          <FadeUp>
            <Eyebrow center>1,524 Colonias con Dato Real</Eyebrow>
            <h2 style={{ ...h2, textAlign: 'center' }}>Explora <span style={SERIF}>por Colonia</span></h2>
            <p style={{ ...lead, textAlign: 'center', maxWidth: 560, margin: '16px auto 36px' }}>Cómo se vive, cuánto cuesta y hacia dónde va — en palabras claras.</p>
          </FadeUp>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px,1fr))', gap: 18 }}>
            {cols.map((c, i) => (
              <FadeUp key={c.key} delay={i * 0.05}>
                <Link to={`/marketplace?zona=${encodeURIComponent(c.name)}`} className="dmx-glow" style={{ textDecoration: 'none', display: 'block', borderRadius: 20, overflow: 'hidden', background: '#fff', border: '1px solid var(--card-border)' }}>
                  <div className="dmx-photo" style={{ position: 'relative', aspectRatio: '16/9' }}>
                    <img src={COL_IMG[c.key]} alt={c.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(11,11,18,0.72), transparent 55%)' }} />
                    <div style={{ position: 'absolute', left: 14, bottom: 10 }}>
                      <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 19, color: '#fff' }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>{c.alcaldia}</div>
                    </div>
                  </div>
                  <div style={{ padding: 16 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                      {benefitsOf(c.scores).map((b) => (
                        <span key={b} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--theme)', background: 'rgba(var(--theme-rgb),0.09)', borderRadius: 999, padding: '4px 10px' }}>{b}</span>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>Plusvalía (2 Años)</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Sparkline trend={c.trend} up={c.momentumPositive} />
                          <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 14, color: c.momentumPositive ? 'var(--ok,#1FA06A)' : 'var(--cream-2)' }}>{c.momentum}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>Desde</div>
                        <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15 }}>{c.priceM2}/m²</div>
                      </div>
                    </div>
                  </div>
                </Link>
              </FadeUp>
            ))}
          </div>
        </Container>
      </Section>

      {/* ════ SERVICIOS (off-white + íconos) ════ */}
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

      {/* ════ PROCESO ════ */}
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

      {/* ════ TESTIMONIOS ════ */}
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

      {/* ════ ASESORES + DESARROLLADORES ════ */}
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

      {/* ════ FAQ (acordeón · activo = morado, no negro) ════ */}
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

      {/* ════ CTA ════ */}
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
        <span style={{ fontSize: 12.5, color: 'var(--cream-3)' }}>DesarrollosMX · Vivienda Nueva en CDMX · 1,524 Colonias con Dato Real · Vista Previa /v2</span>
      </Container>
    </LightScope>
  );
}
