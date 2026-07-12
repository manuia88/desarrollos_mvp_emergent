import { trackFunnelEvent, trackBuyerView, trackPropertyView } from '../funnelTracker';

// ─── Helpers de mock ───────────────────────────────────────────────────────
// funnelTracker lee window.location.href dentro de readUtm() en cada llamada,
// así que sobreescribimos href con un setter controlado por test.
function setHref(href) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { href },
  });
}

function makeSessionStorageMock() {
  const store = {};
  return {
    store,
    getItem: jest.fn((k) => (k in store ? store[k] : null)),
    setItem: jest.fn((k, v) => { store[k] = String(v); }),
    removeItem: jest.fn((k) => { delete store[k]; }),
    clear: jest.fn(() => { Object.keys(store).forEach((k) => delete store[k]); }),
  };
}

// Devuelve el body parseado del último fetch.
function lastBody() {
  const call = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
  return JSON.parse(call[1].body);
}

let sessionMock;

beforeEach(() => {
  sessionMock = makeSessionStorageMock();
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    value: sessionMock,
  });
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200 }));
  setHref('https://desarrollosmx.io/marketplace');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('trackFunnelEvent — guardas de entrada', () => {
  it('NO dispara fetch si falta eventType', async () => {
    await trackFunnelEvent('', 'proj_1');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('NO dispara fetch si falta projectId', async () => {
    await trackFunnelEvent('view_property', null);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('NO dispara fetch si ambos son nulos/undefined', async () => {
    await trackFunnelEvent(undefined, undefined);
    await trackFunnelEvent(0, 0);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('trackFunnelEvent — caso feliz + payload', () => {
  it('POST a /api/funnel/event con method, headers y keepalive correctos', async () => {
    await trackFunnelEvent('view_property', 'proj_42');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/funnel/event');
    expect(opts.method).toBe('POST');
    expect(opts.keepalive).toBe(true);
    expect(opts.headers['Content-Type']).toBe('application/json');
  });

  it('el body incluye event_type, project_id y metadata pasada', async () => {
    await trackFunnelEvent('click_cta', 'proj_42', { boton: 'agendar' });
    const body = lastBody();
    expect(body.event_type).toBe('click_cta');
    expect(body.project_id).toBe('proj_42');
    expect(body.metadata).toEqual({ boton: 'agendar' });
  });

  it('metadata default es objeto vacío cuando no se pasa', async () => {
    await trackFunnelEvent('view_property', 'proj_42');
    expect(lastBody().metadata).toEqual({});
  });
});

describe('trackFunnelEvent — UTM y ref desde la URL', () => {
  it('extrae utm_* y usa ref como link_id', async () => {
    setHref('https://desarrollosmx.io/p/x?utm_source=meta&utm_medium=cpc&utm_campaign=verano&ref=agente99');
    await trackFunnelEvent('view_property', 'proj_42');
    const body = lastBody();
    expect(body.utm_source).toBe('meta');
    expect(body.utm_medium).toBe('cpc');
    expect(body.utm_campaign).toBe('verano');
    expect(body.link_id).toBe('agente99');
  });

  it('sin ref en la URL → link_id es null y utm_* son strings vacíos', async () => {
    setHref('https://desarrollosmx.io/marketplace');
    await trackFunnelEvent('view_property', 'proj_42');
    const body = lastBody();
    expect(body.link_id).toBeNull();
    expect(body.utm_source).toBe('');
    expect(body.utm_medium).toBe('');
    expect(body.utm_campaign).toBe('');
  });
});

describe('trackFunnelEvent — sesión (sessionStorage)', () => {
  it('genera y persiste un session_id cuando no existe', async () => {
    await trackFunnelEvent('view_property', 'proj_42');
    const body = lastBody();
    expect(typeof body.session_id).toBe('string');
    expect(body.session_id).toMatch(/^sess_/);
    // Persistió en storage bajo la clave canónica.
    expect(sessionMock.setItem).toHaveBeenCalledWith('dmx_funnel_session', body.session_id);
  });

  it('reutiliza el session_id existente sin regenerarlo', async () => {
    sessionMock.store['dmx_funnel_session'] = 'sess_previo123';
    await trackFunnelEvent('view_property', 'proj_42');
    expect(lastBody().session_id).toBe('sess_previo123');
    expect(sessionMock.setItem).not.toHaveBeenCalled();
  });
});

describe('trackFunnelEvent — resiliencia', () => {
  it('no lanza si fetch rechaza (fire & forget)', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('network down')));
    await expect(trackFunnelEvent('view_property', 'proj_42')).resolves.toBeUndefined();
  });
});

describe('trackFunnelEvent — sin fuga de PII/tokens', () => {
  it('el payload NO contiene cookies, tokens ni datos personales', async () => {
    // Simula que la app tiene un token en localStorage y cookies sensibles.
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: { getItem: () => 'jwt-super-secreto', setItem: jest.fn() },
    });
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => 'auth=Bearer-abc.def.ghi; session=priv',
    });
    await trackFunnelEvent('view_property', 'proj_42', { note: 'ok' });
    const raw = global.fetch.mock.calls[0][1].body;
    expect(raw).not.toContain('jwt-super-secreto');
    expect(raw).not.toContain('Bearer-abc');
    expect(raw).not.toContain('auth=');
    // Sólo lleva credentials via cookie en buyerView, NO en funnel.
    expect(global.fetch.mock.calls[0][1].credentials).toBeUndefined();
  });
});

describe('trackBuyerView', () => {
  it('NO dispara fetch si falta itemType o itemId', async () => {
    await trackBuyerView('', 'id_1');
    await trackBuyerView('project', null);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('POST a /api/comprador/history con credentials include y source default', async () => {
    await trackBuyerView('project', 'proj_7');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/comprador/history');
    expect(opts.credentials).toBe('include');
    expect(opts.keepalive).toBe(true);
    const body = JSON.parse(opts.body);
    expect(body).toEqual({ item_type: 'project', item_id: 'proj_7', source: 'marketplace' });
  });

  it('respeta el source explícito', async () => {
    await trackBuyerView('unit', 'u_9', 'ficha');
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).source).toBe('ficha');
  });

  it('no lanza si fetch rechaza', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('401')));
    await expect(trackBuyerView('project', 'proj_7')).resolves.toBeUndefined();
  });
});

describe('trackPropertyView — dispara ambos', () => {
  it('NO hace nada si falta projectId', async () => {
    await trackPropertyView(null);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('dispara funnel (view_property) + buyer view (project)', async () => {
    await trackPropertyView('proj_99', 'marketplace', { origen: 'grid' });
    // Deben haberse hecho 2 fetch: uno a funnel, otro a history.
    const urls = global.fetch.mock.calls.map((c) => c[0]);
    expect(urls.some((u) => u.includes('/api/funnel/event'))).toBe(true);
    expect(urls.some((u) => u.includes('/api/comprador/history'))).toBe(true);

    const funnelCall = global.fetch.mock.calls.find((c) => c[0].includes('/api/funnel/event'));
    expect(JSON.parse(funnelCall[1].body).event_type).toBe('view_property');
    expect(JSON.parse(funnelCall[1].body).metadata).toEqual({ origen: 'grid' });

    const histCall = global.fetch.mock.calls.find((c) => c[0].includes('/api/comprador/history'));
    expect(JSON.parse(histCall[1].body).item_type).toBe('project');
    expect(JSON.parse(histCall[1].body).source).toBe('marketplace');
  });
});
