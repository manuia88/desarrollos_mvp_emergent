// Title Case inteligente (español) para TÍTULOS de la UI.
// Regla: mayúscula en palabras significativas; minúscula en artículos/preposiciones/conjunciones cortas (salvo la
// primera palabra). Respeta acrónimos en MAYÚSCULAS, números, emojis y puntuación. No se usa en frases/microcopy.
const SMALL = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'y', 'o', 'u', 'e', 'en', 'con', 'para', 'por', 'a', 'al', 'que',
  'su', 'tu', 'tus', 'mi', 'mis', 'lo', 'se', 'sin', 'sobre', 'tras', 'vs',
  'te', 'me', 'le', 'les', 'nos', 'es',
]);

export function tc(str) {
  if (!str || typeof str !== 'string') return str;
  let seen = false; // ¿ya vimos la primera palabra "real" (con letras)?
  return str.split(/(\s+)/).map((w) => {
    // espacios, emojis y puntuación pura: intactos, y NO cuentan como "primera palabra"
    if (/^\s+$/.test(w) || !/[a-záéíóúñ]/i.test(w)) return w;
    const lower = w.toLowerCase();
    const first = !seen;
    seen = true;
    if (/\d/.test(w) || (w.length > 1 && w === w.toUpperCase())) return w; // acrónimos / con números
    if (!first && SMALL.has(lower)) return lower;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join('');
}

export default tc;
