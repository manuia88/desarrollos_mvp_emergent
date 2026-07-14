/**
 * SuperadminInvestorRoom — SALA DE INVERSIONISTAS (perfil YC/VC).
 * La regla: VERIFICABLE, no slideware. Cada número muestra su fuente (código, catastro, git,
 * costo medido) o está marcado como SUPUESTO editable. Los bloques que más pesan para YC
 * (entrevistas con usuarios y pipeline de pilotos) son registro vivo, no decoración.
 * Tabs deep-linkables con ?tab= (mismo patrón que los hubs).
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Rocket, Users, HeartHandshake, Calculator, ClipboardCheck, PlayCircle, RefreshCw } from 'lucide-react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';

const API = process.env.REACT_APP_BACKEND_URL;
const BASE = `${API}/api/superadmin/investor-room`;
const _j = async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.detail || `HTTP ${r.status}`); return r.json(); };
const _get = (p) => fetch(`${BASE}${p}`, { credentials: 'include' }).then(_j);
const _send = (p, method, body) => fetch(`${BASE}${p}`, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(_j);

const fmt = (n) => (n === null || n === undefined) ? '—' : Number(n).toLocaleString('es-MX');
const S = {
  h2: { fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: '0 0 4px' },
  p: { fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.75)', margin: 0 },
  fuente: { fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.5)', fontStyle: 'italic' },
  card: { border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 16, background: 'rgba(255,255,255,0.03)' },
  big: { fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)' },
  input: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: '7px 10px', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, width: '100%' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, background: 'rgba(var(--theme-rgb),0.14)', border: '1px solid rgba(var(--theme-rgb),0.4)', color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, cursor: 'pointer' },
};

const TABS = [
  { id: 'resumen', nombre: 'Resumen', Icon: Rocket },
  { id: 'entrevistas', nombre: 'Entrevistas', Icon: Users },
  { id: 'pilotos', nombre: 'Pilotos', Icon: HeartHandshake },
  { id: 'numeros', nombre: 'Números', Icon: Calculator },
  { id: 'checklist', nombre: 'Checklist', Icon: ClipboardCheck },
  { id: 'demo', nombre: 'Demo', Icon: PlayCircle },
];

function Semaforo({ ok }) {
  return <span style={{ width: 10, height: 10, borderRadius: '50%', display: 'inline-block', background: ok ? '#4ADE80' : '#f87171', boxShadow: `0 0 6px ${ok ? '#4ADE8088' : '#f8717188'}` }} />;
}

/* ── Resumen: el semáforo YC con drill (por qué importa cada criterio) ── */
function TabResumen({ r }) {
  const yc = r.yc;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        <div>
          <div style={S.big}>{yc.score}%</div>
          <div style={S.p}>listo para aplicar a YC ({yc.hechos} de {yc.de} criterios)</div>
        </div>
        <div style={{ flex: 1, minWidth: 260, display: 'grid', gap: 8 }}>
          {yc.criterios.map((c) => (
            <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <Semaforo ok={c.ok} />
              <div>
                <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, color: 'var(--cream)' }}>{c.nombre}</span>
                <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: c.ok ? '#4ADE80' : '#fca5a5', marginLeft: 8 }}>{c.valor}</span>
                <div style={{ ...S.p, fontSize: 11 }}>{c.por_que}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div style={S.card}>
          <div style={S.h2}>Precio de lista por cliente</div>
          <div style={S.big}>${fmt(r.economia.ticket_full_stack_mxn_mes)} <span style={{ fontSize: 13 }}>MXN/mes</span></div>
          <p style={S.p}>{r.economia.features_con_precio} funciones con precio declarado en el código</p>
          <p style={S.fuente}>Fuente: {r.economia.fuente}</p>
        </div>
        <div style={S.card}>
          <div style={S.h2}>Mercado obtenible (3 años)</div>
          <div style={S.big}>${fmt(r.tam.obtenible_mxn_anual)} <span style={{ fontSize: 13 }}>MXN/año</span></div>
          <p style={S.p}>de un universo de ${fmt(r.tam.universo_mxn_anual)} — supuestos editables en «Números»</p>
          <p style={S.fuente}>Fuente: {r.tam.fuente}</p>
        </div>
        <div style={S.card}>
          <div style={S.h2}>Velocidad de construcción</div>
          <div style={S.big}>{fmt(r.velocity.commits_8_semanas)} <span style={{ fontSize: 13 }}>commits / 8 sem</span></div>
          <p style={S.p}>1 founder + IA. Verificable en el historial del repo.</p>
          <p style={S.fuente}>Fuente: {r.velocity.fuente}</p>
        </div>
        <div style={S.card}>
          <div style={S.h2}>Gasto mensual (burn)</div>
          <div style={S.big}>${fmt(r.burn.burn_total_mxn_mes)} <span style={{ fontSize: 13 }}>MXN/mes</span></div>
          <p style={S.p}>{r.burn.runway_meses ? `Caja para ${r.burn.runway_meses} meses` : 'Pon tu caja en «Números» para calcular cuántos meses aguantas'}</p>
          <p style={S.fuente}>Fuente: {r.burn.fuente}</p>
        </div>
      </div>
    </div>
  );
}

