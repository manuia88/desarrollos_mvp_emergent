/**
 * PoliciesConfig — Política para brokers + Política de venta (interactiva: chips/botones, no escribir).
 * Estilo alineado a los cockpits (tarjetas blancas, chips de marca). El dev elige opciones;
 * "Otra…" permite texto libre. "Descargar" arma el documento con esos valores.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { getCommercialization, patchCommercialization } from '../../api/developer';
import { Download } from '../../components/icons';
import { Z } from '../../styles/zIndex';

const fmtMXN = (v) => (v || v === 0) ? `$${Number(v).toLocaleString('es-MX')}` : '—';

const lbl = { fontSize: 10.5, color: 'var(--cream-3)', fontWeight: 700, letterSpacing: '.02em', display: 'block', marginBottom: 6 };
const inp = {
  width: '100%', background: '#fff', border: '1px solid var(--border)',
  borderRadius: 9, color: 'var(--cream)', fontSize: 13, padding: '8px 10px',
  fontFamily: 'DM Sans,sans-serif', boxSizing: 'border-box',
};

function Field({ label, children }) {
  return <div style={{ marginBottom: 16 }}><label style={lbl}>{label}</label>{children}</div>;
}
function NumRow({ label, value, onChange, suffix, step = 1 }) {
  return (
    <Field label={label}>
      <div style={{ position: 'relative', maxWidth: 200 }}>
        <input type="number" step={step} value={value ?? ''} onChange={e => onChange(e.target.value === '' ? '' : +e.target.value)} style={inp} />
        {suffix && <span style={{ position: 'absolute', right: 10, top: 9, fontSize: 12, color: 'var(--cream-3)', fontWeight: 700 }}>{suffix}</span>}
      </div>
    </Field>
  );
}

const chip = (on) => ({
  fontSize: 12, fontWeight: 700, padding: '7px 13px', borderRadius: 999, cursor: 'pointer', textAlign: 'left',
  border: `1.5px solid ${on ? 'var(--theme)' : 'var(--border)'}`,
  background: on ? 'var(--grad, linear-gradient(120deg,#6D4AFF,#C63FAE))' : '#fff',
  color: on ? '#fff' : 'var(--cream-2)',
});

// Selector de opciones (single) con "Otra…" para texto libre.
function ChipSelect({ label, value, options, onChange }) {
  const isPreset = options.includes(value);
  const [custom, setCustom] = useState(!!value && !isPreset);
  return (
    <Field label={label}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {options.map(o => (
          <button key={o} type="button" onClick={() => { onChange(value === o ? '' : o); setCustom(false); }} style={chip(value === o)}>{o}</button>
        ))}
        <button type="button" onClick={() => setCustom(true)} style={chip(custom && !isPreset)}>Otra…</button>
      </div>
      {custom && !isPreset && (
        <input value={value ?? ''} placeholder="Escribe tu política" onChange={e => onChange(e.target.value)} style={{ ...inp, marginTop: 8 }} />
      )}
    </Field>
  );
}

// Selector múltiple (varias aplican) — guarda como texto unido con " · ".
function ChipMulti({ label, value, options, onChange }) {
  const sel = value ? String(value).split(' · ') : [];
  const toggle = (o) => {
    const set = new Set(sel);
    set.has(o) ? set.delete(o) : set.add(o);
    onChange([...set].join(' · '));
  };
  return (
    <Field label={label}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {options.map(o => <button key={o} type="button" onClick={() => toggle(o)} style={chip(sel.includes(o))}>{o}</button>)}
      </div>
    </Field>
  );
}

function Card({ title, children }) {
  return (
    <div className="dmx-card" style={{ background: '#fff', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16 }}>
        <span style={{ width: 4, height: 16, borderRadius: 3, background: 'var(--grad, linear-gradient(120deg,#6D4AFF,#C63FAE))' }} />
        <h4 style={{ margin: 0, fontFamily: 'Outfit', fontSize: 15, fontWeight: 800, color: 'var(--cream)' }}>{title}</h4>
      </div>
      {children}
    </div>
  );
}

// Sub-sección con fondo sutil (sin arcoíris) para separar grupos de campos.
function Group({ title, children }) {
  return (
    <div style={{ background: 'rgba(var(--cream-rgb),0.025)', border: '1px solid var(--border)', borderRadius: 11, padding: '13px 14px 1px', marginBottom: 12 }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--theme)', marginBottom: 11 }}>{title}</div>
      {children}
    </div>
  );
}

// Presets de cada política (el dev elige; "Otra…" para custom).
const OPT = {
  comision_pago: ['100% al firmar contrato', '50% firma / 50% escritura', '100% al escriturar'],
  registro_leads: ['1 asesor por lead · arbitraje si duplicado', 'Primero en registrar gana', 'Sin exclusividad de lead'],
  comision_escalonada: ['Sin bono', '+0.5% si vende en <60 días', '+1% si vende en <30 días', 'Escalonado por volumen'],
  cobrokering: ['50% captador / 50% cerrador', '60% captador / 40% cerrador', 'No aplica co-broking'],
  exclusividad: ['Sin exclusividad', 'Exclusiva por zona', 'Exclusiva por cartera'],
  apartado_cond: ['Reembolsable los primeros 5 días', 'No reembolsable', 'Reembolsable con penalización'],
  cancelacion: ['Reembolso menos gastos antes de firma', 'No reembolsable tras firma', 'Penalización del 10%'],
  incluye: ['1 cajón de estacionamiento', 'Bodega incluida', 'Cocina equipada', 'Clósets', 'Sin extras incluidos'],
  tiempos: ['Apartado → firma (15 días) → escritura a la entrega', 'Apartado → firma (30 días) → escritura a la entrega'],
};

// ─── Documento descargable ──────────────────────────────────────────────────
function buildPolicyHtml(projectName, b, s) {
  const row = (k, v) => v ? `<tr><td class="k">${k}</td><td>${String(v).replace(/\n/g, '<br>')}</td></tr>` : '';
  const today = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Políticas — ${projectName}</title>
<style>
  body{font-family:Georgia,serif;color:#1a1a1a;max-width:760px;margin:40px auto;padding:0 24px;line-height:1.55}
  h1{font-size:26px;margin:0 0 4px} .sub{color:#666;font-size:13px;margin-bottom:28px}
  h2{font-size:18px;border-bottom:2px solid #111;padding-bottom:6px;margin:32px 0 12px}
  table{width:100%;border-collapse:collapse;margin-bottom:8px}
  td{padding:8px 6px;border-bottom:1px solid #eee;vertical-align:top;font-size:14px}
  td.k{width:230px;color:#555;font-weight:bold}
  .foot{margin-top:36px;color:#888;font-size:11px;border-top:1px solid #ddd;padding-top:10px}
</style></head><body>
<h1>Políticas comerciales</h1>
<div class="sub">Proyecto: ${projectName} · Generado el ${today}</div>
<h2>Política para asesores / brokers</h2>
<table>
  ${row('Comisión', b.comision_pct != null ? b.comision_pct + '%' : '')}
  ${row('Pago de comisión', b.comision_pago_esquema)}
  ${row('Plazo de pago', b.comision_pago_dias ? b.comision_pago_dias + ' días' : '')}
  ${row('Registro de leads', b.registro_leads)}
  ${row('Descuento máximo autorizado', b.descuento_max_pct != null ? b.descuento_max_pct + '%' : '')}
  ${row('Comisión escalonada', b.comision_escalonada)}
  ${row('Co-brokering / reparto', b.cobrokering_reparto)}
  ${row('Exclusividad', b.exclusividad)}
</table>
<h2>Política de venta (comprador)</h2>
<table>
  ${row('Apartado', s.apartado_mxn != null ? fmtMXN(s.apartado_mxn) : '')}
  ${row('Condiciones del apartado', s.apartado_condiciones)}
  ${row('Vigencia del precio', s.precio_vigencia_fecha)}
  ${row('Política de cancelación', s.cancelacion_politica)}
  ${row('Qué incluye el precio', s.incluye)}
  ${row('Tiempos del proceso', s.tiempos)}
</table>
<div class="foot">Documento generado automáticamente por DesarrollosMX. Los valores reflejan la configuración del proyecto a la fecha indicada.</div>
</body></html>`;
}

export default function PoliciesConfig({ devId, projectName }) {
  const [broker, setBroker] = useState({});
  const [sales, setSales] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await getCommercialization(devId);
      setBroker(cfg.broker_policy || {});
      setSales(cfg.sales_policy || {});
    } catch (e) { setToast({ type: 'error', msg: 'No se pudieron cargar las políticas' }); }
    finally { setLoading(false); }
  }, [devId]);

  useEffect(() => { load(); }, [load]);

  const bset = (k, v) => setBroker(p => ({ ...p, [k]: v }));
  const sset = (k, v) => setSales(p => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await patchCommercialization(devId, { broker_policy: broker, sales_policy: sales });
      setToast({ type: 'ok', msg: 'Políticas guardadas' });
      setTimeout(() => setToast(null), 2400);
    } catch (e) { setToast({ type: 'error', msg: e.body?.detail || 'Error al guardar' }); }
    finally { setSaving(false); }
  };

  const download = () => {
    const html = buildPolicyHtml(projectName || devId, broker, sales);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `politicas-${(projectName || devId).replace(/\s+/g, '-').toLowerCase()}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) return <div style={{ padding: 24, color: 'var(--cream-3)', fontSize: 13 }}>Cargando políticas…</div>;

  return (
    <div data-testid="policies-config">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: '0 0 3px', fontFamily: 'Outfit', fontSize: 17.5, fontWeight: 800, color: 'var(--cream)' }}>Políticas</h3>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--cream-2)', maxWidth: 640, lineHeight: 1.5 }}>
            Elige las opciones (sin escribir). <b>Descargar</b> arma el documento ya terminado, listo para tus asesores o compradores.
          </p>
        </div>
        <button onClick={download} data-testid="policy-download"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', color: 'var(--theme)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <Download size={14} /> Descargar política
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(330px,1fr))', gap: 14 }}>
        <Card title="Política para asesores / brokers">
          <Group title="Comisión">
            <NumRow label="Comisión" value={broker.comision_pct} suffix="%" step={0.1} onChange={v => bset('comision_pct', v)} />
            <ChipSelect label="¿Cómo se paga?" value={broker.comision_pago_esquema} options={OPT.comision_pago} onChange={v => bset('comision_pago_esquema', v)} />
            <NumRow label="Plazo de pago tras escriturar" value={broker.comision_pago_dias} suffix="días" onChange={v => bset('comision_pago_dias', v)} />
          </Group>
          <Group title="Reglas de operación">
            <ChipSelect label="Registro de leads" value={broker.registro_leads} options={OPT.registro_leads} onChange={v => bset('registro_leads', v)} />
            <NumRow label="Descuento máximo que puede ofrecer un asesor" value={broker.descuento_max_pct} suffix="%" step={0.1} onChange={v => bset('descuento_max_pct', v)} />
            <ChipSelect label="Exclusividad" value={broker.exclusividad} options={OPT.exclusividad} onChange={v => bset('exclusividad', v)} />
          </Group>
          <Group title="Incentivos">
            <ChipSelect label="Comisión escalonada (bonos)" value={broker.comision_escalonada} options={OPT.comision_escalonada} onChange={v => bset('comision_escalonada', v)} />
            <ChipSelect label="Co-brokering / reparto" value={broker.cobrokering_reparto} options={OPT.cobrokering} onChange={v => bset('cobrokering_reparto', v)} />
          </Group>
        </Card>

        <Card title="Política de venta (comprador)">
          <Group title="Apartado">
            <NumRow label="Apartado" value={sales.apartado_mxn} suffix="$" step={1000} onChange={v => sset('apartado_mxn', v)} />
            <ChipSelect label="Condiciones del apartado" value={sales.apartado_condiciones} options={OPT.apartado_cond} onChange={v => sset('apartado_condiciones', v)} />
          </Group>
          <Group title="Precio">
            <Field label="Vigencia del precio (hasta)">
              <input type="date" value={sales.precio_vigencia_fecha || ''} onChange={e => sset('precio_vigencia_fecha', e.target.value)} style={{ ...inp, maxWidth: 200 }} />
            </Field>
            <ChipMulti label="¿Qué incluye el precio? (varias)" value={sales.incluye} options={OPT.incluye} onChange={v => sset('incluye', v)} />
          </Group>
          <Group title="Proceso">
            <ChipSelect label="Política de cancelación / devolución" value={sales.cancelacion_politica} options={OPT.cancelacion} onChange={v => sset('cancelacion_politica', v)} />
            <ChipSelect label="Tiempos del proceso (apartado → firma → escritura)" value={sales.tiempos} options={OPT.tiempos} onChange={v => sset('tiempos', v)} />
          </Group>
        </Card>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button onClick={save} disabled={saving} data-testid="policy-save"
          style={{ background: saving ? 'rgba(var(--cream-rgb),0.18)' : 'var(--grad, linear-gradient(120deg,#6D4AFF,#C63FAE))', border: 'none', color: '#fff', borderRadius: 10, padding: '9px 22px', fontSize: 12.5, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
          {saving ? 'Guardando…' : 'Guardar políticas'}
        </button>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: Z.STICKY, padding: '12px 18px', borderRadius: 12,
          background: toast.type === 'ok' ? '#1E2230' : '#B91C1C', color: '#fff',
          fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600, boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
        }}>{toast.msg}</div>
      )}
    </div>
  );
}
