import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LightScope, Container, Section, Button, Card, Badge, PublicNav } from '../../components/ui';
import { COLONIAS as ALL_COLONIAS } from '../../data/colonias';

/**
 * /colonias — explorador de colonias (reemplaza la página vieja "Barrios"). Sistema nuevo, fondo
 * blanco, lenguaje de beneficio/experiencia, Title Case. Data REAL de data/colonias + slug correcto
 * (cable arreglado: enlaza a /marketplace?colonia=<slug>, no ?zona=). Imágenes = placeholders.
 */
const HEAD = "'Outfit',sans-serif";
const SERIF = { fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic', fontWeight: 600 };
const IMG = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=700&q=80`;
const TIER_ES = { Premium: 'Premium', Luxury: 'Lujo', Trendy: 'De Moda', Emerging: 'En Ascenso', Revival: 'Renaciendo', Central: 'Céntrica', 'Up-and-coming': 'Promesa', Established: 'Consolidada', Family: 'Familiar', Bohemian: 'Bohemia' };
const COL_IMG = {
  'polanco': IMG('photo-1605146769289-440113cc3d00'), 'roma-norte': IMG('photo-1551361415-69c87624334f'),
  'condesa': IMG('photo-1518105779142-d975f22f1b0a'), 'del-valle-centro': IMG('photo-1566073771259-6a8506099945'),
  'juarez': IMG('photo-1502672260266-1c1ef2d93688'), 'narvarte-poniente': IMG('photo-1493809842364-78817add7ffb'),
  'lomas-chapultepec': IMG('photo-1564013799919-ab600027ffc6'), 'napoles': IMG('photo-1545324418-cc1a3fa10c00'),
  'coyoacan-centro': IMG('photo-1512917774080-9991f1c4c750'), 'santa-fe': IMG('photo-1486406146926-c627a92ad1ab'),
  'escandon': IMG('photo-1560448204-e02f11c3d0e2'), 'anzures': IMG('photo-1600585154340-be6161a56a0c'),
  'roma-sur': IMG('photo-1551361415-69c87624334f'), 'cuauhtemoc': IMG('photo-1518105779142-d975f22f1b0a'),
  'doctores': IMG('photo-1493809842364-78817add7ffb'), 'jardines-del-pedregal': IMG('photo-1564013799919-ab600027ffc6'),
};
const COLONIAS = ALL_COLONIAS.map((c) => ({
  key: c.key, n: c.name, alc: c.alcaldia, desde: `${c.priceM2}/m²`, mom: c.momentum, up: c.momentumPositive,
  vibe: TIER_ES[c.tier] || c.tier || c.alcaldia, img: COL_IMG[c.key] || IMG('photo-1518105779142-d975f22f1b0a'),
}));
const READ = [
  ['Todo a la Mano', 'Súper, café, escuelas y hospitales a pie.'],
  ['Zona Tranquila', 'Qué tan segura es, según datos reales — no rumores.'],
  ['Aquí Tu Dinero Crece', 'Si el precio de la zona viene subiendo o se estancó.'],
  ['Llegas a Todo Rápido', 'Metro, Metrobús y vialidades cerca.'],
];

export default function ColoniasV2() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  return (
    <LightScope>
      <style>{`.dmx-zone{transition:transform .2s ease, box-shadow .25s ease}.dmx-zone img{transition:transform .5s ease}.dmx-zone:hover{transform:translateY(-4px);box-shadow:0 16px 40px rgba(16,24,40,.16)}.dmx-zone:hover img{transform:scale(1.06)}`}</style>
      <PublicNav />

      <Container>
        <Section py={40} style={{ textAlign: 'center' }}>
          <Badge tone="soft" size="md" style={{ marginBottom: 16 }}>Las 16 Alcaldías · 117 Variables por Colonia</Badge>
          <h1 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(32px,4.4vw,52px)', lineHeight: 1.06, letterSpacing: -1.1, margin: '0 0 16px' }}>
            Conoce Cada Colonia <span style={{ ...SERIF, background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>en Palabras Claras</span>.
          </h1>
          <p style={{ fontSize: 'clamp(15.5px,1.6vw,18px)', color: 'var(--cream-2)', maxWidth: 580, margin: '0 auto 24px', lineHeight: 1.6 }}>
            Cruzamos 117 variables por colonia y te decimos lo que importa para tu día a día: si es segura, si caminas a todo y si tu compra va a valer más.
          </p>
          <div style={{ maxWidth: 520, margin: '0 auto', background: '#fff', border: '1px solid var(--card-border)', borderRadius: 'var(--r-card)', boxShadow: '0 10px 30px rgba(16,24,40,0.08)', padding: 8, display: 'flex', gap: 8 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && nav(`/marketplace?colonia=${encodeURIComponent(q)}`)}
              placeholder="Busca Tu Colonia o Alcaldía" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: "'DM Sans',sans-serif", fontSize: 15, padding: '8px 10px', color: 'var(--cream)' }} />
            <Button size="md" onClick={() => nav(`/marketplace?colonia=${encodeURIComponent(q)}`)}>Buscar</Button>
          </div>
        </Section>
      </Container>

      {/* GRID */}
      <Section py={20}>
        <Container>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px,1fr))', gap: 16 }}>
            {COLONIAS.map((z) => (
              <Link key={z.key} to={`/marketplace?colonia=${encodeURIComponent(z.key)}`} className="dmx-zone" style={{ textDecoration: 'none', position: 'relative', display: 'block', borderRadius: 'var(--r-card)', overflow: 'hidden', aspectRatio: '16/11' }}>
                <img src={z.img} alt={z.n} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(11,11,18,0.85) 0%, rgba(11,11,18,0.1) 60%, transparent 100%)' }} />
                {z.mom && <span style={{ position: 'absolute', top: 12, right: 12, background: z.up ? 'var(--ok,#1FA06A)' : 'var(--theme)', color: '#fff', fontFamily: HEAD, fontWeight: 800, fontSize: 11.5, borderRadius: 999, padding: '3px 9px' }}>{z.up ? '▲' : '▼'} {z.mom}</span>}
                <div style={{ position: 'absolute', left: 16, right: 16, bottom: 14 }}>
                  <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 21, color: '#fff' }}>{z.n} ›</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>{z.alc}</span>
                    <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.8)' }}>Desde {z.desde}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Container>
      </Section>

      {/* QUÉ LEEMOS */}
      <Section py={48} style={{ background: 'var(--surface-card)' }}>
        <Container>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(24px,3.2vw,34px)', letterSpacing: -0.5, margin: '0 0 8px', textAlign: 'center' }}>Qué Te Decimos de Cada <span style={SERIF}>Colonia</span></h2>
          <p style={{ fontSize: 16, color: 'var(--cream-2)', maxWidth: 560, margin: '0 auto 28px', textAlign: 'center' }}>Sin tecnicismos. Lo que de verdad cambia tu vida ahí.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px,1fr))', gap: 16 }}>
            {READ.map(([t, b]) => (
              <Card key={t} pad={20}>
                <div style={{ color: 'var(--ok,#1FA06A)', fontWeight: 800, fontSize: 18, marginBottom: 6 }}>✓</div>
                <h3 style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 16.5, margin: '0 0 5px' }}>{t}</h3>
                <p style={{ fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.55, margin: 0 }}>{b}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      {/* CTA */}
      <Section py={52}>
        <Container max={780}>
          <div style={{ borderRadius: 'var(--r-card)', padding: '42px 32px', textAlign: 'center', background: 'var(--grad)', boxShadow: '0 30px 70px rgba(var(--theme-rgb),0.26)' }}>
            <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(24px,3.4vw,36px)', letterSpacing: -0.6, color: '#fff', margin: '0 0 12px' }}>Encuentra Tu Colonia Ideal.</h2>
            <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.9)', margin: '0 auto 22px', maxWidth: 440 }}>Y los desarrollos nuevos que hay en ella. Gratis.</p>
            <Link to="/marketplace" style={{ textDecoration: 'none' }}><Button size="lg" style={{ background: '#fff', color: 'var(--theme-2)' }}>Abrir el Mapa →</Button></Link>
          </div>
        </Container>
      </Section>
      <Container style={{ paddingTop: 24, paddingBottom: 40, textAlign: 'center', borderTop: '1px solid var(--card-border)' }}>
        <span style={{ fontSize: 12.5, color: 'var(--cream-3)' }}>DesarrollosMX · 1,524 Colonias con Dato Real · CDMX</span>
      </Container>
    </LightScope>
  );
}
