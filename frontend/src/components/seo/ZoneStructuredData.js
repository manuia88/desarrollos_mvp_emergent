// W4.2D2 — ZoneStructuredData.js
// Inyecta dos JSON-LD <script> en document.head para programmatic SEO de
// landing pages de zona: schema.org/Place + schema.org/FAQPage.
import { useEffect } from 'react';

const SITE_BASE = 'https://desarrollosmx.io';

function nfMxn(value) {
  if (value == null || isNaN(value)) return null;
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency', currency: 'MXN', maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `$${Math.round(value).toLocaleString('es-MX')}`;
  }
}

function buildFaqs(zone) {
  const name = zone.name;
  const drpiVal = nfMxn(zone?.drpi?.current_value);
  const delta = zone?.drpi?.delta_30d_pct;
  const deltaTxt = (delta != null)
    ? `(${delta > 0 ? '+' : ''}${Number(delta).toFixed(1)}% en los últimos 30 días)`
    : '';
  const riskLetter = zone?.risk_score?.letter || 'N/D';
  const riskTier = zone?.risk_score?.tier || 'desconocido';
  const numDevs = zone?.active_developments ?? 0;
  const compNames = (zone?.comparable_zones || []).map(c => c.name).join(', ') || 'colonias similares de CDMX';

  return [
    {
      question: `¿Cuál es el precio promedio del m² en ${name}?`,
      answer: drpiVal
        ? `El precio promedio actual del m² en ${name} es ${drpiVal} ${deltaTxt}. El dato proviene del DRPI (DMX Residential Price Index), un índice hedónico calculado mensualmente por DesarrollosMX a partir de transacciones reales y listings activos.`
        : `Los datos hedónicos de DRPI para ${name} están en preparación. DesarrollosMX cubre esta zona y publicará el índice cuando se alcance la muestra mínima estadística.`,
    },
    {
      question: `¿Es seguro vivir en ${name}?`,
      answer: zone?.risk_score?.value != null
        ? `${name} tiene una calificación Risk Score de ${riskLetter} (tier ${riskTier}, valor numérico ${zone.risk_score.value}/100). Este score combina datos SESNSP (incidencia delictiva), CENAPRED (riesgos naturales), ENVIPE (percepción) y heurísticas de título de propiedad.`
        : `El Risk Score detallado de ${name} está siendo calculado. DesarrollosMX usará datos SESNSP, CENAPRED y ENVIPE para producir una calificación A-E auditable.`,
    },
    {
      question: `¿Cuántos desarrollos hay en preventa en ${name}?`,
      answer: numDevs > 0
        ? `Actualmente DesarrollosMX rastrea ${numDevs} desarrollo(s) activo(s) en ${name}, cubriendo etapas de preventa, construcción y entrega inmediata. Puedes ver el listado completo en el Marketplace filtrado por colonia.`
        : `Aún no hay desarrollos activos publicados para ${name} en DesarrollosMX. Estamos onboardeando proyectos de la zona; suscríbete para recibir alertas cuando se publiquen.`,
    },
    {
      question: `¿Cómo se compara ${name} con otras colonias de CDMX?`,
      answer: `Las colonias más comparables a ${name} por perfil socioeconómico, tier y precio/m² son: ${compNames}. DesarrollosMX usa clustering jerárquico sobre 23+ indicadores IE para sugerir comparables auditables.`,
    },
    {
      question: `¿Qué fuentes usa DesarrollosMX para los datos de ${name}?`,
      answer: `DesarrollosMX integra fuentes oficiales para ${name}: INEGI (demografía), SESNSP (delictivo), CENAPRED (riesgos naturales), ENVIPE (percepción), DENUE (comercios), SHF/INFONAVIT/RPP (transacciones), y nuestro DRPI (índice hedónico propietario). Todos los outputs son LFPDPPP-compliant y k-anonymizados (k≥5).`,
    },
  ];
}

function buildPlaceJsonLd(zone) {
  const url = `${SITE_BASE}/zona/${zone.slug}`;
  const description = `Análisis completo de la colonia ${zone.name}, ${zone.alcaldia || 'CDMX'}: precios DRPI, Risk Score, Intelligence Engine scores y desarrollos activos. Datos auditables y LFPDPPP-compliant.`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: zone.name,
    description,
    url,
    address: {
      '@type': 'PostalAddress',
      addressLocality: zone.alcaldia || 'Ciudad de México',
      addressRegion: 'CDMX',
      addressCountry: 'MX',
    },
  };
}

function buildFaqJsonLd(zone) {
  const faqs = buildFaqs(zone);
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

export default function ZoneStructuredData({ zone }) {
  useEffect(() => {
    if (!zone || !zone.slug || !zone.name) return;

    const placeScript = document.createElement('script');
    placeScript.type = 'application/ld+json';
    placeScript.setAttribute('data-zone-jsonld', 'place');
    placeScript.text = JSON.stringify(buildPlaceJsonLd(zone));
    document.head.appendChild(placeScript);

    const faqScript = document.createElement('script');
    faqScript.type = 'application/ld+json';
    faqScript.setAttribute('data-zone-jsonld', 'faq');
    faqScript.text = JSON.stringify(buildFaqJsonLd(zone));
    document.head.appendChild(faqScript);

    return () => {
      try { document.head.removeChild(placeScript); } catch {}
      try { document.head.removeChild(faqScript); } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone?.slug, zone?.name, zone?.drpi?.current_value, zone?.risk_score?.letter, zone?.active_developments]);

  return null;
}

// Exportar buildFaqs para que ZonePage pueda renderizar el mismo set en el acordeón visible.
export { buildFaqs };
