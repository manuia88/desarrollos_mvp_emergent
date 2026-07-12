import React from 'react';
import { render, screen } from '@testing-library/react';
import { ResultCard, Field, BtnV4 } from '../calcV4';

describe('calcV4 — componentes presentacionales (smoke)', () => {
  it('ResultCard muestra eyebrow, value y sub', () => {
    render(<ResultCard eyebrow="TIR" value="12.5%" sub="anual apalancada" />);
    expect(screen.getByText('TIR')).toBeInTheDocument();
    expect(screen.getByText('12.5%')).toBeInTheDocument();
    expect(screen.getByText('anual apalancada')).toBeInTheDocument();
  });

  it('ResultCard renderiza las líneas de detalle', () => {
    render(<ResultCard eyebrow="Flujo" value="$10,000" lines={[['Renta', '$12,000'], ['Gasto', '$2,000']]} />);
    expect(screen.getByText('Renta')).toBeInTheDocument();
    expect(screen.getByText('$12,000')).toBeInTheDocument();
  });

  it('Field muestra su label y sus children', () => {
    render(<Field label="Valor de la propiedad"><input aria-label="valor" /></Field>);
    expect(screen.getByText(/Valor de la propiedad/i)).toBeInTheDocument();
    expect(screen.getByLabelText('valor')).toBeInTheDocument();
  });

  it('BtnV4 renderiza su texto y responde al click', () => {
    const onClick = jest.fn();
    render(<BtnV4 onClick={onClick}>Calcular</BtnV4>);
    const btn = screen.getByText('Calcular');
    btn.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('BtnV4 deshabilitado no dispara onClick', () => {
    const onClick = jest.fn();
    render(<BtnV4 onClick={onClick} disabled>NoOp</BtnV4>);
    screen.getByText('NoOp').click();
    expect(onClick).not.toHaveBeenCalled();
  });
});
