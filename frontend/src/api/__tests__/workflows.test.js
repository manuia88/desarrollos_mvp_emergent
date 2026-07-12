import {
  listWorkflows,
  createWorkflow,
  getWorkflow,
  updateWorkflow,
  deleteWorkflow,
  toggleWorkflow,
  testWorkflow,
  listWorkflowRuns,
} from '../workflows';

// Tests de VALOR REAL para src/api/workflows.js (8 wrappers de endpoints del Workflow Builder).
// Se verifica el comportamiento REAL leído del código:
//  - _authHeaders() devuelve SOLO { 'Content-Type': 'application/json' } (sin Authorization/Bearer)
//  - todas las llamadas usan credentials: 'include' (auth por cookie httponly)
//  - URL/método/body correctos por endpoint; el id va con encodeURIComponent
//  - _handle(): si !res.ok -> lee res.text() (o statusText) y throw Error; si ok -> res.json()

describe('api/workflows.js', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    global.fetch = fetchMock;
  });

  afterEach(() => {
    delete global.fetch;
    jest.clearAllMocks();
  });

  // ------------------------------------------------------------------
  // REGRESIÓN DE AUTH (cookie httponly, sin Bearer)
  // ------------------------------------------------------------------
  describe('regresión de auth — cookie httponly, sin Authorization/Bearer', () => {
    it('listWorkflows: GET /api/workflows con credentials:"include" y sin token', async () => {
      await listWorkflows();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];

      // URL + método correctos
      expect(String(url)).toMatch(/\/api\/workflows$/);
      // GET: el wrapper no setea method -> undefined (fetch default = GET)
      expect(opts.method).toBeUndefined();

      // credentials manda la cookie
      expect(opts.credentials).toBe('include');

      // NINGÚN header Authorization, NINGÚN "Bearer", NINGÚN "undefined" interpolado
      const headerKeys = Object.keys(opts.headers || {}).map((k) => k.toLowerCase());
      expect(headerKeys).not.toContain('authorization');
      const headerBlob = JSON.stringify(opts.headers || {});
      expect(headerBlob).not.toMatch(/Bearer/i);
      expect(headerBlob).not.toContain('undefined');

      // el header real es SOLO Content-Type json
      expect(opts.headers['Content-Type']).toBe('application/json');
    });

    it('TODOS los wrappers mandan credentials:"include" y jamás un Authorization', async () => {
      const calls = [
        () => listWorkflows(),
        () => createWorkflow({ name: 'x' }),
        () => getWorkflow('wf1'),
        () => updateWorkflow('wf1', { name: 'y' }),
        () => deleteWorkflow('wf1'),
        () => toggleWorkflow('wf1'),
        () => testWorkflow('wf1'),
        () => listWorkflowRuns('wf1'),
      ];

      for (const call of calls) {
        fetchMock.mockClear();
        await call();
        const [, opts] = fetchMock.mock.calls[0];
        expect(opts.credentials).toBe('include');
        const headerKeys = Object.keys(opts.headers || {}).map((k) => k.toLowerCase());
        expect(headerKeys).not.toContain('authorization');
        expect(JSON.stringify(opts.headers || {})).not.toMatch(/Bearer/i);
      }
    });
  });

  // ------------------------------------------------------------------
  // URL / MÉTODO / BODY por endpoint (casos felices)
  // ------------------------------------------------------------------
  describe('URL, método y body correctos', () => {
    it('createWorkflow: POST /api/workflows con body JSON del payload', async () => {
      const payload = { name: 'Mi flujo', nodes: [1, 2, 3] };
      await createWorkflow(payload);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(String(url)).toMatch(/\/api\/workflows$/);
      expect(opts.method).toBe('POST');
      expect(opts.body).toBe(JSON.stringify(payload));
      expect(JSON.parse(opts.body)).toEqual(payload);
    });

    it('getWorkflow: GET /api/workflows/:id (id encodeURIComponent)', async () => {
      await getWorkflow('wf-42');
      const [url, opts] = fetchMock.mock.calls[0];
      expect(String(url)).toMatch(/\/api\/workflows\/wf-42$/);
      expect(opts.method).toBeUndefined();
      // GET no lleva body
      expect(opts.body).toBeUndefined();
    });

    it('updateWorkflow: PUT /api/workflows/:id con body JSON', async () => {
      const payload = { name: 'nuevo' };
      await updateWorkflow('wf1', payload);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(String(url)).toMatch(/\/api\/workflows\/wf1$/);
      expect(opts.method).toBe('PUT');
      expect(JSON.parse(opts.body)).toEqual(payload);
    });

    it('deleteWorkflow: DELETE /api/workflows/:id sin body', async () => {
      await deleteWorkflow('wf1');
      const [url, opts] = fetchMock.mock.calls[0];
      expect(String(url)).toMatch(/\/api\/workflows\/wf1$/);
      expect(opts.method).toBe('DELETE');
      expect(opts.body).toBeUndefined();
    });

    it('toggleWorkflow: POST /api/workflows/:id/toggle sin body', async () => {
      await toggleWorkflow('wf1');
      const [url, opts] = fetchMock.mock.calls[0];
      expect(String(url)).toMatch(/\/api\/workflows\/wf1\/toggle$/);
      expect(opts.method).toBe('POST');
      expect(opts.body).toBeUndefined();
    });

    it('testWorkflow: POST /api/workflows/:id/test — payload por defecto es {}', async () => {
      await testWorkflow('wf1');
      const [url, opts] = fetchMock.mock.calls[0];
      expect(String(url)).toMatch(/\/api\/workflows\/wf1\/test$/);
      expect(opts.method).toBe('POST');
      // default payload = {} -> body es el string "{}"
      expect(opts.body).toBe('{}');
    });

    it('testWorkflow: respeta el payload cuando se pasa', async () => {
      await testWorkflow('wf1', { dry_run: true });
      const [, opts] = fetchMock.mock.calls[0];
      expect(JSON.parse(opts.body)).toEqual({ dry_run: true });
    });

    it('listWorkflowRuns: GET /api/workflows/:id/runs?days=30 por defecto', async () => {
      await listWorkflowRuns('wf1');
      const [url, opts] = fetchMock.mock.calls[0];
      expect(String(url)).toMatch(/\/api\/workflows\/wf1\/runs\?days=30$/);
      expect(opts.method).toBeUndefined();
    });

    it('listWorkflowRuns: usa el parámetro days cuando se pasa', async () => {
      await listWorkflowRuns('wf1', 7);
      const [url] = fetchMock.mock.calls[0];
      expect(String(url)).toMatch(/\/api\/workflows\/wf1\/runs\?days=7$/);
    });
  });

  // ------------------------------------------------------------------
  // LÍMITES / ENTRADAS RARAS (encoding, ids especiales)
  // ------------------------------------------------------------------
  describe('límites y entradas especiales', () => {
    it('getWorkflow: encodea ids con caracteres peligrosos (/, espacio, #)', async () => {
      await getWorkflow('a/b c#d');
      const [url] = fetchMock.mock.calls[0];
      // encodeURIComponent('a/b c#d') === 'a%2Fb%20c%23d'
      expect(String(url)).toContain('a%2Fb%20c%23d');
      // el slash del id NO debe aparecer crudo tras /workflows/
      expect(String(url)).toMatch(/\/api\/workflows\/a%2Fb%20c%23d$/);
    });

    it('getWorkflow: id vacío produce /api/workflows/ (comportamiento real, no lanza)', async () => {
      await getWorkflow('');
      const [url] = fetchMock.mock.calls[0];
      expect(String(url)).toMatch(/\/api\/workflows\/$/);
    });

    it('createWorkflow: payload null se serializa como body "null" (comportamiento real de JSON.stringify)', async () => {
      await createWorkflow(null);
      const [, opts] = fetchMock.mock.calls[0];
      expect(opts.body).toBe('null');
    });

    it('createWorkflow: payload undefined -> body undefined (JSON.stringify(undefined) === undefined)', async () => {
      await createWorkflow(undefined);
      const [, opts] = fetchMock.mock.calls[0];
      // JSON.stringify(undefined) devuelve undefined, no la cadena "undefined"
      expect(opts.body).toBeUndefined();
    });

    it('listWorkflowRuns: days=0 se interpola literalmente como ?days=0 (no se omite)', async () => {
      await listWorkflowRuns('wf1', 0);
      const [url] = fetchMock.mock.calls[0];
      expect(String(url)).toMatch(/\?days=0$/);
    });
  });

  // ------------------------------------------------------------------
  // MANEJO DE RESPUESTA (_handle): éxito, error con texto, error sin texto
  // ------------------------------------------------------------------
  describe('_handle — parseo de respuesta y errores', () => {
    it('devuelve el JSON parseado cuando res.ok', async () => {
      const data = { id: 'wf9', steps: 2 };
      fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => data });
      await expect(listWorkflows()).resolves.toEqual(data);
    });

    it('lanza Error con el texto del body cuando !res.ok', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 422,
        statusText: 'Unprocessable',
        text: async () => 'nombre requerido',
      });
      await expect(createWorkflow({})).rejects.toThrow('nombre requerido');
    });

    it('cuando !res.ok y text() rechaza, cae a statusText', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Boom',
        text: async () => { throw new Error('sin body'); },
      });
      await expect(listWorkflows()).rejects.toThrow('Server Boom');
    });

    it('cuando !res.ok y el texto es vacío, usa "HTTP <status>"', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: '',
        text: async () => '',
      });
      // text vacío -> statusText vacío -> `HTTP ${status}`
      await expect(listWorkflows()).rejects.toThrow('HTTP 503');
    });

    it('el Error propagado NO expone cookies ni tokens del cliente', async () => {
      // sanity: aunque el body traiga ruido, el módulo no inyecta credenciales en el mensaje
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'unauthorized',
      });
      let caught;
      try {
        await getWorkflow('wf1');
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(caught.message).not.toMatch(/Bearer/i);
      expect(caught.message).not.toMatch(/document\.cookie/i);
    });
  });
});
