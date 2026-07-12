import { TOOL_GROUPS, TOOLS_FLAT } from '../toolsCatalog';

// Guarda el "catálogo único" de herramientas (fuente-de-verdad de los 3 navbars). Regresión del bug
// donde las listas de herramientas vivían duplicadas y se desincronizaban.
describe('toolsCatalog — catálogo único de herramientas', () => {
  it('tiene grupos, cada uno con título e items no vacíos', () => {
    expect(Array.isArray(TOOL_GROUPS)).toBe(true);
    expect(TOOL_GROUPS.length).toBeGreaterThan(0);
    for (const g of TOOL_GROUPS) {
      expect(typeof g.title).toBe('string');
      expect(g.title.length).toBeGreaterThan(0);
      expect(Array.isArray(g.items)).toBe(true);
      expect(g.items.length).toBeGreaterThan(0);
    }
  });

  it('cada herramienta tiene label, ruta (to) y descripción', () => {
    for (const t of TOOLS_FLAT) {
      expect(t.label && typeof t.label === 'string').toBeTruthy();
      expect(t.to && t.to.startsWith('/')).toBeTruthy();
      expect(t.desc && typeof t.desc === 'string').toBeTruthy();
    }
  });

  it('las rutas (to) son ÚNICAS (sin duplicados)', () => {
    const routes = TOOLS_FLAT.map((t) => t.to);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('TOOLS_FLAT es la suma exacta de los items de los grupos', () => {
    const sum = TOOL_GROUPS.reduce((n, g) => n + g.items.length, 0);
    expect(TOOLS_FLAT.length).toBe(sum);
  });

  it('la Calculadora usa /calculadora (rename) y ya NO hay /simulador en el catálogo', () => {
    const routes = TOOLS_FLAT.map((t) => t.to);
    expect(routes).toContain('/calculadora');
    expect(routes).not.toContain('/simulador');
  });

  it('incluye las herramientas nuevas que faltaban en el navbar del home', () => {
    const routes = TOOLS_FLAT.map((t) => t.to);
    ['/picks', '/ideas', '/screener', '/indice', '/datos'].forEach((r) => {
      expect(routes).toContain(r);
    });
  });
});