/* ── Entrevistas: el registro que responde "¿cómo sabes que lo necesitan?" ── */
function TabEntrevistas({ onChanged }) {
  const [rows, setRows] = useState(null);
  const [f, setF] = useState({ nombre: '', rol: 'desarrollador', dolor: '', frase: '', aprendizaje: '', siguiente_paso: '' });
  const [msg, setMsg] = useState('');
  const cargar = useCallback(() => _get('/entrevistas').then((d) => setRows(d.entrevistas)).catch((e) => setMsg(String(e.message))), []);
  useEffect(() => { cargar(); }, [cargar]);
  const guardar = async () => {
    if (f.nombre.length < 2 || f.dolor.length < 3) { setMsg('Nombre y dolor son obligatorios.'); return; }
    try { await _send('/entrevistas', 'POST', f); setF({ nombre: '', rol: f.rol, dolor: '', frase: '', aprendizaje: '', siguiente_paso: '' }); setMsg('Guardada ✓'); cargar(); onChanged(); }
    catch (e) { setMsg(String(e.message)); }
  };
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={S.card}>
        <div style={S.h2}>Registrar entrevista</div>
        <p style={S.p}>YC pregunta literal: <i>«¿cómo sabes que la gente lo necesita?»</i>. La única respuesta buena es este registro. Meta: 10.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginTop: 10 }}>
          <input data-testid="ent-nombre" style={S.input} placeholder="¿Con quién hablaste?" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
          <select style={S.input} value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value })}>
            {['desarrollador', 'asesor', 'inmobiliaria', 'comprador', 'inversionista', 'fondo', 'otro'].map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <input style={{ ...S.input, gridColumn: '1 / -1' }} placeholder="Su dolor, con sus palabras (obligatorio)" value={f.dolor} onChange={(e) => setF({ ...f, dolor: e.target.value })} />
          <input style={{ ...S.input, gridColumn: '1 / -1' }} placeholder="Frase textual (cita — oro para YC)" value={f.frase} onChange={(e) => setF({ ...f, frase: e.target.value })} />
          <input style={S.input} placeholder="Qué aprendí / qué cambia en el producto" value={f.aprendizaje} onChange={(e) => setF({ ...f, aprendizaje: e.target.value })} />
          <input style={S.input} placeholder="Siguiente paso con esta persona" value={f.siguiente_paso} onChange={(e) => setF({ ...f, siguiente_paso: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
          <button data-testid="ent-guardar" style={S.btn} onClick={guardar}>Guardar entrevista</button>
          {msg && <span style={{ ...S.p, color: msg.includes('✓') ? '#4ADE80' : '#fca5a5' }}>{msg}</span>}
        </div>
      </div>
      {rows === null ? <p style={S.p}>Cargando…</p> : rows.length === 0 ? (
        <p style={S.p}>Aún no hay entrevistas registradas. Esta es la tarea #1 — más importante que cualquier pantalla.</p>
      ) : rows.map((r) => (
        <div key={r.id} style={S.card}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <b style={{ fontFamily: 'Outfit', color: 'var(--cream)', fontSize: 14 }}>{r.nombre}</b>
            <span style={{ ...S.p, fontSize: 11 }}>{r.rol} · {r.fecha}</span>
          </div>
          <p style={{ ...S.p, marginTop: 6 }}><b style={{ color: 'var(--cream)' }}>Dolor:</b> {r.dolor}</p>
          {r.frase && <p style={{ ...S.p, fontStyle: 'italic', color: '#d29922' }}>«{r.frase}»</p>}
          {r.aprendizaje && <p style={S.p}><b style={{ color: 'var(--cream)' }}>Aprendí:</b> {r.aprendizaje}</p>}
          {r.siguiente_paso && <p style={S.p}><b style={{ color: 'var(--cream)' }}>Siguiente:</b> {r.siguiente_paso}</p>}
        </div>
      ))}
    </div>
  );
}

/* ── Pilotos: pipeline honesto por etapa ── */
function TabPilotos({ onChanged }) {
  const [data, setData] = useState(null);
  const [f, setF] = useState({ organizacion: '', tipo: 'dev', contacto: '', notas: '', proxima_accion: '' });
  const [msg, setMsg] = useState('');
  const cargar = useCallback(() => _get('/pipeline').then(setData).catch((e) => setMsg(String(e.message))), []);
  useEffect(() => { cargar(); }, [cargar]);
  const agregar = async () => {
    if (f.organizacion.length < 2) { setMsg('Pon el nombre de la organización.'); return; }
    try { await _send('/pipeline', 'POST', f); setF({ organizacion: '', tipo: f.tipo, contacto: '', notas: '', proxima_accion: '' }); setMsg('Agregado ✓'); cargar(); onChanged(); }
    catch (e) { setMsg(String(e.message)); }
  };
  const mover = async (id, etapa) => { try { await _send(`/pipeline/${id}`, 'PATCH', { etapa }); cargar(); onChanged(); } catch (e) { setMsg(String(e.message)); } };
  if (!data) return <p style={S.p}>{msg || 'Cargando…'}</p>;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={S.card}>
        <div style={S.h2}>Agregar prospecto</div>
        <p style={S.p}>3-5 «design partners» con carta de intención valen más que todo el deck. Aquí se rastrea sin humo — «no avanzó» también se registra.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginTop: 10 }}>
          <input data-testid="pros-org" style={S.input} placeholder="Organización" value={f.organizacion} onChange={(e) => setF({ ...f, organizacion: e.target.value })} />
          <select style={S.input} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
            {['dev', 'inmobiliaria', 'asesor', 'fondo', 'otro'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input style={S.input} placeholder="Contacto" value={f.contacto} onChange={(e) => setF({ ...f, contacto: e.target.value })} />
          <input style={S.input} placeholder="Próxima acción" value={f.proxima_accion} onChange={(e) => setF({ ...f, proxima_accion: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
          <button data-testid="pros-agregar" style={S.btn} onClick={agregar}>Agregar</button>
          {msg && <span style={{ ...S.p, color: msg.includes('✓') ? '#4ADE80' : '#fca5a5' }}>{msg}</span>}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        {data.etapas.map((et) => {
          const en = data.prospectos.filter((p) => p.etapa === et.id);
          return (
            <div key={et.id} style={{ ...S.card, padding: 12 }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 12.5, color: 'var(--cream)' }}>{et.nombre} <span style={{ opacity: 0.6 }}>({en.length})</span></div>
              <p style={{ ...S.p, fontSize: 10.5, marginBottom: 8 }}>{et.des}</p>
              {en.map((p) => (
                <div key={p.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9, padding: 8, marginBottom: 6 }}>
                  <div style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, color: 'var(--cream)' }}>{p.organizacion} <span style={{ opacity: 0.55, fontWeight: 400 }}>· {p.tipo}</span></div>
                  {p.proxima_accion && <div style={{ ...S.p, fontSize: 10.5 }}>→ {p.proxima_accion}</div>}
                  <select style={{ ...S.input, marginTop: 6, padding: '4px 6px', fontSize: 11 }} value={p.etapa} onChange={(e) => mover(p.id, e.target.value)}>
                    {data.etapas.map((e2) => <option key={e2.id} value={e2.id}>{e2.nombre}</option>)}
                  </select>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Números: economía, TAM con supuestos editables, velocity, burn, métricas norte ── */
function TabNumeros({ r, onChanged }) {
  const [sup, setSup] = useState(r.supuestos);
  const [msg, setMsg] = useState('');
  const guardar = async () => {
    try {
      const num = Object.fromEntries(Object.entries(sup).map(([k, v]) => [k, Number(v) || 0]));
      await _send('/supuestos', 'PATCH', num); setMsg('Supuestos guardados ✓'); onChanged();
    } catch (e) { setMsg(String(e.message)); }
  };
  const SUP_LABEL = {
    devs_cdmx: 'Desarrolladoras en CDMX (universo)', inmobiliarias_cdmx: 'Inmobiliarias en CDMX (universo)',
    pct_alcanzable: '% alcanzable en 3 años', pct_obtenible: '% del alcanzable que se convierte',
    precio_dev_mxn: 'Ticket mensual desarrollador (MXN)', precio_inmo_mxn: 'Ticket mensual inmobiliaria (MXN)',
    burn_fijo_mxn: 'Gastos fijos al mes (MXN)', caja_mxn: 'Caja disponible (MXN)',
  };
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={S.card}>
        <div style={S.h2}>Economía por cliente <span style={{ ...S.fuente }}>— del código, no de un Excel</span></div>
        <div style={S.big}>${fmt(r.economia.ticket_full_stack_mxn_mes)} MXN/mes</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {r.economia.por_categoria.map((c) => (
            <span key={c.categoria} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(240,235,224,0.8)', fontFamily: 'DM Sans' }}>
              {c.categoria}: {c.n} funciones · ${fmt(c.mxn_mes)}
            </span>
          ))}
        </div>
      </div>
      <div style={S.card}>
        <div style={S.h2}>Tamaño de mercado (bottom-up) <span style={S.fuente}>— {fmt(r.tam.predios_con_dato)} predios propios de respaldo</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, margin: '8px 0' }}>
          <div><div style={S.p}>Universo</div><div style={{ ...S.big, fontSize: 20 }}>${fmt(r.tam.universo_mxn_anual)}/año</div></div>
          <div><div style={S.p}>Alcanzable ({sup.pct_alcanzable}%)</div><div style={{ ...S.big, fontSize: 20 }}>${fmt(r.tam.alcanzable_mxn_anual)}/año</div></div>
          <div><div style={S.p}>Obtenible ({sup.pct_obtenible}% del alcanzable)</div><div style={{ ...S.big, fontSize: 20, color: '#4ADE80' }}>${fmt(r.tam.obtenible_mxn_anual)}/año</div></div>
        </div>
        <p style={{ ...S.p, fontSize: 11.5 }}>{r.tam.nota}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8, marginTop: 10 }}>
          {Object.entries(SUP_LABEL).map(([k, label]) => (
            <label key={k} style={{ ...S.p, fontSize: 11 }}>
              {label} <span style={{ opacity: 0.5 }}>(supuesto)</span>
              <input data-testid={`sup-${k}`} style={{ ...S.input, marginTop: 3 }} type="number" value={sup[k]} onChange={(e) => setSup({ ...sup, [k]: e.target.value })} />
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
          <button style={S.btn} onClick={guardar}>Guardar supuestos</button>
          {msg && <span style={{ ...S.p, color: msg.includes('✓') ? '#4ADE80' : '#fca5a5' }}>{msg}</span>}
        </div>
      </div>
      <div style={S.card}>
        <div style={S.h2}>Velocidad (git, verificable)</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 70, marginTop: 8 }}>
          {r.velocity.por_semana.map((w) => {
            const max = Math.max(...r.velocity.por_semana.map((x) => x.commits), 1);
            return <div key={w.semana} title={`${w.semana}: ${w.commits} commits`} style={{ flex: 1, background: 'rgba(var(--theme-rgb),0.5)', borderRadius: '4px 4px 0 0', height: `${Math.max(8, (w.commits / max) * 100)}%` }} />;
          })}
        </div>
        <p style={{ ...S.p, fontSize: 11 }}>{fmt(r.velocity.commits_8_semanas)} commits en 8 semanas · 1 founder + IA</p>
      </div>
      <div style={S.card}>
        <div style={S.h2}>Métricas norte <span style={S.fuente}>— instrumentadas desde HOY para que las curvas existan al lanzar</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 8 }}>
          {r.metricas_norte.map((m) => (
            <div key={m.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 10 }}>
              <div style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, color: 'var(--cream)' }}>{m.nombre}</div>
              <div style={{ ...S.big, fontSize: 19 }}>{fmt(m.total)}</div>
              {m.tendencia !== null && <div style={{ ...S.p, fontSize: 11, color: m.tendencia >= 0 ? '#4ADE80' : '#fca5a5' }}>{m.tendencia >= 0 ? '▲' : '▼'} {Math.abs(m.tendencia)}% vs semana previa</div>}
              <p style={{ ...S.p, fontSize: 10.5 }}>{m.por_que}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Checklist legal (lo que el código no puede hacer por ti) ── */
function TabChecklist({ r, onChanged }) {
  const [msg, setMsg] = useState('');
  const toggle = async (item) => {
    try { await _send('/checklist', 'PATCH', { item_id: item.id, ok: !item.ok }); onChanged(); }
    catch (e) { setMsg(String(e.message)); }
  };
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <p style={S.p}>Esto no lo puede generar el código — es tarea tuya antes de una due diligence. Cada ítem en verde es una sorpresa menos.</p>
      {msg && <p style={{ ...S.p, color: '#fca5a5' }}>{msg}</p>}
      {r.checklist.map((c) => (
        <button key={c.id} data-testid={`chk-${c.id}`} onClick={() => toggle(c)} style={{ ...S.card, display: 'flex', gap: 10, alignItems: 'baseline', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
          <Semaforo ok={c.ok} />
          <div>
            <div style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>{c.nombre}</div>
            <div style={{ ...S.p, fontSize: 11.5 }}>{c.des}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

/* ── Demo: la puerta para externos ── */
function TabDemo() {
  const url = `${window.location.origin}/demo`;
  const [copiado, setCopiado] = useState(false);
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={S.card}>
        <div style={S.h2}>Demo para externos (YC, VCs, desarrolladores)</div>
        <p style={S.p}>Un recorrido guiado de 5 pasos que muestra cómo funciona la plataforma con <b>datos simulados</b> — sin login, sin exponer un solo dato real de leads. Es lo que abres en una llamada o mandas después de ella.</p>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <a href={url} target="_blank" rel="noreferrer" style={{ ...S.btn, textDecoration: 'none' }} data-testid="abrir-demo"><PlayCircle size={14} /> Abrir el demo</a>
          <button style={S.btn} onClick={() => { navigator.clipboard?.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }}>{copiado ? 'Copiado ✓' : 'Copiar link'}</button>
        </div>
      </div>
      <div style={S.card}>
        <div style={S.h2}>Qué muestra (5 pasos)</div>
        <ol style={{ ...S.p, paddingLeft: 18, display: 'grid', gap: 6 }}>
          <li><b style={{ color: 'var(--cream)' }}>El problema:</b> el mercado inmobiliario de CDMX decide a ciegas.</li>
          <li><b style={{ color: 'var(--cream)' }}>El dato:</b> catastro + fuentes oficiales a nivel predio y unidad.</li>
          <li><b style={{ color: 'var(--cream)' }}>El genoma:</b> cada interacción se vuelve un átomo de demanda.</li>
          <li><b style={{ color: 'var(--cream)' }}>Los motores:</b> equilibrio, transiciones (el «depa vendido»), scores.</li>
          <li><b style={{ color: 'var(--cream)' }}>El ciclo completo:</b> 4 portales que se alimentan entre sí — el moat.</li>
        </ol>
      </div>
    </div>
  );
}

export default function SuperadminInvestorRoom({ user, onLogout }) {
  const nav = useNavigate();
  const loc = useLocation();
  const [r, setR] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState(new URLSearchParams(loc.search).get('tab') || 'resumen');
  useEffect(() => {
    const q = new URLSearchParams(loc.search);
    if (q.get('tab')) setTab(q.get('tab'));
  }, [loc.search]);
  const cargar = useCallback(() => _get('/resumen').then(setR).catch((e) => setErr(String(e.message))), []);
  useEffect(() => { cargar(); }, [cargar]);

  const cuerpo = useMemo(() => {
    if (err) return <p style={{ ...S.p, color: '#fca5a5' }}>⚠ {err}</p>;
    if (!r) return <p style={S.p}>Cargando la sala…</p>;
    switch (tab) {
      case 'entrevistas': return <TabEntrevistas onChanged={cargar} />;
      case 'pilotos': return <TabPilotos onChanged={cargar} />;
      case 'numeros': return <TabNumeros r={r} onChanged={cargar} />;
      case 'checklist': return <TabChecklist r={r} onChanged={cargar} />;
      case 'demo': return <TabDemo />;
      default: return <TabResumen r={r} />;
    }
  }, [tab, r, err, cargar]);

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div style={{ padding: '28px 32px', maxWidth: 1280, margin: '0 auto' }} data-testid="investor-room">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Rocket size={22} color="var(--theme)" />
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: 'var(--cream)', margin: 0 }}>Sala de Inversionistas</h1>
          <button title="Refrescar" onClick={cargar} style={{ ...S.btn, padding: '5px 8px' }}><RefreshCw size={13} /></button>
        </div>
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.7)', margin: '0 0 16px' }}>
          Tu perfil para YC y fondos: cada número con su fuente (código, catastro, git, costo medido) o marcado como supuesto. <b>Verificable, no slideware.</b>
        </p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {TABS.map(({ id, nombre, Icon }) => (
            <button key={id} data-testid={`tab-${id}`} onClick={() => { setTab(id); nav(`/superadmin/inversionistas?tab=${id}`, { replace: true }); }}
              style={{ ...S.btn, background: tab === id ? 'rgba(var(--theme-rgb),0.22)' : 'rgba(255,255,255,0.04)', border: tab === id ? '1px solid rgba(var(--theme-rgb),0.55)' : '1px solid rgba(255,255,255,0.1)', color: tab === id ? 'var(--theme)' : 'rgba(240,235,224,0.75)' }}>
              <Icon size={13} /> {nombre}
            </button>
          ))}
        </div>
        {cuerpo}
      </div>
    </SuperadminLayout>
  );
}
