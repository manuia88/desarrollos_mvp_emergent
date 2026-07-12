import { getHealthOverview } from '../superadminHealth';

// REGRESIÓN DE SEGURIDAD (runtime): tras migrar de localStorage a cookie httponly, cada llamada al
// backend debe (a) mandar credentials:'include' (envía la cookie) y (b) NO llevar header Authorization
// (ya no hay token Bearer robable por XSS). Se verifica el comportamiento real con fetch mockeado.
describe('capa API — auth por cookie httponly, sin Bearer', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    global.fetch = fetchMock;
  });
  afterEach(() => { delete global.fetch; });

  it('getHealthOverview manda la cookie y NINGÚN Authorization', async () => {
    await getHealthOverview();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/superadmin\/health\/overview$/);
    expect(opts.credentials).toBe('include');
    const headerKeys = Object.keys(opts.headers || {}).map((k) => k.toLowerCase());
    expect(headerKeys).not.toContain('authorization');
  });

  it('el header no interpola ningún token (ni "Bearer", ni "undefined")', async () => {
    await getHealthOverview();
    const [, opts] = fetchMock.mock.calls[0];
    const headerBlob = JSON.stringify(opts.headers || {});
    expect(headerBlob).not.toMatch(/Bearer/i);
    expect(headerBlob).not.toContain('undefined');
  });
});
