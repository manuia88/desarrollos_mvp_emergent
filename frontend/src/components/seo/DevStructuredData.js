// DevStructuredData — reconecta el structured data (que YA existe en StructuredData.js) a la ficha del desarrollo.
// Arma RealEstateListing + FAQPage desde dato REAL del dev (hide-if-empty · cero dato inventado).
// Reusado por la ficha viva (FichaDesarrollo) y la nueva (FichaCockpit) — un solo mapeo, sin duplicar.
import React from 'react';
import StructuredData from './StructuredData';

const STAGE = { preventa: 'Preventa', construccion: 'En construcción', entrega_inmediata: 'Entrega inmediata', terminado: 'Terminado' };
const money = (n) => (n ? `$${Number(n).toLocaleString('es-MX')}` : null);
const nums = (arr) => (Array.isArray(arr) ? arr.filter((x) => x != null && !Number.isNaN(Number(x))).map(Number) : []);

export default function DevStructuredData({ dev }) {
  if (!dev || !dev.id) return null;

  const prices = nums((dev.units || []).map((u) => u && u.price));
  const from = dev.price_from || (prices.length ? Math.min(...prices) : null);
  const to = dev.price_to || (prices.length ? Math.max(...prices) : null);
  const m2 = nums(dev.m2_range);
  const beds = nums(dev.bedrooms_range);
  const img = dev.cover_image || (Array.isArray(dev.images) && (dev.images[0] || {}).url) || (Array.isArray(dev.images) && typeof dev.images[0] === 'string' ? dev.images[0] : null) || dev.cover || null;
  const url = typeof window !== 'undefined' ? window.location.href.split('?')[0] : '';
  const loc = `${dev.colonia || ''}${dev.alcaldia ? ', ' + dev.alcaldia : ''}, CDMX`;

  const listing = {
    name: dev.name,
    description: dev.tagline || dev.description || `${dev.name} — desarrollo en ${loc}.`,
    url,
    image: img || undefined,
    address: dev.address_full || dev.street || undefined,
    colonia: dev.colonia || undefined,
    postal_code: dev.postal_code || undefined,
    lat: Array.isArray(dev.center) ? dev.center[1] : (dev.lat || undefined),
    lng: Array.isArray(dev.center) ? dev.center[0] : (dev.lng || undefined),
    price_from: from || undefined,
    price_to: to || undefined,
    m2_range: m2.length === 2 ? m2 : (m2.length ? [Math.min(...m2), Math.max(...m2)] : undefined),
  };

  // FAQPage SOLO con dato real (cada pregunta se incluye si existe su respuesta).
  const faqs = [];
  if (from) faqs.push({ question: `¿Cuánto cuesta un departamento en ${dev.name}?`, answer: `En ${dev.name} (${loc}) los departamentos van desde ${money(from)}${to && to !== from ? ` hasta ${money(to)}` : ''}.` });
  if (dev.address_full || dev.colonia) faqs.push({ question: `¿Dónde está ${dev.name}?`, answer: `${dev.name} está en ${dev.address_full || dev.colonia}${dev.alcaldia ? ', ' + dev.alcaldia : ''}, Ciudad de México.` });
  if (m2.length) faqs.push({ question: `¿De qué tamaño son los departamentos en ${dev.name}?`, answer: `Van de ${Math.min(...m2)} a ${Math.max(...m2)} m².` });
  if (beds.length) faqs.push({ question: `¿Cuántas recámaras tienen?`, answer: `De ${Math.min(...beds)} a ${Math.max(...beds)} recámaras.` });
  if (dev.stage) faqs.push({ question: `¿En qué etapa de venta está ${dev.name}?`, answer: `${STAGE[dev.stage] || dev.stage}.` });

  return (
    <>
      <StructuredData type="RealEstateListing" data={listing} />
      {faqs.length >= 2 && <StructuredData type="FAQPage" data={{ questions: faqs }} />}
    </>
  );
}
