import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Herramientas from '../Herramientas';
import { TOOLS_FLAT } from '../../../lib/toolsCatalog';

// Smoke + regresión: el hub /herramientas debe renderizar TODAS las herramientas del catálogo único.
describe('Herramientas (hub) — smoke', () => {
  function renderHub() {
    return render(<MemoryRouter><Herramientas /></MemoryRouter>);
  }

  it('renderiza el título del hub', () => {
    renderHub();
    expect(screen.getByRole('heading', { name: /Todas las herramientas/i })).toBeInTheDocument();
  });

  it('lista TODAS las herramientas del catálogo con su ruta', () => {
    renderHub();
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    for (const t of TOOLS_FLAT) {
      expect(hrefs).toContain(t.to);
    }
  });

  it('incluye la Calculadora en /calculadora (no /simulador)', () => {
    renderHub();
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/calculadora');
    expect(hrefs).not.toContain('/simulador');
  });
});
