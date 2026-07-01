// Re-export para NO forkear el titlecase inteligente.
// Fuente ÚNICA: lib/titleCase.js → export function tc(str).
// Mantiene el nombre `titleCase` para los importadores existentes.
export { tc as titleCase, tc } from '../lib/titleCase';
export { default } from '../lib/titleCase';
