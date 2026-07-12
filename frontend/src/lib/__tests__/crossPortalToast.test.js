/**
 * Tests para lib/crossPortalToast.js
 * Cubre: showCrossPortalSync (DOM/labels/fallbacks/auto-dismiss) y
 * logCrossPortalEvent (fetch con credentials, swallow de errores).
 *
 * NOTA: asserts basados en la conducta REAL del módulo:
 *  - action desconocida -> se usa el string crudo (EVENT_LABELS[a] || a)
 *  - portal desconocido -> se usa el slug crudo (PORTAL_LABELS[p] || p)
 *  - contenedor reutilizado (mismo id 'cross-portal-toasts')
 *  - auto-dismiss a los 5000ms + 300ms de fade
 *  - logCrossPortalEvent nunca lanza aunque fetch rechace
 */
import { showCrossPortalSync, logCrossPortalEvent } from '../crossPortalToast';

describe('showCrossPortalSync', () => {
  beforeEach(() => {
    // Limpiar el body entre tests para no arrastrar toasts/contenedor.
    document.body.innerHTML = '';
  });

  it('crea un contenedor fixed y le agrega un toast (happy path)', () => {
    showCrossPortalSync('project_published', ['marketplace', 'asesor']);

    const container = document.getElementById('cross-portal-toasts');
    expect(container).not.toBeNull();
    // El toast quedó dentro del contenedor.
    expect(container.children.length).toBe(1);
  });

  it('usa el label humano de la acción y de los portales conocidos', () => {
    showCrossPortalSync('lead_created', ['marketplace', 'crm']);

    const container = document.getElementById('cross-portal-toasts');
    const html = container.innerHTML;
    // EVENT_LABELS['lead_created'] === 'Lead creado'
    expect(html).toContain('Lead creado');
    // PORTAL_LABELS mapea a etiquetas humanas.
    expect(html).toContain('Marketplace');
    expect(html).toContain('CRM');
  });

  it('cae al string crudo cuando la acción/portal son desconocidos', () => {
    showCrossPortalSync('accion_no_registrada', ['portal_raro']);

    const html = document.getElementById('cross-portal-toasts').innerHTML;
    // Sin entrada en EVENT_LABELS -> se muestra el string tal cual.
    expect(html).toContain('accion_no_registrada');
    // Sin entrada en PORTAL_LABELS -> chip con el slug crudo.
    expect(html).toContain('portal_raro');
  });

  it('renderiza sin chips cuando affected_portals usa el default vacío', () => {
    // Solo un argumento -> affected_portals = [] (default param).
    showCrossPortalSync('pricing_changed');

    const container = document.getElementById('cross-portal-toasts');
    expect(container.children.length).toBe(1);
    const html = container.innerHTML;
    expect(html).toContain('Precio actualizado');
    // No se generó ningún chip de portal (usan background rgba(34,197,94,0.15)
    // pero el marcador único de chip es el border-radius pill 9999px sobre <span>).
    expect(html).not.toContain('<span');
  });

  it('reutiliza el mismo contenedor en llamadas sucesivas y da IDs únicos', () => {
    showCrossPortalSync('lead_created', ['crm']);
    showCrossPortalSync('lead_created', ['crm']);

    const containers = document.querySelectorAll('#cross-portal-toasts');
    // Un solo contenedor, no dos.
    expect(containers.length).toBe(1);
    expect(containers[0].children.length).toBe(2);

    // Los IDs de los toasts son distintos (contador incremental).
    const [t1, t2] = containers[0].children;
    expect(t1.id).not.toBe(t2.id);
    expect(t1.id).toMatch(/^cp-toast-\d+$/);
  });

  it('recrea el contenedor si fue removido del DOM', () => {
    showCrossPortalSync('lead_created', ['crm']);
    // Simular que otro código borró el contenedor.
    document.getElementById('cross-portal-toasts').remove();
    expect(document.getElementById('cross-portal-toasts')).toBeNull();

    showCrossPortalSync('lead_created', ['crm']);
    const container = document.getElementById('cross-portal-toasts');
    expect(container).not.toBeNull();
    expect(container.children.length).toBe(1);
  });

  it('auto-descarta el toast tras 5s + 300ms de fade', () => {
    jest.useFakeTimers();
    try {
      showCrossPortalSync('lead_created', ['crm']);
      const container = document.getElementById('cross-portal-toasts');
      expect(container.children.length).toBe(1);

      // A los 5s dispara fadeOut pero aún NO remueve.
      jest.advanceTimersByTime(5000);
      expect(container.children.length).toBe(1);

      // 300ms después del fade -> removido.
      jest.advanceTimersByTime(300);
      expect(container.children.length).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('inyecta los keyframes CSS una sola vez (al importar el módulo)', () => {
    // El IIFE injectCSS corre al importar; el <style> vive en <head>,
    // por eso no lo borra el reset de document.body en beforeEach.
    const styles = document.querySelectorAll('#cp-toast-styles');
    expect(styles.length).toBe(1);
    expect(styles[0].textContent).toContain('@keyframes slideInRight');
  });
});

describe('logCrossPortalEvent', () => {
  const OLD_FETCH = global.fetch;

  afterEach(() => {
    global.fetch = OLD_FETCH;
    jest.restoreAllMocks();
  });

  it('hace POST con credentials:include y el body esperado', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock;

    await logCrossPortalEvent('project_published', 'proj-42', { extra: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/orgs/cross-portal/log');
    expect(opts.method).toBe('POST');
    expect(opts.credentials).toBe('include');
    expect(opts.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(opts.body);
    expect(body).toEqual({
      event_type: 'project_published',
      entity_id: 'proj-42',
      metadata: { extra: 1 },
    });
  });

  it('usa defaults (entity_id=null, metadata={}) cuando se omiten', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock;

    await logCrossPortalEvent('lead_created');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.entity_id).toBeNull();
    expect(body.metadata).toEqual({});
  });

  it('NO lanza aunque fetch rechace (catch silencioso)', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('network down'));
    global.fetch = fetchMock;

    // No debe propagar el error.
    await expect(logCrossPortalEvent('lead_created', 'x')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
