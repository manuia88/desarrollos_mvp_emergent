/**
 * Packs de colonia en el front (espeja backend/zona_packs.py). Agrupa sub-colonias en su
 * ZONA BASE: quita alcaldía + variantes (norte/sur/centro/i-x/ampl) y aplica alias de
 * adyacencia (Hipódromo/San Miguel Chapultepec/Escandón → Condesa; Granada → Polanco).
 */
const VARIANTES = new Set([
  'norte', 'nte', 'sur', 'centro', 'oriente', 'ote', 'poniente', 'pte',
  'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x',
  'ampl', 'ampliacion', 'seccion', 'secc',
]);
const ALCALDIAS = [
  'cuajimalpa-de-morelos', 'la-magdalena-contreras', 'gustavo-a-madero', 'venustiano-carranza',
  'magdalena-contreras', 'naucalpan-de-juarez', 'atizapan-de-zaragoza', 'benito-juarez',
  'alvaro-obregon', 'miguel-hidalgo', 'huixquilucan', 'tlalnepantla', 'azcapotzalco',
  'cuauhtemoc', 'iztapalapa', 'iztacalco', 'xochimilco', 'cuajimalpa', 'naucalpan',
  'atizapan', 'coyoacan', 'milpa-alta', 'tlahuac', 'tlalpan', 'edomex',
].sort((a, b) => b.length - a.length);
const ALIAS = {
  hipodromo: 'condesa', 'hipodromo-condesa': 'condesa',
  'san-miguel-chapultepec': 'condesa', escandon: 'condesa',
  granada: 'polanco', 'ampliacion-granada': 'polanco', 'amp-granada': 'polanco',
  'veronica-anzures': 'anzures',
  'green-house': 'interlomas', 'hacienda-de-las-palmas': 'interlomas', 'la-herradura': 'interlomas',
};
const ENLACE = new Set(['de', 'del', 'la', 'las', 'los', 'y']);

export function zonaBase(slug) {
  let s = (slug || '').toLowerCase().trim();
  for (const a of ALCALDIAS) { if (s === a) break; if (s.endsWith('-' + a)) { s = s.slice(0, -(a.length + 1)); break; } }
  const toks = s.split('-');
  while (toks.length > 1 && VARIANTES.has(toks[toks.length - 1])) toks.pop();
  const base = toks.join('-');
  return ALIAS[base] || base;
}

export function nombreZona(slug) {
  return (slug || '').split('-').map((w, i) => (i === 0 || !ENLACE.has(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
}
