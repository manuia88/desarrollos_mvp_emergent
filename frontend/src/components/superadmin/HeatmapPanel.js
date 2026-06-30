// Superadmin · MAPA DE TENSIÓN — el heatmap repivotable de CDMX.
// Eliges una MÉTRICA (precio/m², demanda…) o un SEGMENTO (terraza·con terraza) y las colonias se recolorean.
// Mapa = maplibre-gl LAZY, estilo CARTO Positron sin token (mismo patrón que LugaresMap): un marcador-círculo por
// colonia, color por valor en la escala (divergente para gaps/tensión, secuencial para métricas), radio por magnitud.
// Las listas "Mayor / Menor tensión" SIEMPRE se ven (fallback si el mapa no monta + lectura rápida del analista).
// Reusa /heatmap/opciones (selectores) y /heatmap (puntos+escala+top/bottom+lectura). Cero dato inventado.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Badge } from '../advisor/primitives';
import { getHeatmapOpciones, getHeatmap } from '../../api/superadminDemandIntel';

const card = { padding: '14px 18px' };
const lbl = { fontSize: 11, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 };
const selStyle = {
  background: 'rgba(255,255,255,0.04)', color: '#ddd', fontSize: 12.5,
  border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: '6px 9px',
};
const tabBtn = (on) => ({
  padding: '6px 14px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
  background: on ? 'var(--theme, #6366f1)' : 'transparent', color: on ? '#fff' : '#aaa', fontSize: 12.5, fontWeight: 600,
});
const CDMX_CENTER = [-99.13, 19.40];
const CDMX_ZOOM = 10.5;

// ── color de un valor dentro de la escala ───────────────────────────────────
// modo divergente (gap/tensión): verde = positivo (oportunidad), gris = 0, ámbar→rojo = negativo (sobreoferta).
// modo secuencial (métrica): azul tenue → índigo intenso a más valor.
function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
function rgb(c) { return `rgb(${c[0]},${c[1]},${c[2]})`; }
function colorFor(v, escala, divergente) {
  if (v == null || !escala) return '#3a3d4d'; // sin dato → gris tenue
  const min = escala.min, max = escala.max;
  if (divergente) {
    const lim = Math.max(Math.abs(min), Math.abs(max), 1e-9);
    const t = Math.max(-1, Math.min(1, v / lim));
    if (t >= 0) { // 0 → gris, +1 → verde
      const g = [90, 95, 110]; const pos = [34, 197, 94];
      return rgb([lerp(g[0], pos[0], t), lerp(g[1], pos[1], t), lerp(g[2], pos[2], t)]);
    }
    const g = [90, 95, 110]; const neg = [220, 70, 60]; const tt = -t; // 0 → gris, -1 → rojo (pasa por ámbar)
    return rgb([lerp(g[0], neg[0], tt), lerp(g[1], neg[1], tt), lerp(g[2], neg[2], tt)]);
  }
  // secuencial
  const span = (max - min) || 1;
  const t = Math.max(0, Math.min(1, (v - min) / span));
  const lo = [120, 140, 230]; const hi = [67, 56, 202];
  return rgb([lerp(lo[0], hi[0], t), lerp(lo[1], hi[1], t), lerp(lo[2], hi[2], t)]);
}
// radio del marcador (px) proporcional a |valor| (o n_devs como respaldo) dentro de la escala.
function radiusFor(p, escala) {
  const lim = escala ? Math.max(Math.abs(escala.min || 0), Math.abs(escala.max || 0), 1e-9) : 1;
  const base = p.valor != null ? Math.abs(p.valor) / lim : (p.n_devs ? Math.min(1, p.n_devs / 10) : 0.25);
  return Math.round(7 + Math.max(0, Math.min(1, base)) * 15); // 7..22 px
}

