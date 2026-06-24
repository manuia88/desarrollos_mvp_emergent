import React from 'react';
import { Link } from 'react-router-dom';
import { LightScope, Container, Section, Button, Card, Badge, PublicNav } from '../../components/ui';
import AtlaxBubble from '../../components/landing/AtlaxBubble';
import ZonaPulsoWidget from '../../components/landing/ZonaPulsoWidget';

/** /asesores — landing estilo Hormozi: muestra de valor (demanda de tu zona) → registro. MX, Title Case. */
const HEAD = "'Outfit',sans-serif";
const SERIF = { fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic', fontWeight: 600 };
const GRADTXT = { ...SERIF, background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };

const PAINS = [
  ['🥶', 'Persigues leads fríos que ni contestan', 'Compras bases o respondes portales y la mitad ni sabe qué quiere. Quemas horas en gente que no compra.'],
  ['😴', 'Se te enfrían los clientes dormidos', 'Ese que vio algo hace 2 meses ya se fue con otro. No tienes cómo revivirlo a tiempo.'],
  ['📋', 'Pierdes horas en CRM y seguimiento', 'Capturando datos, armando números y mandando WhatsApps — en vez de estar cerrando.'],
];

const STACK = [
  ['🔥', 'Leads con contexto, ya tibios', 'Llegan del marketplace y de Atlax con lo que buscan (zona, presupuesto, intención). Sabes qué quieren antes de llamar.', 'hables con gente lista, no con curiosos'],
  ['🧠', 'Un equipo de IA que trabaja contigo', 'Agentes que prospectan, nutren, califican y te entrenan — y una Sala de Control donde tú apruebas lo delicado.', 'la máquina haga el 80% tedioso y tú decidas'],
  ['❤️', 'Sabe qué mostrarle a cada cliente', 'Tu cliente “swipea” propiedades y el sistema aprende su gusto; te arma el brief y los parecidos.', 'le muestres lo que sí le va a gustar y cierres antes'],
  ['⏰', 'Revive solo tus leads dormidos', 'Cuando entra algo que le encaja a un cliente viejo, el sistema lo detecta y te avisa para recontactar.', 'no se te enfríe ni un cliente otra vez'],
  ['🛠️', 'Caja de herramientas para cerrar', 'Ficha 360°, calculadora de crédito e inversión, comparador, plantillas de WhatsApp y agenda de visitas.', 'cierres con números y materiales profesionales al instante'],
  ['🗺️', 'La info que convence en la primera visita', 'Precios, plusvalía, seguridad y qué hay cerca de 1,811 colonias de CDMX, a un click.', 'respondas cualquier duda de zona con autoridad'],
];

const STEPS = [
  ['1', 'Pon tu zona aquí arriba', 'Mira gratis cuántos compradores buscan en tu zona y con qué presupuesto.'],
  ['2', 'Únete gratis', 'Con tu correo. Recibes leads de tus zonas y tu equipo de IA queda activo.'],
  ['3', 'Cierra con la info de tu lado', 'Herramientas, datos de la colonia y seguimiento automático. Tú solo cierras.'],
];

const FAQ = [
  ['¿Cuánto cuesta?', 'Empezar es gratis, sin mensualidad. Te quedas tu relación con el cliente.'],
  ['¿De dónde salen los leads?', 'De compradores reales que buscan en el marketplace y que chatean con Atlax — llegan con contexto de qué quieren.'],
  ['¿La IA me reemplaza?', 'No. Hace lo tedioso (prospectar, nutrir, capturar) para que tú hagas lo que nadie reemplaza: cerrar y dar confianza.'],
  ['¿Necesito experiencia o cédula?', 'Te puedes registrar gratis hoy; para recibir ciertos leads te pedimos verificar tu identidad/cédula.'],
];

export default function AsesoresV2() {
  return (
    <LightScope>
      <PublicNav />

      {/* ── HERO + lead magnet ── */}
      <Container>
        <Section py={44}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.02fr)', gap: 40, alignItems: 'center' }}>
            <div>
              <Badge tone="theme" size="md" style={{ marginBottom: 16 }}>Para Asesores Inmobiliarios</Badge>
              <h1 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(30px,4.2vw,48px)', lineHeight: 1.05, letterSpacing: -1.1, margin: '0 0 16px' }}>
                Te llegan clientes <span style={GRADTXT}>listos para comprar</span> — no curiosos.
              </h1>
              <p style={{ fontSize: 'clamp(15.5px,1.6vw,18px)', color: 'var(--cream-2)', lineHeight: 1.6, margin: '0 0 22px', maxWidth: 480 }}>
                Compradores reales, con presupuesto e intención, que ya saben qué quieren. <b>Tú solo cierras</b> — y una IA hace lo tedioso por ti.
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                <Link to="/login" style={{ textDecoration: 'none' }}><Button size="lg">Únete Gratis como Asesor →</Button></Link>
                <Link to="/marketplace" style={{ textDecoration: 'none' }}><Button variant="secondary" size="lg">Ver el Marketplace</Button></Link>
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)' }}>Sin mensualidad para empezar · Tu cliente es tuyo · Cancela cuando quieras</div>
            </div>
            <ZonaPulsoWidget rol="asesor" />
          </div>
        </Section>
      </Container>

      {/* ── PROBLEMA ── */}
      <Section py={46} style={{ background: 'var(--surface-card)' }}>
        <Container>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(23px,3.1vw,33px)', letterSpacing: -0.5, margin: '0 0 8px', textAlign: 'center' }}>Vender no debería ser <span style={SERIF}>perseguir fantasmas</span></h2>
          <p style={{ textAlign: 'center', color: 'var(--cream-2)', fontSize: 15, margin: '0 auto 28px', maxWidth: 520 }}>Si te pasa alguno de estos, no es que vendas mal — es que cargas tú solo lo que una máquina puede hacer:</p>
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
            <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(23px,3.1vw,34px)', letterSpacing: -0.5, margin: '0 0 10px' }}>No es otro CRM. Es <span style={SERIF}>un equipo de IA + leads que ya vienen tibios</span>.</h2>
            <p style={{ color: 'var(--cream-2)', fontSize: 15, margin: '0 auto', maxWidth: 560 }}>Todo lo que entra en tu cuenta de asesor:</p>
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
            {[['✅', 'Gratis para empezar', 'Sin mensualidad para arrancar.'], ['🤝', 'Tu cliente es tuyo', 'Te quedas la relación. Nosotros te damos las herramientas.'], ['🎯', '1 asesor por proyecto', 'Los leads de ese proyecto son tuyos, no compartidos entre 10.']].map(([i, t, b]) => (
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
            <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(24px,3.4vw,36px)', letterSpacing: -0.6, color: '#fff', margin: '0 0 12px' }}>Empieza hoy, gratis.</h2>
            <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.9)', margin: '0 auto 22px', maxWidth: 460 }}>Leads tibios, un equipo de IA y la info que cierra ventas — de tu lado.</p>
            <Link to="/login" style={{ textDecoration: 'none' }}><Button size="lg" style={{ background: '#fff', color: 'var(--theme-2)' }}>Crear Mi Cuenta de Asesor →</Button></Link>
          </div>
        </Container>
      </Section>

      <Container style={{ paddingTop: 24, paddingBottom: 40, textAlign: 'center', borderTop: '1px solid var(--card-border)' }}>
        <span style={{ fontSize: 12.5, color: 'var(--cream-3)' }}>DesarrollosMX · Para Asesores · CDMX</span>
      </Container>
      <AtlaxBubble theme="light" context="El usuario está en la landing para ASESORES inmobiliarios. Quiere más leads y herramientas. Ayúdalo a registrarse y explícale el valor (leads tibios con contexto, el equipo de IA, el modelo de gusto, la info de las colonias)." />
    </LightScope>
  );
}
