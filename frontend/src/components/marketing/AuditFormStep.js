// W4.16 — AuditFormStep · 4-step wizard for free audit submission.
import React from 'react';

const fieldStyle = {
  width: '100%',
  background: 'rgba(15,18,28,0.85)',
  border: '1px solid rgba(240,235,224,0.12)',
  borderRadius: 10,
  color: 'var(--cream)',
  padding: '11px 14px',
  fontFamily: 'DM Sans',
  fontSize: 13,
};
const labelStyle = {
  display: 'block',
  fontFamily: 'Outfit',
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: '0.06em',
  color: 'var(--cream-2, #d4d4d8)',
  marginBottom: 6,
};

export default function AuditFormStep({ step, form, onChange, errors }) {
  const set = (k, v) => onChange({ ...form, [k]: v });

  if (step === 1) {
    return (
      <div data-testid="audit-step-1" style={{ display: 'grid', gap: 14 }}>
        <Field label="Nombre del proyecto / propiedad" required error={errors?.project_name}>
          <input
            data-testid="audit-form-project_name"
            value={form.project_name || ''}
            onChange={(e) => set('project_name', e.target.value)}
            placeholder="Ej. Mi depa Polanco"
            style={fieldStyle}
          />
        </Field>
        <Field label="Colonia (slug)" required error={errors?.colonia_slug}>
          <input
            data-testid="audit-form-colonia_slug"
            value={form.colonia_slug || ''}
            onChange={(e) => set('colonia_slug', e.target.value.toLowerCase().replace(/\s+/g, '-'))}
            placeholder="polanco · condesa · roma-norte..."
            style={fieldStyle}
          />
        </Field>
        <Row>
          <Field label="Superficie (m²)" required>
            <input
              data-testid="audit-form-m2"
              type="number" min="10" max="5000"
              value={form.m2 || ''}
              onChange={(e) => set('m2', e.target.value)}
              style={fieldStyle}
            />
          </Field>
          <Field label="Recámaras" required>
            <input
              data-testid="audit-form-recamaras"
              type="number" min="0" max="20"
              value={form.recamaras ?? ''}
              onChange={(e) => set('recamaras', e.target.value)}
              style={fieldStyle}
            />
          </Field>
          <Field label="Baños" required>
            <input
              data-testid="audit-form-banos"
              type="number" min="0" max="20"
              value={form.banos ?? ''}
              onChange={(e) => set('banos', e.target.value)}
              style={fieldStyle}
            />
          </Field>
          <Field label="Antigüedad (años · 0=preventa)">
            <input
              data-testid="audit-form-antiguedad_anos"
              type="number" min="0" max="200"
              value={form.antiguedad_anos ?? 0}
              onChange={(e) => set('antiguedad_anos', e.target.value)}
              style={fieldStyle}
            />
          </Field>
        </Row>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div data-testid="audit-step-2" style={{ display: 'grid', gap: 14 }}>
        <Field label="Precio estimado (MXN)" required>
          <input
            data-testid="audit-form-precio_estimado"
            type="number" min="0"
            value={form.precio_estimado || ''}
            onChange={(e) => set('precio_estimado', e.target.value)}
            placeholder="Ej. 18500000"
            style={fieldStyle}
          />
        </Field>
        <Field label="Descripción (máx 500 caracteres)">
          <textarea
            data-testid="audit-form-descripcion"
            value={form.descripcion || ''}
            onChange={(e) => set('descripcion', e.target.value.slice(0, 500))}
            rows={5}
            placeholder="Cuéntanos qué hace tu propiedad única."
            style={{ ...fieldStyle, resize: 'vertical' }}
          />
          <div style={{ fontSize: 11, color: 'var(--cream-3)', textAlign: 'right', marginTop: 4 }}>
            {(form.descripcion || '').length} / 500
          </div>
        </Field>
      </div>
    );
  }

  if (step === 3) {
    return (
      <div data-testid="audit-step-3" style={{ display: 'grid', gap: 14 }}>
        <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>
          Opcional · si tienes el plano, podemos referenciarlo en el reporte.
        </div>
        <Field label="Plano (PDF, PNG, JPG · máx 10 MB)">
          <input
            data-testid="audit-form-floor_plan"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            onChange={(e) => set('_floor_plan_file', e.target.files?.[0] || null)}
            style={{ ...fieldStyle, padding: 8 }}
          />
        </Field>
        {form._floor_plan_uploaded && (
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#86efac' }}>
            Plano subido correctamente.
          </div>
        )}
      </div>
    );
  }

  // step 4
  return (
    <div data-testid="audit-step-4" style={{ display: 'grid', gap: 14 }}>
      <Field label="Email" required error={errors?.email}>
        <input
          data-testid="audit-form-email"
          type="email"
          value={form.email || ''}
          onChange={(e) => set('email', e.target.value)}
          placeholder="tu@email.com"
          style={fieldStyle}
        />
      </Field>
      <Field label="WhatsApp (opcional)">
        <input
          data-testid="audit-form-phone"
          type="tel"
          value={form.phone || ''}
          onChange={(e) => set('phone', e.target.value)}
          placeholder="+52 55 ..."
          style={fieldStyle}
        />
      </Field>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
        <input
          data-testid="audit-form-consent"
          type="checkbox"
          checked={!!form.consent}
          onChange={(e) => set('consent', e.target.checked)}
          style={{ marginTop: 4, accentColor: 'var(--theme)' }}
        />
        <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', lineHeight: 1.5 }}>
          Acepto el aviso de privacidad LFPDPPP y autorizo a DesarrollosMX a contactarme con mi audit por email y WhatsApp.
        </span>
      </label>
    </div>
  );
}

function Field({ label, required, error, children }) {
  const fieldId = `field-${String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32)}`;
  const errId = `${fieldId}-err`;
  const child = React.Children.map(children, c => {
    if (!c || typeof c !== 'object') return c;
    return React.cloneElement(c, {
      id: c.props.id || fieldId,
      'aria-describedby': error ? errId : c.props['aria-describedby'],
      'aria-invalid': error ? 'true' : c.props['aria-invalid'],
    });
  });
  return (
    <div>
      <label htmlFor={fieldId} style={labelStyle}>
        {label?.toUpperCase()}
        {required && <span style={{ color: 'var(--theme-3)', marginLeft: 4 }}>*</span>}
      </label>
      {child}
      {error && (
        <div id={errId} role="alert" style={{ marginTop: 4, fontFamily: 'DM Sans', fontSize: 11, color: '#fca5a5' }}>
          {error}
        </div>
      )}
    </div>
  );
}

function Row({ children }) {
  return (
    <div style={{
      display: 'grid', gap: 12,
      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    }}>
      {children}
    </div>
  );
}
