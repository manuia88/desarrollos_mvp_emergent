/** Guardia anti-regresión (07-15): una inserción automatizada le robó el `export default`
 * a App y la app entera se volvió un <Navigate> fuera del Router. Esto lo caza en CI. */
const fs = require('fs');
const path = require('path');

test('App.js exporta App como default (nadie le roba el export)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  expect(src).toMatch(/export default function App\(\)/);
  const defaults = (src.match(/export default/g) || []).length;
  expect(defaults).toBe(1);
});
