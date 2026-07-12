// Test de valor real para lib/atlaxPrefs — preferencias del comprador sobre localStorage.
// Mockeamos ./buyerSignal para (a) no pegarle a fetch real y (b) espiar la señal al espinazo.
jest.mock('../buyerSignal', () => ({ sendBuyerSignal: jest.fn() }));

import { sendBuyerSignal } from '../buyerSignal';
import {
  REJECT_REASONS,
  isSaved,
  isDismissed,
  getSavedIds,
  getDismissedIds,
  toggleSave,
  dismiss,
  undismiss,
  logPhotoDwell,
  logPhotoZoom,
} from '../atlaxPrefs';

const SAVED = 'dmx_atlax_saved';
const DISM = 'dmx_atlax_dismissed';

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

describe('defaults / lectura sobre localStorage vacío', () => {
  it('sin nada guardado: isSaved/isDismissed = false y listas vacías', () => {
    expect(isSaved('x1')).toBe(false);
    expect(isDismissed('x1')).toBe(false);
    expect(getSavedIds()).toEqual([]);
    expect(getDismissedIds()).toEqual([]);
  });

  it('tolera JSON corrupto en localStorage (no revienta, devuelve default)', () => {
    localStorage.setItem(SAVED, '{no-es-json');
    expect(getSavedIds()).toEqual([]);   // read() cae al catch → {}
    expect(isSaved('x1')).toBe(false);
  });
});

describe('toggleSave — round-trip (set → get) y espejo a buyer_signals', () => {
  const dev = { id: 'dev-1', name: 'Torre Roma', colonia: 'Roma Norte' };

  it('guarda: devuelve true, isSaved=true, aparece en getSavedIds y emite señal "save"', () => {
    const on = toggleSave(dev);
    expect(on).toBe(true);
    expect(isSaved('dev-1')).toBe(true);
    expect(getSavedIds()).toEqual(['dev-1']);
    expect(sendBuyerSignal).toHaveBeenCalledWith('save', {
      entity_id: 'dev-1',
      colonia: 'roma norte', // colSlug: lowercase de colonia
    });
  });

  it('quita: segundo toggle devuelve false, isSaved=false, lista vacía y señal "unsave"', () => {
    toggleSave(dev);           // on
    jest.clearAllMocks();
    const off = toggleSave(dev); // off
    expect(off).toBe(false);
    expect(isSaved('dev-1')).toBe(false);
    expect(getSavedIds()).toEqual([]);
    expect(sendBuyerSignal).toHaveBeenCalledWith('unsave', {
      entity_id: 'dev-1',
      colonia: 'roma norte',
    });
  });

  it('persiste el objeto guardado con id/name/ts en localStorage (round-trip real)', () => {
    toggleSave(dev);
    const raw = JSON.parse(localStorage.getItem(SAVED));
    expect(raw['dev-1'].id).toBe('dev-1');
    expect(raw['dev-1'].name).toBe('Torre Roma');
    expect(typeof raw['dev-1'].ts).toBe('number');
  });

  it('emite el evento window "dmx:prefs" al cambiar una preferencia', () => {
    const spy = jest.fn();
    window.addEventListener('dmx:prefs', spy);
    toggleSave(dev);
    expect(spy).toHaveBeenCalledTimes(1);
    window.removeEventListener('dmx:prefs', spy);
  });

  it('entrada nula / sin id: devuelve false, no escribe y no emite señal', () => {
    expect(toggleSave(null)).toBe(false);
    expect(toggleSave({})).toBe(false);
    expect(toggleSave({ name: 'sin id' })).toBe(false);
    expect(getSavedIds()).toEqual([]);
    expect(sendBuyerSignal).not.toHaveBeenCalled();
  });
});

