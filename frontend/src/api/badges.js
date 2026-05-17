/**
 * W5.11 Parte 3 — Badge fetchers helpers.
 * Cada función retorna una promesa con un entero (count).
 * Reusable desde PortalLayout.BADGE_SOURCES y componentes ad-hoc.
 */
const API = process.env.REACT_APP_BACKEND_URL;

export const disputes_pending_count = () =>
  fetch(`${API}/api/dev/disputes/pending`, { credentials: 'include' })
    .then((r) => r.json())
    .then((d) => (typeof d?.count === 'number' ? d.count : (d?.pending?.length ?? 0)))
    .catch(() => 0);

export default { disputes_pending_count };
