// Superadmin · MOTORES — el catálogo de motores del cubo. Lista los motores REGISTRADOS (agrupados por eje)
// y deja correr cualquiera contra una colonia, mostrando su salida HIPER-SEGMENTADA (cada campo = su propio dato).
// Es un HUB que crece por tandas: hoy ~7 motores, llegará a ~120. Reusa /engines/catalog y /engines/run.
// Cero dato inventado: TODO viene de la respuesta. `null` se muestra como "sin dato (latente)", error en ámbar (no rojo).
import React, { useState, useEffect, useCallback } from 'react';
import { Card, Badge } from '../advisor/primitives';
import { getEnginesCatalog, getEngineRun } from '../../api/superadminDemandIntel';
import ColoniaPicker from './ColoniaPicker';

// ── tokens de tema oscuro (idénticos a los otros paneles) ───────────────────
const card = { padding: '16px 20px' };
const muted = '#888';
const cream = 'var(--cream, #e8e6df)';
const theme = 'var(--theme, #6366f1)';
const amber = '#f59e0b';

const btnRun = {
  padding: '7px 16px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.14)', cursor: 'pointer',
  background: theme, color: '#fff', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
};
const btnGhost = {
  padding: '6px 13px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.16)', cursor: 'pointer',
  background: 'rgba(255,255,255,0.05)', color: '#bbb', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
};
const btnDisabled = { ...btnRun, opacity: 0.45, cursor: 'not-allowed' };

// Color del badge de eje (mismo tono de tema; se reparte por hash para distinguir ejes sin inventar paleta).
const EJE_TONES = ['brand', 'pink', 'ok', 'warn', 'neutral'];
const ejeTone = (eje) => {
  const s = String(eje || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return EJE_TONES[h % EJE_TONES.length];
};

// ── formateo de valores hiper-segmentado ────────────────────────────────────
// Número legible (es-MX). Enteros con separador de miles; decimales acotados.
const fmtNum = (v) => (Number.isInteger(v) ? v.toLocaleString('es-MX') : (+v.toFixed(2)).toLocaleString('es-MX', { maximumFractionDigits: 2 }));

// Humaniza una clave cruda (snake_case → palabras).
const humanKey = (k) => String(k).replace(/_/g, ' ').replace(/\bpct\b/gi, '%').trim();

const isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

// Renderiza UN valor escalar como su propio dato (clave → valor). `null` = latente, no crash.
function ScalarVal({ v }) {
  if (v == null) return <span style={{ color: amber, fontStyle: 'italic' }}>sin dato (latente)</span>;
  if (typeof v === 'boolean') return <span style={{ color: v ? '#22c55e' : '#aaa', fontWeight: 600 }}>{v ? 'sí' : 'no'}</span>;
  if (typeof v === 'number') return <span style={{ color: cream, fontWeight: 700 }}>{fmtNum(v)}</span>;
  const s = String(v);
  if (s === '') return <span style={{ color: amber, fontStyle: 'italic' }}>sin dato (latente)</span>;
  return <span style={{ color: cream, fontWeight: 600 }}>{s}</span>;
}

// Recorre RECURSIVAMENTE un valor (objeto/array/escalar) y pinta CADA campo en su propia fila.
// Nunca vuelca JSON crudo en bloque: cada hoja es una fila clave→valor; los nodos anidados son sub-listas.
function FieldTree({ label, value, depth = 0 }) {
  const indent = depth > 0 ? { borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: 12, marginLeft: 2 } : {};

  // Array → lista de elementos (cada uno recursivo)
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <Field label={label} depth={depth}>
          <span style={{ color: amber, fontStyle: 'italic' }}>vacío (sin elementos)</span>
        </Field>
      );
    }
    // Array de escalares → chips en una sola fila (legible y compacto)
    const allScalar = value.every((x) => x == null || typeof x !== 'object');
    if (allScalar) {
      return (
        <Field label={label} depth={depth}>
          <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
            {value.map((x, i) => (
              <span key={i} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '1px 8px', fontSize: 12, color: '#cfcfd6' }}>
                <ScalarVal v={x} />
              </span>
            ))}
          </span>
        </Field>
      );
    }
    // Array de objetos → sub-lista numerada, cada uno recursivo
    return (
      <div style={{ marginTop: 6 }}>
        <FieldLabel label={label} depth={depth} count={value.length} />
        <div style={{ ...indent, display: 'grid', gap: 6, marginTop: 4 }}>
          {value.map((x, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: '6px 10px' }}>
              <div style={{ fontSize: 10.5, color: '#777', fontWeight: 700, marginBottom: 2 }}>#{i + 1}</div>
              {isPlainObject(x)
                ? Object.entries(x).map(([k, v]) => <FieldTree key={k} label={k} value={v} depth={depth + 1} />)
                : <FieldTree label="valor" value={x} depth={depth + 1} />}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Objeto → sub-lista de campos (cada uno recursivo)
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return (
        <Field label={label} depth={depth}>
          <span style={{ color: amber, fontStyle: 'italic' }}>vacío (sin campos)</span>
        </Field>
      );
    }
    return (
      <div style={{ marginTop: 6 }}>
        <FieldLabel label={label} depth={depth} count={entries.length} />
        <div style={{ ...indent, display: 'grid', gap: 5, marginTop: 4 }}>
          {entries.map(([k, v]) => <FieldTree key={k} label={k} value={v} depth={depth + 1} />)}
        </div>
      </div>
    );
  }

  // Escalar → una fila clave → valor
  return (
    <Field label={label} depth={depth}>
      <ScalarVal v={value} />
    </Field>
  );
}