describe('dismiss / undismiss — el porqué del NO + no-repetir local', () => {
  const dev = { id: 'dev-9', colonia_id: 'COL-123' };

  it('descarta con motivo: isDismissed=true, aparece en getDismissedIds y persiste el reason', () => {
    dismiss(dev, 'precio');
    expect(isDismissed('dev-9')).toBe(true);
    expect(getDismissedIds()).toEqual(['dev-9']);
    const raw = JSON.parse(localStorage.getItem(DISM));
    expect(raw['dev-9'].reason).toBe('precio');
    expect(typeof raw['dev-9'].ts).toBe('number');
  });

  it('emite señal "dismiss" con colonia (colSlug de colonia_id) y meta.reason', () => {
    dismiss(dev, 'zona');
    expect(sendBuyerSignal).toHaveBeenCalledTimes(1);
    const [type, payload] = sendBuyerSignal.mock.calls[0];
    expect(type).toBe('dismiss');
    expect(payload.entity_id).toBe('dev-9');
    expect(payload.colonia).toBe('col-123'); // lowercase de colonia_id
    expect(payload.value).toBe('zona');
    expect(payload.meta.reason).toBe('zona');
  });

  it('trunca ctx.query a 80 chars en la meta de la señal', () => {
    const longQuery = 'a'.repeat(200);
    dismiss(dev, 'fotos', { query: longQuery, rank: 3, section: 'feed' });
    const payload = sendBuyerSignal.mock.calls[0][1];
    expect(payload.meta.query).toHaveLength(80);
    expect(payload.meta.rank).toBe(3);
    expect(payload.meta.section).toBe('feed');
  });

  it('undismiss borra el descarte: isDismissed vuelve a false y lista vacía', () => {
    dismiss(dev, 'precio');
    expect(isDismissed('dev-9')).toBe(true);
    undismiss('dev-9');
    expect(isDismissed('dev-9')).toBe(false);
    expect(getDismissedIds()).toEqual([]);
  });

  it('dismiss con dev nulo / sin id: no escribe ni emite señal', () => {
    dismiss(null, 'precio');
    dismiss({}, 'precio');
    expect(getDismissedIds()).toEqual([]);
    expect(sendBuyerSignal).not.toHaveBeenCalled();
  });
});

describe('logPhotoDwell — umbral de ruido (0.4s) y clamp', () => {
  const dev = { id: 'dev-7' };

  it('ignora dwell < 400ms (ruido): no emite señal', () => {
    logPhotoDwell(dev, 0, 399);
    logPhotoDwell(dev, 0, 0);
    logPhotoDwell(dev, 0, undefined);
    logPhotoDwell(null, 0, 5000);
    expect(sendBuyerSignal).not.toHaveBeenCalled();
  });

  it('en el umbral (400ms) sí emite "photo_dwell" con dwell_ms redondeado', () => {
    logPhotoDwell(dev, 2, 400);
    expect(sendBuyerSignal).toHaveBeenCalledWith('photo_dwell', {
      entity_id: 'dev-7',
      dwell_ms: 400,
      value: '2',
    });
  });

  it('clampa dwell_ms a 600000ms máximo y redondea decimales', () => {
    jest.clearAllMocks();
    logPhotoDwell(dev, 1, 999999.7);
    expect(sendBuyerSignal.mock.calls[0][1].dwell_ms).toBe(600000);
  });
});

describe('logPhotoZoom', () => {
  it('emite "photo_zoom" con value = índice como string', () => {
    logPhotoZoom({ id: 'dev-3' }, 5);
    expect(sendBuyerSignal).toHaveBeenCalledWith('photo_zoom', {
      entity_id: 'dev-3',
      value: '5',
    });
  });

  it('con dev nulo / sin id: no emite señal', () => {
    logPhotoZoom(null, 5);
    logPhotoZoom({}, 5);
    expect(sendBuyerSignal).not.toHaveBeenCalled();
  });
});

describe('REJECT_REASONS — catálogo estable de motivos', () => {
  it('expone 6 motivos con key + label y NO filtra PII/tokens', () => {
    expect(REJECT_REASONS).toHaveLength(6);
    expect(REJECT_REASONS.map((r) => r.key)).toEqual(
      ['fotos', 'precio', 'zona', 'tamano', 'amenidades', 'entrega'],
    );
    REJECT_REASONS.forEach((r) => {
      expect(typeof r.key).toBe('string');
      expect(typeof r.label).toBe('string');
    });
    const blob = JSON.stringify(REJECT_REASONS);
    expect(blob).not.toMatch(/token|password|secret|api[_-]?key/i);
  });
});
