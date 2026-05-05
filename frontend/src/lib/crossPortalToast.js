/**
 * Batch 19 Sub-B — crossPortalToast.js
 * Shows a toast bottom-right when cross-portal sync happens.
 */

const PORTAL_ICONS = {
  marketplace: '🛒',
  asesor:      '👤',
  inmobiliaria:'🏢',
  crm:         '📊',
};

const PORTAL_LABELS = {
  marketplace: 'Marketplace',
  asesor:      'Portal Asesor',
  inmobiliaria:'Portal Inmobiliaria',
  crm:         'CRM',
};

const EVENT_LABELS = {
  project_published:   'Proyecto publicado',
  lead_created:        'Lead creado',
  asesor_deactivated:  'Asesor desactivado',
  commission_updated:  'Comisión actualizada',
  pricing_changed:     'Precio actualizado',
};

let _toastContainer = null;
let _toastCount = 0;

function getContainer() {
  if (_toastContainer && document.body.contains(_toastContainer)) return _toastContainer;

  const el = document.createElement('div');
  el.id = 'cross-portal-toasts';
  el.style.cssText = `
    position:fixed; bottom:24px; right:24px;
    z-index:9990; display:flex; flex-direction:column; gap:10px;
    pointer-events:none;
  `;
  document.body.appendChild(el);
  _toastContainer = el;
  return el;
}

/**
 * showCrossPortalSync(action, affected_portals)
 * E.g.: showCrossPortalSync('project_published', ['marketplace', 'asesor', 'inmobiliaria'])
 */
export function showCrossPortalSync(action, affected_portals = []) {
  const container = getContainer();
  const id = `cp-toast-${++_toastCount}`;

  const actionLabel = EVENT_LABELS[action] || action;
  const portalChips = affected_portals.map(p =>
    `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;
     border-radius:9999px;background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.35);
     color:#86efac;font-size:10px;font-weight:700;">${PORTAL_LABELS[p] || p}</span>`
  ).join(' ');

  const toast = document.createElement('div');
  toast.id = id;
  toast.style.cssText = `
    background:rgba(13,16,23,0.94);
    border:1px solid rgba(255,255,255,0.16);
    border-radius:12px;
    padding:12px 16px;
    min-width:280px;
    max-width:360px;
    pointer-events:all;
    animation:slideInRight 0.25s ease;
    backdrop-filter:blur(12px);
    font-family:'DM Sans',sans-serif;
  `;
  toast.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:10px;">
      <div style="width:24px;height:24px;border-radius:9999px;
           background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.35);
           display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#86efac" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 7L9 18l-5-5"/>
        </svg>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="color:#F0EBE0;font-size:12px;font-weight:700;margin-bottom:5px;">
          ${actionLabel} · Sincronizado
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">
          ${portalChips}
        </div>
      </div>
      <button onclick="document.getElementById('${id}')?.remove()"
        style="background:none;border:none;color:rgba(240,235,224,0.4);cursor:pointer;
               padding:2px;line-height:1;font-size:16px;">&times;</button>
    </div>
  `;

  container.appendChild(toast);

  // Auto-dismiss after 5s
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.animation = 'fadeOut 0.3s ease forwards';
      setTimeout(() => toast.parentNode?.removeChild(toast), 300);
    }
  }, 5000);
}

// Inject keyframe CSS once
(function injectCSS() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('cp-toast-styles')) return;
  const style = document.createElement('style');
  style.id = 'cp-toast-styles';
  style.textContent = `
    @keyframes slideInRight {
      from { transform: translateX(120%); opacity: 0; }
      to   { transform: translateX(0);    opacity: 1; }
    }
    @keyframes fadeOut {
      from { opacity: 1; }
      to   { opacity: 0; }
    }
  `;
  document.head.appendChild(style);
})();

/**
 * Log event to backend cross_portal_events collection.
 */
const API = process.env.REACT_APP_BACKEND_URL;
export async function logCrossPortalEvent(event_type, entity_id = null, metadata = {}) {
  try {
    await fetch(`${API}/api/orgs/cross-portal/log`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type, entity_id, metadata }),
    });
  } catch {}
}
