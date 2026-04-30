// /asesores — B2B landing: "Únete a DMX como asesor verificado"
import React from 'react';
import Navbar from '../components/landing/Navbar';
import CtaFooter from '../components/landing/CtaFooter';
import { Sparkle, Database, TrendUp, Route, Shield, Bookmark, ArrowRight } from '../components/icons';
import { useAuth } from '../App';

const PILLARS = [
  {
    Icon: Database,
    t: 'CRM Pulppo+ incluido',
    d: 'Contactos, búsquedas, captaciones, operaciones y comisiones en una sola pantalla. Sin Excel, sin WhatsApp perdido.',
  },
  {
    Icon: Sparkle,
    t: 'Argumentario IA por contacto',
    d: 'Claude Sonnet genera un pitch personalizado por contacto × desarrollo, listo para enviar por WhatsApp o email.',
  },
  {
    Icon: Route,
    t: 'Matcher determinístico',
    d: 'Motor 5-dimensiones (precio, zona, amenidades, recámaras, urgencia) que emparenta tus búsquedas con el inventario real.',
  },
  {
    Icon: TrendUp,
    t: 'Split transparente 80 / 20',
    d: 'Cada operación calcula en vivo honorarios + IVA + split. Sin letras chicas, sin renegociaciones por fuera.',
  },
  {
    Icon: Shield,
    t: 'Perfil público verificado',
    d: 'Tu cédula AMPI, tus cierres y tu zona aparecen como asesor verificado DMX. Confianza pública construida con datos.',
  },
  {
    Icon: Bookmark,
    t: 'Studio de contenido IA',
    d: 'Genera videos, anuncios y carruseles por colonia desde tu portal — sin salir del CRM, sin pagar a una agencia aparte.',
  },
];

const STEPS = [
  { n: '01', t: 'Te registras con Google o email', d: 'Eliges "Soy asesor" en el onboarding. Recibes acceso al portal en minutos.' },
  { n: '02', t: 'Completas tu perfil', d: 'Nombre, AMPI, brokerage, colonias en las que operas. Tu perfil público queda listo.' },
  { n: '03', t: 'Migras tus contactos', d: 'Importas tu agenda o empiezas desde cero. El seed-demo crea 6 contactos para que veas el flujo.' },
  { n: '04', t: 'Operas y cobras', d: 'Cada operación cerrada otorga XP, score Elo y entra al leaderboard. Comisiones con forecast a 6 meses.' },
];

export default function AsesoresLanding() {
  const { user, logout, openAuth } = useAuth();

  const handleJoin = () => {
    // Opens AuthModal in register mode (user can pick role = advisor)
    openAuth('register');
  };

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navbar onLogin={openAuth} user={user} onLogout={logout} />
      <main style={{ padding: '110px 24px 80px', maxWidth: 1200, margin: '0 auto' }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>PORTAL ASESOR · B2B</div>
        <h1 style={{
          fontFamily: 'Outfit', fontWeight: 800,
          fontSize: 'clamp(36px, 6vw, 64px)',
          color: 'var(--cream)',
          letterSpacing: '-0.028em', lineHeight: 1.02,
          margin: '0 0 18px', maxWidth: 920,
        }}>
          Únete a DMX como <span style={{
            background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>asesor verificado.</span>
        </h1>
        <p style={{
          fontFamily: 'DM Sans', fontSize: 17, color: 'var(--cream-2)',
          lineHeight: 1.65, maxWidth: 760, margin: '0 0 28px',
        }}>
          Un portal pensado para el asesor residencial de CDMX. CRM + argumentario IA
          + split transparente, con la data del territorio en vivo. Sin cuotas
          ocultas: pagas un porcentaje fijo solo cuando cierras.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 56 }}>
          <button
            data-testid="advisors-cta-join"
            onClick={handleJoin}
            className="btn btn-primary"
          >
            <Sparkle size={13} />
            Crear mi cuenta de asesor
          </button>
          <a
            href="/marketplace"
            data-testid="advisors-cta-marketplace"
            className="btn btn-glass"
            style={{ textDecoration: 'none' }}
          >
            Ver el marketplace <ArrowRight size={12} />
          </a>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 14, marginBottom: 56,
        }}>
          {PILLARS.map(({ Icon, t, d }) => (
            <div key={t} data-testid={`advisors-pillar-${t.split(' ')[0].toLowerCase()}`} style={{
              padding: 22,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              borderRadius: 16,
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: 'rgba(99,102,241,0.12)',
                border: '1px solid rgba(99,102,241,0.28)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 14,
              }}>
                <Icon size={18} color="var(--indigo-3)" />
              </div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', marginBottom: 6 }}>
                {t}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', lineHeight: 1.55 }}>
                {d}
              </div>
            </div>
          ))}
        </div>

        <div className="eyebrow" style={{ marginBottom: 14 }}>CÓMO EMPIEZAS</div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 14, marginBottom: 48,
        }}>
          {STEPS.map(({ n, t, d }) => (
            <div key={n} data-testid={`advisors-step-${n}`} style={{
              padding: 22,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              borderRadius: 16,
            }}>
              <div style={{
                fontFamily: 'Outfit', fontWeight: 800, fontSize: 28,
                background: 'var(--grad)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-0.02em',
                marginBottom: 8,
              }}>
                {n}
              </div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', marginBottom: 4 }}>
                {t}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', lineHeight: 1.55 }}>
                {d}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          padding: 28,
          background: 'linear-gradient(140deg, rgba(99,102,241,0.10), rgba(236,72,153,0.05))',
          border: '1px solid var(--border)',
          borderRadius: 18,
          textAlign: 'center',
        }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>ÚLTIMO PASO</div>
          <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: '0 0 10px', letterSpacing: '-0.02em' }}>
            Empieza hoy. Sin mensualidad, sin contratos.
          </h2>
          <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.6, margin: '0 0 18px', maxWidth: 600, marginLeft: 'auto', marginRight: 'auto' }}>
            Creas tu cuenta, configuras tu perfil y ya puedes operar. Pagas un
            porcentaje fijo solo cuando cierras una operación.
          </p>
          <button
            data-testid="advisors-cta-join-bottom"
            onClick={handleJoin}
            className="btn btn-primary"
            style={{ justifyContent: 'center' }}
          >
            Crear mi cuenta de asesor
            <ArrowRight size={12} />
          </button>
        </div>
      </main>
      <CtaFooter />
    </div>
  );
}
