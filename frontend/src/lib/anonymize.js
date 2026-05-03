/**
 * Batch 19 Sub-C — anonymize.js
 * PII anonymization helpers for Presentation Mode.
 */

/**
 * Deterministic hash from lead._id (NOT by index — index not stable cross-view).
 */
const hashId = (id) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h) + id.charCodeAt(i);
  return Math.abs(h);
};

/**
 * Anonymize a lead object for display.
 * Same lead._id always produces same "Lead XXX" number.
 */
export const anonymizeLead = (lead) => {
  if (!lead || !lead._id) return lead;
  const num = (hashId(lead._id) % 999) + 1;
  return {
    ...lead,
    nombre: `Lead ${String(num).padStart(3, '0')}`,
    name:   `Lead ${String(num).padStart(3, '0')}`,
    contact_name: `Lead ${String(num).padStart(3, '0')}`,
    telefono: '+52 ** *** ****',
    phone:    '+52 ** *** ****',
    contact_phone: '+52 ** *** ****',
    email: '***@***.com',
    contact_email: '***@***.com',
    notas_internas: undefined,
  };
};

/**
 * Anonymize a lead for Kanban card display (lighter version).
 */
export const anonymizeKanbanCard = (card) => {
  if (!card || !card.id) return card;
  const num = (hashId(card.id) % 999) + 1;
  return {
    ...card,
    contact_name:  `Lead ${String(num).padStart(3, '0')}`,
    contact_email: '***@***.com',
    contact_phone: '+52 ** *** ****',
  };
};

/** CSS class for PII fields that should be blurred */
export const piiCSS = 'pii-anonymize';

/** CSS class for pricing fields that should be blurred */
export const blurPriceCSS = 'pricing-blur';

/** CSS class for internal-only content that should be hidden */
export const internalOnlyCSS = 'internal-only';
