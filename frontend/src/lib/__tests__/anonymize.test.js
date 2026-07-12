import { anonymizeLead, anonymizeKanbanCard } from '../anonymize';

describe('anonymizeLead (Modo Presentación · PII)', () => {
  const lead = {
    _id: 'abc123', nombre: 'Juan Pérez', email: 'juan@real.com',
    telefono: '+52 55 1234 5678', notas_internas: 'secreto', status: 'nuevo',
  };

  it('enmascara nombre, email, teléfono y borra notas internas', () => {
    const a = anonymizeLead(lead);
    expect(a.nombre).toMatch(/^Lead \d{3}$/);
    expect(a.email).toBe('***@***.com');
    expect(a.telefono).toBe('+52 ** *** ****');
    expect(a.notas_internas).toBeUndefined();
  });

  it('NO deja filtrar la PII real', () => {
    const a = anonymizeLead(lead);
    const blob = JSON.stringify(a);
    expect(blob).not.toContain('Juan Pérez');
    expect(blob).not.toContain('juan@real.com');
    expect(blob).not.toContain('1234 5678');
    expect(blob).not.toContain('secreto');
  });

  it('es determinista: mismo _id → mismo número de Lead', () => {
    expect(anonymizeLead(lead).nombre).toBe(anonymizeLead({ ...lead }).nombre);
    expect(anonymizeLead({ ...lead, _id: 'otro' }).nombre).not.toBe(anonymizeLead(lead).nombre);
  });

  it('preserva campos no-PII (status)', () => {
    expect(anonymizeLead(lead).status).toBe('nuevo');
  });

  it('es seguro con null o sin _id', () => {
    expect(anonymizeLead(null)).toBeNull();
    expect(anonymizeLead({ nombre: 'x' })).toEqual({ nombre: 'x' });
  });
});

describe('anonymizeKanbanCard', () => {
  it('enmascara contacto de la card', () => {
    const c = anonymizeKanbanCard({ id: 'k1', contact_name: 'Ana', contact_email: 'a@x.com', contact_phone: '555' });
    expect(c.contact_name).toMatch(/^Lead \d{3}$/);
    expect(c.contact_email).toBe('***@***.com');
    expect(c.contact_phone).toBe('+52 ** *** ****');
  });
});
