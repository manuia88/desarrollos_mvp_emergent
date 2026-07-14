/**
 * SuperadminCatalogo — EL CATÁLOGO VIVO (Fase A del rebuild UX).
 * La puerta de entrada al portal: buscas por PREGUNTA, no por dónde-quedó-el-tab. Cada pieza
 * (vista/reporte/motor/producto) se explica en lenguaje humano — qué es · qué me dice · para qué
 * me sirve · qué hago con esto — y se agrupa en 6 dominios. Server-driven: sale de /catalogo,
 * NADA hardcodeado aquí. Una pieza nueva en el backend aparece sola.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronDown, ArrowRight, Sparkles } from 'lucide-react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { getCatalogo } from '../../api/superadminMetricsCube';
import { preguntarAlCopilot } from '../../hooks/useAICopilot';

const TIPO_LABEL = { vista: 'Pantalla', reporte: 'Reporte', motor: 'Capacidad', score: 'Score', producto: 'Producto', indice: 'Índice' };
const TIPO_COLOR = { vista: '#58a6ff', reporte: '#4ADE80', producto: '#d29922', indice: '#a78bfa', motor: '#8b949e', score: '#f472b6' };

function Pieza({ p, onIr }) {
  const [abierto, setAbierto] = useState(false);
  const col = TIPO_COLOR[p.tipo] || '#8b949e';
  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 16, background: 'rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 10, padding: '2px 8px', borderRadius: 9999, color: col, background: `${col}1c`, border: `1px solid ${col}50` }}>{TIPO_LABEL[p.tipo] || p.tipo}</span>
        <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>{p.titulo}</span>
      </div>
      <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.85)', margin: 0 }}>{p.que_es}</p>
      <button onClick={() => setAbierto(!abierto)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--theme)', fontFamily: 'DM Sans', fontSize: 11.5, cursor: 'pointer', padding: 0, alignSelf: 'flex-start' }}>
        {abierto ? 'Menos' : '¿Qué me da y qué hago con esto?'} <ChevronDown size={13} style={{ transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {abierto && (
        <div style={{ display: 'grid', gap: 6, fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.8)', paddingLeft: 4, borderLeft: `2px solid ${col}44` }}>
          <div><b style={{ color: 'var(--cream)' }}>Qué me dice:</b> {p.que_dice}</div>
          <div><b style={{ color: 'var(--cream)' }}>Para qué me sirve:</b> {p.beneficio}</div>
          <div><b style={{ color: 'var(--cream)' }}>Qué hago con esto:</b> {p.que_hago}</div>
          {p.necesita?.length > 0 && <div style={{ fontSize: 11, opacity: 0.7 }}>Necesita: {p.necesita.join(', ')}</div>}
        </div>
      )}
      {p.ruta_ui && (
        <button onClick={() => onIr(p.ruta_ui)} data-testid={`ir-${p.id}`} style={{ marginTop: 2, alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 9, background: 'rgba(var(--theme-rgb),0.14)', border: '1px solid rgba(var(--theme-rgb),0.4)', color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11.5, cursor: 'pointer' }}>
          Ir <ArrowRight size={13} />
        </button>
      )}
    </div>
  );
}

export default function SuperadminCatalogo({ dominioInicial = '', user, onLogout }) {
  const nav = useNavigate();
  const [cat, setCat] = useState(null);
  const [err, setErr] = useState('');
  const [texto, setTexto] = useState('');
  // dominio inicial: prop (ruta dedicada /productos) o ?dominio= (deep-link) — su propia URL
  // para que el resaltado del sidebar sea correcto (el query no vive en pathname).
  const [dominio, setDominio] = useState(dominioInicial || new URLSearchParams(window.location.search).get('dominio') || '');
  const [tipo, setTipo] = useState('');
  const [necesita, setNecesita] = useState('');
  const SUGERENCIAS = ['absorción', 'renta', 'escasez', 'plusvalía', 'riesgo', 'leads', 'precio'];
  const NECESITA_LABEL = { colonias: 'una zona', tiempo: 'un periodo', fecha: 'una fecha', unit_id: 'una unidad', estudio: 'un estudio 4S' };

  useEffect(() => {
    getCatalogo().then(setCat).catch((e) => setErr(e?.message || 'No se pudo cargar el catálogo.'));
  }, []);

  // filtro EN VIVO del lado del cliente (el backend ya trae todo; filtrar local es instantáneo)
  const piezas = useMemo(() => {
    if (!cat) return [];
    const t = texto.trim().toLowerCase();
    return cat.piezas.filter((p) => {
      if (dominio && p.dominio !== dominio) return false;
      if (tipo && p.tipo !== tipo) return false;
      if (necesita && !(p.necesita || []).includes(necesita)) return false;
      if (t) {
        const heno = [p.titulo, p.que_es, p.que_dice, p.beneficio, p.que_hago, ...(p.temas || [])].join(' ').toLowerCase();
        if (!heno.includes(t)) return false;
      }
      return true;
    });
  }, [cat, texto, dominio, tipo, necesita]);

  const chip = (activo) => ({ padding: '7px 14px', borderRadius: 9999, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5, background: activo ? 'rgba(var(--theme-rgb),0.16)' : 'rgba(255,255,255,0.04)', border: `1px solid ${activo ? 'rgba(var(--theme-rgb),0.45)' : 'rgba(255,255,255,0.1)'}`, color: activo ? 'var(--theme)' : 'rgba(240,235,224,0.7)' });

  if (err) return <SuperadminLayout user={user} onLogout={onLogout}><div style={{ padding: 40, fontFamily: 'DM Sans', color: '#fca5a5' }}>⚠ {err}</div></SuperadminLayout>;
  if (!cat) return <SuperadminLayout user={user} onLogout={onLogout}><div style={{ padding: 40, fontFamily: 'DM Sans', color: 'rgba(240,235,224,0.6)' }}>Cargando el catálogo…</div></SuperadminLayout>;

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
    <div style={{ padding: '28px 32px', maxWidth: 1280, margin: '0 auto' }} data-testid="superadmin-catalogo">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Search size={22} color="var(--theme)" />
        <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: 'var(--cream)', margin: 0 }}>El Catálogo</h1>
      </div>
      <p style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'rgba(240,235,224,0.7)', margin: '0 0 18px' }}>
        Todas las <b>{cat.n_piezas} herramientas</b> del portal en 6 áreas, en lenguaje simple. Busca la que necesitas y te lleva. <span style={{ opacity: 0.7 }}>¿Buscas una respuesta, no una pantalla? Eso lo responde el Copilot DMX (⌘J).</span>
      </p>

      {/* BUSCADOR */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <Search size={16} style={{ position: 'absolute', left: 14, top: 13, color: 'rgba(240,235,224,0.4)' }} />
        <input value={texto} onChange={(e) => setTexto(e.target.value)} data-testid="cat-buscar"
          placeholder="¿Qué quieres saber? ej: absorción, renta, escasez, quién busca, precio, riesgo…"
          style={{ width: '100%', padding: '11px 14px 11px 40px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 14 }} />
      </div>
      {/* sugerencias rápidas: el founder no adivina palabras */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.45)' }}>Prueba:</span>
        {SUGERENCIAS.map((s) => (
          <button key={s} onClick={() => setTexto(s)} style={{ padding: '3px 10px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(240,235,224,0.7)', fontFamily: 'DM Sans', fontSize: 11.5, cursor: 'pointer' }}>{s}</button>
        ))}
      </div>

      {/* DOMINIOS */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <button onClick={() => setDominio('')} style={chip(!dominio)}>Todo</button>
        {cat.dominios.map((d) => (
          <button key={d.id} onClick={() => setDominio(dominio === d.id ? '' : d.id)} style={chip(dominio === d.id)} title={d.resumen}>
            {d.icono} {d.titulo} <span style={{ opacity: 0.6 }}>({d.n_piezas})</span>
          </button>
        ))}
      </div>

      {/* TIPOS */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        <button onClick={() => setTipo('')} style={{ ...chip(!tipo), fontSize: 11.5, padding: '5px 11px' }}>Todos los tipos</button>
        {Object.entries(cat.por_tipo).map(([t, n]) => (
          <button key={t} onClick={() => setTipo(tipo === t ? '' : t)} style={{ ...chip(tipo === t), fontSize: 11.5, padding: '5px 11px' }}>
            {TIPO_LABEL[t] || t} ({n})
          </button>
        ))}
      </div>

      {/* filtro por lo que la herramienta NECESITA (una zona, una fecha, una unidad…) */}
      {cat.necesita_valores?.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.45)' }}>Necesita:</span>
          {cat.necesita_valores.map((n) => (
            <button key={n} onClick={() => setNecesita(necesita === n ? '' : n)} style={{ ...chip(necesita === n), fontSize: 11.5, padding: '5px 11px' }}>
              {NECESITA_LABEL[n] || n}
            </button>
          ))}
        </div>
      )}

      <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.5)', marginBottom: 12 }}>
        {piezas.length} de {cat.n_piezas}{(texto || dominio || tipo || necesita) ? ' (filtrado)' : ''}
      </div>

      {/* CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
        {piezas.map((p) => <Pieza key={p.id} p={p} onIr={(r) => nav(r)} />)}
      </div>
      {piezas.length === 0 && (
        <div style={{ padding: 30, textAlign: 'center', display: 'grid', gap: 12, justifyItems: 'center' }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.6)' }}>
            Ninguna <b>herramienta</b> coincide con “{texto}”.
          </div>
          {texto.trim() && (
            <>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.55)' }}>
                Si es una <b>pregunta</b> (quieres una respuesta, no una pantalla), pásasela a la IA:
              </div>
              <button onClick={() => preguntarAlCopilot(texto.trim())} data-testid="cat-handoff-copilot"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: 'rgba(var(--theme-rgb),0.16)', border: '1px solid rgba(var(--theme-rgb),0.4)', color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                <Sparkles size={14} /> Pregúntale al Copilot DMX
              </button>
            </>
          )}
        </div>
      )}
    </div>
    </SuperadminLayout>
  );
}
