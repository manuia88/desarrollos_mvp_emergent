// W5.x F9 · whatsapp_stub · build link via backend con fallback local fail-silent
const BASE = process.env.REACT_APP_BACKEND_URL;

// Templates locales fallback (es-MX) — usados si backend devuelve 404
const LOCAL_TEMPLATES = {
  lead_welcome: ({ name = '', property_title = '' } = {}) =>
    `Hola, soy ${name || ''}. Me interesa ${property_title || 'la propiedad'} y vi mi PDF personalizado. Quiero saber mas.`,
  asesor_alert: ({ advisor_name = '', lead_name = '', property_title = '', urgency_score = '' } = {}) =>
    `Hola ${advisor_name || ''}, hay un nuevo lead caliente: ${lead_name || ''} sobre ${property_title || ''}. Score ${urgency_score || '--'}/100.`,
  property_inquiry: ({ property_title = '' } = {}) =>
    `Hola, vi ${property_title || 'la propiedad'} en el marketplace y quiero mas informacion.`,
  followup_24h: ({ name = '', property_title = '' } = {}) =>
    `Hola ${name || ''}, hace 24h viste ${property_title || 'una propiedad'}. ¿Sigues interesado? Tengo info nueva.`,
};

function buildFallback(templateKey, context, phone) {
  const fn = LOCAL_TEMPLATES[templateKey] || LOCAL_TEMPLATES.property_inquiry;
  const text = fn(context || {});
  const digits = String(phone || '').replace(/\D/g, '');
  const withCountry = digits.length === 10 ? `52${digits}` : digits;
  const base = withCountry ? `https://wa.me/${withCountry}` : 'https://wa.me/';
  const url = `${base}?text=${encodeURIComponent(text)}`;
  return { whatsapp_url: url, template_used: templateKey, fallback: true };
}

/**
 * POST /api/whatsapp/build-link · fail-silent → fallback local
 * @param {string} templateKey
 * @param {object} context — variables del template (incluye opcionalmente `phone` para fallback URL)
 * @returns {Promise<{ whatsapp_url: string, template_used: string, fallback: boolean }>}
 */
export const buildWhatsAppLink = async (templateKey, context = {}) => {
  const phone = context?.phone || '';
  try {
    const r = await fetch(`${BASE}/api/whatsapp/build-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ template_key: templateKey, context: context || {} }),
    });
    if (!r.ok) return buildFallback(templateKey, context, phone);
    const data = await r.json();
    if (!data?.whatsapp_url) return buildFallback(templateKey, context, phone);
    return { ...data, fallback: false };
  } catch {
    return buildFallback(templateKey, context, phone);
  }
};

export { LOCAL_TEMPLATES };
