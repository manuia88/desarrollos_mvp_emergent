/**
 * PoliciesConfig — Política para brokers + Política de venta (editable + descargable).
 * Todos los valores se editan aquí; "Descargar" arma el documento terminado con
 * esos valores. Se guarda dentro de la config de comercialización del proyecto.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { getCommercialization, patchCommercialization } from '../../api/developer';
import { Download } from '../../components/icons';
import { Z } from '../../styles/zIndex';

const fmtMXN = (v) => (v || v === 0) ? `$${Number(v).toLocaleString('es-MX')}` : '—';

const lbl = { fontSize: 10.5, color: 'var(--cream-3)', fontWeight: 600, display: 'block', marginBottom: 4 };
const inp = {
  width: '100%', background: 'rgba(var(--bg-rgb),0.5)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--cream)', fontSize: 13, padding: '8px 10px',
  fontFamily: 'DM Sans,sans-serif', boxSizing: 'border-box',
};

function Field({ label, children }) {
  return <div style={{ marginBottom: 12 }}><label style={lbl}>{label}</label>{children}</div>;
}
function TextRow({ label, value, onChange, placeholder }) {
  return <Field label={label}><input value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} style={inp} /></Field>;
}
function NumRow({ label, value, onChange, suffix, step = 1 }) {
  return (
    <Field label={label}>
      <div style={{ position: 'relative' }}>
        <input type="number" step={step} value={value ?? ''} onChange={e => onChange(e.target.value === '' ? '' : +e.target.value)} style={inp} />
        {suffix && <span style={{ position: 'absolute', right: 10, top: 9, fontSize: 12, color: 'var(--cream-3)' }}>{suffix}</span>}
      </div>
    </Field>
  );
}
function AreaRow({ label, value, onChange }) {
  return <Field label={label}><textarea value={value ?? ''} onChange={e => onChange(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} /></Field>;
}

function Card({ title, children }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: 'rgba(var(--cream-rgb),0.02)' }}>
      <h4 style={{ margin: '0 0 12px', fontFamily: 'Outfit', fontSize: 15, fontWeight: 700, color: 'var(--cream)' }}>{title}</h4>
      {children}
    </div>
  );
}

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div>
          <h3 style={{ margin: '0 0 3px', fontFamily: 'Outfit', fontSize: 17, fontWeight: 700, color: 'var(--cream)' }}>Políticas</h3>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--cream-2)', maxWidth: 620, lineHeight: 1.5 }}>
            Edita aquí las reglas. El botón <strong>Descargar</strong> arma el documento ya terminado con estos valores,
            listo para enviar a tus asesores o compradores.
          </p>
        </div>
        <button onClick={download} data-testid="policy-download"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(var(--theme-rgb),0.14)', color: '#f9a8d4', border: '1px solid rgba(var(--theme-rgb),0.3)', borderRadius: 9999, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <Download size={14} /> Descargar política
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14 }}>
        <Card title="Política para asesores / brokers">
          <NumRow label="Comisión" value={broker.comision_pct} suffix="%" step={0.1} onChange={v => bset('comision_pct', v)} />
          <TextRow label="¿Cómo se paga la comisión?" value={broker.comision_pago_esquema} placeholder="Ej: 50% al firmar, 50% al escriturar" onChange={v => bset('comision_pago_esquema', v)} />
          <NumRow label="Plazo de pago tras escriturar" value={broker.comision_pago_dias} suffix="días" onChange={v => bset('comision_pago_dias', v)} />
          <AreaRow label="Registro de leads" value={broker.registro_leads} onChange={v => bset('registro_leads', v)} />
          <NumRow label="Descuento máximo que puede ofrecer un asesor" value={broker.descuento_max_pct} suffix="%" step={0.1} onChange={v => bset('descuento_max_pct', v)} />
          <AreaRow label="Comisión escalonada (bonos)" value={broker.comision_escalonada} onChange={v => bset('comision_escalonada', v)} />
          <TextRow label="Co-brokering / reparto" value={broker.cobrokering_reparto} placeholder="Ej: 50% captador / 50% cerrador" onChange={v => bset('cobrokering_reparto', v)} />
          <TextRow label="Exclusividad (opcional)" value={broker.exclusividad} onChange={v => bset('exclusividad', v)} />
        </Card>

        <Card title="Política de venta (comprador)">
          <NumRow label="Apartado" value={sales.apartado_mxn} suffix="$" step={1000} onChange={v => sset('apartado_mxn', v)} />
          <AreaRow label="Condiciones del apartado" value={sales.apartado_condiciones} onChange={v => sset('apartado_condiciones', v)} />
          <Field label="Vigencia del precio (hasta)">
            <input type="date" value={sales.precio_vigencia_fecha || ''} onChange={e => sset('precio_vigencia_fecha', e.target.value)} style={inp} />
          </Field>
          <AreaRow label="Política de cancelación / devolución" value={sales.cancelacion_politica} onChange={v => sset('cancelacion_politica', v)} />
          <AreaRow label="¿Qué incluye el precio?" value={sales.incluye} onChange={v => sset('incluye', v)} />
          <AreaRow label="Tiempos del proceso (apartado → firma → escritura)" value={sales.tiempos} onChange={v => sset('tiempos', v)} />
        </Card>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button onClick={save} disabled={saving} data-testid="policy-save"
          style={{ background: saving ? 'rgba(148,163,184,0.25)' : 'var(--grad)', border: 'none', color: '#fff', borderRadius: 9999, padding: '9px 22px', fontSize: 12.5, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
          {saving ? 'Guardando…' : 'Guardar políticas'}
        </button>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: Z.STICKY, padding: '12px 18px', borderRadius: 14,
          background: toast.type === 'ok' ? 'rgba(21,128,61,0.97)' : 'rgba(185,28,28,0.97)',
          border: `1px solid ${toast.type === 'ok' ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.4)'}`,
          color: toast.type === 'ok' ? '#86efac' : '#fca5a5', fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 500,
        }}>{toast.msg}</div>
      )}
    </div>
  );
}
