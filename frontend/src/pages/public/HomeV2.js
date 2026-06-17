import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LightScope, Container, Section, Button, Card, Badge } from '../../components/ui';

/**
 * Home V2 — marketplace de VIVIENDA NUEVA, enfocado al COMPRADOR. Cálido, emocional, búsqueda
 * primero (referencias UX: loft.com.br · clikalia.es · quintoandar). La inteligencia de colonia
 * es el diferencial de CONFIANZA, no el gancho frío. Secciones secundarias para asesor y dev.
 * Imágenes Unsplash = placeholders cálidos (se cambian por fotos reales de los desarrollos).
 */
const HEAD = "'Outfit', sans-serif";
const IMG = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=80`;

const HERO_IMG = IMG('photo-1600585154340-be6161a56a0c'); // casa moderna luminosa
const FEATURED = [
  { name: 'Altavista Polanco', col: 'Polanco', from: '$8.5M', beds: '2–3 rec', img: IMG('photo-1545324418-cc1a3fa10c00') },
  { name: 'Reforma Living', col: 'Juárez', from: '$5.2M', beds: '1–2 rec', img: IMG('photo-1502672260266-1c1ef2d93688') },
  { name: 'Parque Condesa', col: 'Condesa', from: '$7.8M', beds: '2 rec', img: IMG('photo-1560448204-e02f11c3d0e2') },
  { name: 'Del Valle 360', col: 'Del Valle', from: '$4.9M', beds: '2–3 rec', img: IMG('photo-1493809842364-78817add7ffb') },
];
const ZONAS = ['Polanco', 'Condesa', 'Roma Norte', 'Del Valle', 'Nápoles', 'Juárez', 'Coyoacán', 'Santa Fe', 'Narvarte', 'Lomas'];
const WHY = [
  { t: 'Solo vivienda nueva, verificada', b: 'Proyectos de desarrolladores reales, con documentación al día. Nada de listings dudosos.' },
  { t: 'Conoce tu colonia antes de mudarte', b: 'Cada desarrollo trae el perfil real de su zona: seguridad, servicios, plusvalía y vida. Decides con todo a la vista.' },
  { t: 'Te acompañamos hasta las llaves', b: 'Un asesor experto de la zona, agenda de visitas y apoyo en crédito. De principio a fin.' },
];

export default function HomeV2() {
  const nav = useNavigate();
  const [zona, setZona] = useState('');
  const go = () => nav(`/marketplace${zona ? `?zona=${encodeURIComponent(zona)}` : ''}`);

  return (
    <LightScope>
      {/* NAV */}
      <Container style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 18, paddingBottom: 18 }}>
        <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 21, letterSpacing: -0.3 }}>
          Desarrollos<span style={{ color: 'var(--theme)' }}>MX</span>
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Link to="/marketplace" style={{ textDecoration: 'none' }}><Button variant="ghost" size="sm">Comprar</Button></Link>
          <a href="#asesores" style={{ textDecoration: 'none' }}><Button variant="ghost" size="sm">Soy asesor</Button></a>
          <a href="#desarrolladores" style={{ textDecoration: 'none' }}><Button variant="ghost" size="sm">Soy desarrollador</Button></a>
          <Link to="/login" style={{ textDecoration: 'none' }}><Button variant="secondary" size="sm">Entrar</Button></Link>
        </div>
      </Container>

      {/* HERO — emocional + búsqueda + foto */}
      <Container>
        <Section py={40}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,0.95fr)', gap: 40, alignItems: 'center' }}>
            <div>
              <Badge tone="soft" size="md" style={{ marginBottom: 18 }}>🏠 Vivienda nueva en CDMX · 1,524 colonias</Badge>
              <h1 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(34px,4.6vw,54px)', lineHeight: 1.06, letterSpacing: -1.1, margin: '0 0 18px' }}>
                Tu nuevo hogar,<br />elegido con el corazón<br /><span style={{ background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>y con datos.</span>
              </h1>
              <p style={{ fontSize: 'clamp(15.5px,1.6vw,18.5px)', color: 'var(--cream-2)', lineHeight: 1.6, margin: '0 0 26px', maxWidth: 500 }}>
                Vivienda nueva de los mejores desarrolladores. Y por primera vez, conoce el perfil real de cada colonia <b style={{ color: 'var(--cream)' }}>antes de mudarte</b>.
              </p>

              {/* Barra de búsqueda */}
              <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-card)', boxShadow: 'var(--sh-card)', padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  value={zona} onChange={(e) => setZona(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()}
                  placeholder="¿Dónde quieres vivir? (colonia o alcaldía)"
                  style={{ flex: 1, minWidth: 180, border: 'none', outline: 'none', background: 'transparent', fontFamily: "'DM Sans',sans-serif", fontSize: 15, color: 'var(--cream)', padding: '8px 10px' }}
                />
                <select style={selStyle}><option>Presupuesto</option><option>Hasta $4M</option><option>$4M–$7M</option><option>$7M+</option></select>
                <select style={selStyle}><option>Recámaras</option><option>1+</option><option>2+</option><option>3+</option></select>
                <Button size="md" onClick={go}>Buscar</Button>
              </div>
              <div style={{ fontSize: 13, color: 'var(--cream-3)', marginTop: 12 }}>Gratis · sin registro para empezar · vivienda nueva verificada.</div>
            </div>

            {/* Foto hero */}
            <div style={{ position: 'relative' }}>
              <div style={{ borderRadius: 'var(--r-card)', overflow: 'hidden', boxShadow: 'var(--sh-card)', aspectRatio: '4/5', background: 'var(--bg-3)' }}>
                <img src={HERO_IMG} alt="Hogar nuevo en CDMX" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
              {/* mini-tarjeta de confianza flotante */}
              <Card variant="elevated" pad={14} hover={false} style={{ position: 'absolute', bottom: -18, left: -14, width: 230 }}>
                <div style={{ fontSize: 11, color: 'var(--cream-3)', marginBottom: 6 }}>Perfil de la colonia · en vivo</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[['Seguridad', '72'], ['Servicios', '94'], ['Plusvalía', '90']].map(([l, v]) => (
                    <div key={l} style={{ flex: 1, minWidth: 60 }}>
                      <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 17, color: 'var(--theme)' }}>{v}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--cream-3)' }}>{l}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </Section>
      </Container>

      {/* DESTACADOS */}
      <Section py={44}>
        <Container>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22 }}>
            <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(24px,3vw,32px)', letterSpacing: -0.5, margin: 0 }}>Desarrollos destacados</h2>
            <Link to="/marketplace" style={{ textDecoration: 'none' }}><Button variant="ghost" size="sm">Ver todos →</Button></Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px,1fr))', gap: 18 }}>
            {FEATURED.map((d) => (
              <Card key={d.name} pad={0} style={{ overflow: 'hidden', cursor: 'pointer' }} onClick={() => nav('/marketplace')}>
                <div style={{ aspectRatio: '4/3', background: 'var(--bg-3)' }}>
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

      {/* POR QUÉ */}
      <Section py={52} style={{ background: 'var(--bg-2)' }}>
        <Container>
          <div style={{ textAlign: 'center', marginBottom: 34 }}>
            <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(24px,3.4vw,36px)', letterSpacing: -0.6, margin: '0 0 10px' }}>Comprar tu hogar, sin angustia.</h2>
            <p style={{ fontSize: 16, color: 'var(--cream-2)', maxWidth: 560, margin: '0 auto' }}>No es solo un departamento. Es dónde vas a vivir tu vida. Te damos todo para elegir tranquilo.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px,1fr))', gap: 18 }}>
            {WHY.map((w) => (
              <Card key={w.t} pad={22}>
                <h3 style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 18, margin: '0 0 8px' }}>{w.t}</h3>
                <p style={{ fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.6, margin: 0 }}>{w.b}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      {/* EXPLORA POR ZONA */}
      <Section py={44}>
        <Container style={{ textAlign: 'center' }}>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(22px,3vw,30px)', letterSpacing: -0.5, margin: '0 0 18px' }}>Explora por zona</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            {ZONAS.map((z) => (
              <Link key={z} to={`/marketplace?zona=${encodeURIComponent(z)}`} style={{ textDecoration: 'none' }}>
                <span className="dmx-card" style={{ display: 'inline-block', padding: '8px 16px', borderRadius: 'var(--r-pill)', background: 'var(--bg-2)', color: 'var(--cream-2)', fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>{z}</span>
              </Link>
            ))}
          </div>
        </Container>
      </Section>

      {/* ASESORES */}
      <Section py={46} id="asesores">
        <Container>
          <Card variant="elevated" pad={0} hover={false} style={{ overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))' }}>
              <div style={{ padding: '34px 32px' }}>
                <Badge tone="theme" style={{ marginBottom: 12 }}>Para asesores inmobiliarios</Badge>
                <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(22px,2.8vw,30px)', letterSpacing: -0.5, margin: '0 0 12px' }}>Vende más con inteligencia que nadie más tiene.</h2>
                <ul style={{ margin: '0 0 20px', padding: 0, listStyle: 'none' }}>
                  {['Leads atribuidos de compradores reales', 'Capa premium de colonia (lo que tu cliente NO ve)', 'CRM ligero + material por cliente con un click'].map((x) => (
                    <li key={x} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14.5, color: 'var(--cream-2)', marginBottom: 9 }}>
                      <span style={{ color: 'var(--theme)', fontWeight: 800 }}>✓</span>{x}
                    </li>
                  ))}
                </ul>
                <Link to="/asesores" style={{ textDecoration: 'none' }}><Button size="md">Únete gratis como asesor →</Button></Link>
              </div>
              <div style={{ background: 'var(--bg-3)', minHeight: 200 }}>
                <img src={IMG('photo-1556761175-b413da4baf72')} alt="Asesor inmobiliario" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
            </div>
          </Card>
        </Container>
      </Section>

      {/* DESARROLLADORES */}
      <Section py={46} id="desarrolladores">
        <Container>
          <Card variant="elevated" pad={0} hover={false} style={{ overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))' }}>
              <div style={{ background: 'var(--bg-3)', minHeight: 200, order: 0 }}>
                <img src={IMG('photo-1486406146926-c627a92ad1ab')} alt="Desarrollo inmobiliario" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
              <div style={{ padding: '34px 32px' }}>
                <Badge tone="theme" style={{ marginBottom: 12 }}>Para desarrolladores</Badge>
                <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(22px,2.8vw,30px)', letterSpacing: -0.5, margin: '0 0 12px' }}>Vende tu proyecto donde el dato dice que sí.</h2>
                <ul style={{ margin: '0 0 20px', padding: 0, listStyle: 'none' }}>
                  {['Publica tu inventario en tiempo real', 'Leads atribuidos + embudo medible', 'Absorción vs competencia y dónde está la demanda real'].map((x) => (
                    <li key={x} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14.5, color: 'var(--cream-2)', marginBottom: 9 }}>
                      <span style={{ color: 'var(--theme)', fontWeight: 800 }}>✓</span>{x}
                    </li>
                  ))}
                </ul>
                <Link to="/login" style={{ textDecoration: 'none' }}><Button size="md">Publica tu proyecto →</Button></Link>
              </div>
            </div>
          </Card>
        </Container>
      </Section>

      {/* CTA FINAL */}
      <Section py={56}>
        <Container max={820}>
          <div style={{ borderRadius: 'var(--r-card)', padding: '46px 36px', textAlign: 'center', background: 'var(--grad)' }}>
            <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(26px,3.8vw,40px)', letterSpacing: -0.7, color: '#fff', margin: '0 0 12px' }}>Tu nuevo hogar te está esperando.</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', maxWidth: 480, margin: '0 auto 24px', lineHeight: 1.6 }}>Empieza por la zona que sueñas. Gratis y en segundos.</p>
            <Link to="/marketplace" style={{ textDecoration: 'none' }}>
              <Button size="lg" style={{ background: '#fff', color: 'var(--theme-2)' }}>Buscar mi hogar →</Button>
            </Link>
          </div>
        </Container>
      </Section>

      <Container style={{ paddingTop: 24, paddingBottom: 40, textAlign: 'center', borderTop: '1px solid var(--border)' }}>
        <span style={{ fontSize: 12.5, color: 'var(--cream-3)' }}>DesarrollosMX · Vivienda nueva en CDMX · vista previa /v2</span>
      </Container>
    </LightScope>
  );
}

const selStyle = {
  border: '1px solid var(--border)', borderRadius: 'var(--r-inner)', background: 'var(--bg)',
  color: 'var(--cream-2)', fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, padding: '9px 10px', outline: 'none', cursor: 'pointer',
};