// Etiqueta de un nodo anidado (objeto/array) con su conteo de campos.
function FieldLabel({ label, depth, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginLeft: depth > 0 ? 2 : 0 }}>
      <span style={{ fontSize: 11.5, color: '#9a9aa6', fontWeight: 700, textTransform: depth === 0 ? 'uppercase' : 'none', letterSpacing: depth === 0 ? 0.4 : 0 }}>
        {humanKey(label)}
      </span>
      {count != null && <span style={{ fontSize: 10, color: '#666' }}>· {count} {count === 1 ? 'campo' : 'campos'}</span>}
    </div>
  );
}

// Fila de un dato hoja: clave (gris) → valor.
function Field({ label, depth, children }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 12.5, padding: '2px 0', flexWrap: 'wrap', marginLeft: depth > 0 ? 2 : 0 }}>
      <span style={{ color: muted, minWidth: 120, flexShrink: 0 }}>{humanKey(label)}</span>
      <span style={{ flex: 1, minWidth: 80 }}>{children}</span>
    </div>
  );
}

// ── Bloque de SALIDA de un motor (debajo de su tarjeta) ─────────────────────
function EngineOutput({ res }) {
  if (!res) return null;
  // Error → ámbar, no rojo (el motor está latente o falló, no es crash).
  if (res.error) {
    return (
      <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, border: `1px solid rgba(245,158,11,0.35)`, background: 'rgba(245,158,11,0.06)' }}>
        <div style={{ fontSize: 12, color: amber, fontWeight: 700, marginBottom: 3 }}>Latente o sin resultado</div>
        <div style={{ fontSize: 12, color: '#d8c9a8', lineHeight: 1.5 }}>{res.error}</div>
        {res.fuente && <div style={{ fontSize: 10.5, color: '#8a7d5e', marginTop: 6, fontStyle: 'italic' }}>fuente: {res.fuente}</div>}
      </div>
    );
  }
  const salida = res.salida;
  const tieneSalida = salida != null && (!isPlainObject(salida) || Object.keys(salida).length > 0);
  return (
    <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.02)' }}>
      {/* meta del run: produce + contexto */}
      {(res.produce || res.ctx) && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {res.produce && <span style={{ fontSize: 12, color: '#bdbdc6' }}>produce: <span style={{ color: cream, fontWeight: 600 }}>{res.produce}</span></span>}
          {isPlainObject(res.ctx) && Object.keys(res.ctx).length > 0 && (
            <span style={{ fontSize: 11.5, color: muted }}>
              ctx: {Object.entries(res.ctx).map(([k, v]) => `${humanKey(k)} ${v}`).join(' · ')}
            </span>
          )}
        </div>
      )}

      {/* SALIDA hiper-segmentada — cada campo su propia fila */}
      {tieneSalida ? (
        <div style={{ display: 'grid', gap: 5 }}>
          {isPlainObject(salida)
            ? Object.entries(salida).map(([k, v]) => <FieldTree key={k} label={k} value={v} depth={0} />)
            : <FieldTree label="salida" value={salida} depth={0} />}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: amber, fontStyle: 'italic' }}>El motor corrió pero no devolvió campos (latente).</div>
      )}

      {res.fuente && <div style={{ fontSize: 10.5, color: '#666', marginTop: 10, fontStyle: 'italic' }}>fuente: {res.fuente}</div>}
    </div>
  );
}

