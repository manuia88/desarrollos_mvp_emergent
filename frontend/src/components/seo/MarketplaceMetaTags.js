// W4.2D1 — MarketplaceMetaTags.js
// Inyecta <title> + <meta description> + JSON-LD SearchResultsPage dinámico según filtros activos.
import { useEffect } from 'react';

const SITE = 'DesarrollosMX';

function humanPrecio(max) {
  if (!max) return null;
  if (max >= 1_000_000) return `$${(max / 1_000_000).toFixed(0)}M`;
  if (max >= 1_000) return `$${(max / 1_000).toFixed(0)}K`;
  return `$${max}`;
}

function humanColonia(slug) {
  if (!slug) return null;
  // title-case the slug
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function buildTitle(filters, coloniaFilter) {
  const parts = [];

  // Base concept
  const tipo = filters.tipo === 'casa' ? 'Casas' : 'Departamentos';
  parts.push(tipo);

  // Recámaras
  if (filters.beds) parts.push(`${filters.beds} recámaras`);

  // Colonia
  const colonia = coloniaFilter || (Array.isArray(filters.colonia) ? filters.colonia[0] : null);
  if (colonia) parts.push(`en ${humanColonia(colonia)}`);

  // Precio
  if (filters.max_price) parts.push(`hasta ${humanPrecio(filters.max_price)}`);

  // Stage
  if (filters.stage) {
    const stageLabel = {
      preventa: 'en preventa',
      en_construccion: 'en construcción',
      entrega_inmediata: 'entrega inmediata',
    }[filters.stage];
    if (stageLabel) parts.push(stageLabel);
  }

  const main = parts.join(' ');
  const base = main.length > 5 ? main : 'Departamentos en CDMX';
  return `${base} | ${SITE}`;
}

function buildDescription(filters, coloniaFilter, resultCount) {
  const colonia = coloniaFilter || (Array.isArray(filters.colonia) ? filters.colonia[0] : null);
  const coloniaText = colonia ? `en ${humanColonia(colonia)}, CDMX` : 'en Ciudad de México';
  const tipo = filters.tipo === 'casa' ? 'casas' : 'departamentos';
  const count = resultCount != null ? `${resultCount} resultados. ` : '';
  return `${count}Encuentra ${tipo} ${coloniaText} con datos de mercado en tiempo real: precios, absorción, IE Score y diagnóstico inteligente. DesarrollosMX.`;
}

export default function MarketplaceMetaTags({ filters = {}, coloniaFilter = null, resultCount = null }) {
  useEffect(() => {
    const title = buildTitle(filters, coloniaFilter);
    const description = buildDescription(filters, coloniaFilter, resultCount);

    // Update <title>
    document.title = title;

    // Upsert <meta name="description">
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', description);

    // JSON-LD SearchResultsPage
    const colonia = coloniaFilter || (Array.isArray(filters.colonia) ? filters.colonia[0] : null);
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'SearchResultsPage',
      'name': title,
      'description': description,
      'numberOfItems': resultCount ?? undefined,
      'query': Object.entries({
        colonia,
        tipo: filters.tipo,
        stage: filters.stage,
        precio_max: filters.max_price,
        recamaras_min: filters.beds,
      })
        .filter(([, v]) => v != null)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ') || 'todos',
    };

    let ldScript = document.querySelector('script[data-structured-type="SearchResultsPage"]');
    if (!ldScript) {
      ldScript = document.createElement('script');
      ldScript.type = 'application/ld+json';
      ldScript.setAttribute('data-structured-type', 'SearchResultsPage');
      document.head.appendChild(ldScript);
    }
    ldScript.text = JSON.stringify(jsonLd);

    return () => {
      // Restore defaults on unmount
      document.title = 'DesarrollosMX · Inteligencia Inmobiliaria LATAM';
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters), coloniaFilter, resultCount]);

  return null;
}
