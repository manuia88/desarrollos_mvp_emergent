import { urlToFilters, filtersToUrl, buildCanonicalUrl } from '../marketplaceUrlState';

describe('marketplaceUrlState — URL <→ filtros', () => {
  it('urlToFilters parsea colonia, escalares numéricos y arrays', () => {
    const { filters, coloniaFilter } = urlToFilters(
      'colonia=polanco&precio_max=15000000&recamaras_min=2&stage=preventa&unit_feature=terraza&unit_feature=roof_garden',
    );
    expect(coloniaFilter).toBe('polanco');
    expect(filters.colonia).toEqual(['polanco']);
    expect(filters.max_price).toBe(15000000);   // numérico
    expect(filters.beds).toBe(2);
    expect(filters.stage).toBe('preventa');       // string
    expect(filters.unit_feature).toEqual(['terraza', 'roof_garden']);
  });

  it('ignora params vacíos y numéricos inválidos', () => {
    const { filters } = urlToFilters('precio_max=&recamaras_min=abc&stage=');
    expect(filters.max_price).toBeUndefined();
    expect(filters.beds).toBeUndefined();
    expect(filters.stage).toBeUndefined();
  });

  it('filtersToUrl ordena los params ALFABÉTICAMENTE y sin vacíos', () => {
    const url = filtersToUrl({ max_price: 15000000, beds: 2, stage: 'preventa', unit_feature: ['terraza'] }, 'polanco');
    expect(url.indexOf('colonia')).toBeLessThan(url.indexOf('precio_max'));
    expect(url.indexOf('precio_max')).toBeLessThan(url.indexOf('recamaras_min'));
    expect(url.indexOf('recamaras_min')).toBeLessThan(url.indexOf('stage'));
    expect(url).not.toContain('=&');
  });

  it('round-trip: filtros → URL → filtros conserva los valores', () => {
    const F = { max_price: 15000000, beds: 2, stage: 'preventa', unit_feature: ['terraza', 'roof_garden'], orientacion: ['Sur'] };
    const { filters: F2, coloniaFilter } = urlToFilters(filtersToUrl(F, 'polanco'));
    expect(coloniaFilter).toBe('polanco');
    expect(F2.max_price).toBe(15000000);
    expect(F2.beds).toBe(2);
    expect(F2.stage).toBe('preventa');
    expect(F2.unit_feature).toEqual(['terraza', 'roof_garden']);
    expect(F2.orientacion).toEqual(['Sur']);
  });

  it('buildCanonicalUrl arma /marketplace con y sin query', () => {
    expect(buildCanonicalUrl({ beds: 2 }, null)).toBe('/marketplace?recamaras_min=2');
    expect(buildCanonicalUrl({}, null)).toBe('/marketplace');
    expect(buildCanonicalUrl({ beds: 2 }, null, 'https://x.com')).toBe('https://x.com/marketplace?recamaras_min=2');
  });
});