// ── Tarjeta de UN motor ─────────────────────────────────────────────────────
function EngineCard({ m, colonia, result, loading, onRun }) {
  const [abierto, setAbierto] = useState(false);
  const tieneResultado = result != null;

  const correr = () => {
    setAbierto(true);
    onRun(m.id);
  };

  return (
    <Card style={{ ...card, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 14, color: cream, lineHeight: 1.25 }}>{m.nombre || m.id}</strong>
          {m.produce && <div style={{ fontSize: 12.5, color: '#aba9a2', marginTop: 3, lineHeight: 1.45 }}>{m.produce}</div>}
        </div>
        {m.eje && <Badge tone={ejeTone(m.eje)}>{m.eje}</Badge>}
      </div>

      {/* metadata chica: input que toma · fuente · tanda */}
      <div style={{ fontSize: 10.5, color: muted, lineHeight: 1.5 }}>
        {Array.isArray(m.input) && m.input.length > 0 && (
          <span>toma: {m.input.join(', ')}</span>
        )}
        {m.fuente && <span>{Array.isArray(m.input) && m.input.length > 0 ? ' · ' : ''}fuente: {m.fuente}</span>}
        {m.tanda != null && <span> · tanda {m.tanda}</span>}
      </div>

      {/* acción: Correr (deshabilitado sin colonia) */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
        <button
          type="button"
          onClick={correr}
          disabled={!colonia || loading}
          style={!colonia || loading ? btnDisabled : btnRun}
          aria-label={`Correr motor ${m.nombre || m.id}`}
          title={!colonia ? 'Elige una colonia primero' : `Correr ${m.nombre || m.id}`}
        >
          {loading ? 'Corriendo…' : tieneResultado ? 'Correr otra vez' : 'Correr'}
        </button>
        {tieneResultado && (
          <button type="button" onClick={() => setAbierto((a) => !a)} style={btnGhost}>
            {abierto ? 'Ocultar salida' : 'Ver salida'}
          </button>
        )}
      </div>

      {/* SALIDA expandible debajo de la tarjeta */}
      {abierto && tieneResultado && <EngineOutput res={result} />}
      {abierto && loading && !tieneResultado && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#aaa', fontStyle: 'italic' }}>Corriendo el motor…</div>
      )}
    </Card>
  );
}

