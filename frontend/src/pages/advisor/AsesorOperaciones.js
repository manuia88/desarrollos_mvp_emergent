// /asesor/operaciones — list + 6-step wizard + status transitions
import React, { useEffect, useState } from 'react';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { PageHeader, Card, Badge, Empty, Drawer, Toast, fmtMXN } from '../../components/advisor/primitives';
import * as api from '../../api/advisor';

const LEGAL_NEXT = {
  propuesta: ['oferta_aceptada', 'cancelada'],
  oferta_aceptada: ['escritura', 'cancelada'],
  escritura: ['cerrada', 'cancelada'],
  cerrada: ['pagando', 'cancelada'],
  pagando: ['cobrada'],
  cobrada: [],
  cancelada: [],
};

const STATUS_TONE = {
  propuesta: 'brand', oferta_aceptada: 'warn', escritura: 'pink', cerrada: 'ok',
  pagando: 'warn', cobrada: 'ok', cancelada: 'bad',
};

export default function AsesorOperaciones({ user, onLogout }) {
  const [items, setItems] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [devs, setDevs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [toast, setToast] = useState(null);
  const [detail, setDetail] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [ops, cs] = await Promise.all([api.listOperaciones(), api.listContactos({})]);
      setItems(ops); setContacts(cs);
    } finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/developments?sort=recent`).then(r => r.json()).then(setDevs);
  }, []);

  const transition = async (op, to) => {
    try {
      await api.updateOpStatus(op.id, to);
      setToast({ kind: 'success', text: `Estado actualizado: ${to}` });
      const updated = await api.getOperacion(op.id);
      setDetail(updated); load();
    } catch (e) { setToast({ kind: 'error', text: e.body?.detail || 'Transición inválida' }); }
  };

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="CRM · OPERACIONES"
        title="Operaciones"
        sub="Wizard 6 pasos + transiciones de estado auditables. IVA 16% + split 80/20 visible al cierre."
        actions={<button onClick={() => setShowNew(true)} data-testid="new-op-btn" className="btn btn-primary">+ Nueva operación</button>}
      />

      {loading ? <div style={{ padding: 60, color: 'var(--cream-3)', textAlign: 'center' }}>Cargando…</div>
        : items.length === 0 ? <Empty title="Sin operaciones" sub="Crea la primera con el wizard." />
        : (
          <Card style={{ padding: 0, overflow: 'auto' }}>
            <table data-testid="ops-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Código', 'Side', 'Valor', 'Comisión total', 'Split asesor', 'Estado', 'Cierre'].map(c => (
                    <th key={c} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(op => (
                  <tr key={op.id} data-testid={`op-row-${op.id}`} onClick={() => setDetail(op)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                    <td style={{ padding: '11px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--cream)' }}>{op.code}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--cream-2)', fontSize: 12 }}>{op.side}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--cream)', fontFamily: 'Outfit', fontWeight: 700, fontSize: 13 }}>{fmtMXN(op.valor_cierre)} {op.currency}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--cream-2)', fontSize: 12 }}>{fmtMXN(op.comision_total)}</td>
                    <td style={{ padding: '11px 14px', color: '#86efac', fontSize: 12 }}>{fmtMXN(op.asesor_split)}</td>
                    <td style={{ padding: '11px 14px' }}><Badge tone={STATUS_TONE[op.status]}>{op.status.replace('_', ' ')}</Badge></td>
                    <td style={{ padding: '11px 14px', color: 'var(--cream-3)', fontSize: 12 }}>{op.fecha_cierre || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

      <Drawer open={showNew} onClose={() => setShowNew(false)} title="Nueva operación · Wizard 6 pasos" width={620}>
        <NewOpWizard contacts={contacts} devs={devs}
          onDone={() => { setShowNew(false); setToast({ kind: 'success', text: 'Operación creada' }); load(); }}
          onError={t => setToast({ kind: 'error', text: t })} />
      </Drawer>

      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail ? `Operación ${detail.code}` : ''} width={540}>
        {detail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Datos</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Line k="Side" v={detail.side} />
                <Line k="Estado" v={<Badge tone={STATUS_TONE[detail.status]}>{detail.status}</Badge>} />
                <Line k="Valor cierre" v={`${fmtMXN(detail.valor_cierre)} ${detail.currency}`} />
                <Line k="Comisión %" v={`${detail.comision_pct}%`} />
                <Line k="Comisión base" v={fmtMXN(detail.comision_base)} />
                <Line k="IVA 16%" v={fmtMXN(detail.iva)} />
                <Line k="Total" v={fmtMXN(detail.comision_total)} />
                <Line k="Fecha cierre" v={detail.fecha_cierre || '—'} />
              </div>
            </Card>
            <Card style={{ background: 'linear-gradient(140deg, rgba(99,102,241,0.1), rgba(236,72,153,0.04))' }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Split 80/20</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Line k="Tu inmobiliaria · 80%" v={fmtMXN(detail.asesor_split)} bold />
                <Line k="DMX · 20%" v={fmtMXN(detail.platform_split)} />
              </div>
            </Card>
            {LEGAL_NEXT[detail.status].length > 0 && (
              <Card>
                <div className="eyebrow" style={{ marginBottom: 10 }}>Próxima transición</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {LEGAL_NEXT[detail.status].map(s => (
                    <button key={s} onClick={() => transition(detail, s)} data-testid={`op-to-${s}`}
                      className="btn btn-glass btn-sm">
                      → {s.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
      </Drawer>

      {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}
    </AdvisorLayout>
  );
}

function Line({ k, v, bold }) {
  return (
    <div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{k}</div>
      <div style={{ fontFamily: bold ? 'Outfit' : 'DM Sans', fontWeight: bold ? 800 : 500, fontSize: 14, color: 'var(--cream)' }}>{v}</div>
    </div>
  );
}

function NewOpWizard({ contacts, devs, onDone, onError }) {
  const [step, setStep] = useState(1);
  const [f, setF] = useState({
    side: 'ambos', contacto_id: contacts[0]?.id || '', desarrollo_id: '', unidad_id: '',
    valor_cierre: '', currency: 'MXN', comision_pct: 4.0, fecha_cierre: '',
    declaracion_jurada: false, notas: '',
  });
  const [sub, setSub] = useState(false);
  const dev = devs.find(d => d.id === f.desarrollo_id);

  const next = () => setStep(s => Math.min(6, s + 1));
  const back = () => setStep(s => Math.max(1, s - 1));

  const inputStyle = { width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 9999, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none' };
  const lblStyle = { fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 };

  const submit = async () => {
    if (!f.declaracion_jurada) return onError('Debes aceptar la declaración jurada');
    if (!f.valor_cierre) return onError('Falta valor de cierre');
    setSub(true);
    try {
      await api.createOperacion({
        side: f.side, contacto_id: f.contacto_id || null,
        desarrollo_id: f.desarrollo_id || null, unidad_id: f.unidad_id || null,
        valor_cierre: +f.valor_cierre, currency: f.currency,
        comision_pct: +f.comision_pct,
        fecha_cierre: f.fecha_cierre || null, notas: f.notas,
      });
      onDone();
    } catch { onError('Error al crear'); }
    finally { setSub(false); }
  };

  // Preview comisión
  const preview = () => {
    const v = +f.valor_cierre || 0;
    const base = v * (+f.comision_pct || 0) / 100;
    const iva = base * 0.16;
    return { base, iva, total: base + iva, asesor: base * 0.8, dmx: base * 0.2 };
  };
  const p = preview();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Stepper */}
      <div style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4, 5, 6].map(n => (
          <div key={n} style={{ flex: 1, height: 4, borderRadius: 9999, background: n <= step ? 'var(--grad)' : 'var(--border-2)' }} />
        ))}
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', textAlign: 'center' }}>
        Paso {step} de 6
      </div>

      {step === 1 && (
        <>
          <div className="eyebrow">1 · Operación</div>
          <label><div style={lblStyle}>Side</div>
            <select value={f.side} onChange={e => setF({ ...f, side: e.target.value })} className="asr-select" style={{ width: '100%' }} data-testid="op-side">
              <option value="ambos">Ambos lados (4%)</option>
              <option value="vendedor">Lado vendedor (3%)</option>
              <option value="comprador">Lado comprador (3%)</option>
            </select>
          </label>
        </>
      )}
      {step === 2 && (
        <>
          <div className="eyebrow">2 · Comprador</div>
          <label><div style={lblStyle}>Contacto comprador</div>
            <select value={f.contacto_id} onChange={e => setF({ ...f, contacto_id: e.target.value })} className="asr-select" style={{ width: '100%' }} data-testid="op-contact">
              <option value="">— Opcional —</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
            </select>
          </label>
        </>
      )}
      {step === 3 && (
        <>
          <div className="eyebrow">3 · Propiedad / Desarrollo</div>
          <label><div style={lblStyle}>Desarrollo</div>
            <select value={f.desarrollo_id} onChange={e => setF({ ...f, desarrollo_id: e.target.value })} className="asr-select" style={{ width: '100%' }} data-testid="op-dev">
              <option value="">— Opcional —</option>
              {devs.map(d => <option key={d.id} value={d.id}>{d.name} · {d.colonia}</option>)}
            </select>
          </label>
          {dev && (
            <label><div style={lblStyle}>Unidad</div>
              <select value={f.unidad_id} onChange={e => setF({ ...f, unidad_id: e.target.value })} className="asr-select" style={{ width: '100%' }}>
                <option value="">— Sin seleccionar —</option>
                {(dev.units || []).slice(0, 30).map(u => <option key={u.id} value={u.id}>{u.unit_number} · {u.prototype} · {fmtMXN(u.price)}</option>)}
              </select>
            </label>
          )}
        </>
      )}
      {step === 4 && (
        <>
          <div className="eyebrow">4 · Valores</div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
            <label><div style={lblStyle}>Valor cierre *</div>
              <input type="number" value={f.valor_cierre} onChange={e => setF({ ...f, valor_cierre: e.target.value })} style={inputStyle} data-testid="op-valor" />
            </label>
            <label><div style={lblStyle}>Divisa</div>
              <select value={f.currency} onChange={e => setF({ ...f, currency: e.target.value })} className="asr-select" style={{ width: '100%' }}>
                <option>MXN</option><option>USD</option><option>AED</option>
              </select>
            </label>
          </div>
          <label><div style={lblStyle}>Fecha cierre estimada</div>
            <input type="date" value={f.fecha_cierre} onChange={e => setF({ ...f, fecha_cierre: e.target.value })} style={inputStyle} />
          </label>
        </>
      )}
      {step === 5 && (
        <>
          <div className="eyebrow">5 · Comisión</div>
          <label><div style={lblStyle}>% Comisión</div>
            <input type="number" step={0.1} value={f.comision_pct} onChange={e => setF({ ...f, comision_pct: e.target.value })} style={inputStyle} data-testid="op-pct" />
          </label>
          <Card style={{ background: 'linear-gradient(140deg, rgba(99,102,241,0.1), rgba(236,72,153,0.04))' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Line k="Base" v={fmtMXN(p.base)} />
              <Line k="IVA 16% auto" v={fmtMXN(p.iva)} />
              <Line k="Total c/IVA" v={fmtMXN(p.total)} bold />
              <Line k="Tu 80%" v={fmtMXN(p.asesor)} />
              <Line k="DMX 20%" v={fmtMXN(p.dmx)} />
            </div>
          </Card>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={f.declaracion_jurada} onChange={e => setF({ ...f, declaracion_jurada: e.target.checked })} data-testid="op-jurada" style={{ marginTop: 3 }} />
            <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.5 }}>
              Declaro bajo protesta de decir verdad que la información proporcionada es veraz y que cumplo con los requisitos fiscales para emitir CFDI por esta comisión.
            </span>
          </label>
        </>
      )}
      {step === 6 && (
        <>
          <div className="eyebrow">6 · Notas</div>
          <label><div style={lblStyle}>Notas internas (opcional)</div>
            <textarea value={f.notas} onChange={e => setF({ ...f, notas: e.target.value })} rows={4}
              style={{ ...inputStyle, borderRadius: 14, resize: 'vertical', fontFamily: 'DM Sans' }} data-testid="op-notas" />
          </label>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {step > 1 && <button onClick={back} className="btn btn-glass" style={{ flex: 1, justifyContent: 'center' }} data-testid="op-back">← Atrás</button>}
        {step < 6 && <button onClick={next} className="btn btn-primary" style={{ flex: 2, justifyContent: 'center' }} data-testid="op-next">Siguiente →</button>}
        {step === 6 && <button onClick={submit} disabled={sub || !f.declaracion_jurada || !f.valor_cierre} className="btn btn-primary" style={{ flex: 2, justifyContent: 'center', opacity: (sub || !f.declaracion_jurada || !f.valor_cierre) ? 0.6 : 1 }} data-testid="op-submit">
          {sub ? 'Creando…' : 'Crear operación'}
        </button>}
      </div>
    </div>
  );
}
