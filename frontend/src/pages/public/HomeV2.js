import React from 'react';
import { Link } from 'react-router-dom';
import { LightScope, Container, Section, Button, Card, Badge } from '../../components/ui';

/**
 * Home activa V2 — rediseño público, fondo CLARO, estructura de venta (Hormozi/Brunson):
 * hook → problema → mecanismo → stack de valor → oferta (reporte gratis) → prueba → CTA repetido.
 * Valor real con los datos del producto (1,524 colonias, 117 variables, índices propios).
 * Preview en /v2 · usa el sistema de diseño (components/ui).
 */

const HEAD = "'Outfit', sans-serif";

const PROOF = [
  { k: '1,524', v: 'colonias con dato real' },
  { k: '117', v: 'variables cruzadas por colonia' },
  { k: '5', v: 'índices propios de mercado' },
  { k: 'En vivo', v: 'precio, demanda y riesgo' },
];

const PAINS = [
  { t: 'Pagas de más', b: 'Sin el valor real de la zona, el metro cuadrado es una cifra a ciegas. El listing nunca te lo dice.' },
  { t: 'Compras el problema', b: 'Delito, inundación, sin servicios a pie. Lo descubres después de mudarte — cuando ya firmaste.' },
  { t: 'Pierdes la plusvalía', b: 'La colonia que se dispara y la que se estanca se ven idénticas en una foto. El dato las separa.' },
];

const STACK = [
  { t: 'Score de plusvalía', d: '¿La colonia sube o se estanca? (IPV · catastro + SHF)', val: '$2,400' },
  { t: 'Mapa de delito georreferenciado', d: 'Carpetas FGJ por área fija, comparable entre colonias', val: '$1,800' },
  { t: 'Riesgo sísmico e inundación', d: 'Atlas de riesgos CDMX, por punto exacto', val: '$1,500' },
  { t: 'Densidad de servicios a pie', d: 'Qué resuelves caminando (caminabilidad real, OSM)', val: '$1,200' },
  { t: 'Absorción de preventa', d: '¿El inventario se vende o se queda? Ritmo real del mercado', val: '$2,600' },
  { t: 'Comparativa vs colonias similares', d: 'Dónde está parada tu zona contra sus pares', val: '$1,500' },
];

const AUDIENCES = [
  { tag: 'Compra', t: 'Compra con la verdad en la mano', b: 'Negocia con dato, no con corazonada. Sabes el precio justo y la plusvalía antes de ofertar.', cta: 'Quiero mi reporte', to: '/marketplace' },
  { tag: 'Asesor', t: 'Cierra con inteligencia que nadie más tiene', b: 'Marketplace + capa premium de colonia + material por cliente con un click. El argumento que convence.', cta: 'Soy asesor', to: '/asesores' },
  { tag: 'Desarrollador', t: 'Construye donde el dato dice que sí', b: 'Inventario en vivo, leads atribuidos, absorción vs competencia y dónde está la demanda real.', cta: 'Soy desarrollador', to: '/' },
];

const ALLIES = ["Christie's", "Sotheby's", 'Lamudi', 'Propiedades.com', 'Habi'];

function Stat({ k, v, big }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 92 }}>
      <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: big ? 30 : 22, color: 'var(--theme)', lineHeight: 1 }}>{k}</div>
      <div style={{ fontSize: 12, color: 'var(--cream-3)', marginTop: 5 }}>{v}</div>
    </div>
  );
}

