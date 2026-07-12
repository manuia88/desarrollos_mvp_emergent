/**
 * Tests for src/lib/tracking.js — attribution / touchpoint utilities.
 *
 * Behaviors verified against the REAL implementation:
 *  - captureRefCookie(): reads ?ref=X, persists a `dmx_ref` cookie, pushes a
 *    touchpoint, and (only on /desarrollo|/proyecto paths) POSTs a view event.
 *  - getCurrentAttribution(): snapshot {touchpoints, current_url, referrer, cookie_ref}.
 *  - clearAttribution(): drops cookie + localStorage touchpoints.
 *  - appendTouchpoint(): appends, defaults timestamp, and the store is capped at
 *    the LAST 15 entries (saveTouchpoints uses list.slice(-15)).
 *
 * Browser side-effects (localStorage / cookie / navigator / location / referrer /
 * fetch) run against jsdom; fetch is mocked with jest.
 */
import {
  captureRefCookie,
  getCurrentAttribution,
  clearAttribution,
  appendTouchpoint,
} from '../tracking';

const COOKIE_NAME = 'dmx_ref';
const TOUCHPOINTS_KEY = 'dmx_touchpoints';

// --- helpers to drive the browser environment deterministically ---------------
function setLocation({ search = '', href = 'https://app.dmx.test/', pathname = '/' } = {}) {
  Object.defineProperty(window, 'location', {
    value: { search, href, pathname },
    configurable: true,
    writable: true,
  });
}

function setReferrer(value) {
  Object.defineProperty(document, 'referrer', { value, configurable: true });
}

// jsdom persists document.cookie across tests in the same file, so wipe it hard.
function nukeCookies() {
  document.cookie
    .split(';')
    .map((c) => c.split('=')[0].trim())
    .filter(Boolean)
    .forEach((name) => {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    });
}

