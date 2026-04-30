// Faq — 2-col accordion with 7 questions
import React, { useState } from 'react';
import FadeUp from '../animations/FadeUp';
import { ChevronDown, MessageSquare } from '../icons';

const FAQS = [
  {
    q: '¿Qué es DMX y por qué es diferente a Lamudi o Inmuebles24?',
    a: 'DMX es una plataforma de Spatial Decision Intelligence, no un portal de anuncios. Mientras Lamudi e Inmuebles24 muestran listados de propiedades, DMX procesa más de 97 variables por colonia desde fuentes oficiales (DENUE, FGJ, GTFS, SEDUVI) para darte certeza real antes de firmar. No vendemos publicidad: vendemos inteligencia.',
  },
  {
    q: '¿De dónde vienen los datos? ¿Son confiables?',
    a: 'Todas nuestras fuentes son públicas y oficiales: DENUE (directorio nacional de empresas), FGJ (delitos por colonia), GTFS (rutas de transporte público), SEDUVI (uso de suelo y desarrollo urbano), Atlas de Riesgos CDMX y más. Los datos se actualizan semanalmente de forma automatizada.',
  },
  {
    q: '¿Qué significan los scores LIV, MOV, SEC, ECO?',
    a: 'Son los cuatro scores compuestos de DMX: LIV (Calidad de Vida), MOV (Movilidad), SEC (Seguridad) y ECO (Ecosistema Comercial). Cada uno agrega múltiples indicadores en un score 0-100 calculado mediante regresión y machine learning sobre datos históricos de 24+ meses.',
  },
  {
    q: '¿Cómo gana dinero DMX si no cobra comisión por venta?',
    a: 'El modelo de negocio de DMX se basa en suscripciones: plan Asesor, plan Desarrolladora y plan Comprador Premium. También ofrecemos APIs B2B para bancos y FIBRAs, y DMX Studio para producción de video e IA. Sin comisiones de transacción, sin conflicto de interés.',
  },
  {
    q: '¿Cuántas colonias tienen IE Score completo?',
    a: 'En el lanzamiento H1 cubrimos las 18 colonias con mayor actividad de preventa en CDMX. Para H2 expandimos a las 133 colonias de la CDMX completa y agregamos municipios de Monterrey, Guadalajara y Ciudad Juárez.',
  },
  {
    q: '¿Puedo confiar en la plusvalía proyectada?',
    a: 'La plusvalía proyectada es una estimación estadística basada en regresión histórica de 24 meses y machine learning sobre factores de demanda, oferta y contexto urbano. No es una garantía de rentabilidad. Te damos intervalos de confianza explícitos y siempre recomendamos validar con tu asesor.',
  },
  {
    q: '¿Cómo me contacto con un asesor verificado?',
    a: 'Todos los asesores en DMX tienen verificación de cédula AMPI, historial transparente de operaciones y score de reputación. Puedes contactarlos directamente desde la ficha de cada propiedad o desde el botón "Hablar con un asesor" en tu reporte de colonia.',
  },
];

function FaqItem({ q, a, isOpen, onClick, index }) {
  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      <button
        data-testid={`faq-item-${index}`}
        onClick={onClick}
        style={{
          width: '100%', textAlign: 'left',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 0',
          background: 'none', border: 'none',
          cursor: 'pointer',
          color: isOpen ? 'var(--indigo-3)' : 'var(--cream)',
          transition: 'color 0.2s',
        }}
        onMouseEnter={e => { if (!isOpen) e.currentTarget.style.color = 'var(--indigo-3)'; }}
        onMouseLeave={e => { if (!isOpen) e.currentTarget.style.color = 'var(--cream)'; }}
      >
        <span style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 15, lineHeight: 1.4, paddingRight: 24 }}>
          {q}
        </span>
        <div style={{
          flexShrink: 0,
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'transform 0.3s cubic-bezier(0.22,1,0.36,1)',
          color: isOpen ? 'var(--indigo-3)' : 'var(--cream-3)',
        }}>
          <ChevronDown size={18} color="currentColor" />
        </div>
      </button>
      <div style={{
        maxHeight: isOpen ? 400 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.4s cubic-bezier(0.22,1,0.36,1)',
      }}>
        <p style={{
          fontFamily: 'DM Sans', fontSize: 15,
          color: 'var(--cream-2)',
          lineHeight: 1.65,
          paddingBottom: 20,
          maxWidth: '58ch',
          textWrap: 'pretty',
        }}>
          {a}
        </p>
      </div>
    </div>
  );
}

export default function Faq() {
  const [openIdx, setOpenIdx] = useState(0);

  return (
    <section data-testid="faq-section" style={{ padding: '80px 32px', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '0.85fr 1.15fr', gap: 72, alignItems: 'start' }}
          className="faq-grid">
          {/* Col left — sticky */}
          <FadeUp>
            <div style={{ position: 'sticky', top: 24 }}>
              <div className="tag-pill" style={{ marginBottom: 20 }}>FAQ</div>
              <h2 style={{
                fontFamily: 'Outfit', fontWeight: 800,
                fontSize: 'clamp(32px, 3.5vw, 48px)',
                lineHeight: 1.05, letterSpacing: '-0.028em',
                color: 'var(--cream)', marginBottom: 16,
              }}>
                Preguntas frecuentes.
              </h2>
              <p style={{
                fontFamily: 'DM Sans', fontSize: 16, color: 'var(--cream-2)',
                lineHeight: 1.65, marginBottom: 28,
              }}>
                Todo lo que necesitas saber sobre cómo funciona DMX, nuestros datos y cómo protegemos tu información.
              </p>
              <button className="btn btn-glass" data-testid="faq-advisor-btn" style={{ gap: 8 }}>
                <MessageSquare size={14} />
                Hablar con un asesor
              </button>
            </div>
          </FadeUp>

          {/* Col right — accordion */}
          <div>
            {FAQS.map((item, i) => (
              <FaqItem
                key={i}
                index={i}
                {...item}
                isOpen={openIdx === i}
                onClick={() => setOpenIdx(openIdx === i ? -1 : i)}
              />
            ))}
            {/* Last border-bottom */}
            <div style={{ borderBottom: '1px solid var(--border)' }} />
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .faq-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
        }
      `}</style>
    </section>
  );
}
