import {
  fetchAvmQuick,
  fetchTopColonias,
  fetchAvmWidgetConfig,
  fetchAvmLanding,
  fetchAvmAccuracySummary,
  fetchAvmPromotions,
  triggerAvmRetrain,
  fetchAvmGoldenValidation,
  invalidateAvmCache,
} from '../avm';

// Helpers para parsear la URL que recibió fetch.
function lastUrl(mock) {
  return String(mock.mock.calls[mock.mock.calls.length - 1][0]);
}
function lastOpts(mock) {
  return mock.mock.calls[mock.mock.calls.length - 1][1] || {};
}
function queryParams(url) {
  const qs = String(url).split('?')[1] || '';
  return new URLSearchParams(qs);
}

// Mock de una respuesta fetch estilo Response.
function okResponse(body = { ok: true }) {
  return { ok: true, status: 200, json: async () => body };
}
function errResponse(status) {
  return { ok: false, status, json: async () => ({}) };
}

describe('api/avm.js — construcción de request y comportamiento real', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(okResponse());
    global.fetch = fetchMock;
  });
  afterEach(() => {
    delete global.fetch;
    jest.clearAllMocks();
  });

  // ── CASOS FELICES ────────────────────────────────────────────────
  it('fetchAvmQuick arma los params base y devuelve el json', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ estimado: 1234 }));
    const out = await fetchAvmQuick({
      coloniaSlug: 'roma-norte',
      m2: 80,
      recamaras: 2,
      banos: 2,
      antiguedadAnos: 5,
    });
    expect(out).toEqual({ estimado: 1234 });
    const url = lastUrl(fetchMock);
    expect(url).toMatch(/\/api\/avm-public\/quick\?/);
    const p = queryParams(url);
    expect(p.get('colonia_slug')).toBe('roma-norte');
    expect(p.get('m2')).toBe('80');
    expect(p.get('recamaras')).toBe('2');
    expect(p.get('banos')).toBe('2');
    expect(p.get('antiguedad_anos')).toBe('5');
    // explain default = false → 'false' literal
    expect(p.get('explain')).toBe('false');
  });

  it('fetchAvmQuick con explain=true serializa el flag como "true"', async () => {
    await fetchAvmQuick({
      coloniaSlug: 'condesa',
      m2: 60,
      recamaras: 1,
      banos: 1,
      antiguedadAnos: 10,
      explain: true,
    });
    const p = queryParams(lastUrl(fetchMock));
    expect(p.get('explain')).toBe('true');
  });

  it('fetchAvmQuick incluye SOLO los atributos ricos que son truthy', async () => {
    await fetchAvmQuick({
      coloniaSlug: 'polanco',
      m2: 120,
      recamaras: 3,
      banos: 3,
      antiguedadAnos: 2,
      vista: 'panoramica',
      estadoConservacion: 'excelente',
      nivel: 5,
      nAmenidades: 4,
      // condicion y orientacion NO se pasan → no deben aparecer
    });
    const p = queryParams(lastUrl(fetchMock));
    expect(p.get('vista')).toBe('panoramica');
    expect(p.get('estado_conservacion')).toBe('excelente');
    expect(p.get('nivel')).toBe('5');
    expect(p.get('n_amenidades')).toBe('4');
    expect(p.has('condicion')).toBe(false);
    expect(p.has('orientacion')).toBe(false);
  });

  // ── LÍMITES / UMBRAL: valores falsy en atributos opcionales ──────
  it('fetchAvmQuick con nivel=0 y nAmenidades=0 (falsy) NO agrega esos params', async () => {
    // Comportamiento REAL: `if (nivel)` con 0 es falsy → NO se setea.
    await fetchAvmQuick({
      coloniaSlug: 'napoles',
      m2: 50,
      recamaras: 1,
      banos: 1,
      antiguedadAnos: 0,
      nivel: 0,
      nAmenidades: 0,
    });
    const p = queryParams(lastUrl(fetchMock));
    expect(p.has('nivel')).toBe(false);
    expect(p.has('n_amenidades')).toBe(false);
    // antiguedad_anos SÍ va siempre (base), aun siendo 0 → String(0)==='0'
    expect(p.get('antiguedad_anos')).toBe('0');
  });

  // ── ENTRADAS NULAS: comportamiento REAL de String(null)==='null' ──
  it('fetchAvmQuick con m2=null serializa el literal "null" (NO vacío, NO NaN)', async () => {
    // No asumo Number(null)===0: el código hace String(m2). String(null) === 'null'.
    await fetchAvmQuick({
      coloniaSlug: 'del-valle',
      m2: null,
      recamaras: null,
      banos: null,
      antiguedadAnos: null,
    });
    const p = queryParams(lastUrl(fetchMock));
    expect(p.get('m2')).toBe('null');
    expect(p.get('recamaras')).toBe('null');
    expect(p.get('banos')).toBe('null');
    expect(p.get('antiguedad_anos')).toBe('null');
  });

  // ── MANEJO DE ERRORES: mapeo por status ──────────────────────────
  it('fetchAvmQuick mapea 429 a mensaje de rate-limit', async () => {
    fetchMock.mockResolvedValueOnce(errResponse(429));
    await expect(
      fetchAvmQuick({ coloniaSlug: 'x', m2: 1, recamaras: 1, banos: 1, antiguedadAnos: 1 }),
    ).rejects.toThrow('Demasiadas peticiones. Espera 1 minuto.');
  });

  it('fetchAvmQuick mapea 404 a "Colonia no encontrada."', async () => {
    fetchMock.mockResolvedValueOnce(errResponse(404));
    await expect(
      fetchAvmQuick({ coloniaSlug: 'x', m2: 1, recamaras: 1, banos: 1, antiguedadAnos: 1 }),
    ).rejects.toThrow('Colonia no encontrada.');
  });

  it('fetchAvmQuick mapea otros status a "Error <status>"', async () => {
    fetchMock.mockResolvedValueOnce(errResponse(500));
    await expect(
      fetchAvmQuick({ coloniaSlug: 'x', m2: 1, recamaras: 1, banos: 1, antiguedadAnos: 1 }),
    ).rejects.toThrow('Error 500');
  });

  // ── fetchTopColonias: fallback sin throw en error ────────────────
  it('fetchTopColonias usa el limit default (30) en la URL', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ colonias: [{ slug: 'a' }] }));
    const out = await fetchTopColonias();
    expect(out).toEqual({ colonias: [{ slug: 'a' }] });
    const p = queryParams(lastUrl(fetchMock));
    expect(p.get('limit')).toBe('30');
  });

  it('fetchTopColonias respeta un limit explícito y NO lanza en error (devuelve {colonias:[]})', async () => {
    fetchMock.mockResolvedValueOnce(errResponse(500));
    const out = await fetchTopColonias(7);
    // Comportamiento REAL: no throw, retorna fallback.
    expect(out).toEqual({ colonias: [] });
    const p = queryParams(lastUrl(fetchMock));
    expect(p.get('limit')).toBe('7');
  });

  // ── widget-config / landing: encodeURIComponent del slug ─────────
  it('fetchAvmWidgetConfig codifica el slug y aplica theme default "dark"', async () => {
    await fetchAvmWidgetConfig('roma norte/&');
    const url = lastUrl(fetchMock);
    expect(url).toContain('/api/avm-public/widget-config/');
    // El slug debe estar url-encoded (espacio→%20, /→%2F, &→%26).
    expect(url).toContain(encodeURIComponent('roma norte/&'));
    expect(url).not.toContain('roma norte/&');
    const p = queryParams(url);
    expect(p.get('theme')).toBe('dark');
  });

  it('fetchAvmWidgetConfig lanza widget_config_<status> en error', async () => {
    fetchMock.mockResolvedValueOnce(errResponse(403));
    await expect(fetchAvmWidgetConfig('x')).rejects.toThrow('widget_config_403');
  });

  it('fetchAvmLanding codifica el slug y lanza landing_<status> en error', async () => {
    fetchMock.mockResolvedValueOnce(errResponse(404));
    await expect(fetchAvmLanding('a b')).rejects.toThrow('landing_404');
    expect(lastUrl(fetchMock)).toContain(encodeURIComponent('a b'));
  });
});