// ── Skeleton mientras carga el catálogo ─────────────────────────────────────
function Skeleton() {
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {[0, 1].map((g) => (
        <div key={g}>
          <div style={{ height: 14, width: 160, background: 'rgba(255,255,255,0.06)', borderRadius: 6, marginBottom: 10 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 12 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ height: 120, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16 }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MotoresPanel({ zona = '', onZona } = {}) {
  // colonia local = el contexto compartido como semilla; el usuario puede cambiarla con el picker.
  const [colonia, setColonia] = useState(zona || '');
  const [catalogo, setCatalogo] = useState(null);
  const [catErr, setCatErr] = useState(null);
  const [catLoading, setCatLoading] = useState(true);
  const [results, setResults] = useState({});   // { [engine_id]: respuesta de getEngineRun }
  const [running, setRunning] = useState({});    // { [engine_id]: true } mientras corre
  const [bulk, setBulk] = useState(null);        // eje actualmente corriendo "todos"

  // Carga el catálogo al montar.
  useEffect(() => {
    setCatLoading(true); setCatErr(null);
    getEnginesCatalog()
      .then((d) => setCatalogo(d))
      .catch((e) => setCatErr(e.message || 'No se pudo cargar el catálogo de motores.'))
      .finally(() => setCatLoading(false));
  }, []);

  // Adopta la zona compartida si cambia desde afuera.
  useEffect(() => {
    if (zona && zona !== colonia) setColonia(zona);
  }, [zona]); // eslint-disable-line react-hooks/exhaustive-deps

  // El usuario eligió en el picker → estado local + propaga al contexto compartido.
  const onPick = (id) => {
    setColonia(id);
    if (onZona) onZona(id);
  };

  // Corre UN motor contra la colonia en foco. Devuelve la promesa (para "Correr todos").
  const runEngine = useCallback((engineId) => {
    if (!colonia) return Promise.resolve();
    setRunning((r) => ({ ...r, [engineId]: true }));
    return getEngineRun({ engine_id: engineId, colonia_id: colonia })
      .then((res) => setResults((m) => ({ ...m, [engineId]: res })))
      .catch((e) => setResults((m) => ({ ...m, [engineId]: { id: engineId, error: e.message || 'Falló el motor.' } })))
      .finally(() => setRunning((r) => ({ ...r, [engineId]: false })));
  }, [colonia]);

  // Corre TODOS los motores de un eje, secuencialmente.
  const runAll = useCallback(async (eje, items) => {
    if (!colonia) return;
    setBulk(eje);
    for (const it of items) {
      await runEngine(it.id); // eslint-disable-line no-await-in-loop
    }
    setBulk(null);
  }, [colonia, runEngine]);

  const motores = Array.isArray(catalogo?.motores) ? catalogo.motores : [];
  const total = catalogo?.total_registrados != null
    ? catalogo.total_registrados
    : motores.reduce((s, g) => s + (Array.isArray(g.items) ? g.items.length : 0), 0);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* ── NOTA / HUB ──────────────────────────────────────────────────────── */}
      <Card style={{ ...card, borderLeft: `3px solid ${theme}` }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#eee', marginBottom: 5 }}>
          Hub de motores{total != null ? ` — ${total} registrados` : ''}
        </div>
        <div style={{ fontSize: 12.5, color: '#aaa', lineHeight: 1.55 }}>
          Cada motor del cubo, consultable por el mismo patrón. Crece por tandas hasta el 100%.
          {catalogo?.lectura ? <span style={{ display: 'block', marginTop: 5, color: '#9a9aa6' }}>{catalogo.lectura}</span> : null}
        </div>
      </Card>

      {/* ── COLONIA en foco para correr los motores ─────────────────────────── */}
      <Card style={{ ...card, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: '#b4b4c0', fontWeight: 600 }}>Colonia para correr</span>
        <ColoniaPicker value={colonia} onChange={onPick} placeholder="Elige una colonia" style={{ minWidth: 240 }} />
        {colonia && (
          <button onClick={() => onPick('')} style={{ ...btnGhost, padding: '4px 10px' }}>quitar</button>
        )}
        {!colonia && <span style={{ fontSize: 11.5, color: amber }}>Elige una colonia para correr los motores.</span>}
      </Card>

      {/* ── ERROR catálogo ──────────────────────────────────────────────────── */}
      {catErr && (
        <Card style={{ ...card, borderLeft: '3px solid #dc2626', color: '#f3b4b4', fontSize: 13 }}>{catErr}</Card>
      )}

      {/* ── SKELETON ────────────────────────────────────────────────────────── */}
      {catLoading && <Skeleton />}

      {/* ── VACÍO ───────────────────────────────────────────────────────────── */}
      {!catLoading && !catErr && motores.length === 0 && (
        <Card style={{ ...card, textAlign: 'center', color: muted, fontSize: 13, padding: '40px 22px' }}>
          Aún no hay motores registrados en el catálogo.
        </Card>
      )}

      {/* ── MOTORES AGRUPADOS POR EJE ───────────────────────────────────────── */}
      {!catLoading && !catErr && motores.map((grupo, gi) => {
        const items = Array.isArray(grupo.items) ? grupo.items : [];
        if (items.length === 0) return null;
        const corriendoTodos = bulk === grupo.eje;
        return (
          <div key={grupo.eje || gi}>
            {/* encabezado del eje + "Correr todos" */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11.5, color: '#9a9aa6', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  {grupo.eje || 'Sin eje'}
                </span>
                <span style={{ fontSize: 11, color: '#666' }}>{items.length} {items.length === 1 ? 'motor' : 'motores'}</span>
              </div>
              <button
                type="button"
                onClick={() => runAll(grupo.eje, items)}
                disabled={!colonia || corriendoTodos}
                style={!colonia || corriendoTodos ? { ...btnGhost, opacity: 0.45, cursor: 'not-allowed' } : btnGhost}
                title={!colonia ? 'Elige una colonia primero' : `Correr los ${items.length} motores de ${grupo.eje}`}
              >
                {corriendoTodos ? 'Corriendo todos…' : 'Correr todos'}
              </button>
            </div>

            {/* tarjetas del eje */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
              {items.map((m) => (
                <EngineCard
                  key={m.id}
                  m={m}
                  colonia={colonia}
                  result={results[m.id]}
                  loading={!!running[m.id]}
                  onRun={runEngine}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
