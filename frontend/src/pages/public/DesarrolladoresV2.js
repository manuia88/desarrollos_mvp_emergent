import React from 'react';
import { Link } from 'react-router-dom';
import { LightScope, Container, Section, Button, Card, Badge, PublicNav } from '../../components/ui';
import AtlaxBubble from '../../components/landing/AtlaxBubble';

/** /desarrolladores — landing clara para desarrolladores + registro. Sistema nuevo, Title Case, MX. */
const HEAD = "'Outfit',sans-serif";
const SERIF = { fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic', fontWeight: 600 };
const IMG = 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=900&q=80';

const VALUE = [
  { i: '📡', t: 'Tu Inventario, en Tiempo Real', b: 'Publica unidades, precios y disponibilidad. El comprador ve lo que de verdad hay.' },
  { i: '🎯', t: 'Clientes Atribuidos a Ti', b: 'Cada lead llega con nombre, zona y origen. Sabes exactamente de dónde viene cada venta.' },
  { i: '📈', t: 'Vende al Ritmo del Mercado', b: 'Qué tan rápido se vende tu zona vs la competencia y dónde está la demanda. Decides precio con datos.' },
];
const STEPS = [
  ['1', 'Crea Tu Cuenta', 'Registra tu desarrolladora y tu primer proyecto.'],
  ['2', 'Publica Tu Proyecto', 'Sube fotos, unidades y precios. Te ayudamos con el material.'],
  ['3', 'Recibe Clientes', 'Te llegan compradores reales y mides tu embudo de principio a fin.'],
];

export default function DesarrolladoresV2() {
  return (
    <LightScope>
      <PublicNav />
      <Container>
        <Section py={44}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,0.95fr) minmax(0,1.05fr)', gap: 40, alignItems: 'center' }}>
            <div style={{ borderRadius: 'var(--r-card)', overflow: 'hidden', boxShadow: '0 30px 70px rgba(var(--theme-rgb),0.18)', aspectRatio: '4/3', order: 0 }}>
              <img src={IMG} alt="Desarrollo inmobiliario" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
            <div>
              <Badge tone="theme" size="md" style={{ marginBottom: 16 }}>Para Desarrolladores</Badge>
              <h1 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(32px,4.4vw,50px)', lineHeight: 1.06, letterSpacing: -1.1, margin: '0 0 16px' }}>
                Vende Tu Proyecto Donde el <span style={{ ...SERIF, background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Dato Dice que Sí</span>.
              </h1>
              <p style={{ fontSize: 'clamp(15.5px,1.6vw,18px)', color: 'var(--cream-2)', lineHeight: 1.6, margin: '0 0 24px', maxWidth: 480 }}>
                Publica tu inventario, recibe clientes atribuidos y mide tu absorción contra la competencia. Toma decisiones de precio y ritmo con el mercado, no a ciegas.
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link to="/login" style={{ textDecoration: 'none' }}><Button size="lg">Publica Tu Proyecto →</Button></Link>
                <Link to="/marketplace" style={{ textDecoration: 'none' }}><Button variant="secondary" size="lg">Ver el Marketplace</Button></Link>
              </div>
            </div>
          </div>
        </Section>
      </Container>

      <Section py={48} style={{ background: 'var(--surface-card)' }}>
        <Container>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(24px,3.2vw,34px)', letterSpacing: -0.5, margin: '0 0 30px', textAlign: 'center' }}>Por Qué Vender con <span style={SERIF}>Nosotros</span></h2>
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
            <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(24px,3.4vw,36px)', letterSpacing: -0.6, color: '#fff', margin: '0 0 12px' }}>Pon Tu Proyecto Frente a Quien Compra.</h2>
            <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.9)', margin: '0 auto 22px', maxWidth: 440 }}>Te acompañamos a publicar y a vender mejor.</p>
            <Link to="/login" style={{ textDecoration: 'none' }}><Button size="lg" style={{ background: '#fff', color: 'var(--theme-2)' }}>Crear Mi Cuenta de Desarrollador →</Button></Link>
          </div>
        </Container>
      </Section>
      <Container style={{ paddingTop: 24, paddingBottom: 40, textAlign: 'center', borderTop: '1px solid var(--card-border)' }}>
        <span style={{ fontSize: 12.5, color: 'var(--cream-3)' }}>DesarrollosMX · Para Desarrolladores · CDMX</span>
      </Container>
      <AtlaxBubble />
    </LightScope>
  );
}
