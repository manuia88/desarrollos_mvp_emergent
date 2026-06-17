import React from 'react';
import { Link } from 'react-router-dom';
import { LightScope, Container, Section, Button, Card, Badge, PublicNav } from '../../components/ui';

/** /asesores — landing clara para asesores + registro. Sistema nuevo, Title Case, español MX. */
const HEAD = "'Outfit',sans-serif";
const SERIF = { fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic', fontWeight: 600 };
const IMG = 'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=900&q=80';

const VALUE = [
  { i: '🎯', t: 'Clientes Reales, No Curiosos', b: 'Recibe compradores interesados en tus zonas, ya filtrados por presupuesto e intención.' },
  { i: '🔐', t: 'La Información que Cierra Ventas', b: 'La capa premium de la colonia: seguridad, plusvalía y servicios. Lo que convence al cliente en la primera visita.' },
  { i: '⚡', t: 'Menos Trabajo, Más Cierres', b: 'CRM sencillo, material por cliente con un click y agenda de visitas. Tú vende, lo demás lo hacemos nosotros.' },
];
const STEPS = [
  ['1', 'Regístrate Gratis', 'Con tu correo o Google. En 2 minutos estás dentro.'],
  ['2', 'Verifica Tu Perfil', 'Subes tu cédula o identificación y quedas como asesor verificado.'],
  ['3', 'Recibe y Cierra', 'Te llegan clientes de tus zonas y cierras con la información de tu lado.'],
];

export default function AsesoresV2() {
  return (
    <LightScope>
      <PublicNav />
      <Container>
        <Section py={44}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,0.95fr)', gap: 40, alignItems: 'center' }}>
            <div>
              <Badge tone="theme" size="md" style={{ marginBottom: 16 }}>Para Asesores Inmobiliarios</Badge>
              <h1 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(32px,4.4vw,50px)', lineHeight: 1.06, letterSpacing: -1.1, margin: '0 0 16px' }}>
                Vende Más con Información que <span style={{ ...SERIF, background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Nadie Más Tiene</span>.
              </h1>
              <p style={{ fontSize: 'clamp(15.5px,1.6vw,18px)', color: 'var(--cream-2)', lineHeight: 1.6, margin: '0 0 24px', maxWidth: 480 }}>
                Te conectamos con compradores reales y te damos el perfil de cada colonia para que cierres con datos, no con suerte. Gratis para empezar.
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link to="/login" style={{ textDecoration: 'none' }}><Button size="lg">Únete Gratis como Asesor →</Button></Link>
                <Link to="/marketplace" style={{ textDecoration: 'none' }}><Button variant="secondary" size="lg">Ver el Marketplace</Button></Link>
              </div>
            </div>
            <div style={{ borderRadius: 'var(--r-card)', overflow: 'hidden', boxShadow: '0 30px 70px rgba(var(--theme-rgb),0.18)', aspectRatio: '4/3' }}>
              <img src={IMG} alt="Asesor inmobiliario" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
          </div>
        </Section>
      </Container>

      <Section py={48} style={{ background: 'var(--surface-card)' }}>
        <Container>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(24px,3.2vw,34px)', letterSpacing: -0.5, margin: '0 0 30px', textAlign: 'center' }}>Lo que Ganas al <span style={SERIF}>Unirte</span></h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px,1fr))', gap: 18 }}>
            {VALUE.map((v) => (
              <Card key={v.t} pad={24}>
                <div style={{ fontSize: 30, marginBottom: 10 }}>{v.i}</div>
                <h3 style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 18, margin: '0 0 8px' }}>{v.t}</h3>
                <p style={{ fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.6, margin: 0 }}>{v.b}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section py={48}>
        <Container>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(24px,3.2vw,34px)', letterSpacing: -0.5, margin: '0 0 30px', textAlign: 'center' }}>Cómo <span style={SERIF}>Funciona</span></h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px,1fr))', gap: 18 }}>
            {STEPS.map(([n, t, b]) => (
              <Card key={n} pad={24}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--grad)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: HEAD, fontWeight: 800, fontSize: 18, marginBottom: 12 }}>{n}</div>
                <h3 style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 17, margin: '0 0 6px' }}>{t}</h3>
                <p style={{ fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.6, margin: 0 }}>{b}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section py={52}>
        <Container max={780}>
          <div style={{ borderRadius: 'var(--r-card)', padding: '42px 32px', textAlign: 'center', background: 'var(--grad)', boxShadow: '0 30px 70px rgba(var(--theme-rgb),0.26)' }}>
            <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(24px,3.4vw,36px)', letterSpacing: -0.6, color: '#fff', margin: '0 0 12px' }}>Empieza Hoy, Gratis.</h2>
            <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.9)', margin: '0 auto 22px', maxWidth: 440 }}>Sin mensualidad para arrancar. Solo necesitas tu cédula.</p>
            <Link to="/login" style={{ textDecoration: 'none' }}><Button size="lg" style={{ background: '#fff', color: 'var(--theme-2)' }}>Crear Mi Cuenta de Asesor →</Button></Link>
          </div>
        </Container>
      </Section>
      <Container style={{ paddingTop: 24, paddingBottom: 40, textAlign: 'center', borderTop: '1px solid var(--card-border)' }}>
        <span style={{ fontSize: 12.5, color: 'var(--cream-3)' }}>DesarrollosMX · Para Asesores · CDMX</span>
      </Container>
    </LightScope>
  );
}
