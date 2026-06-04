/**
 * Title Case "inteligente" en español.
 * - Mayúscula en palabras importantes.
 * - Minúscula en palabras menores (de, del, la, y, en, a, por, con…), salvo la 1ª.
 * - Respeta acrónimos (TODO MAYÚSCULAS: CDMX, AVM, IVA), números y m².
 * Pensado para etiquetas cortas: nav, tabs, botones, encabezados. NO para frases largas.
 */
const MINOR = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'un', 'una', 'unos', 'unas',
  'y', 'e', 'o', 'u', 'a', 'al', 'en', 'con', 'por', 'para', 'sin',
  'sobre', 'tras', 'que', 'su', 'sus', 'lo', 'vs',
]);

export function titleCase(str) {
  if (!str || typeof str !== 'string') return str;
  const tokens = str.split(/(\s+)/); // conserva los espacios
  let first = true;
  return tokens.map((tok) => {
    if (/^\s+$/.test(tok)) return tok;
    // Acrónimos (todo mayúsculas con al menos una letra) → intactos
    if (tok.length > 1 && tok === tok.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(tok)) { first = false; return tok; }
    // Tokens con dígitos o símbolos (m², 3D, 24/7) → intactos
    if (/[0-9²]/.test(tok)) { first = false; return tok; }
    const lower = tok.toLowerCase();
    const out = (!first && MINOR.has(lower))
      ? lower
      : lower.charAt(0).toUpperCase() + lower.slice(1);
    first = false;
    return out;
  }).join('');
}

export default titleCase;
