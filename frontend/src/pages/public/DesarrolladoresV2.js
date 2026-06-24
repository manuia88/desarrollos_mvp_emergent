import React from 'react';
import { Link } from 'react-router-dom';
import { LightScope, Container, Section, Button, Card, Badge, PublicNav } from '../../components/ui';
import AtlaxBubble from '../../components/landing/AtlaxBubble';
import ZonaPulsoWidget from '../../components/landing/ZonaPulsoWidget';

/** /desarrolladores — landing estilo Hormozi: muestra de valor (pulso de zona real) → registro. MX, Title Case. */
const HEAD = "'Outfit',sans-serif";
const SERIF = { fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic', fontWeight: 600 };
const GRADTXT = { ...SERIF, background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };

const PAINS = [
  ['💸', 'Gastas en marketing que trae curiosos', 'Anuncios y portales que llenan tu CRM de gente que no compra. Pagas por volumen, no por ventas.'],
  ['🎲', 'Decides precio y producto a ciegas', 'Pones el precio “como el vecino” y rezas. Sin saber qué busca de verdad la gente en tu zona.'],
  ['🐌', 'Tu inventario se estanca', 'Y no sabes si es el precio, el producto o la forma de pago. Cada mes parado cuesta.'],
];

const STACK = [
  ['🧭', 'Inteligencia de demanda de tus zonas', 'Qué busca la gente y NO encuentra, a dónde se va tu demanda, cuántos no les alcanza y qué esquema de pago piden.', 'sepas dónde construir y a qué precio, con señal real'],
  ['📊', 'Benchmark contra el mercado', 'Tu absorción y tu $/m² vs la competencia, y qué amenidad sube de verdad el precio.', 'dejes de adivinar y de regalar margen'],
  ['💳', 'Formas de pago conectadas al comprador', 'Configura preventa, crédito y contado; el buscador le muestra su mensualidad real.', 'cierres con el plan que la gente sí puede pagar'],
  ['🎯', 'Marketing por ángulo + Atlax 24/7', 'Landings por intención (inversión, familia, plusvalía…), video con IA y un asistente que califica leads de noche.', 'atraigas al comprador correcto y recibas leads tibios, no fríos'],
  ['👥', 'CRM + red comercial', '1 asesor responsable por proyecto, pipeline claro y leads que llegan con contexto de qué buscan.', 'tu equipo cierre sin fugas ni leads huérfanos'],
  ['🧠', 'Un cerebro que aprende tu mercado', 'Predice valor de venta y días en mercado, aprende de cada cierre, y te propone la jugada — tú apruebas.', 'decidas con una máquina que mejora sola'],
];

const STEPS = [
  ['1', 'Pon tu zona aquí arriba', 'Mira gratis el pulso real de tu colonia: cuántos buscan, con qué presupuesto y quién compite.'],
  ['2', 'Publica tu proyecto', 'Subes unidades, precios y formas de pago. Te conectamos con demanda real y con asesores.'],
  ['3', 'Vende con datos', 'Precio, producto y plan de pago que la gente sí compra — medido de principio a fin.'],
];

const FAQ = [
  ['¿Cuánto cuesta empezar?', 'Nada. Publicas tu proyecto gratis y solo pagas cuando vendes. Sin costo de entrada.'],
  ['¿Quién ve los datos de mi zona?', 'La inteligencia de demanda es tuya. Te mostramos agregados anónimos del mercado, nunca datos crudos de otro desarrollador.'],
  ['¿Necesito exclusividad?', 'No. Pero asignamos 1 asesor responsable por proyecto para que tus leads no se diluyan.'],
  ['¿Qué tan rápido publico?', 'En el mismo día. Y te ayudamos con el material (fotos, video, landing).'],
];

export default function DesarrolladoresV2() {
  return (
    <LightScope>
      <PublicNav />

      {/* ── HERO + lead magnet ── */}
      <Container>
        <Section py={44}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.02fr)', gap: 40, alignItems: 'center' }}>
            <div>
              <Badge tone="theme" size="md" style={{ marginBottom: 16 }}>Para Desarrolladores</Badge>
              <h1 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(30px,4.2vw,48px)', lineHeight: 1.05, letterSpacing: -1.1, margin: '0 0 16px' }}>
                Vende más rápido — y sabe exactamente <span style={GRADTXT}>qué construir y a qué precio</span>.
              </h1>
              <p style={{ fontSize: 'clamp(15.5px,1.6vw,18px)', color: 'var(--cream-2)', lineHeight: 1.6, margin: '0 0 22px', maxWidth: 480 }}>
                La única plataforma de CDMX que te muestra <b>lo que la gente busca y no encuentra en tus zonas</b> — y pone tu proyecto frente a quien sí va a comprar.
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                <Link to="/login" style={{ textDecoration: 'none' }}><Button size="lg">Publica Tu Proyecto Gratis →</Button></Link>
                <Link to="/marketplace" style={{ textDecoration: 'none' }}><Button variant="secondary" size="lg">Ver el Marketplace</Button></Link>
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)' }}>Sin costo de entrada · Pagas solo cuando vendes · 1 asesor por proyecto</div>
            </div>
            <ZonaPulsoWidget rol="dev" />
          </div>
        </Section>
      </Container>

      {/* ── PROBLEMA ── */}
      <Section py={46} style={{ background: 'var(--surface-card)' }}>
        <Container>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(23px,3.1vw,33px)', letterSpacing: -0.5, margin: '0 0 8px', textAlign: 'center' }}>Vender un desarrollo <span style={SERIF}>no debería ser a ciegas</span></h2>
          <p style={{ textAlign: 'center', color: 'var(--cream-2)', fontSize: 15, margin: '0 auto 28px', maxWidth: 520 }}>Si te suena alguno de estos, no es tu culpa — es que te falta la información correcta:</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px,1fr))', gap: 18 }}>
            {PAINS.map(([i, t, b]) => (
              <Card key={t} pad={24}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>{i}</div>
                <h3 style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 17, margin: '0 0 8px' }}>{t}</h3>
                <p style={{ fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.6, margin: 0 }}>{b}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      {/* ── MECANISMO + VALUE STACK ── */}
      <Section py={50}>
        <Container>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <Badge tone="theme" size="md" style={{ marginBottom: 12 }}>Lo que recibes</Badge>
            <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(23px,3.1vw,34px)', letterSpacing: -0.5, margin: '0 0 10px' }}>No es un CRM más. Es <span style={SERIF}>demanda real + un cerebro que aprende tu mercado</span>.</h2>
            <p style={{ color: 'var(--cream-2)', fontSize: 15, margin: '0 auto', maxWidth: 560 }}>Todo lo que entra en tu cuenta de desarrollador:</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px,1fr))', gap: 16 }}>
            {STACK.map(([i, t, b, y]) => (
              <Card key={t} pad={24}>
                <div style={{ fontSize: 26, marginBottom: 10 }}>{i}</div>
                <h3 style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 17, margin: '0 0 7px' }}>{t}</h3>
                <p style={{ fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.55, margin: '0 0 10px' }}>{b}</p>
                <p style={{ fontSize: 13, color: 'var(--theme)', fontWeight: 600, lineHeight: 1.5, margin: 0 }}>→ Para que tú {y}.</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      {/* ── CÓMO FUNCIONA ── */}
      <Section py={48} style={{ background: 'var(--surface-card)' }}>
        <Container>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(23px,3.1vw,33px)', letterSpacing: -0.5, margin: '0 0 30px', textAlign: 'center' }}>Cómo <span style={SERIF}>Funciona</span></h2>
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

      {/* ── GARANTÍA / RIESGO ── */}
      <Section py={44}>
        <Container max={820}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
            {[['✅', 'Empiezas gratis', 'Sin costo de entrada. Pagas solo cuando vendes.'], ['🔒', 'Tu data es tuya', 'La inteligencia de tu zona no se comparte. Agregados anónimos del mercado, nada crudo de otros.'], ['🤝', '1 asesor por proyecto', 'Tus leads no se diluyen entre 10 personas.']].map(([i, t, b]) => (
              <div key={t} style={{ padding: 20, borderRadius: 'var(--r-card)', border: '1px solid var(--card-border)', background: 'var(--surface-card)' }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{i}</div>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15.5, marginBottom: 4 }}>{t}</div>
                <div style={{ fontSize: 13, color: 'var(--cream-2)', lineHeight: 1.55 }}>{b}</div>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      {/* ── FAQ ── */}
      <Section py={44} style={{ background: 'var(--surface-card)' }}>
        <Container max={760}>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(22px,3vw,30px)', letterSpacing: -0.5, margin: '0 0 24px', textAlign: 'center' }}>Preguntas <span style={SERIF}>Frecuentes</span></h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {FAQ.map(([q, a]) => (
              <Card key={q} pad={20}>
                <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{q}</div>
                <div style={{ fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.6 }}>{a}</div>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      {/* ── CTA FINAL ── */}
      <Section py={52}>
        <Container max={780}>
          <div style={{ borderRadius: 'var(--r-card)', padding: '42px 32px', textAlign: 'center', background: 'var(--grad)', boxShadow: '0 30px 70px rgba(var(--theme-rgb),0.26)' }}>
            <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(24px,3.4vw,36px)', letterSpacing: -0.6, color: '#fff', margin: '0 0 12px' }}>Pon tu proyecto frente a quien sí compra.</h2>
            <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.9)', margin: '0 auto 22px', maxWidth: 460 }}>Gratis para empezar. Te ayudamos a publicar y a vender con datos.</p>
            <Link to="/login" style={{ textDecoration: 'none' }}><Button size="lg" style={{ background: '#fff', color: 'var(--theme-2)' }}>Crear Mi Cuenta de Desarrollador →</Button></Link>
          </div>
        </Container>
      </Section>

      <Container style={{ paddingTop: 24, paddingBottom: 40, textAlign: 'center', borderTop: '1px solid var(--card-border)' }}>
        <span style={{ fontSize: 12.5, color: 'var(--cream-3)' }}>DesarrollosMX · Para Desarrolladores · CDMX</span>
      </Container>
      <AtlaxBubble theme="light" context="El usuario está en la landing para DESARROLLADORES. Quiere vender su proyecto y entender la inteligencia de demanda. Ayúdalo a registrarse y explícale el valor (qué busca la gente en su zona, formas de pago, leads, el cerebro)." />
    </LightScope>
  );
}
