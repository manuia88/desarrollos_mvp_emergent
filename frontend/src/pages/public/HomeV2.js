import React from 'react';
import { Link } from 'react-router-dom';
import { LightScope, Container, Section, Button, Card, Badge } from '../../components/ui';

/**
 * Home activa V2 — primera versión del rediseño público en FONDO CLARO (decisión founder).
 * Preview en /v2 · no toca el landing vivo. Valor: la vitrina viva del mercado (el contexto que
 * ningún portal da) + los 3 públicos (compra · asesor · dev). Usa SOLO las primitivas de components/ui.
 */

const AUDIENCES = [
  { tag: 'Compra', title: 'Compra con contexto', body: 'Precio justo, plusvalía y vida de la colonia — el dato que un listing no te da, antes de decidir.', cta: 'Explorar el mapa', to: '/marketplace' },
  { tag: 'Asesor', title: 'Vende con inteligencia', body: 'Marketplace + capa premium de colonia, CRM ligero y material por cliente con un click.', cta: 'Soy asesor', to: '/asesores' },
  { tag: 'Desarrollador', title: 'Construye con datos', body: 'Inventario en tiempo real, leads atribuidos y absorción vs competencia y demanda real.', cta: 'Soy desarrollador', to: '/' },
];

const SIGNALS = [
  { k: '1,524', v: 'colonias con scores reales' },
  { k: 'IPV · IAB · IDS', v: 'índices propios de mercado' },
  { k: 'Tiempo real', v: 'inventario + demanda viva' },
];

export default function HomeV2() {
  return (
    <LightScope>
      {/* Nav */}
      <Container style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 22, paddingBottom: 22 }}>
        <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: -0.3, color: 'var(--cream)' }}>
          Desarrollos<span style={{ color: 'var(--theme)' }}>MX</span>
        </span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link to="/marketplace" style={{ textDecoration: 'none' }}><Button variant="ghost" size="sm">Marketplace</Button></Link>
          <Link to="/login" style={{ textDecoration: 'none' }}><Button variant="secondary" size="sm">Entrar</Button></Link>
        </div>
      </Container>

      {/* Hero */}
      <Section py={64}>
        <Container max={920} style={{ textAlign: 'center' }}>
          <Badge tone="theme" size="md" style={{ marginBottom: 18 }}>Inteligencia de mercado · CDMX</Badge>
          <h1 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 'clamp(34px, 6vw, 60px)', lineHeight: 1.05, letterSpacing: -1, margin: '0 0 18px', color: 'var(--cream)' }}>
            Si vendes, compras o construyes en México,<br />
            <span style={{ background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>esto te da el contexto que ningún portal te da.</span>
          </h1>
          <p style={{ fontSize: 'clamp(15px, 2vw, 19px)', color: 'var(--cream-2)', maxWidth: 620, margin: '0 auto 30px', lineHeight: 1.6 }}>
            Precio real, plusvalía, seguridad y vida de cada colonia — actualizado en vivo. Conecta a desarrolladores, asesores y compradores con datos que hoy nadie tiene público.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 38 }}>
            <Link to="/marketplace" style={{ textDecoration: 'none' }}><Button size="lg">Explorar el mapa de la ciudad</Button></Link>
            <Link to="/colonia/polanco" style={{ textDecoration: 'none' }}><Button variant="secondary" size="lg">Ver una colonia gratis</Button></Link>
          </div>
          <div style={{ display: 'flex', gap: 28, justifyContent: 'center', flexWrap: 'wrap' }}>
            {SIGNALS.map((s) => (
              <div key={s.v} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 22, color: 'var(--theme)' }}>{s.k}</div>
                <div style={{ fontSize: 12.5, color: 'var(--cream-3)' }}>{s.v}</div>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      {/* 3 públicos */}
      <Section py={20}>
        <Container>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
            {AUDIENCES.map((a) => (
              <Card key={a.tag} pad={22}>
                <Badge tone="soft" style={{ marginBottom: 12 }}>{a.tag}</Badge>
                <h3 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 19, margin: '0 0 8px', color: 'var(--cream)' }}>{a.title}</h3>
                <p style={{ fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.6, margin: '0 0 16px' }}>{a.body}</p>
                <Link to={a.to} style={{ textDecoration: 'none' }}><Button variant="secondary" size="sm">{a.cta}</Button></Link>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section py={40}>
        <Container max={920}>
          <Card variant="elevated" pad={36} hover={false} style={{ textAlign: 'center' }}>
            <h2 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 'clamp(24px,3.5vw,34px)', margin: '0 0 12px', color: 'var(--cream)' }}>
              El mercado, en tiempo real.
            </h2>
            <p style={{ fontSize: 16, color: 'var(--cream-2)', maxWidth: 540, margin: '0 auto 22px', lineHeight: 1.6 }}>
              Empieza por tu colonia. Sin costo, sin registro.
            </p>
            <Link to="/marketplace" style={{ textDecoration: 'none' }}><Button size="lg">Entrar al mapa</Button></Link>
          </Card>
        </Container>
      </Section>

      <Container style={{ paddingTop: 30, paddingBottom: 40, textAlign: 'center' }}>
        <span style={{ fontSize: 12.5, color: 'var(--cream-3)' }}>DesarrollosMX · Inteligencia inmobiliaria CDMX · vista previa /v2</span>
      </Container>
    </LightScope>
  );
}
