// W5.25 — Widget embed tracking helper · client-side.
// Llamado al mount de cada widget público. FAIL-SOFT: cualquier error es silencioso.

const API = process.env.REACT_APP_BACKEND_URL;

async function sha256Hex(str) {
  try {
    const buf = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return '';
  }
}

function isSelfReferrer(ref) {
  if (!ref) return true;
  try {
    const host = new URL(ref).hostname.toLowerCase();
    return host.includes('desarrollosmx') || host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}

/**
 * Fire-and-forget tracking pixel.
 * Use opts.slug for widgets con slug nativo (avm/score/risk).
 * Use opts.apiKey para widgets API-keyed (vertical B2B) → hash truncado 16 chars.
 * Si ninguno · slug='anon'.
 */
export async function trackWidgetEmbed(widgetType, opts = {}) {
  try {
    if (typeof window === 'undefined' || !API) return;
    const ref = document.referrer || '';
    if (isSelfReferrer(ref)) return;

    let slug = (opts.slug || '').toString().trim();
    if (!slug && opts.apiKey) {
      const hex = await sha256Hex(opts.apiKey);
      slug = hex ? hex.slice(0, 16) : 'anon';
    }
    if (!slug) slug = 'anon';

    const url = `${API}/api/widgets/${encodeURIComponent(widgetType)}/${encodeURIComponent(slug)}/track?_=${Date.now()}`;
    const img = new Image();
    img.src = url;
  } catch {
    // silent
  }
}
