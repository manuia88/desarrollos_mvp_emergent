// W4.2B — StructuredData.js
// Injects JSON-LD <script> into document.head for SEO / GEO.
// Supported types: RealEstateListing | FAQPage | Dataset | Article
import { useEffect } from 'react';

function buildJsonLd(type, data) {
  switch (type) {
    case 'RealEstateListing':
      return {
        '@context': 'https://schema.org',
        '@type': 'RealEstateListing',
        'name': data.name || '',
        'description': data.description || '',
        'url': data.url || '',
        'image': data.image || '',
        'address': {
          '@type': 'PostalAddress',
          'streetAddress': data.address || '',
          'addressLocality': data.colonia || '',
          'addressRegion': 'Ciudad de México',
          'addressCountry': 'MX',
          'postalCode': data.postal_code || '',
        },
        'geo': data.lat && data.lng ? {
          '@type': 'GeoCoordinates',
          'latitude': data.lat,
          'longitude': data.lng,
        } : undefined,
        'offers': {
          '@type': 'AggregateOffer',
          'priceCurrency': 'MXN',
          'lowPrice': data.price_from || undefined,
          'highPrice': data.price_to || undefined,
        },
        'floorSize': data.m2_range ? {
          '@type': 'QuantitativeValue',
          'minValue': data.m2_range[0],
          'maxValue': data.m2_range[1],
          'unitCode': 'MTK',
        } : undefined,
        'brand': {
          '@type': 'Brand',
          'name': 'DesarrollosMX',
        },
      };

    case 'FAQPage':
      return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        'mainEntity': (data.questions || []).map(q => ({
          '@type': 'Question',
          'name': q.question,
          'acceptedAnswer': {
            '@type': 'Answer',
            'text': q.answer,
          },
        })),
      };

    case 'Dataset':
      return {
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        'name': data.name || '',
        'description': data.description || '',
        'creator': { '@type': 'Organization', 'name': 'DesarrollosMX' },
        'license': data.license || 'https://desarrollosmx.io/terminos',
        'distribution': data.api_url ? [{
          '@type': 'DataDownload',
          'encodingFormat': 'application/json',
          'contentUrl': data.api_url,
        }] : undefined,
      };

    case 'Article':
      return {
        '@context': 'https://schema.org',
        '@type': 'Article',
        'headline': data.headline || '',
        'datePublished': data.datePublished || '',
        'author': { '@type': 'Organization', 'name': 'DesarrollosMX' },
        'description': data.description || '',
      };

    default:
      return null;
  }
}

// Remove undefined values recursively (Schema.org doesn't want undefined fields)
function clean(obj) {
  if (Array.isArray(obj)) return obj.map(clean).filter(v => v != null);
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([, v]) => v != null)
        .map(([k, v]) => [k, clean(v)])
    );
  }
  return obj;
}

export default function StructuredData({ type, data }) {
  useEffect(() => {
    const jsonLd = buildJsonLd(type, data || {});
    if (!jsonLd) return;

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-structured-type', type);
    script.text = JSON.stringify(clean(jsonLd));
    document.head.appendChild(script);

    return () => {
      try { document.head.removeChild(script); } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, JSON.stringify(data)]);

  return null;
}
