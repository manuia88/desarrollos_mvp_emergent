// Bloque 2.4 — Superadmin · Cobertura de Datos.
// Qué receta alimenta qué en el producto, de qué fuente, en qué estado y la UNA acción
// para prenderla. Conexión guiada inline (pega resource_id → prueba → sincroniza → se prende).
// Reusa data-sources (PATCH/test/sync). Cuando se conecta, el comprador deja de ver "datos en camino".
import React, { useEffect, useMemo, useState } from 'react';
import { Database, Link2, Check, RefreshCw } from 'lucide-react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card, Empty } from '../../components/advisor/primitives';
import { getRecipesCoverage, updateCredentials, testConnection, syncSource } from '../../api/superadmin';

const ESTADO = {
  pendiente: { label: 'Pendiente', col: '#fca5a5', dot: '#ef4444' },
  lista: { label: 'Lista para sincronizar', col: '#fcd34d', dot: '#f59e0b' },
  conectada: { label: 'Conectada', col: '#86efac', dot: '#22c55e' },
  interna: { label: 'Interna', col: 'var(--cream-3)', dot: 'var(--cream-3)' },
};

function ConnectRow({ recipe, onDone }) {
  const src = (recipe.fuentes || []).find(f => !f.configurada) || (recipe.fuentes || [])[0];
  const [rid, setRid] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const isCkan = src && src.access_mode === 'ckan_resource';

  const connect = async () => {
    if (!src) return;
    setBusy('connect'); setMsg(null);
    try {
      if (isCkan) {
        if (!rid.trim()) { setMsg({ ok: false, t: 'Pega el resource_id primero.' }); setBusy(''); return; }
        await updateCredentials(src.id, { credentials: { resource_id: rid.trim() }, run_test: true });
      }
      const t = await testConnection(src.id);
      setMsg({ ok: t.ok, t: t.message + (t.kind ? ` (${t.kind})` : '') });
      const s = await syncSource(src.id);
      setMsg({ ok: !s.is_stub, t: s.is_stub ? `Sincronizado pero la fuente devolvió stub (${s.records_ingested}).` : `¡Conectada! ${s.records_ingested} registros reales.` });
      onDone && onDone();
    } catch (e) {
      setMsg({ ok: false, t: e.message || 'Error al conectar' });
    } finally { setBusy(''); }
  };

  if (!src) return null;
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>Fuente: <b style={{ color: 'var(--cream)' }}>{src.name}</b></span>
      {isCkan && (
        <input data-testid={`rid-${recipe.code}`} value={rid} onChange={e => setRid(e.target.value)} placeholder="resource_id de datos.cdmx"
          style={{ flex: '1 1 200px', minWidth: 160, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12 }} />
      )}
      <button data-testid={`connect-${recipe.code}`} onClick={connect} disabled={!!busy}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 9999, cursor: busy ? 'wait' : 'pointer',
          background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb),0.7))', border: '1px solid rgba(255,255,255,0.16)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12 }}>
        {busy ? <RefreshCw size={13} className="spin" /> : <Link2 size={13} />} {busy ? 'Conectando…' : (isCkan ? 'Conectar' : 'Sincronizar')}
      </button>
      {msg && <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: msg.ok ? '#86efac' : '#fca5a5' }}>{msg.ok ? <Check size={12} style={{ verticalAlign: 'middle' }} /> : '⚠ '}{msg.t}</span>}
    </div>
  );
}

function RecipeCard({ recipe, onDone }) {
  const st = ESTADO[recipe.estado] || ESTADO.interna;
  const connectable = recipe.estado === 'pendiente' || recipe.estado === 'lista';
  return (
    <Card data-testid={`recipe-${recipe.code}`} style={{ padding: 14, borderLeft: `3px solid ${st.dot}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>{recipe.categoria}{recipe.user_facing && <span title="Se ve en el comprador" style={{ fontSize: 9.5, marginLeft: 6, color: 'var(--theme)' }}>público</span>}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'DM Sans', fontSize: 11, color: st.col }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: st.dot }} /> {st.label}
        </span>
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', marginTop: 5, lineHeight: 1.45 }}>{recipe.powers}</div>
      {connectable && (
        <>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 7 }}>{recipe.como_conectar}</div>
          <ConnectRow recipe={recipe} onDone={onDone} />
        </>
      )}
    </Card>
  );
}

export default function SuperadminRecipesCoverage({ embedded }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showInternas, setShowInternas] = useState(false);

  const refresh = () => {
    setLoading(true);
    getRecipesCoverage().then(setData).catch(() => setData(false)).finally(() => setLoading(false));
  };
  useEffect(() => { refresh(); }, []);

  const items = useMemo(() => (data && data.items) || [], [data]);
  const kpis = (data && data.kpis) || {};
  const visible = showInternas ? items : items.filter(i => i.estado !== 'interna');

  return (
    <SuperadminLayout bare={embedded}>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <PageHeader
        eyebrow="DATOS · COBERTURA"
        title="Cobertura de Datos"
        sub="Qué dato alimenta cada parte del producto, de qué fuente, y la acción para prenderlo. Conecta una fuente y la zona deja de mostrar 'datos en camino' al comprador."
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 18 }}>
        {[
          ['Conectadas', kpis.conectadas, '#86efac', <Check key="c" size={14} />],
          ['Listas', kpis.listas, '#fcd34d', <RefreshCw key="r" size={14} />],
          ['Pendientes', kpis.pendientes, '#fca5a5', <Link2 key="l" size={14} />],
          ['Pendientes públicas', kpis.pendientes_user, 'var(--theme)', <Database key="d" size={14} />],
        ].map(([lbl, val, col, icon], i) => (
          <Card key={i} style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>{icon}{lbl}</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: col, marginTop: 4 }}>{val ?? '—'}</div>
          </Card>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Cargando…</div>
      ) : !data ? (
        <Empty title="No se pudo cargar" sub="Revisa el backend de cobertura." />
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <button onClick={() => setShowInternas(v => !v)} style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              {showInternas ? 'Ocultar' : 'Mostrar'} recetas internas ({kpis.internas ?? 0})
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(330px,1fr))', gap: 12 }}>
            {visible.map(r => <RecipeCard key={r.code} recipe={r} onDone={refresh} />)}
          </div>
        </>
      )}
    </SuperadminLayout>
  );
}
