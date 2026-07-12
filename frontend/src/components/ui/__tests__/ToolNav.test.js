import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ToolNav from '../ToolNav';

// Smoke: el navbar de herramientas renderiza sin crashear y muestra el logo + el menú Herramientas.
function renderNav() {
  return render(
    <MemoryRouter>
      <ToolNav />
    </MemoryRouter>,
  );
}

describe('ToolNav (smoke)', () => {
  it('renderiza el logo DesarrollosMX', () => {
    renderNav();
    expect(screen.getAllByText(/Desarrollos/i).length).toBeGreaterThan(0);
  });

  it('muestra el botón/menú de Herramientas', () => {
    renderNav();
    // el título "Herramientas" aparece (botón desktop o encabezado móvil)
    expect(screen.getAllByText(/Herramientas/i).length).toBeGreaterThan(0);
  });

  it('enlaza a las secciones públicas principales', () => {
    renderNav();
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    // al menos una de las rutas públicas conocidas está presente
    expect(links.some((h) => h === '/' || h === '/marketplace' || h === '/colonias')).toBe(true);
  });
});
