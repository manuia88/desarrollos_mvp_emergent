/**
 * SuperadminVigia — el robot que ronda tu carpeta maestra de Drive cada hora ($0, sin IA)
 * + Prototipos v2 (el código mide, la IA bautiza). Embebido en "Desarrolladores y carga".
 * Bandeja: nada se ingiere sin tu clic — aprobar = OK de gasto, con linaje completo.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Radar, Check, X, RefreshCw, FolderPlus, Boxes, Sparkles } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;
const _j = async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.detail || `HTTP ${r.status}`); return r.json(); };
const _get = (p) => fetch(`${API}/api/superadmin${p}`, { credentials: 'include' }).then(_j);
const _post = (p, body) => fetch(`${API}/api/superadmin${p}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(_j);

const card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '16px 18px' };
const p13 = { fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.75)', margin: 0 };
const mini = { fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.5)' };
const h3 = { fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)', margin: '0 0 4px' };
const btn = (tone = 'theme') => ({
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 9, cursor: 'pointer',
  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
  background: tone === 'ok' ? 'rgba(74,222,128,0.12)' : tone === 'no' ? 'rgba(248,113,113,0.1)' : 'rgba(var(--theme-rgb),0.14)',
  border: `1px solid ${tone === 'ok' ? 'rgba(74,222,128,0.45)' : tone === 'no' ? 'rgba(248,113,113,0.4)' : 'rgba(var(--theme-rgb),0.4)'}`,
  color: tone === 'ok' ? '#86efac' : tone === 'no' ? '#fca5a5' : 'var(--theme)',
});
const inp = { flex: 1, minWidth: 220, padding: '9px 11px', borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, outline: 'none' };

const TIPO_HUMANO = {
  dev_nuevo: ['🏢', 'Desarrollador nuevo detectado'],
  proyecto_nuevo: ['📁', 'Carpeta de proyecto nueva'],
  lista_nueva: ['📄', 'Lista de precios nueva'],
  lista_cambiada: ['✏️', 'Lista de precios CAMBIÓ'],
  acceso_roto: ['⚠️', 'Perdimos acceso a este dev'],
};

const _put = (p, body) => fetch(`${API}/api/superadmin${p}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(_j);

/* ── EL MANIFIESTO: tu carpeta → el dev de la plataforma + su patrón ── */
function Manifiesto({ pendientes, fuentes, onChanged }) {
  const [data, setData] = useState(null);
  const [sel, setSel] = useState({});        // dev_carpeta → dev_org_id elegido
  const [notas, setNotas] = useState({});    // dev_carpeta → patrón
  const [msg, setMsg] = useState('');
  const cargar = useCallback(() => _get('/vigia/manifiesto').then(setData).catch((e) => setMsg(String(e.message))), []);
  useEffect(() => { cargar(); }, [cargar]);
  if (!data) return null;

  const mapeados = new Set(data.mapeos.map((m) => m.dev_carpeta));
  // carpetas detectadas por el robot que AÚN no tienen dueño en la plataforma
  const sinMapear = [...new Set(pendientes.filter((p) => p.dev && !mapeados.has(p.dev)).map((p) => JSON.stringify({ c: p.dev, f: p.dev_folder_id, fu: p.fuente_id })))].map((s) => JSON.parse(s));

  const guardar = async (carpeta, folderId, fuenteId) => {
    const dev = sel[carpeta];
    if (!dev) { setMsg(`Elige a qué desarrollador corresponde "${carpeta}".`); return; }
    try {
      const body = { fuente_id: fuenteId || fuentes?.[0]?.id, dev_carpeta: carpeta, dev_folder_id: folderId || '', patron_notas: notas[carpeta] || '' };
      if (dev === '__crear__') body.crear_dev_nombre = carpeta;   // crea el dev AL VUELO con el nombre de la carpeta
      else body.dev_org_id = dev;
      const r = await _put('/vigia/manifiesto', body);
      setMsg(`"${carpeta}" mapeado ✓${r.dev_creado ? ' (dev creado — link de reclamo en Directorio)' : ''}`);
      cargar(); onChanged();
    } catch (e) { setMsg(String(e.message)); }
  };

  if (!sinMapear.length && !data.mapeos.length) return null;
  return (
    <div style={card}>
      <div style={h3}>El manifiesto (quién es quién)</div>
      <p style={p13}>Así sabe el sistema que tu carpeta "DESARROLLOS-CLASS" es el dev <i>class</i> y que sus proyectos van a su catálogo. Se declara UNA vez por dev; sin mapeo, nada se ingiere (nada cae a un costal genérico).</p>
      {msg && <p style={{ ...p13, marginTop: 6, color: msg.includes('✓') ? '#86efac' : '#fca5a5' }}>{msg}</p>}
      {sinMapear.map(({ c, f, fu }) => (
        <div key={c} style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '10px 0', display: 'grid', gap: 6 }}>
          <div style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, color: '#d29922' }}>📂 {c} <span style={{ ...mini }}>· sin mapear</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select data-testid={`map-sel-${c}`} style={{ ...inp, maxWidth: 300 }} value={sel[c] || ''} onChange={(e) => setSel({ ...sel, [c]: e.target.value })}>
              <option value="">¿Qué desarrollador de la plataforma es?</option>
              <option value="__crear__">➕ No existe — créalo con este nombre ({c})</option>
              {data.devs_plataforma.map((d) => <option key={d.dev_org_id} value={d.dev_org_id}>{d.name}</option>)}
            </select>
            <button style={btn('ok')} data-testid={`map-ok-${c}`} onClick={() => guardar(c, f, fu)}><Check size={13} /> Mapear</button>
          </div>
          <input style={inp} placeholder="Patrón de este dev (opcional): cómo organiza sus carpetas, dónde pone las listas, qué ignorar… (la IA lo leerá al ingerir)"
            value={notas[c] || ''} onChange={(e) => setNotas({ ...notas, [c]: e.target.value })} />
          <span style={mini}>Si no aparece en la lista: créalo primero en «Alta manual» y regresa aquí.</span>
        </div>
      ))}
      {data.mapeos.map((m) => (
        <div key={m.dev_carpeta} style={{ ...mini, borderTop: '1px solid rgba(255,255,255,0.05)', padding: '7px 0' }}>
          ✓ {m.dev_carpeta} → <b style={{ color: 'var(--cream)' }}>{(data.devs_plataforma.find((d) => d.dev_org_id === m.dev_org_id) || {}).name || m.dev_org_id}</b>
          {m.patron_notas ? ` · patrón: "${m.patron_notas.slice(0, 80)}${m.patron_notas.length > 80 ? '…' : ''}"` : ''}
        </div>
      ))}
    </div>
  );
}