// formato de valor para etiquetas (usa la unidad si vino del catálogo)
function fmtVal(v, unidad) {
  if (v == null) return '—';
  if (typeof v !== 'number') return String(v);
  const u = unidad || '';
  if (u === '$/m²') return `$${Math.round(v / 1000)}k/m²`;
  if (u === 'MXN') return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v).toLocaleString('es-MX')}`;
  if (u === '%') return `${Number.isInteger(v) ? v : +v.toFixed(1)}%`;
  if (u === 'x') return `${+v.toFixed(2)}x`;
  if (u === 'idx') return `${+v.toFixed(2)}`;
  if (Math.abs(v) >= 1000) return `${Math.round(v / 1000)}k`;
  return Number.isInteger(v) ? v.toLocaleString('es-MX') : (+v.toFixed(1)).toLocaleString('es-MX');
}

export default function HeatmapPanel() {
  const [op, setOp] = useState(null);          // {metricas, dimensiones_segmento, lectura}
  const [opErr, setOpErr] = useState(null);

  const [modo, setModo] = useState('metrica'); // 'metrica' | 'segmento'
  const [metrica, setMetrica] = useState('');
  const [dimension, setDimension] = useState('');
  const [valor, setValor] = useState('');

  const [data, setData] = useState(null);      // respuesta de /heatmap
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  // ── catálogo de opciones al montar ──
  useEffect(() => {
    getHeatmapOpciones()
      .then((d) => {
        setOp(d);
        const m0 = d?.metricas?.[0];
        if (m0) setMetrica(m0.id);
        const dim0 = d?.dimensiones_segmento?.[0];
        if (dim0) { setDimension(dim0.id); setValor(dim0.valores?.[0] ?? ''); }
      })
      .catch((e) => setOpErr(e.message));
  }, []);

  const metById = useMemo(() => Object.fromEntries((op?.metricas || []).map((m) => [m.id, m])), [op]);
  const dimById = useMemo(() => Object.fromEntries((op?.dimensiones_segmento || []).map((d) => [d.id, d])), [op]);
  const unidadActual = modo === 'metrica' ? (metById[metrica]?.unidad || '') : ''; // gaps de segmento no traen unidad
  const divergente = modo === 'segmento'; // segmento = tensión (gap) → escala divergente; métrica = secuencial

  // ── consulta del heatmap cuando cambia la selección ──
  useEffect(() => {
    if (!op) return;
    let args = null;
    if (modo === 'metrica') { if (!metrica) return; args = { metrica }; }
    else { if (!dimension || valor === '' || valor == null) return; args = { dimension, valor }; }
    setLoading(true); setErr(null);
    getHeatmap(args)
      .then((d) => setData(d))
      .catch((e) => { setData(null); setErr(e.message); })
      .finally(() => setLoading(false));
  }, [op, modo, metrica, dimension, valor]);

  // cambiar de dimensión → resetear su valor al primero disponible
  const onDimension = (id) => {
    setDimension(id);
    const vals = dimById[id]?.valores || [];
    setValor(vals[0] ?? '');
  };

  if (opErr) return <Card style={{ ...card, color: '#dc2626' }}>{opErr}</Card>;
  if (!op) return <Card style={card}>Cargando opciones del mapa…</Card>;

  const escala = data?.escala;
  const puntos = data?.puntos || [];
  const top = data?.top || [];
  const bottom = data?.bottom || [];

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {/* ── INTRO ── */}
      <Card style={{ ...card, borderLeft: '3px solid var(--theme, #6366f1)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#eee', marginBottom: 6 }}>Mapa de tensión de CDMX</div>
        <div style={{ fontSize: 12.5, color: '#bbb', lineHeight: 1.55 }}>
          Eliges una <strong style={{ color: '#ddd' }}>métrica</strong> o un <strong style={{ color: '#ddd' }}>segmento</strong> y
          {' '}las colonias se recolorean. {op.lectura ? <span style={{ color: '#999' }}>{op.lectura}</span> : null}
        </div>
      </Card>

      {/* ── CONTROLES ── */}
      <Card style={{ ...card, display: 'flex', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={lbl}>¿Qué coloreo?</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={tabBtn(modo === 'metrica')} onClick={() => setModo('metrica')}>Métrica</button>
            <button style={tabBtn(modo === 'segmento')} onClick={() => setModo('segmento')}>Segmento</button>
          </div>
        </div>

        {modo === 'metrica' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={lbl}>Métrica</span>
            <select style={{ ...selStyle, minWidth: 260 }} value={metrica} onChange={(e) => setMetrica(e.target.value)}>
              {(op.metricas || []).map((m) => <option key={m.id} value={m.id}>{m.label}{m.unidad ? ` (${m.unidad})` : ''}</option>)}
            </select>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={lbl}>Dimensión</span>
              <select style={{ ...selStyle, minWidth: 200 }} value={dimension} onChange={(e) => onDimension(e.target.value)}>
                {(op.dimensiones_segmento || []).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={lbl}>Valor</span>
              <select style={{ ...selStyle, minWidth: 180 }} value={valor} onChange={(e) => setValor(e.target.value)}>
                {(dimById[dimension]?.valores || []).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </>
        )}
        {loading && <span style={{ fontSize: 12, color: '#888', alignSelf: 'center' }}>Recoloreando…</span>}
      </Card>

      {err && <Card style={{ ...card, color: '#dc2626' }}>{err}</Card>}

      {/* ── LECTURA + LEYENDA ── */}
      {data && (
        <Card style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 320px' }}>
              <div style={{ fontSize: 11, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                {data.etiqueta || (modo === 'metrica' ? metById[metrica]?.label : `${dimById[dimension]?.label}: ${valor}`)}
              </div>
              {data.lectura && <div style={{ fontSize: 13.5, color: '#ddd', lineHeight: 1.45 }}>{data.lectura}</div>}
            </div>
            <Legend escala={escala} divergente={divergente} unidad={unidadActual} />
          </div>
        </Card>
      )}

      {/* ── MAPA + LISTAS (las listas SIEMPRE visibles) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 16, alignItems: 'start' }}>
        <HeatMap puntos={puntos} escala={escala} divergente={divergente} unidad={unidadActual} loading={loading} />
        <div style={{ display: 'grid', gap: 14 }}>
          <RankList title={divergente ? 'Mayor tensión' : 'Más alto'} items={top} escala={escala} divergente={divergente} unidad={unidadActual} alto />
          <RankList title={divergente ? 'Menor tensión' : 'Más bajo'} items={bottom} escala={escala} divergente={divergente} unidad={unidadActual} />
          {escala && (
            <div style={{ fontSize: 11, color: '#777', lineHeight: 1.5 }}>
              {escala.con_dato} de {escala.total} colonias con dato. Clic en una para centrar el mapa.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── LEYENDA de color (min ↔ max) ─────────────────────────────────────────────
function Legend({ escala, divergente, unidad }) {
  if (!escala) return null;
  const grad = divergente
    ? 'linear-gradient(90deg, rgb(220,70,60), rgb(90,95,110), rgb(34,197,94))'
    : 'linear-gradient(90deg, rgb(120,140,230), rgb(67,56,202))';
  return (
    <div style={{ minWidth: 220 }}>
      <div style={{ height: 10, borderRadius: 6, background: grad, border: '1px solid rgba(255,255,255,0.12)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#888', marginTop: 4 }}>
        <span>{fmtVal(escala.min, unidad)}</span>
        {divergente && <span style={{ color: '#999' }}>0</span>}
        <span>{fmtVal(escala.max, unidad)}</span>
      </div>
      <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
        {divergente ? 'rojo = sobreoferta · verde = oportunidad' : 'claro → intenso a más valor'}
      </div>
    </div>
  );
}

// ── LISTA Mayor / Menor ──────────────────────────────────────────────────────
function RankList({ title, items, escala, divergente, unidad, alto }) {
  if (!items || items.length === 0) {
    return (
      <Card style={{ ...card, padding: '12px 14px' }}>
        <div style={{ ...lbl, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 12, color: '#777' }}>Sin colonias con dato.</div>
      </Card>
    );
  }
  return (
    <Card style={{ ...card, padding: '12px 14px' }}>
      <div style={{ ...lbl, marginBottom: 8, color: alto && divergente ? '#22c55e' : (alto ? 'var(--theme)' : '#888') }}>{title}</div>
      <div style={{ display: 'grid', gap: 2 }}>
        {items.map((it, i) => {
          const c = colorFor(it.valor, escala, divergente);
          return (
            <button
              key={(it.nombre || i) + '-' + i}
              onClick={() => window.dispatchEvent(new CustomEvent('heatmap-focus', { detail: it.nombre }))}
              title="Centrar el mapa aquí"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                padding: '5px 6px', borderRadius: 6, width: '100%',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ width: 9, height: 9, borderRadius: 9999, background: c, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.nombre}</span>
              </span>
              <span style={{ fontSize: 12, color: '#fff', fontWeight: 700, flexShrink: 0 }}>{fmtVal(it.valor, unidad)}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ── EL MAPA (maplibre LAZY, mismo patrón que LugaresMap) ─────────────────────
function HeatMap({ puntos, escala, divergente, unidad, loading }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const mlRef = useRef(null);
  const markersRef = useRef([]);
  const [ready, setReady] = useState(0);
  const [failed, setFailed] = useState(false);

  const pts = useMemo(
    () => (puntos || []).filter((p) => p && p.lat != null && p.lng != null && isFinite(p.lat) && isFinite(p.lng)),
    [puntos],
  );

  // montar el mapa una vez
  useEffect(() => {
    let cancelled = false;
    if (!ref.current || mapRef.current) return undefined;
    import('maplibre-gl').then((mod) => {
      if (cancelled || !ref.current || mapRef.current) return;
      const maplibregl = mod.default || mod;
      mlRef.current = maplibregl;
      try {
        const map = new maplibregl.Map({
          container: ref.current,
          style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
          center: CDMX_CENTER, zoom: CDMX_ZOOM, attributionControl: false,
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        map.on('load', () => { if (!cancelled) { mapRef.current = map; setReady((r) => r + 1); } });
      } catch (e) { setFailed(true); }
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; if (mapRef.current) { try { mapRef.current.remove(); } catch (e) { /* noop */ } mapRef.current = null; } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // (re)pintar los marcadores cuando cambian los puntos / escala
  useEffect(() => {
    const map = mapRef.current; const maplibregl = mlRef.current;
    if (!map || !maplibregl) return;
    markersRef.current.forEach((m) => { try { m.remove(); } catch (e) { /* noop */ } });
    markersRef.current = [];
    pts.forEach((p) => {
      const r = radiusFor(p, escala);
      const c = colorFor(p.valor, escala, divergente);
      const el = document.createElement('div');
      el.style.cssText = `width:${r}px;height:${r}px;border-radius:9999px;background:${c};opacity:.82;`
        + 'border:1px solid rgba(255,255,255,0.55);cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.45);';
      const safe = (s) => String(s == null ? '' : s).replace(/</g, '&lt;');
      const extra = (p.oferta != null || p.demanda != null)
        ? `<div style="color:#A2A6BC;font-size:11px;margin-top:2px;">oferta ${p.oferta ?? '—'} · demanda ${p.demanda ?? '—'}</div>` : '';
      const html = `<div style="font-family:'DM Sans',sans-serif;max-width:200px;">`
        + `<div style="font-weight:700;font-size:12.5px;color:#3A3E55;">${safe(p.nombre)}</div>`
        + `<div style="color:#0E7A53;font-weight:800;font-size:12px;margin-top:2px;">${safe(fmtVal(p.valor, unidad))}</div>`
        + `${p.alcaldia ? `<div style="color:#A2A6BC;font-size:11px;">${safe(p.alcaldia)}</div>` : ''}${extra}</div>`;
      const popup = new maplibregl.Popup({ offset: 12, closeButton: false }).setHTML(html);
      try {
        const mk = new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).setPopup(popup).addTo(map);
        el.addEventListener('mouseenter', () => { try { if (!popup.isOpen()) mk.togglePopup(); } catch (e) { /* noop */ } });
        el.addEventListener('mouseleave', () => { try { if (popup.isOpen()) mk.togglePopup(); } catch (e) { /* noop */ } });
        markersRef.current.push(mk);
      } catch (e) { /* noop */ }
    });
  }, [pts, escala, divergente, unidad, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // centrar el mapa cuando una colonia de la lista pide foco
  useEffect(() => {
    const onFocus = (ev) => {
      const map = mapRef.current; if (!map) return;
      const name = ev.detail;
      const p = pts.find((x) => x.nombre === name);
      if (p) { try { map.flyTo({ center: [p.lng, p.lat], zoom: 13.5, duration: 600 }); } catch (e) { /* noop */ } }
    };
    window.addEventListener('heatmap-focus', onFocus);
    return () => window.removeEventListener('heatmap-focus', onFocus);
  }, [pts]);

  // si maplibre no montó: degradar a un aviso (las listas top/bottom ya cubren la lectura)
  if (failed) {
    return (
      <Card style={{ ...card, height: 480, display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center', color: '#888', fontSize: 12.5, maxWidth: 280 }}>
          El mapa no cargó. Usa las listas de la derecha (Mayor / Menor tensión) para la lectura.
        </div>
      </Card>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={ref}
        style={{ width: '100%', height: 480, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.10)', background: '#0c0e16' }}
      />
      {ready === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#888', fontSize: 12.5, pointerEvents: 'none' }}>
          Cargando mapa…
        </div>
      )}
      {ready > 0 && pts.length === 0 && !loading && (
        <div style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(12,14,22,0.85)', color: '#aaa', fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
          Ninguna colonia con dato para esta selección.
        </div>
      )}
    </div>
  );
}
