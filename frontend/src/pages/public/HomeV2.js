import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LightScope, Container, Section, Button, Card, Badge, PublicNav, Aurora } from '../../components/ui';
import FadeUp from '../../components/animations/FadeUp';
import { COLONIAS_BY_KEY } from '../../data/colonias';

/**
 * Home V2 — marketplace de vivienda nueva, comprador-first, TODO CLARO (sin negros).
 * Estilo nistora con NUESTROS colores: auroras animadas, glow, bordes, movimiento (FadeUp).
 * Data REAL de data/colonias (precio/m², momentum, tendencia, scores) en lenguaje de beneficio.
 * Imágenes Unsplash = placeholders. Preview /v2.
 */
const HEAD = "'Outfit',sans-serif";
const SERIF = { fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic', fontWeight: 600 };
const GRAD_TEXT = { background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };
const IMG = (id, w = 800) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;
const HERO_IMG = IMG('photo-1600585154340-be6161a56a0c', 900);

// Colonias destacadas (data real + foto placeholder)
const COL_KEYS = ['polanco', 'roma-norte', 'condesa', 'del-valle-centro', 'juarez', 'narvarte'];
const COL_IMG = {
  'polanco': IMG('photo-1605146769289-440113cc3d00'), 'roma-norte': IMG('photo-1551361415-69c87624334f'),
  'condesa': IMG('photo-1518105779142-d975f22f1b0a'), 'del-valle-centro': IMG('photo-1566073771259-6a8506099945'),
  'juarez': IMG('photo-1502672260266-1c1ef2d93688'), 'narvarte': IMG('photo-1493809842364-78817add7ffb'),
};
const FEATURED = [
  { name: 'Altavista Polanco', col: 'Polanco', from: '$8.5M', beds: '2–3 Rec', tag: 'Entrega 2026', img: IMG('photo-1545324418-cc1a3fa10c00') },
  { name: 'Reforma Living', col: 'Juárez', from: '$5.2M', beds: '1–2 Rec', tag: 'Preventa', img: IMG('photo-1502672260266-1c1ef2d93688') },
  { name: 'Parque Condesa', col: 'Condesa', from: '$7.8M', beds: '2 Rec', tag: 'Últimas Unidades', img: IMG('photo-1560448204-e02f11c3d0e2') },
  { name: 'Del Valle 360', col: 'Del Valle', from: '$4.9M', beds: '2–3 Rec', tag: 'Entrega Inmediata', img: IMG('photo-1493809842364-78817add7ffb') },
];
const TICKER = ['Roma Norte · Zona con Mucha Vida', 'Polanco · Aquí Tu Dinero Crece', 'Condesa · Todo a la Mano', 'Del Valle · Más Tranquila Cada Año', 'Juárez · Subiendo Fuerte', 'Nápoles · 12 Proyectos Nuevos'];
const BENEFITS = [
  ['🚶', 'Todo a la Mano', 'Súper, café, escuelas y hospitales a pie de tu casa.'],
  ['🛡️', 'Zona Tranquila', 'Qué tan segura es, según datos reales — no rumores.'],
  ['📈', 'Aquí Tu Dinero Crece', 'Si el precio de la zona viene subiendo o se estancó.'],
  ['🚇', 'Llegas a Todo Rápido', 'Metro, Metrobús y vialidades cerca; menos tráfico.'],
];
const STATS = [['1,524', 'Colonias con Dato Real'], ['117', 'Variables por Colonia'], ['50+', 'Fuentes Oficiales'], ['+8%', 'Plusvalía Promedio 24m']];
const TESTIMONIALS = [
  { n: 'Mariana G.', r: 'Compradora · Condesa', q: 'Supe que la colonia era segura y que iba a subir de precio antes de ofertar. Compré tranquila, no a ciegas.' },
  { n: 'Carlos D.', r: 'Asesor · Polanco', q: 'Le explico al cliente cómo se vive en la zona en la primera visita. Cierro más rápido.' },
  { n: 'Grupo Vértice', r: 'Desarrolladora', q: 'Vemos qué tan rápido se vende cada zona vs la competencia. Decidimos precio y ritmo con el mercado.' },
];
const FAQ = [
  ['¿El Reporte de la Colonia Tiene Costo?', 'No. Empiezas gratis y sin registro. Solo pagas si contratas servicios premium.'],
  ['¿De Dónde Sale la Información?', 'De fuentes oficiales: seguridad, valor del suelo, plusvalía, riesgo de sismo e inundación, y servicios cercanos. Lo juntamos y te lo decimos en palabras claras.'],
  ['¿Solo Venden Vivienda Nueva?', 'Sí — preventa y entrega inmediata de desarrolladores verificados en CDMX.'],
];
const ALLIES = ["Christie's", "Sotheby's", 'Lamudi', 'Propiedades.com', 'Habimetro'];

function benefitsOf(s) {
  return [[s.comercio, 'Todo a la Mano'], [s.movilidad, 'Llegas Rápido'], [s.seguridad, 'Tranquila'], [s.plusvalia, 'Tu Dinero Crece'], [s.vida, 'Mucha Vida'], [s.educacion, 'Buenas Escuelas']]
    .sort((a, b) => b[0] - a[0]).slice(0, 2).map((x) => x[1]);
}
function Sparkline({ trend, up }) {
  const w = 116, h = 32, min = Math.min(...trend), max = Math.max(...trend), range = max - min || 1;
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
  const go = () => nav(`/marketplace${zona ? `?zona=${encodeURIComponent(zona)}` : ''}`);
  const cols = COL_KEYS.map((k) => COLONIAS_BY_KEY[k]).filter(Boolean);

  return (
    <LightScope>
      <style>{`
        @keyframes dmxTicker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        .dmx-zone{transition:transform .2s ease, box-shadow .25s ease}
        .dmx-zone img{transition:transform .5s ease}
        .dmx-zone:hover{transform:translateY(-5px); box-shadow:0 18px 44px rgba(var(--theme-rgb),.20)}
        .dmx-zone:hover img{transform:scale(1.07)}
        .dmx-photo img{transition:transform .5s ease}
        .dmx-photo:hover img{transform:scale(1.05)}
        .dmx-glow{transition:transform .25s ease, box-shadow .3s ease, border-color .3s ease}
        .dmx-glow:hover{transform:translateY(-4px); box-shadow:0 16px 40px rgba(var(--theme-rgb),.18); border-color:rgba(var(--theme-rgb),.35)}
      `}</style>
      <PublicNav />

      {/* HERO con AURORAS */}
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <Aurora intensity={0.9} />
        <Container style={{ position: 'relative' }}>
          <Section py={40}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,0.95fr)', gap: 40, alignItems: 'center' }}>
              <FadeUp>
                <Badge tone="soft" size="md" style={{ marginBottom: 18 }}>🏠 Vivienda Nueva · CDMX · 1,524 Colonias</Badge>
                <h1 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(34px,4.7vw,56px)', lineHeight: 1.06, letterSpacing: -1.2, margin: '0 0 18px' }}>
                  Encuentra Tu Nuevo <span style={{ ...SERIF, ...GRAD_TEXT }}>Hogar</span><br />en la Ciudad de México.
                </h1>
                <p style={{ fontSize: 'clamp(15.5px,1.6vw,18.5px)', color: 'var(--cream-2)', lineHeight: 1.6, margin: '0 0 24px', maxWidth: 510 }}>
                  Vivienda nueva verificada. Y por primera vez, sabes <b style={{ color: 'var(--cream)' }}>cómo se vive en cada colonia</b> antes de mudarte: si es tranquila, si tienes todo a la mano y si tu inversión va a crecer.
                </p>
                <div style={{ background: '#fff', border: '1px solid var(--card-border)', borderRadius: 'var(--r-card)', boxShadow: '0 12px 36px rgba(var(--theme-rgb),0.12)', padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input value={zona} onChange={(e) => setZona(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()}
                    placeholder="¿En Qué Colonia o Alcaldía Quieres Vivir?"
                    style={{ flex: 1, minWidth: 180, border: 'none', outline: 'none', background: 'transparent', fontFamily: "'DM Sans',sans-serif", fontSize: 15, color: 'var(--cream)', padding: '8px 10px' }} />
                  <select style={selStyle}><option>Presupuesto</option><option>Hasta $4M</option><option>$4M–$7M</option><option>$7M o Más</option></select>
                  <select style={selStyle}><option>Recámaras</option><option>1 o Más</option><option>2 o Más</option><option>3 o Más</option></select>
                  <Button size="md" onClick={go}>Buscar</Button>
                </div>
                <div style={{ fontSize: 13, color: 'var(--cream-3)', marginTop: 12 }}>Gratis · Sin Registro para Empezar · Información Verificable</div>
              </FadeUp>

              <FadeUp delay={0.15}>
                <div style={{ position: 'relative' }} className="dmx-photo">
                  <div style={{ borderRadius: 'var(--r-card)', overflow: 'hidden', boxShadow: '0 30px 70px rgba(var(--theme-rgb),0.22)', aspectRatio: '4/5', background: 'var(--bg-3)' }}>
                    <img src={HERO_IMG} alt="Hogar nuevo en CDMX" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                  <div style={{ position: 'absolute', bottom: -20, left: -16, width: 252, background: '#fff', border: '1px solid var(--card-border)', borderRadius: 'var(--r-card)', padding: 16, boxShadow: '0 20px 50px rgba(var(--theme-rgb),0.20)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 16 }}>Roma Norte</span>
                      <Badge tone="green" size="xs">● En Vivo</Badge>
                    </div>
                    {['Todo a la Mano', 'Zona con Mucha Vida', 'Aquí Tu Dinero Crece'].map((b) => (
                      <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--cream-2)', marginBottom: 6 }}>
                        <span style={{ color: 'var(--ok,#1FA06A)', fontWeight: 800 }}>✓</span>{b}
                      </div>
                    ))}
                  </div>
                </div>
              </FadeUp>
            </div>
          </Section>
        </Container>
      </div>

      {/* TICKER */}
      <div style={{ borderTop: '1px solid var(--card-border)', borderBottom: '1px solid var(--card-border)', background: 'var(--surface-card)', overflow: 'hidden', padding: '11px 0' }}>
        <div style={{ display: 'flex', gap: 36, whiteSpace: 'nowrap', width: 'max-content', animation: 'dmxTicker 34s linear infinite' }}>
          {[...TICKER, ...TICKER].map((t, i) => (
            <span key={i} style={{ fontSize: 13, color: 'var(--cream-2)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok,#1FA06A)' }} />{t}
            </span>
          ))}
        </div>
      </div>

      {/* DESTACADOS · CLARO (foto + hover glow) */}
      <Section py={48}>
        <Container>
          <FadeUp>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22 }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--cream-3)', marginBottom: 4 }}>Lo Mejor de la Ciudad</div>
                <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(24px,3vw,34px)', letterSpacing: -0.5, margin: 0 }}>Desarrollos <span style={SERIF}>Destacados</span></h2>
              </div>
              <Link to="/marketplace" style={{ textDecoration: 'none' }}><Button variant="ghost" size="sm">Ver Todos →</Button></Link>
            </div>
          </FadeUp>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(228px,1fr))', gap: 18 }}>
            {FEATURED.map((d, i) => (
              <FadeUp key={d.name} delay={i * 0.06}>
                <div className="dmx-photo dmx-glow" onClick={() => nav('/marketplace')}
                  style={{ cursor: 'pointer', borderRadius: 'var(--r-card)', overflow: 'hidden', background: '#fff', border: '1px solid var(--card-border)' }}>
                  <div style={{ aspectRatio: '4/3', overflow: 'hidden' }}>
                    <img src={d.img} alt={d.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                  <div style={{ padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 16 }}>{d.name}</span>
                      <Badge tone="green" size="xs">{d.tag}</Badge>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--cream-3)', marginBottom: 8 }}>{d.col} · {d.beds}</div>
                    <div style={{ fontSize: 13, color: 'var(--cream-2)' }}>Desde <b style={{ color: 'var(--cream)' }}>{d.from}</b></div>
                  </div>
                </div>
              </FadeUp>
            ))}
          </div>
        </Container>
      </Section>

      {/* EXPLORA POR COLONIA · tarjetas RICAS con data real (sparkline + precio/m² + momentum) */}
      <Section py={44} style={{ background: 'var(--surface-card)' }}>
        <Container>
          <FadeUp>
            <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(24px,3vw,34px)', letterSpacing: -0.5, margin: '0 0 6px', textAlign: 'center' }}>Explora <span style={SERIF}>Por Colonia</span></h2>
            <p style={{ textAlign: 'center', color: 'var(--cream-2)', margin: '0 0 28px' }}>Cómo se vive, cuánto cuesta y hacia dónde va — en palabras claras.</p>
          </FadeUp>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px,1fr))', gap: 18 }}>
            {cols.map((c, i) => (
              <FadeUp key={c.key} delay={i * 0.05}>
                <Link to={`/marketplace?zona=${encodeURIComponent(c.name)}`} className="dmx-glow" style={{ textDecoration: 'none', display: 'block', borderRadius: 'var(--r-card)', overflow: 'hidden', background: '#fff', border: '1px solid var(--card-border)' }}>
                  <div className="dmx-photo" style={{ position: 'relative', aspectRatio: '16/9', overflow: 'hidden' }}>
                    <img src={COL_IMG[c.key]} alt={c.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(11,11,18,0.7), transparent 55%)' }} />
                    <div style={{ position: 'absolute', left: 14, bottom: 10 }}>
                      <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 19, color: '#fff' }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>{c.alcaldia}</div>
                    </div>
                  </div>
                  <div style={{ padding: 14 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                      {benefitsOf(c.scores).map((b) => (
                        <span key={b} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--theme)', background: 'rgba(var(--theme-rgb),0.09)', borderRadius: 'var(--r-pill)', padding: '4px 10px' }}>{b}</span>
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

      {/* QUÉ TE DECIMOS · beneficios en lenguaje claro */}
      <Section py={50}>
        <Container>
          <FadeUp>
            <div style={{ textAlign: 'center', marginBottom: 30 }}>
              <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(24px,3.2vw,34px)', letterSpacing: -0.5, margin: '0 0 8px' }}>De Cada Colonia, en <span style={SERIF}>Palabras Claras</span></h2>
              <p style={{ fontSize: 16, color: 'var(--cream-2)', maxWidth: 560, margin: '0 auto' }}>Nada de "índice 80/100". Te decimos qué significa para tu día a día.</p>
            </div>
          </FadeUp>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px,1fr))', gap: 16 }}>
            {BENEFITS.map(([ic, t, b], i) => (
              <FadeUp key={t} delay={i * 0.06}>
                <Card pad={20} className="dmx-glow">
                  <div style={{ fontSize: 26, marginBottom: 8 }}>{ic}</div>
                  <h3 style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 16.5, margin: '0 0 5px' }}>{t}</h3>
                  <p style={{ fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.55, margin: 0 }}>{b}</p>
                </Card>
              </FadeUp>
            ))}
          </div>
        </Container>
      </Section>

      {/* STATS con aurora */}
      <Section py={40}>
        <Container>
          <div style={{ position: 'relative', borderRadius: 'var(--r-card)', overflow: 'hidden', border: '1px solid var(--card-border)', background: '#fff', padding: '36px 24px' }}>
            <Aurora intensity={0.5} />
            <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 16 }}>
              {STATS.map(([k, v], i) => (
                <FadeUp key={v} delay={i * 0.06} style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 34, ...GRAD_TEXT }}>{k}</div>
                  <div style={{ fontSize: 13, color: 'var(--cream-3)', marginTop: 4 }}>{v}</div>
                </FadeUp>
              ))}
            </div>
          </div>
        </Container>
      </Section>

      {/* TESTIMONIOS */}
      <Section py={46} style={{ background: 'var(--surface-card)' }}>
        <Container>
          <FadeUp><h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(24px,3vw,32px)', letterSpacing: -0.5, margin: '0 0 26px', textAlign: 'center' }}>Quien Decide con Datos, <span style={SERIF}>Decide Tranquilo</span></h2></FadeUp>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 18 }}>
            {TESTIMONIALS.map((tm, i) => (
              <FadeUp key={tm.n} delay={i * 0.06}>
                <Card pad={22} className="dmx-glow">
                  <div style={{ fontSize: 15, color: 'var(--cream)', lineHeight: 1.6, marginBottom: 16 }}>“{tm.q}”</div>
                  <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 14 }}>{tm.n}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--cream-3)' }}>{tm.r}</div>
                </Card>
              </FadeUp>
            ))}
          </div>
        </Container>
      </Section>

      {/* ASESORES */}
      <Section py={44} id="asesores">
        <Container>
          <FadeUp>
            <Card variant="elevated" pad={0} hover={false} style={{ overflow: 'hidden', background: '#fff' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))' }}>
                <div style={{ padding: '34px 32px' }}>
                  <Badge tone="theme" style={{ marginBottom: 12 }}>Para Asesores</Badge>
                  <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(22px,2.8vw,30px)', letterSpacing: -0.5, margin: '0 0 12px' }}>Vende Más con Información que <span style={SERIF}>Nadie Más Tiene</span>.</h2>
                  {['Clientes Reales Interesados en Tus Zonas', 'La Información Premium de la Colonia (lo que el cliente no ve)', 'CRM Sencillo + Material por Cliente con un Click'].map((x) => (
                    <div key={x} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14.5, color: 'var(--cream-2)', marginBottom: 9 }}><span style={{ color: 'var(--theme)', fontWeight: 800 }}>✓</span>{x}</div>
                  ))}
                  <Link to="/asesores" style={{ textDecoration: 'none' }}><Button size="md" style={{ marginTop: 12 }}>Únete Gratis como Asesor →</Button></Link>
                </div>
                <div className="dmx-photo" style={{ background: 'var(--bg-3)', minHeight: 220, overflow: 'hidden' }}><img src={IMG('photo-1556761175-b413da4baf72')} alt="Asesor" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /></div>
              </div>
            </Card>
          </FadeUp>
        </Container>
      </Section>

      {/* DESARROLLADORES */}
      <Section py={44} id="desarrolladores">
        <Container>
          <FadeUp>
            <Card variant="elevated" pad={0} hover={false} style={{ overflow: 'hidden', background: '#fff' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))' }}>
                <div className="dmx-photo" style={{ background: 'var(--bg-3)', minHeight: 220, overflow: 'hidden' }}><img src={IMG('photo-1486406146926-c627a92ad1ab')} alt="Desarrollo" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /></div>
                <div style={{ padding: '34px 32px' }}>
                  <Badge tone="theme" style={{ marginBottom: 12 }}>Para Desarrolladores</Badge>
                  <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(22px,2.8vw,30px)', letterSpacing: -0.5, margin: '0 0 12px' }}>Vende Tu Proyecto Donde el <span style={SERIF}>Dato Dice que Sí</span>.</h2>
                  {['Publica Tu Inventario en Tiempo Real', 'Clientes Atribuidos + Embudo Medible', 'Qué Tan Rápido Se Vende Tu Zona vs la Competencia'].map((x) => (
                    <div key={x} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14.5, color: 'var(--cream-2)', marginBottom: 9 }}><span style={{ color: 'var(--theme)', fontWeight: 800 }}>✓</span>{x}</div>
                  ))}
                  <Link to="/desarrolladores" style={{ textDecoration: 'none' }}><Button size="md" style={{ marginTop: 12 }}>Publica Tu Proyecto →</Button></Link>
                </div>
              </div>
            </Card>
          </FadeUp>
        </Container>
      </Section>

      {/* ALIADOS */}
      <Section py={30}>
        <Container style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--cream-3)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 14 }}>Operamos Junto a Plataformas que Mueven el Real Estate</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 30, justifyContent: 'center', alignItems: 'center' }}>
            {ALLIES.map((a) => <span key={a} style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 18, color: 'var(--cream-3)' }}>{a}</span>)}
          </div>
        </Container>
      </Section>

      {/* FAQ */}
      <Section py={40} style={{ background: 'var(--surface-card)' }}>
        <Container max={760}>
          <FadeUp><h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(22px,3vw,30px)', letterSpacing: -0.5, margin: '0 0 20px', textAlign: 'center' }}>Preguntas <span style={SERIF}>Frecuentes</span></h2></FadeUp>
          {FAQ.map(([q, a], i) => (
            <FadeUp key={q} delay={i * 0.05}>
              <Card pad={18} className="dmx-glow" style={{ marginBottom: 12 }}>
                <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 15.5, marginBottom: 5 }}>{q}</div>
                <div style={{ fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.6 }}>{a}</div>
              </Card>
            </FadeUp>
          ))}
        </Container>
      </Section>

      {/* CTA con aurora */}
      <Section py={56}>
        <Container max={820}>
          <div style={{ position: 'relative', borderRadius: 'var(--r-card)', overflow: 'hidden', padding: '46px 36px', textAlign: 'center', background: 'var(--grad)', boxShadow: '0 30px 70px rgba(var(--theme-rgb),0.30)' }}>
            <Aurora intensity={0.4} />
            <div style={{ position: 'relative' }}>
              <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(26px,3.8vw,40px)', letterSpacing: -0.7, color: '#fff', margin: '0 0 12px' }}>Tu Nuevo Hogar <span style={{ ...SERIF, color: '#fff' }}>Te Está Esperando</span>.</h2>
              <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.92)', maxWidth: 480, margin: '0 auto 24px', lineHeight: 1.6 }}>Empieza por la colonia que sueñas. Gratis y en Segundos.</p>
              <Link to="/marketplace" style={{ textDecoration: 'none' }}><Button size="lg" style={{ background: '#fff', color: 'var(--theme-2)' }}>Buscar Mi Hogar →</Button></Link>
            </div>
          </div>
        </Container>
      </Section>

      <Container style={{ paddingTop: 24, paddingBottom: 40, textAlign: 'center', borderTop: '1px solid var(--card-border)' }}>
        <span style={{ fontSize: 12.5, color: 'var(--cream-3)' }}>DesarrollosMX · Vivienda Nueva en CDMX · 1,524 Colonias con Dato Real · Vista Previa /v2</span>
      </Container>
    </LightScope>
  );
}

const selStyle = { border: '1px solid var(--card-border)', borderRadius: 'var(--r-inner)', background: '#fff', color: 'var(--cream-2)', fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, padding: '9px 10px', outline: 'none', cursor: 'pointer' };
