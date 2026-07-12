import { visitorId, sendBuyerSignal, claimVisitor, fetchInteres } from '../buyerSignal';

/**
 * Tests de VALOR para src/lib/buyerSignal.js.
 *
 * deviceType() NO se exporta: se prueba de forma indirecta a través de
 * sendBuyerSignal(), que mete `device: deviceType()` en el body del fetch.
 * Espiamos fetch y leemos el body real que se manda.
 */

// Helpers ------------------------------------------------------------

function setUserAgent(ua) {
  // navigator.userAgent es un getter en jsdom; se sobreescribe con defineProperty.
  Object.defineProperty(window.navigator, 'userAgent', {
    value: ua,
    configurable: true,
  });
}

// device que salió en el ÚLTIMO fetch de sendBuyerSignal
function deviceFromLastSignal(fetchMock) {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  const body = JSON.parse(call[1].body);
  return body.device;
}

function bodyFromLastCall(fetchMock) {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return JSON.parse(call[1].body);
}

// Setup --------------------------------------------------------------

describe('buyerSignal', () => {
  let fetchMock;
  const originalUA = window.navigator.userAgent;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    // fetch nunca pega a la red real: siempre resolvemos un stub.
    fetchMock = jest.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ ok: true }) })
    );
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    setUserAgent(originalUA);
  });

  // visitorId -------------------------------------------------------

  describe('visitorId()', () => {
    it('devuelve el MISMO id en dos llamadas (persistente en localStorage)', () => {
      const a = visitorId();
      const b = visitorId();
      expect(a).toBe(b);
      // se persistió con la key canónica del espinazo
      expect(localStorage.getItem('dmx_visitor_id')).toBe(a);
    });

    it('genera un id con prefijo v_ y alta entropía (no adivinable)', () => {
      const v = visitorId();
      // Formato real segun la impl: 'v_' + _strongId(). En jsdom (sin crypto.randomUUID
      // en este runtime) cae al fallback base36 → [0-9a-z]. Con crypto sería hex. Cubrimos
      // ambos con [0-9a-z] (superset) y exigimos longitud de alta entropía.
      expect(v).toMatch(/^v_[0-9a-z]{24,}$/);
      // NO es el fallback anónimo ni un valor corto adivinable.
      expect(v).not.toBe('v_anon');
      expect(v.length).toBeGreaterThan(20);
    });

    it('reutiliza un id ya existente en storage en vez de regenerar', () => {
      localStorage.setItem('dmx_visitor_id', 'v_previo_guardado');
      expect(visitorId()).toBe('v_previo_guardado');
    });

    it('fail-open a v_anon si localStorage.getItem revienta', () => {
      const spy = jest
        .spyOn(Storage.prototype, 'getItem')
        .mockImplementation(() => {
          throw new Error('storage bloqueado (modo privado)');
        });
      expect(visitorId()).toBe('v_anon');
      spy.mockRestore();
    });
  });

  // deviceType (vía sendBuyerSignal) --------------------------------

  describe('deviceType() (indirecto vía sendBuyerSignal)', () => {
    it('iPhone → mobile', () => {
      setUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605'
      );
      sendBuyerSignal('view');
      expect(deviceFromLastSignal(fetchMock)).toBe('mobile');
    });

    it('Android phone (trae "Mobile") → mobile', () => {
      setUserAgent(
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Mobile Safari/537.36'
      );
      sendBuyerSignal('view');
      expect(deviceFromLastSignal(fetchMock)).toBe('mobile');
    });

    it('iPad → tablet', () => {
      setUserAgent(
        'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605'
      );
      sendBuyerSignal('view');
      expect(deviceFromLastSignal(fetchMock)).toBe('tablet');
    });

    it('Android SIN "Mobile" (tablet) → tablet (umbral android && !mobile)', () => {
      setUserAgent(
        'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 Safari/537.36'
      );
      sendBuyerSignal('view');
      expect(deviceFromLastSignal(fetchMock)).toBe('tablet');
    });

    it('Desktop (Mac Chrome, sin señales móviles) → desktop', () => {
      setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36'
      );
      sendBuyerSignal('view');
      expect(deviceFromLastSignal(fetchMock)).toBe('desktop');
    });

    it('UA vacío → desktop (default del try, no unknown)', () => {
      setUserAgent('');
      sendBuyerSignal('view');
      expect(deviceFromLastSignal(fetchMock)).toBe('desktop');
    });
  });

  // sendBuyerSignal payload -----------------------------------------

  describe('sendBuyerSignal()', () => {
    it('arma el body con visitor_id + type + device y hace POST keepalive', () => {
      setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120'
      );
      sendBuyerSignal('like', { dev_id: 'D42' });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toMatch(/\/api\/buyer\/signal$/);
      expect(init.method).toBe('POST');
      expect(init.keepalive).toBe(true);

      const body = bodyFromLastCall(fetchMock);
      expect(body.type).toBe('like');
      expect(body.device).toBe('desktop');
      expect(body.dev_id).toBe('D42'); // opts se fusionan
      expect(body.visitor_id).toMatch(/^v_/);
    });

    it('NO filtra tokens/PII: el body solo lleva id anónimo + campos declarados', () => {
      // simulamos un token en localStorage como haría un flujo real de auth
      localStorage.setItem('access_token', 'secreto-jwt-abc.def.ghi');
      sendBuyerSignal('save');

      const raw = fetchMock.mock.calls[0][1].body;
      expect(raw).not.toContain('secreto-jwt-abc');
      const body = JSON.parse(raw);
      // solo el visitor_id anónimo, nunca el token
      expect(body.visitor_id).toMatch(/^v_[0-9a-z]{24,}$/);
      expect(Object.keys(body).sort()).toEqual(
        ['device', 'type', 'visitor_id'].sort()
      );
    });

    it('es fail-open: si fetch lanza síncrono, NO propaga excepción', () => {
      global.fetch = jest.fn(() => {
        throw new Error('boom red');
      });
      expect(() => sendBuyerSignal('view')).not.toThrow();
    });
  });

  // claimVisitor ----------------------------------------------------

  describe('claimVisitor()', () => {
    it('hace el POST a /claim la primera vez (sin flag de sesión)', () => {
      claimVisitor();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toMatch(/\/api\/buyer\/claim$/);
      expect(init.credentials).toBe('include');
    });

    it('NO re-dispara si ya está marcado como vinculado en la sesión', () => {
      sessionStorage.setItem('dmx_claimed', '1');
      claimVisitor();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // fetchInteres ----------------------------------------------------

  describe('fetchInteres()', () => {
    it('devuelve el json del backend para el devId', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({ json: () => Promise.resolve({ likes: 3, saves: 1 }) })
      );
      await expect(fetchInteres('D7')).resolves.toEqual({ likes: 3, saves: 1 });
    });

    it('fail-open a null si el fetch rechaza', async () => {
      global.fetch = jest.fn(() => Promise.reject(new Error('down')));
      await expect(fetchInteres('D7')).resolves.toBeNull();
    });
  });
});