/* ── Telegram: tarjetas de decisión en el celular ── */
function TelegramCard() {
  const [tg, setTg] = useState(null);
  useEffect(() => { _get('/vigia/telegram').then(setTg).catch(() => setTg(null)); }, []);
  if (!tg) return null;
  return (
    <div style={{ ...card, borderColor: tg.vinculado ? 'rgba(74,222,128,0.35)' : 'rgba(255,255,255,0.1)' }}>
      <div style={h3}>📱 Telegram {tg.vinculado ? <span style={{ color: '#86efac', fontSize: 12 }}>· vinculado ✓</span> : ''}</div>
      {tg.vinculado ? (
        <p style={p13}>Las tarjetas de decisión te llegan al celular con contexto y botones. Comandos: /pendientes · /ronda · /estado.</p>
      ) : !tg.token_configurado ? (
        <p style={p13}>Para aprobar desde el celular: abre Telegram → <b>@BotFather</b> → <code>/newbot</code> → pega el token en <code>backend/.env</code> como <code>TELEGRAM_BOT_TOKEN=…</code> y reinicia. Luego regresa aquí por tu código de vínculo.</p>
      ) : (
        <p style={p13}>Bot encendido. En Telegram, mándale a tu bot: <b><code>/vincular {tg.bind_code}</code></b> — y las tarjetas de decisión empiezan a llegarte.</p>
      )}
    </div>
  );
}

