import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LightScope, Container, Section, Button, Card, Badge, PublicNav } from '../../components/ui';

/**
 * Home V2 — marketplace de vivienda nueva, comprador-first, FONDO BLANCO con vida.
 * Principios (feedback + agentes): tarjetas que RESALTAN (off-white + hover), lenguaje de
 * BENEFICIO/EXPERIENCIA (no "índice 80/100"), Title Case, español MX (colonias no barrios),
 * acento serif itálico, banda oscura para destacados (refs nistora/loft/clikalia).
 * Imágenes Unsplash = placeholders cálidos. Preview /v2.
 */
const HEAD = "'Outfit',sans-serif";
const SERIF = { fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic', fontWeight: 600 };
const IMG = (id, w = 900) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

const HERO_IMG = IMG('photo-1600585154340-be6161a56a0c');
const FEATURED = [
  { name: 'Altavista Polanco', col: 'Polanco', from: '$8.5M', beds: '2–3 Rec', tag: 'Entrega 2026', img: IMG('photo-1545324418-cc1a3fa10c00') },
  { name: 'Reforma Living', col: 'Juárez', from: '$5.2M', beds: '1–2 Rec', tag: 'Preventa', img: IMG('photo-1502672260266-1c1ef2d93688') },
  { name: 'Parque Condesa', col: 'Condesa', from: '$7.8M', beds: '2 Rec', tag: 'Últimas Unidades', img: IMG('photo-1560448204-e02f11c3d0e2') },
  { name: 'Del Valle 360', col: 'Del Valle', from: '$4.9M', beds: '2–3 Rec', tag: 'Entrega Inmediata', img: IMG('photo-1493809842364-78817add7ffb') },
];
// Colonias con TAG de EXPERIENCIA (no scores crudos · el founder lo pidió)
const COLONIAS = [
  { name: 'Polanco', vibe: 'Lujo y Negocios', img: IMG('photo-1605146769289-440113cc3d00', 700) },
  { name: 'Condesa', vibe: 'Vida, Cafés y Parques', img: IMG('photo-1518105779142-d975f22f1b0a', 700) },
  { name: 'Roma Norte', vibe: 'Arte, Bares y Caminable', img: IMG('photo-1551361415-69c87624334f', 700) },
  { name: 'Del Valle', vibe: 'Familiar y Bien Conectada', img: IMG('photo-1566073771259-6a8506099945', 700) },
  { name: 'Coyoacán', vibe: 'Tradición y Calma', img: IMG('photo-1512917774080-9991f1c4c750', 700) },
  { name: 'Santa Fe', vibe: 'Corporativo y Nuevo', img: IMG('photo-1486406146926-c627a92ad1ab', 700) },
];
const TICKER = ['Roma Norte · Zona con Mucha Vida', 'Polanco · Aquí Tu Dinero Crece', 'Condesa · Todo a la Mano', 'Del Valle · Más Tranquila Cada Año', 'Juárez · Subiendo Fuerte', 'Nápoles · 12 Proyectos Nuevos', 'Coyoacán · Tradición que No Pasa de Moda'];
const WHY = [
  { i: '🏡', t: 'Solo Vivienda Nueva, Verificada', b: 'Proyectos de desarrolladores reales, con papeles al día. Nada de anuncios dudosos.' },
  { i: '🧭', t: 'Conoce la Colonia Antes de Mudarte', b: 'Te decimos en palabras claras cómo se vive ahí: si es tranquila, si caminas a todo y si tu compra va a valer más.' },
  { i: '🤝', t: 'Te Acompañamos Hasta las Llaves', b: 'Un asesor experto de la zona, visitas agendadas y apoyo con tu crédito. De principio a fin.' },
];
const BENEFITS = [
  ['Todo a la Mano', 'Súper, café y restaurantes a pie de tu casa.'],
  ['Zona Tranquila', 'Buena vigilancia y alumbrado; segura para tu familia.'],
  ['Aquí Tu Dinero Crece', 'El precio en la zona viene subiendo; comprar hoy conviene.'],
  ['Llegas a Todo Rápido', 'Metro, Metrobús y vialidades cerca; menos tráfico.'],
];
const STATS = [['1,524', 'Colonias con Dato Real'], ['117', 'Variables por Colonia'], ['590K+', 'Búsquedas Atendidas'], ['+8%', 'Plusvalía Promedio 24m']];
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

export default function HomeV2() {
  const nav = useNavigate();
  const [zona, setZona] = useState('');
  const go = () => nav(`/marketplace${zona ? `?zona=${encodeURIComponent(zona)}` : ''}`);

  return (
    <LightScope>
      <style>{`
        @keyframes dmxTicker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        .dmx-zone{transition:transform .2s ease, box-shadow .25s ease}
        .dmx-zone img{transition:transform .5s ease}
        .dmx-zone:hover{transform:translateY(-4px); box-shadow:0 16px 40px rgba(16,24,40,.16)}
        .dmx-zone:hover img{transform:scale(1.06)}
        .dmx-photo img{transition:transform .5s ease}
        .dmx-photo:hover img{transform:scale(1.05)}
      `}</style>
      <PublicNav />

      {/* HERO */}
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -180, right: -120, width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(var(--theme-rgb),0.14), transparent)', pointerEvents: 'none' }} />
        <Container style={{ position: 'relative' }}>
          <Section py={36}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,0.95fr)', gap: 40, alignItems: 'center' }}>
              <div>
                <Badge tone="soft" size="md" style={{ marginBottom: 18 }}>🏠 Vivienda Nueva · CDMX · 1,524 Colonias</Badge>
                <h1 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(34px,4.7vw,56px)', lineHeight: 1.06, letterSpacing: -1.2, margin: '0 0 18px' }}>
                  Encuentra Tu Nuevo <span style={{ ...SERIF, background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Hogar</span><br />en la Ciudad de México.
                </h1>
                <p style={{ fontSize: 'clamp(15.5px,1.6vw,18.5px)', color: 'var(--cream-2)', lineHeight: 1.6, margin: '0 0 24px', maxWidth: 510 }}>
                  Vivienda nueva verificada. Y por primera vez, sabes <b style={{ color: 'var(--cream)' }}>cómo se vive en cada colonia</b> antes de mudarte: si es tranquila, si tienes todo a la mano y si tu inversión va a crecer.
                </p>
                <div style={{ background: '#fff', border: '1px solid var(--card-border)', borderRadius: 'var(--r-card)', boxShadow: '0 10px 30px rgba(16,24,40,0.08)', padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input value={zona} onChange={(e) => setZona(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()}
                    placeholder="¿En Qué Colonia o Alcaldía Quieres Vivir?"
                    style={{ flex: 1, minWidth: 180, border: 'none', outline: 'none', background: 'transparent', fontFamily: "'DM Sans',sans-serif", fontSize: 15, color: 'var(--cream)', padding: '8px 10px' }} />
                  <select style={selStyle}><option>Presupuesto</option><option>Hasta $4M</option><option>$4M–$7M</option><option>$7M o Más</option></select>
                  <select style={selStyle}><option>Recámaras</option><option>1 o Más</option><option>2 o Más</option><option>3 o Más</option></select>
                  <Button size="md" onClick={go}>Buscar</Button>
                </div>
                <div style={{ fontSize: 13, color: 'var(--cream-3)', marginTop: 12 }}>Gratis · Sin Registro para Empezar · Información Verificable</div>
              </div>

              <div style={{ position: 'relative' }} className="dmx-photo">
                <div style={{ borderRadius: 'var(--r-card)', overflow: 'hidden', boxShadow: '0 30px 70px rgba(var(--theme-rgb),0.18)', aspectRatio: '4/5', background: 'var(--bg-3)' }}>
                  <img src={HERO_IMG} alt="Hogar nuevo en CDMX" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </div>
                <Card variant="elevated" pad={16} hover={false} style={{ position: 'absolute', bottom: -20, left: -16, width: 252, background: '#fff', boxShadow: '0 20px 50px rgba(16,24,40,0.16)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 16 }}>Roma Norte</span>
                    <Badge tone="green" size="xs">● En Vivo</Badge>
                  </div>
                  {['Todo a la Mano', 'Zona con Mucha Vida', 'Aquí Tu Dinero Crece'].map((b) => (
                    <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--cream-2)', marginBottom: 6 }}>
                      <span style={{ color: 'var(--ok,#1FA06A)', fontWeight: 800 }}>✓</span>{b}
                    </div>
                  ))}
                </Card>
              </div>
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

      {/* DESTACADOS · banda OSCURA (las fotos explotan · regla nistora) */}
      <div style={{ background: '#0B0B12', color: '#fff' }}>
        <Container>
          <Section py={48}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22 }}>
              <div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>Lo Mejor de la Ciudad</div>
                <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(24px,3vw,34px)', letterSpacing: -0.5, margin: 0 }}>Desarrollos <span style={SERIF}>Destacados</span></h2>
              </div>
              <Link to="/marketplace" style={{ textDecoration: 'none' }}><Button variant="secondary" size="sm" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.25)' }}>Ver Todos →</Button></Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(228px,1fr))', gap: 18 }}>
              {FEATURED.map((d) => (
                <div key={d.name} className="dmx-photo" onClick={() => nav('/marketplace')}
                  style={{ cursor: 'pointer', borderRadius: 16, overflow: 'hidden', background: '#14141F', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ aspectRatio: '4/3', overflow: 'hidden' }}>
                    <img src={d.img} alt={d.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                  <div style={{ padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 16 }}>{d.name}</span>
                      <Badge tone="green" size="xs">{d.tag}</Badge>
                    </div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 8 }}>{d.col} · {d.beds}</div>
                    <div style={{ fontSize: 13 }}>Desde <b>{d.from}</b></div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </Container>
      </div>

      {/* EXPLORA POR COLONIA (foto + experiencia + hover) */}
      <Section py={48}>
        <Container>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(24px,3vw,34px)', letterSpacing: -0.5, margin: '0 0 6px', textAlign: 'center' }}>Explora <span style={SERIF}>Por Colonia</span></h2>
          <p style={{ textAlign: 'center', color: 'var(--cream-2)', margin: '0 0 26px' }}>Descubre cómo se vive en cada una, en palabras claras.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px,1fr))', gap: 16 }}>
            {COLONIAS.map((z) => (
              <Link key={z.name} to={`/marketplace?zona=${encodeURIComponent(z.name)}`} className="dmx-zone" style={{ textDecoration: 'none', position: 'relative', display: 'block', borderRadius: 'var(--r-card)', overflow: 'hidden', aspectRatio: '16/11' }}>
                <img src={z.img} alt={z.name} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(11,11,18,0.82) 0%, rgba(11,11,18,0.1) 60%, transparent 100%)' }} />
                <div style={{ position: 'absolute', left: 16, right: 16, bottom: 14 }}>
                  <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 21, color: '#fff' }}>{z.name} ›</div>
                  <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.88)', fontWeight: 600 }}>{z.vibe}</div>
                </div>
              </Link>
            ))}
          </div>
        </Container>
      </Section>

      {/* QUÉ TE DECIMOS (beneficios en lenguaje claro) */}
      <Section py={50} style={{ background: 'var(--surface-card)' }}>
        <Container>
          <div style={{ textAlign: 'center', marginBottom: 30 }}>
            <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(24px,3.2vw,34px)', letterSpacing: -0.5, margin: '0 0 8px' }}>De Cada Colonia, en <span style={SERIF}>Palabras Claras</span></h2>
            <p style={{ fontSize: 16, color: 'var(--cream-2)', maxWidth: 560, margin: '0 auto' }}>Nada de "índice 80/100". Te decimos qué significa para tu día a día.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px,1fr))', gap: 16 }}>
            {BENEFITS.map(([t, b]) => (
              <Card key={t} pad={20}>
                <div style={{ color: 'var(--ok,#1FA06A)', fontWeight: 800, fontSize: 18, marginBottom: 6 }}>✓</div>
                <h3 style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 16.5, margin: '0 0 5px' }}>{t}</h3>
                <p style={{ fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.55, margin: 0 }}>{b}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      {/* POR QUÉ */}
      <Section py={50}>
        <Container>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(24px,3.2vw,34px)', letterSpacing: -0.5, margin: '0 0 8px', textAlign: 'center' }}>Comprar Tu Hogar, <span style={SERIF}>Sin Angustia</span></h2>
          <p style={{ fontSize: 16, color: 'var(--cream-2)', maxWidth: 560, margin: '0 auto 30px', textAlign: 'center' }}>No es solo un departamento. Es dónde vas a vivir tu vida.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px,1fr))', gap: 18 }}>
            {WHY.map((w) => (
              <Card key={w.t} pad={24}>
                <div style={{ fontSize: 30, marginBottom: 10 }}>{w.i}</div>
                <h3 style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 18, margin: '0 0 8px' }}>{w.t}</h3>
                <p style={{ fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.6, margin: 0 }}>{w.b}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      {/* STATS */}
      <Section py={36}>
        <Container>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 16 }}>
            {STATS.map(([k, v]) => (
              <Card key={v} pad={20} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 30, background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{k}</div>
                <div style={{ fontSize: 13, color: 'var(--cream-3)', marginTop: 4 }}>{v}</div>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      {/* TESTIMONIOS */}
      <Section py={46} style={{ background: 'var(--surface-card)' }}>
        <Container>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(24px,3vw,32px)', letterSpacing: -0.5, margin: '0 0 26px', textAlign: 'center' }}>Quien Decide con Datos, <span style={SERIF}>Decide Tranquilo</span></h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 18 }}>
            {TESTIMONIALS.map((tm) => (
              <Card key={tm.n} pad={22}>
                <div style={{ fontSize: 15, color: 'var(--cream)', lineHeight: 1.6, marginBottom: 16 }}>“{tm.q}”</div>
                <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 14 }}>{tm.n}</div>
                <div style={{ fontSize: 12.5, color: 'var(--cream-3)' }}>{tm.r}</div>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      {/* ASESORES */}
      <Section py={44} id="asesores">
        <Container>
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
              <div style={{ background: 'var(--bg-3)', minHeight: 220 }}><img src={IMG('photo-1556761175-b413da4baf72')} alt="Asesor" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /></div>
            </div>
          </Card>
        </Container>
      </Section>

      {/* DESARROLLADORES */}
      <Section py={44} id="desarrolladores">
        <Container>
          <Card variant="elevated" pad={0} hover={false} style={{ overflow: 'hidden', background: '#fff' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))' }}>
              <div style={{ background: 'var(--bg-3)', minHeight: 220 }}><img src={IMG('photo-1486406146926-c627a92ad1ab')} alt="Desarrollo" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /></div>
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
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(22px,3vw,30px)', letterSpacing: -0.5, margin: '0 0 20px', textAlign: 'center' }}>Preguntas <span style={SERIF}>Frecuentes</span></h2>
          {FAQ.map(([q, a]) => (
            <Card key={q} pad={18} style={{ marginBottom: 12 }}>
              <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 15.5, marginBottom: 5 }}>{q}</div>
              <div style={{ fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.6 }}>{a}</div>
            </Card>
          ))}
        </Container>
      </Section>

      {/* CTA */}
      <Section py={56}>
        <Container max={820}>
          <div style={{ borderRadius: 'var(--r-card)', padding: '46px 36px', textAlign: 'center', background: 'var(--grad)', boxShadow: '0 30px 70px rgba(var(--theme-rgb),0.26)' }}>
            <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(26px,3.8vw,40px)', letterSpacing: -0.7, color: '#fff', margin: '0 0 12px' }}>Tu Nuevo Hogar <span style={{ ...SERIF, color: '#fff' }}>Te Está Esperando</span>.</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', maxWidth: 480, margin: '0 auto 24px', lineHeight: 1.6 }}>Empieza por la colonia que sueñas. Gratis y en Segundos.</p>
            <Link to="/marketplace" style={{ textDecoration: 'none' }}><Button size="lg" style={{ background: '#fff', color: 'var(--theme-2)' }}>Buscar Mi Hogar →</Button></Link>
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