function ScoreChip({ label, value, tone }) {
  return (
    <div style={{ background: 'var(--bg-3)', borderRadius: 'var(--r-chip)', padding: '10px 12px', flex: 1, minWidth: 96 }}>
      <div style={{ fontSize: 11, color: 'var(--cream-3)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 20, color: tone || 'var(--cream)' }}>{value}</div>
    </div>
  );
}

export default function HomeV2() {
  return (
    <LightScope>
      {/* NAV */}
      <Container style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 20, paddingBottom: 20 }}>
        <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 21, letterSpacing: -0.3 }}>
          Desarrollos<span style={{ color: 'var(--theme)' }}>MX</span>
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link to="/marketplace" style={{ textDecoration: 'none' }}><Button variant="ghost" size="sm">El mapa</Button></Link>
          <Link to="/asesores" style={{ textDecoration: 'none' }}><Button variant="ghost" size="sm">Asesores</Button></Link>
          <Link to="/login" style={{ textDecoration: 'none' }}><Button variant="secondary" size="sm">Entrar</Button></Link>
        </div>
      </Container>

      {/* HERO */}
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -160, left: '50%', transform: 'translateX(-50%)', width: 900, height: 520,
          background: 'radial-gradient(closest-side, rgba(var(--theme-rgb),0.14), transparent)', pointerEvents: 'none' }} />
        <Container style={{ position: 'relative' }}>
          <Section py={48}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,0.85fr)', gap: 44, alignItems: 'center' }}>
              {/* Left: copy */}
              <div>
                <Badge tone="theme" size="md" style={{ marginBottom: 18 }}>117 variables · 1,524 colonias · lectura en vivo</Badge>
                <h1 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(36px, 5vw, 58px)', lineHeight: 1.04, letterSpacing: -1.2, margin: '0 0 20px' }}>
                  El precio te miente.<br />
                  <span style={{ background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>La colonia te dice la verdad.</span>
                </h1>
                <p style={{ fontSize: 'clamp(15.5px, 1.6vw, 19px)', color: 'var(--cream-2)', lineHeight: 1.6, margin: '0 0 28px', maxWidth: 540 }}>
                  Cruzamos <b style={{ color: 'var(--cream)' }}>117 variables</b> de cada colonia de la CDMX —plusvalía, delito georreferenciado,
                  riesgo sísmico, servicios y absorción de preventa— y te las entregamos en un retrato verificable.
                  Antes de comprar, vender o construir.
                </p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                  <Link to="/marketplace" style={{ textDecoration: 'none' }}><Button size="lg">Recibe gratis el reporte de tu colonia →</Button></Link>
                  <Link to="/colonia/roma-norte" style={{ textDecoration: 'none' }}><Button variant="secondary" size="lg">Ver el mapa</Button></Link>
                </div>
                <div style={{ fontSize: 13, color: 'var(--cream-3)' }}>Sin costo · sin registro para empezar · dato verificable, no opinión.</div>
              </div>

              {/* Right: live barrio card (el moat visible) */}
              <Card variant="elevated" pad={0} hover={false} style={{ overflow: 'hidden' }}>
                <div style={{ height: 4, background: 'var(--grad)' }} />
                <div style={{ padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--cream-3)', letterSpacing: 0.5, textTransform: 'uppercase' }}>Perfil del barrio</div>
                      <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22 }}>Roma Norte</div>
                      <div style={{ fontSize: 12.5, color: 'var(--cream-3)' }}>Cuauhtémoc</div>
                    </div>
                    <Badge tone="green" size="sm">● en vivo</Badge>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    <ScoreChip label="Vida" value="90" tone="var(--theme)" />
                    <ScoreChip label="Movilidad" value="85" />
                    <ScoreChip label="Seguridad" value="72" tone="var(--warm, #E2982E)" />
                    <ScoreChip label="Comercio" value="94" tone="var(--ok, #1FA06A)" />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px',
                    background: 'rgba(var(--theme-rgb),0.07)', borderRadius: 'var(--r-chip)', marginBottom: 14 }}>
                    <span style={{ fontSize: 13, color: 'var(--cream-2)' }}>Absorción de preventa · 24m</span>
                    <span style={{ fontFamily: HEAD, fontWeight: 800, color: 'var(--ok, #1FA06A)' }}>+8%</span>
                  </div>
                  <Link to="/colonia/roma-norte" style={{ textDecoration: 'none' }}><Button block size="md">Abrir reporte completo</Button></Link>
                </div>
              </Card>
            </div>

            {/* Proof bar */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, justifyContent: 'space-between', marginTop: 40,
              padding: '22px 26px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-card)' }}>
              {PROOF.map((p) => <Stat key={p.v} k={p.k} v={p.v} />)}
            </div>
          </Section>
        </Container>
      </div>

      {/* PROBLEMA */}
      <Section py={56} style={{ background: 'var(--bg-2)' }}>
        <Container>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <Badge tone="red" style={{ marginBottom: 12 }}>El costo de comprar a ciegas</Badge>
            <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(26px,3.6vw,38px)', letterSpacing: -0.6, margin: 0 }}>
              Una mala colonia no se ve en la foto. Se siente en la cuenta.
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px,1fr))', gap: 18 }}>
            {PAINS.map((p) => (
              <Card key={p.t} pad={22}>
                <h3 style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 18, margin: '0 0 8px' }}>{p.t}</h3>
                <p style={{ fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.6, margin: 0 }}>{p.b}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      {/* MECANISMO */}
      <Section py={60}>
        <Container max={980} style={{ textAlign: 'center' }}>
          <Badge tone="theme" style={{ marginBottom: 14 }}>Cómo lo sabemos</Badge>
          <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(28px,4vw,44px)', letterSpacing: -0.8, margin: '0 0 16px' }}>
            No es una opinión.<br />Es el cruce de <span style={{ color: 'var(--theme)' }}>117 variables</span> por colonia.
          </h2>
          <p style={{ fontSize: 17, color: 'var(--cream-2)', lineHeight: 1.65, maxWidth: 680, margin: '0 auto 26px' }}>
            Tomamos las fuentes que importan —FGJ, Catastro, SHF, Atlas de Riesgos, OpenStreetMap— y las
            convertimos en 5 índices propios que ningún portal calcula. Plusvalía, ambiente, desarrollo,
            seguridad y movilidad, en una sola lectura comparable entre las 1,524 colonias de la ciudad.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            {['IPV · Plusvalía', 'IAB · Ambiente', 'IDS · Desarrollo', 'Seguridad', 'Movilidad'].map((x) => (
              <Badge key={x} tone="soft" size="md">{x}</Badge>
            ))}
          </div>
        </Container>
      </Section>

      {/* STACK DE VALOR + OFERTA */}
      <Section py={20}>
        <Container max={920}>
          <Card variant="elevated" pad={0} hover={false} style={{ overflow: 'hidden' }}>
            <div style={{ padding: '28px 30px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(22px,3vw,30px)', letterSpacing: -0.5, margin: '0 0 6px' }}>
                Todo esto, en el reporte gratis de tu colonia:
              </h2>
              <p style={{ fontSize: 14.5, color: 'var(--cream-2)', margin: 0 }}>Lo que un consultor te cobraría por hacer a mano — listo en segundos.</p>
            </div>
            <div style={{ padding: '8px 30px' }}>
              {STACK.map((s) => (
                <div key={s.t} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: 'rgba(var(--theme-rgb),0.14)', color: 'var(--theme)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, marginTop: 1 }}>✓</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 15.5 }}>{s.t}</div>
                    <div style={{ fontSize: 13, color: 'var(--cream-2)' }}>{s.d}</div>
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--cream-3)', textDecoration: 'line-through', marginTop: 2, whiteSpace: 'nowrap' }}>{s.val}</span>
                </div>
              ))}
            </div>
            <div style={{ padding: '24px 30px', textAlign: 'center', background: 'rgba(var(--theme-rgb),0.05)' }}>
              <div style={{ fontSize: 14, color: 'var(--cream-2)', marginBottom: 4 }}>Valor real de un due-diligence de colonia: <b style={{ color: 'var(--cream)' }}>$11,000 MXN</b></div>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 26, marginBottom: 16 }}>Para ti, hoy: <span style={{ color: 'var(--theme)' }}>gratis.</span></div>
              <Link to="/marketplace" style={{ textDecoration: 'none' }}><Button size="lg">Generar el reporte de mi colonia →</Button></Link>
            </div>
          </Card>
        </Container>
      </Section>

      {/* 3 PÚBLICOS */}
      <Section py={56}>
        <Container>
          <div style={{ textAlign: 'center', marginBottom: 34 }}>
            <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(26px,3.6vw,38px)', letterSpacing: -0.6, margin: 0 }}>
              El mismo dato, tu jugada.
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 18 }}>
            {AUDIENCES.map((a) => (
              <Card key={a.tag} pad={24}>
                <Badge tone="soft" style={{ marginBottom: 14 }}>{a.tag}</Badge>
                <h3 style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 19, margin: '0 0 10px', lineHeight: 1.25 }}>{a.t}</h3>
                <p style={{ fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.6, margin: '0 0 18px' }}>{a.b}</p>
                <Link to={a.to} style={{ textDecoration: 'none' }}><Button variant="secondary" size="sm">{a.cta} →</Button></Link>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      {/* AUTORIDAD */}
      <Section py={36} style={{ background: 'var(--bg-2)' }}>
        <Container style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12.5, color: 'var(--cream-3)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 16 }}>
            Operamos junto a plataformas que mueven el real estate
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 34, justifyContent: 'center', alignItems: 'center' }}>
            {ALLIES.map((a) => (
              <span key={a} style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 19, color: 'var(--cream-3)' }}>{a}</span>
            ))}
          </div>
        </Container>
      </Section>

      {/* CTA FINAL */}
      <Section py={60}>
        <Container max={860}>
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--r-card)', padding: '48px 36px', textAlign: 'center',
            background: 'var(--grad)' }}>
            <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(28px,4vw,42px)', letterSpacing: -0.8, color: '#fff', margin: '0 0 12px' }}>
              Tu próxima decisión vale millones.<br />Tómala con la luz encendida.
            </h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', maxWidth: 520, margin: '0 auto 26px', lineHeight: 1.6 }}>
              Empieza por tu colonia. Gratis, sin registro, en segundos.
            </p>
            <Link to="/marketplace" style={{ textDecoration: 'none' }}>
              <Button size="lg" style={{ background: '#fff', color: 'var(--theme-2)' }}>Generar mi reporte gratis →</Button>
            </Link>
          </div>
        </Container>
      </Section>

      {/* FOOTER */}
      <Container style={{ paddingTop: 24, paddingBottom: 40, textAlign: 'center', borderTop: '1px solid var(--border)' }}>
        <span style={{ fontSize: 12.5, color: 'var(--cream-3)' }}>
          DesarrollosMX · Inteligencia inmobiliaria CDMX · 1,524 colonias con dato real · vista previa /v2
        </span>
      </Container>
    </LightScope>
  );
}
