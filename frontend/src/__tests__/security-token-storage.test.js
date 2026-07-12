import fs from 'fs';
import path from 'path';

// REGRESIÓN DE SEGURIDAD (auditoría 2026-07-12): el token de sesión NO debe volver a guardarse/leerse
// en localStorage/sessionStorage (vector XSS). La sesión vive SOLO en la cookie httponly. Este test
// escanea todo src/ y falla si alguien re-introduce el patrón.
const SRC = path.join(__dirname, '..');
const FORBIDDEN = /(local|session)Storage\.(get|set)Item\(\s*['"](dmx_token|access_token|token)['"]/;
const BEARER_LS = /Bearer\s*\$\{\s*(local|session)Storage\.getItem/;

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(js|jsx|ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

describe('seguridad — el token de sesión no vive en el navegador', () => {
  const files = walk(SRC);

  it('escanea un número razonable de archivos de código', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('NINGÚN archivo guarda/lee dmx_token/access_token/token en localStorage o sessionStorage', () => {
    const offenders = files.filter((f) => FORBIDDEN.test(fs.readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it('NINGÚN archivo arma Authorization: Bearer desde localStorage', () => {
    const offenders = files.filter((f) => BEARER_LS.test(fs.readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });
});