beforeEach(() => {
  localStorage.clear();
  nukeCookies();
  setReferrer('');
  setLocation({});
  global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
  process.env.REACT_APP_BACKEND_URL = 'https://api.dmx.test';
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('captureRefCookie()', () => {
  it('caso feliz: captura ?ref, persiste cookie dmx_ref y registra touchpoint', () => {
    setLocation({
      search: '?ref=asesor_007',
      href: 'https://app.dmx.test/algo?ref=asesor_007',
      pathname: '/algo',
    });
    setReferrer('https://google.com/');

    const returned = captureRefCookie();

    // returns the ref
    expect(returned).toBe('asesor_007');
    // cookie round-trips through get/decode
    expect(getCurrentAttribution().cookie_ref).toBe('asesor_007');
    // touchpoint captured with the expected shape
    const { touchpoints } = getCurrentAttribution();
    expect(touchpoints).toHaveLength(1);
    expect(touchpoints[0]).toMatchObject({
      asesor_id: 'asesor_007',
      source: 'asesor_link',
      cookie_value: 'asesor_007',
      referrer_url: 'https://google.com/',
    });
    // real ISO timestamp
    expect(new Date(touchpoints[0].timestamp).toISOString()).toBe(touchpoints[0].timestamp);
  });

  it('entrada vacía: sin ?ref devuelve null y NO crea touchpoint ni cookie', () => {
    setLocation({ search: '', pathname: '/' });

    expect(captureRefCookie()).toBeNull();
    const snap = getCurrentAttribution();
    expect(snap.touchpoints).toEqual([]);
    expect(snap.cookie_ref).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('dispara fetch de vista SOLO en rutas /desarrollo|/proyecto con el project_id correcto', () => {
    setLocation({
      search: '?ref=abc',
      href: 'https://app.dmx.test/desarrollo/torre-9?ref=abc',
      pathname: '/desarrollo/torre-9',
    });

    captureRefCookie();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.dmx.test/api/tracking/view');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body).toMatchObject({ asesor_id: 'abc', project_id: 'torre-9' });
  });

  it('NO dispara fetch en rutas que no son de proyecto (aunque haya ?ref)', () => {
    setLocation({ search: '?ref=abc', href: 'https://app.dmx.test/home?ref=abc', pathname: '/home' });

    expect(captureRefCookie()).toBe('abc'); // sigue capturando la cookie
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('un fetch que rechaza NO revienta captureRefCookie (catch silencioso)', () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('network down')));
    setLocation({
      search: '?ref=abc',
      href: 'https://app.dmx.test/proyecto/xy?ref=abc',
      pathname: '/proyecto/xy',
    });

    expect(() => captureRefCookie()).not.toThrow();
    expect(captureRefCookie()).toBe('abc');
  });

  it('valores con caracteres especiales se codifican/decodifican en la cookie', () => {
    setLocation({ search: '?ref=' + encodeURIComponent('a b&c=d'), pathname: '/' });

    expect(captureRefCookie()).toBe('a b&c=d');
    // la cookie recuperada debe decodificar de vuelta al valor original exacto
    expect(getCurrentAttribution().cookie_ref).toBe('a b&c=d');
  });
});

describe('getCurrentAttribution()', () => {
  it('refleja url actual, referrer y cookie; referrer vacío → null', () => {
    setLocation({ href: 'https://app.dmx.test/x/y', pathname: '/x/y' });
    setReferrer('');

    const snap = getCurrentAttribution();
    expect(snap.current_url).toBe('https://app.dmx.test/x/y');
    expect(snap.referrer).toBeNull();
    expect(snap.cookie_ref).toBeNull();
    expect(snap.touchpoints).toEqual([]);
  });
});

describe('appendTouchpoint()', () => {
  it('agrega touchpoint y default de timestamp cuando falta', () => {
    appendTouchpoint({ asesor_id: 'z1', source: 'feria_scan' });
    const list = getCurrentAttribution().touchpoints;
    expect(list).toHaveLength(1);
    expect(list[0].asesor_id).toBe('z1');
    expect(typeof list[0].timestamp).toBe('string');
    expect(new Date(list[0].timestamp).toISOString()).toBe(list[0].timestamp);
  });

  it('respeta un timestamp provisto por el caller', () => {
    appendTouchpoint({ asesor_id: 'z2', timestamp: '2020-01-01T00:00:00.000Z' });
    expect(getCurrentAttribution().touchpoints[0].timestamp).toBe('2020-01-01T00:00:00.000Z');
  });

  it('límite/umbral: el store se recorta a los ÚLTIMOS 15 touchpoints', () => {
    for (let i = 0; i < 20; i++) {
      appendTouchpoint({ asesor_id: `t${i}` });
    }
    const list = getCurrentAttribution().touchpoints;
    expect(list).toHaveLength(15);
    // conserva la cola (t5..t19), descarta la cabeza (t0..t4)
    expect(list[0].asesor_id).toBe('t5');
    expect(list[list.length - 1].asesor_id).toBe('t19');
  });
});

describe('clearAttribution()', () => {
  it('borra cookie dmx_ref y touchpoints de localStorage', () => {
    setLocation({ search: '?ref=to_clear', pathname: '/' });
    captureRefCookie();
    // precondición: hay estado
    expect(getCurrentAttribution().cookie_ref).toBe('to_clear');
    expect(getCurrentAttribution().touchpoints).toHaveLength(1);

    clearAttribution();

    expect(getCurrentAttribution().cookie_ref).toBeNull();
    expect(getCurrentAttribution().touchpoints).toEqual([]);
    expect(localStorage.getItem(TOUCHPOINTS_KEY)).toBeNull();
  });
});

describe('resiliencia / no fuga de datos', () => {
  it('localStorage corrupto → loadTouchpoints degrada a [] sin lanzar', () => {
    localStorage.setItem(TOUCHPOINTS_KEY, '{not-json');
    expect(() => getCurrentAttribution()).not.toThrow();
    expect(getCurrentAttribution().touchpoints).toEqual([]);
  });

  it('el touchpoint NO persiste el userAgent inventado: usa el navigator real', () => {
    setLocation({ search: '?ref=ua_check', pathname: '/' });
    captureRefCookie();
    const tp = getCurrentAttribution().touchpoints[0];
    // refleja el userAgent real de navigator, no un string hardcodeado del test
    expect(tp.user_agent).toBe(navigator.userAgent);
  });

  it('la cookie solo guarda el ref, no arrastra otros valores del query string', () => {
    setLocation({ search: '?ref=only_ref&token=SECRET123&pwd=hunter2', pathname: '/' });
    captureRefCookie();
    // el valor de la cookie es exactamente el ref, sin el token ni el pwd
    expect(getCurrentAttribution().cookie_ref).toBe('only_ref');
    expect(document.cookie).toContain(`${COOKIE_NAME}=only_ref`);
    expect(document.cookie).not.toContain('SECRET123');
    expect(document.cookie).not.toContain('hunter2');
  });
});
