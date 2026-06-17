import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LightScope, Container, Section, Button, Card, Badge, PublicNav } from '../../components/ui';

/**
 * Home V2 — marketplace de VIVIENDA NUEVA, comprador-first, FONDO BLANCO con VIDA (glow, hover,
 * borders, movimiento). Refs UX: loft / quintoandar / clikalia. Mina el contenido de la landing
 * anterior (117 variables, tarjeta viva, aliados) y lo trae con calidez. Imágenes Unsplash =
 * placeholders cálidos (cambiar por fotos reales). Preview /v2.
 */
const HEAD = "'Outfit',sans-serif";
const IMG = (id, w = 900) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

const HERO_IMG = IMG('photo-1600585154340-be6161a56a0c');
const FEATURED = [
  { name: 'Altavista Polanco', col: 'Polanco', from: '$8.5M', beds: '2–3 rec', img: IMG('photo-1545324418-cc1a3fa10c00') },
  { name: 'Reforma Living', col: 'Juárez', from: '$5.2M', beds: '1–2 rec', img: IMG('photo-1502672260266-1c1ef2d93688') },
  { name: 'Parque Condesa', col: 'Condesa', from: '$7.8M', beds: '2 rec', img: IMG('photo-1560448204-e02f11c3d0e2') },
  { name: 'Del Valle 360', col: 'Del Valle', from: '$4.9M', beds: '2–3 rec', img: IMG('photo-1493809842364-78817add7ffb') },
];
const ZONES = [
  { name: 'Polanco', plus: 92, img: IMG('photo-1605146769289-440113cc3d00', 700) },
  { name: 'Condesa', plus: 88, img: IMG('photo-1518105779142-d975f22f1b0a', 700) },
  { name: 'Roma Norte', plus: 90, img: IMG('photo-1551361415-69c87624334f', 700) },
  { name: 'Del Valle', plus: 81, img: IMG('photo-1566073771259-6a8506099945', 700) },
  { name: 'Coyoacán', plus: 79, img: IMG('photo-1512917774080-9991f1c4c750', 700) },
  { name: 'Santa Fe', plus: 84, img: IMG('photo-1486406146926-c627a92ad1ab', 700) },
];
const TICKER = ['Roma Norte · absorción +8%', 'Polanco · plusvalía 92', 'Condesa · vida 90', 'Del Valle · seguridad +5pts', 'Juárez · demanda ▲', 'Nápoles · 12 nuevos proyectos', 'Coyoacán · plusvalía estable', 'Santa Fe · absorción 18m'];
const WHY = [
  { i: '🏡', t: 'Solo vivienda nueva, verificada', b: 'Proyectos de desarrolladores reales, con documentación al día. Nada de listings dudosos.' },
  { i: '🧭', t: 'Conoce tu colonia antes de mudarte', b: 'Cada desarrollo trae el perfil real de su zona: seguridad, servicios, plusvalía y vida.' },
  { i: '🤝', t: 'Te acompañamos hasta las llaves', b: 'Un asesor experto de la zona, agenda de visitas y apoyo en crédito. De principio a fin.' },
];
const STATS = [['1,524', 'colonias con dato real'], ['117', 'variables por colonia'], ['590K+', 'búsquedas atendidas'], ['+8%', 'plusvalía promedio 24m']];
const TESTIMONIALS = [
  { n: 'Mariana G.', r: 'Compradora · Condesa', q: 'Vi el reporte de seguridad y plusvalía de la colonia antes de ofertar. Negocié con datos, no con nervios.' },
  { n: 'Carlos D.', r: 'Asesor · Polanco', q: 'La capa premium de colonia me cierra las dudas del cliente en la primera visita. Vendo más rápido.' },
  { n: 'Grupo Vértice', r: 'Desarrolladora', q: 'Vemos absorción vs competencia en vivo. Decidimos precio y ritmo con el mercado, no a ciegas.' },
];
const FAQ = [
  ['¿El reporte de colonia tiene costo?', 'No. Empiezas gratis y sin registro. Pagas solo si contratas servicios premium.'],
  ['¿De dónde sale el dato?', 'Fuentes oficiales: FGJ (delito), Catastro, SHF (plusvalía), Atlas de Riesgos y OpenStreetMap. Cruzamos 117 variables por colonia.'],
  ['¿Solo venden vivienda nueva?', 'Sí — preventa y entrega inmediata de desarrolladores verificados en CDMX.'],
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
        .dmx-zone{transition:transform .18s ease, box-shadow .18s ease}
        .dmx-zone img{transition:transform .35s ease}
        .dmx-zone:hover{transform:translateY(-3px); box-shadow:0 16px 40px rgba(var(--theme-rgb),0.22)}
        .dmx-zone:hover img{transform:scale(1.06)}
      `}</style>
      <PublicNav />

      {/* HERO con glow */}
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -180, right: -120, width: 620, height: 620, borderRadius: '50%',
          background: 'radial-gradient(closest-side, rgba(var(--theme-rgb),0.16), transparent)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: 120, left: -160, width: 480, height: 480, borderRadius: '50%',
          background: 'radial-gradient(closest-side, rgba(236,63,174,0.10), transparent)', pointerEvents: 'none' }} />
        <Container style={{ position: 'relative' }}>
          <Section py={36}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,0.95fr)', gap: 40, alignItems: 'center' }}>
              <div>
                <Badge tone="soft" size="md" style={{ marginBottom: 18 }}>🏠 Vivienda nueva · CDMX · 1,524 colonias</Badge>
                <h1 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(34px,4.6vw,55px)', lineHeight: 1.05, letterSpacing: -1.1, margin: '0 0 18px' }}>
                  Tu nuevo hogar,<br />elegido con el corazón<br /><span style={{ background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>y con datos.</span>
                </h1>
                <p style={{ fontSize: 'clamp(15.5px,1.6vw,18.5px)', color: 'var(--cream-2)', lineHeight: 1.6, margin: '0 0 24px', maxWidth: 500 }}>
                  Cruzamos <b style={{ color: 'var(--cream)' }}>117 variables</b> de cada colonia —seguridad, plusvalía, servicios, riesgo— para que elijas tu vivienda nueva sabiendo dónde vas a vivir, no solo cuánto cuesta.
                </p>
                <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-card)', boxShadow: 'var(--sh-card)', padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input value={zona} onChange={(e) => setZona(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()}
                    placeholder="¿Dónde quieres vivir? (colonia o alcaldía)"
                    style={{ flex: 1, minWidth: 170, border: 'none', outline: 'none', background: 'transparent', fontFamily: "'DM Sans',sans-serif", fontSize: 15, color: 'var(--cream)', padding: '8px 10px' }} />
                  <select style={selStyle}><option>Presupuesto</option><option>Hasta $4M</option><option>$4M–$7M</option><option>$7M+</option></select>
                  <select style={selStyle}><option>Recámaras</option><option>1+</option><option>2+</option><option>3+</option></select>
                  <Button size="md" onClick={go}>Buscar</Button>
                </div>
                <div style={{ fontSize: 13, color: 'var(--cream-3)', marginTop: 12 }}>Gratis · sin registro para empezar · dato verificable, no opinión.</div>
              </div>

              <div style={{ position: 'relative' }}>
                <div style={{ borderRadius: 'var(--r-card)', overflow: 'hidden', boxShadow: '0 30px 70px rgba(var(--theme-rgb),0.20)', aspectRatio: '4/5', background: 'var(--bg-3)', border: '1px solid var(--border)' }}>
                  <img src={HERO_IMG} alt="Hogar nuevo en CDMX" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </div>
                <Card variant="elevated" pad={16} hover={false} style={{ position: 'absolute', bottom: -20, left: -16, width: 250, boxShadow: '0 20px 50px rgba(0,0,0,0.14)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15 }}>Roma Norte</span>
                    <Badge tone="green" size="xs">● en vivo</Badge>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[['Seguridad', '72', 'var(--warm,#E2982E)'], ['Servicios', '94', 'var(--ok,#1FA06A)'], ['Plusvalía', '90', 'var(--theme)']].map(([l, v, c]) => (
                      <div key={l} style={{ flex: 1 }}>
                        <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 18, color: c }}>{v}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--cream-3)' }}>{l}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          </Section>
        </Container>
      </div>

      {/* LIVE TICKER */}
      <div style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--bg-2)', overflow: 'hidden', padding: '11px 0' }}>
        <div style={{ display: 'flex', gap: 36, whiteSpace: 'nowrap', width: 'max-content', animation: 'dmxTicker 32s linear infinite' }}>
          {[...TICKER, ...TICKER].map((t, i) => (
            <span key={i} style={{ fontSize: 13, color: 'var(--cream-2)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok,#1FA06A)' }} />{t}
            </span>
          ))}
        </div>
      </div>

      {/* DESTACADOS */}
      <Section py={44}>
        <Container>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
            <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(24px,3vw,32px)', letterSpacing: -0.5, margin: 0 }}>Desarrollos destacados</h2>
            <Link to="/marketplace" style={{ textDecoration: 'none' }}><Button variant="ghost" size="sm">Ver todos →</Button></Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(228px,1fr))', gap: 18 }}>
            {FEATURED.map((d) => (
              <Card key={d.name} pad={0} style={{ overflow: 'hidden', cursor: 'pointer' }} onClick={() => nav('/marketplace')}>
                <div style={{ aspectRatio: '4/3', overflow: 'hidden', background: 'var(--bg-3)' }}>
                  <img src={d.img} alt={d.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </div>
                <div style={{ padding: 14 }}>
                  <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 16 }}>{d.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--cream-3)', marginBottom: 8 }}>{d.col} · {d.beds}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, color: 'var(--cream-2)' }}>desde <b style={{ color: 'var(--cream)' }}>{d.from}</b></span>
                    <Badge tone="green" size="xs">Nuevo</Badge>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      {/* GRID DE BARRIOS estilo clikalia (foto + label + hover) */}
      <Section py={36}>
        <Container>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(24px,3vw,32px)', letterSpacing: -0.5, margin: '0 0 6px', textAlign: 'center' }}>Explora por barrio</h2>
          <p style={{ textAlign: 'center', color: 'var(--cream-2)', margin: '0 0 24px' }}>Cada uno con su perfil real de plusvalía, seguridad y vida.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px,1fr))', gap: 16 }}>
            {ZONES.map((z) => (
              <Link key={z.name} to={`/marketplace?zona=${encodeURIComponent(z.name)}`} className="dmx-zone" style={{ textDecoration: 'none', position: 'relative', display: 'block', borderRadius: 'var(--r-card)', overflow: 'hidden', aspectRatio: '16/10', boxShadow: 'var(--sh-card)' }}>
                <img src={z.img} alt={z.name} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(20,16,40,0.72) 0%, transparent 55%)' }} />
                <div style={{ position: 'absolute', left: 16, right: 16, bottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 20, color: '#fff' }}>{z.name} ›</span>
                  <span style={{ background: 'rgba(255,255,255,0.92)', borderRadius: 'var(--r-pill)', padding: '3px 10px', fontFamily: HEAD, fontWeight: 800, fontSize: 13, color: 'var(--theme-2)' }}>Plusvalía {z.plus}</span>
                </div>
              </Link>
            ))}
          </div>
        </Container>
      </Section>

      {/* POR QUÉ */}
      <Section py={50} style={{ background: 'var(--bg-2)' }}>
        <Container>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(24px,3.4vw,36px)', letterSpacing: -0.6, margin: '0 0 10px' }}>Comprar tu hogar, sin angustia.</h2>
            <p style={{ fontSize: 16, color: 'var(--cream-2)', maxWidth: 560, margin: '0 auto' }}>No es solo un departamento. Es dónde vas a vivir tu vida.</p>
          </div>
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
      <Section py={40}>
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
      <Section py={44} style={{ background: 'var(--bg-2)' }}>
        <Container>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(24px,3vw,32px)', letterSpacing: -0.5, margin: '0 0 26px', textAlign: 'center' }}>Quien decide con dato, decide tranquilo.</h2>
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
          <Card variant="elevated" pad={0} hover={false} style={{ overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))' }}>
              <div style={{ padding: '34px 32px' }}>
                <Badge tone="theme" style={{ marginBottom: 12 }}>Para asesores</Badge>
                <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(22px,2.8vw,30px)', letterSpacing: -0.5, margin: '0 0 12px' }}>Vende más con inteligencia que nadie más tiene.</h2>
                {['Leads atribuidos de compradores reales', 'Capa premium de colonia (lo que el cliente NO ve)', 'CRM ligero + material por cliente con un click'].map((x) => (
                  <div key={x} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14.5, color: 'var(--cream-2)', marginBottom: 9 }}><span style={{ color: 'var(--theme)', fontWeight: 800 }}>✓</span>{x}</div>
                ))}
                <Link to="/asesores" style={{ textDecoration: 'none' }}><Button size="md" style={{ marginTop: 12 }}>Únete gratis como asesor →</Button></Link>
              </div>
              <div style={{ background: 'var(--bg-3)', minHeight: 220 }}><img src={IMG('photo-1556761175-b413da4baf72')} alt="Asesor" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /></div>
            </div>
          </Card>
        </Container>
      </Section>

      {/* DESARROLLADORES */}
      <Section py={44} id="desarrolladores">
        <Container>
          <Card variant="elevated" pad={0} hover={false} style={{ overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))' }}>
              <div style={{ background: 'var(--bg-3)', minHeight: 220 }}><img src={IMG('photo-1486406146926-c627a92ad1ab')} alt="Desarrollo" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /></div>
              <div style={{ padding: '34px 32px' }}>
                <Badge tone="theme" style={{ marginBottom: 12 }}>Para desarrolladores</Badge>
                <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(22px,2.8vw,30px)', letterSpacing: -0.5, margin: '0 0 12px' }}>Vende tu proyecto donde el dato dice que sí.</h2>
                {['Publica tu inventario en tiempo real', 'Leads atribuidos + embudo medible', 'Absorción vs competencia y dónde está la demanda'].map((x) => (
                  <div key={x} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14.5, color: 'var(--cream-2)', marginBottom: 9 }}><span style={{ color: 'var(--theme)', fontWeight: 800 }}>✓</span>{x}</div>
                ))}
                <Link to="/login" style={{ textDecoration: 'none' }}><Button size="md" style={{ marginTop: 12 }}>Publica tu proyecto →</Button></Link>
              </div>
            </div>
          </Card>
        </Container>
      </Section>

      {/* ALIADOS */}
      <Section py={30}>
        <Container style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--cream-3)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 14 }}>Operamos junto a plataformas que mueven el real estate</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 30, justifyContent: 'center', alignItems: 'center' }}>
            {ALLIES.map((a) => <span key={a} style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 18, color: 'var(--cream-3)' }}>{a}</span>)}
          </div>
        </Container>
      </Section>

      {/* FAQ */}
      <Section py={40} style={{ background: 'var(--bg-2)' }}>
        <Container max={760}>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(22px,3vw,30px)', letterSpacing: -0.5, margin: '0 0 20px', textAlign: 'center' }}>Preguntas frecuentes</h2>
          {FAQ.map(([q, a]) => (
            <Card key={q} pad={18} style={{ marginBottom: 12 }}>
              <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 15.5, marginBottom: 5 }}>{q}</div>
              <div style={{ fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.6 }}>{a}</div>
            </Card>
          ))}
        </Container>
      </Section>

      {/* CTA FINAL */}
      <Section py={56}>
        <Container max={820}>
          <div style={{ borderRadius: 'var(--r-card)', padding: '46px 36px', textAlign: 'center', background: 'var(--grad)', boxShadow: '0 30px 70px rgba(var(--theme-rgb),0.28)' }}>
            <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(26px,3.8vw,40px)', letterSpacing: -0.7, color: '#fff', margin: '0 0 12px' }}>Tu nuevo hogar te está esperando.</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', maxWidth: 480, margin: '0 auto 24px', lineHeight: 1.6 }}>Empieza por la zona que sueñas. Gratis y en segundos.</p>
            <Link to="/marketplace" style={{ textDecoration: 'none' }}><Button size="lg" style={{ background: '#fff', color: 'var(--theme-2)' }}>Buscar mi hogar →</Button></Link>
          </div>
        </Container>
      </Section>

      <Container style={{ paddingTop: 24, paddingBottom: 40, textAlign: 'center', borderTop: '1px solid var(--border)' }}>
        <span style={{ fontSize: 12.5, color: 'var(--cream-3)' }}>DesarrollosMX · Vivienda nueva en CDMX · 1,524 colonias con dato real · vista previa /v2</span>
      </Container>
    </LightScope>
  );
}

const selStyle = { border: '1px solid var(--border)', borderRadius: 'var(--r-inner)', background: 'var(--bg)', color: 'var(--cream-2)', fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, padding: '9px 10px', outline: 'none', cursor: 'pointer' };