export function VigiaTab() {
  const [estado, setEstado] = useState(null);
  const [pend, setPend] = useState(null);
  const [url, setUrl] = useState('');
  const [msg, setMsg] = useState('');
  const [rondando, setRondando] = useState(false);

  const cargar = useCallback(() => {
    _get('/vigia').then(setEstado).catch((e) => setMsg(String(e.message)));
    _get('/vigia/pendientes').then((d) => setPend(d.pendientes)).catch(() => setPend([]));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const agregar = async () => {
    if (!url.trim()) { setMsg('Pega el link de tu carpeta maestra de Drive.'); return; }
    try { await _post('/vigia/fuentes', { url: url.trim() }); setUrl(''); setMsg('Carpeta registrada ✓ — corre la primera ronda.'); cargar(); }
    catch (e) { setMsg(String(e.message)); }
  };
  const ronda = async () => {
    setRondando(true); setMsg('');
    try {
      const r = await _post('/vigia/ronda');
      setMsg(`Ronda lista: ${r.eventos} evento(s), ${r.pendientes_nuevos} pendiente(s) nuevos${r.errores?.length ? ` · ⚠ ${r.errores[0].error}` : ''}`);
      cargar();
    } catch (e) { setMsg(String(e.message)); }
    setRondando(false);
  };
  const resolver = async (id, accion) => {
    try { await _post(`/vigia/pendientes/${id}/${accion}`, accion === 'rechazar' ? { razon: '' } : undefined); cargar(); }
    catch (e) { setMsg(String(e.message)); }
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={card}>
        <div style={h3}><Radar size={15} style={{ verticalAlign: -2, marginRight: 6 }} color="var(--theme)" />El robot vigía</div>
        <p style={p13}>Ronda tu carpeta maestra cada hora (solo nombres, fechas y huellas — <b>$0, sin IA</b>). Si un dev cambia una lista o sube un proyecto, te llega campana + correo y aparece aquí abajo para tu aprobación. Nada se procesa sin tu clic.</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input data-testid="vigia-url" style={inp} placeholder="Link de tu carpeta maestra de Drive (con los accesos directos de tus devs)" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button style={btn()} data-testid="vigia-agregar" onClick={agregar}><FolderPlus size={13} /> Vigilar carpeta</button>
          <button style={btn()} data-testid="vigia-ronda" onClick={ronda} disabled={rondando}><RefreshCw size={13} /> {rondando ? 'Rondando…' : 'Correr ronda ahora'}</button>
        </div>
        {msg && <p style={{ ...p13, marginTop: 8, color: msg.includes('✓') || msg.startsWith('Ronda') ? '#86efac' : '#fca5a5' }}>{msg}</p>}
        {estado?.fuentes?.filter((f) => f.activa).map((f) => (
          <div key={f.id} style={{ ...mini, marginTop: 8 }}>
            👁 {f.nombre} · vigilada cada {f.cadencia_min} min · última ronda: {f.last_ronda_at ? new Date(f.last_ronda_at).toLocaleString('es-MX') : 'nunca (corre una ahora)'}
          </div>
        ))}
        {estado?.salud_devs?.length > 0 && (
          <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
            <span style={{ ...mini, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6 }}>Conexión por desarrollador</span>
            {estado.salud_devs.map((d) => (
              <span key={d.dev} style={{ ...mini, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.ok ? '#4ADE80' : (d.fails >= 2 ? '#f87171' : '#d29922'), display: 'inline-block' }} />
                <b style={{ color: 'var(--cream)' }}>{d.dev}</b> · {d.ok ? `sincronizado (${d.archivos} archivos)` : d.fails >= 2 ? 'SIN ACCESO — revisar permiso' : 'falla transitoria, reintentando'} · foto: {d.ultima_foto ? new Date(d.ultima_foto).toLocaleString('es-MX') : '—'}
              </span>
            ))}
          </div>
        )}
      </div>

      <TelegramCard />

      {pend?.length > 0 && <Manifiesto pendientes={pend} fuentes={estado?.fuentes} onChanged={cargar} />}

      <div style={card}>
        <div style={h3}>Bandeja de aprobación {pend?.length > 0 && <span style={{ color: '#d29922' }}>({pend.length})</span>}</div>
        {pend === null ? <p style={p13}>Cargando…</p> : pend.length === 0 ? (
          <p style={p13}>Sin pendientes. Cuando el robot encuentre algo, aparece aquí (y te llega correo).</p>
        ) : pend.map((x) => {
          const [emoji, titulo] = TIPO_HUMANO[x.tipo] || ['•', x.tipo];
          return (
            <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.07)', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 240, flex: 1 }}>
                <div style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>{emoji} {titulo}</div>
                <div style={{ ...mini, marginTop: 2 }}>
                  {x.dev}{x.proyecto ? ` · ${x.proyecto}` : ''}{x.archivo ? ` · ${x.archivo.nombre}` : ''}
                  {x.archivo?.modificado ? ` · modificado ${new Date(x.archivo.modificado).toLocaleString('es-MX')}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={btn('ok')} data-testid={`vp-ok-${x.id}`} onClick={() => resolver(x.id, 'aprobar')} title={x.tipo === 'acceso_roto' ? 'Enterado' : 'Aprueba y dispara la ingesta de ese proyecto (esto sí usa IA)'}>
                  <Check size={13} /> {x.tipo === 'acceso_roto' ? 'Enterado' : 'Aprobar e ingerir'}
                </button>
                <button style={btn('no')} onClick={() => resolver(x.id, 'rechazar')}><X size={13} /> Ignorar</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PrototiposTab() {
  const [res, setRes] = useState(null);
  const [msg, setMsg] = useState('');
  const [corriendo, setCorriendo] = useState(false);
  const cargar = useCallback(() => _get('/prototipos/resumen').then(setRes).catch((e) => setMsg(String(e.message))), []);
  useEffect(() => { cargar(); }, [cargar]);

  const rederivar = async (bautizar) => {
    setCorriendo(true); setMsg('');
    try {
      const r = await _post('/prototipos/rederivar', { bautizar_ia: bautizar });
      setMsg(`Listo: ${r.prototipos} prototipos en ${r.desarrollos} desarrollos · ${r.unidades} unidades asignadas · ${r.cuarentena} en cuarentena.`);
      cargar();
    } catch (e) { setMsg(String(e.message)); }
    setCorriendo(false);
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={card}>
        <div style={h3}><Boxes size={15} style={{ verticalAlign: -2, marginRight: 6 }} color="var(--theme)" />Prototipos (los moldes de cada desarrollo)</div>
        <p style={p13}>El código agrupa las unidades que son el mismo molde (recámaras + baños + m² ±3%). La IA solo les pone nombre. Lo ambiguo cae a cuarentena — no se inventa nada.</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button style={btn()} data-testid="proto-rederivar" onClick={() => rederivar(false)} disabled={corriendo}><RefreshCw size={13} /> Re-derivar (gratis)</button>
          <button style={btn()} data-testid="proto-bautizar" onClick={() => rederivar(true)} disabled={corriendo} title="La IA nombra cada molde en humano — cuesta centavos"><Sparkles size={13} /> Re-derivar + bautizar con IA</button>
        </div>
        {msg && <p style={{ ...p13, marginTop: 8, color: msg.startsWith('Listo') ? '#86efac' : '#fca5a5' }}>{msg}</p>}
        {res && <p style={{ ...mini, marginTop: 6 }}>{res.total_prototipos} prototipos · {res.unidades_en_cuarentena} unidades en cuarentena</p>}
      </div>
      {res?.desarrollos?.map((d) => (
        <div key={d.development_id} style={card}>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13.5, color: 'var(--cream)', marginBottom: 6 }}>{d.nombre} <span style={mini}>· {d.prototipos.length} prototipos · {d.n_unidades} unidades</span></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {d.prototipos.map((p) => (
              <span key={p.prototype_id} title={`confianza ${p.confianza}${p.m2_min ? ` · ${p.m2_min}–${p.m2_max} m²` : ''}`}
                style={{ fontFamily: 'DM Sans', fontSize: 11.5, padding: '4px 10px', borderRadius: 9999,
                  background: p.confianza === 'alta' ? 'rgba(74,222,128,0.1)' : 'rgba(210,153,34,0.1)',
                  border: `1px solid ${p.confianza === 'alta' ? 'rgba(74,222,128,0.4)' : 'rgba(210,153,34,0.4)'}`,
                  color: p.confianza === 'alta' ? '#86efac' : '#d29922' }}>
                {p.nombre} · {p.unidades_total}u{p.precio_desde_mxn ? ` · desde $${(p.precio_desde_mxn / 1e6).toFixed(1)}M` : ''}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