// ── REGRESIÓN DE AUTH (cookie httponly, sin Bearer) ────────────────
describe('api/avm.js — auth por cookie httponly, sin Authorization/Bearer', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(okResponse());
    global.fetch = fetchMock;
  });
  afterEach(() => {
    delete global.fetch;
    jest.clearAllMocks();
  });

  it('fn superadmin (fetchAvmAccuracySummary) manda credentials:"include" y NINGÚN Authorization', async () => {
    await fetchAvmAccuracySummary();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = lastUrl(fetchMock);
    const opts = lastOpts(fetchMock);
    expect(url).toMatch(/\/api\/superadmin\/avm-accuracy\/summary$/);
    expect(opts.credentials).toBe('include');
    const headerKeys = Object.keys(opts.headers || {}).map((k) => k.toLowerCase());
    expect(headerKeys).not.toContain('authorization');
    // No se interpola token robable ("Bearer" / "undefined").
    const blob = JSON.stringify(opts.headers || {});
    expect(blob).not.toMatch(/Bearer/i);
    expect(blob).not.toContain('undefined');
  });

  it('triggerAvmRetrain hace POST con credentials:"include" y sin Bearer', async () => {
    await triggerAvmRetrain();
    const opts = lastOpts(fetchMock);
    expect(opts.method).toBe('POST');
    expect(opts.credentials).toBe('include');
    const headerBlob = JSON.stringify(opts.headers || {});
    expect(headerBlob).not.toMatch(/Bearer/i);
    expect(lastUrl(fetchMock)).toMatch(/\/api\/superadmin\/avm-accuracy\/trigger-retrain$/);
  });

  it('invalidateAvmCache hace POST con credentials:"include"', async () => {
    await invalidateAvmCache();
    const opts = lastOpts(fetchMock);
    expect(opts.method).toBe('POST');
    expect(opts.credentials).toBe('include');
    expect(lastUrl(fetchMock)).toMatch(/\/api\/superadmin\/avm-accuracy\/cache-invalidate$/);
  });

  it('fn pública (fetchAvmQuick) también manda credentials:"include" y sin Authorization', async () => {
    await fetchAvmQuick({ coloniaSlug: 'x', m2: 1, recamaras: 1, banos: 1, antiguedadAnos: 1 });
    const opts = lastOpts(fetchMock);
    expect(opts.credentials).toBe('include');
    const headerKeys = Object.keys(opts.headers || {}).map((k) => k.toLowerCase());
    expect(headerKeys).not.toContain('authorization');
  });

  it('fetchAvmPromotions (superadmin GET) usa limit default 100 y credentials include', async () => {
    await fetchAvmPromotions();
    const opts = lastOpts(fetchMock);
    expect(opts.credentials).toBe('include');
    const p = queryParams(lastUrl(fetchMock));
    expect(p.get('limit')).toBe('100');
  });

  it('fetchAvmGoldenValidation golpea el endpoint golden-validation con include', async () => {
    await fetchAvmGoldenValidation();
    const opts = lastOpts(fetchMock);
    expect(opts.credentials).toBe('include');
    expect(lastUrl(fetchMock)).toMatch(/\/api\/superadmin\/avm-accuracy\/golden-validation$/);
  });
});
