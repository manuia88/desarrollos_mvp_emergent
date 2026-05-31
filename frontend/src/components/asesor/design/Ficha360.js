// Ficha360 — el perfil-hub del lead: modal central (tema claro) con 4 tabs.
// QUÉ ES: el centro de control del lead. Header (avatar + temperatura + chips de
//         etapa que MUEVEN el estado + WhatsApp/Agendar) y 4 pestañas:
//         Resumen · Propiedades · Conversaciones · Actividad.
// CUÁNDO: al hacer click en un lead de la pantalla de Leads.
//
// DATOS (todo real · contrato advisor.js · cero stubs):
//   Resumen      → getContacto (datos) · getCloseProbability (anillo % cierre) ·
//                  listBusquedas filtradas por contacto (criterios "qué busca") ·
//                  listTareas({contacto_id}) (Pendientes · completar con completeTarea).
//   Actividad    → getContactoOverview (timeline unificado) + nota (addTimelineEntry).
//   Propiedades  → listBusquedas + getMatches por búsqueda (tablero read-only).
//   Conversaciones → getLeadConversations (hilo real); si no hay, empty state real.
//
// NOTA (conservadora): asesor_contactos NO tiene campo de "etapa" de pipeline — el
// único estado mutable del contrato es `temperatura`. Por eso los chips del header y
// las columnas del kanban mueven `temperatura` (vía patchContacto). Cuando exista un
// campo de etapa, se reemplaza aquí sin tocar backend.
//
// Props: open · onClose · contact (de getContacto) · user (para el modal de cita) ·
//        onOpenArg() · onStageChange(temp) (avisa al kanban) · onToast(kind,text).
//        B4: "Agendar" abre NewCitaModal inline (prellenado), ya no navega a /citas.
import React, { useEffect, useState, useCallback } from 'react';
import {
  Calendar, Sparkles, X, Phone as PhoneIcon, Mail, Globe, Check,
  MessageCircle, MessageSquare, Pencil, Building2, ThumbsUp, ThumbsDown, ArrowLeftRight,
  ListChecks, Mic, AlertTriangle, Send,
} from 'lucide-react';
import * as api from '../../../api/advisor';
import { fmtMXN } from '../../advisor/primitives';
import { Z } from '../../../styles/zIndex';
import TemperaturePill from './TemperaturePill';
import ScoreRing from './ScoreRing';
import { ETAPA, ETAPA_ORDER, etapaMeta } from './palette';
import NewCitaModal from '../../developer/NewCitaModal';

const initials = (c) =>
  `${(c?.first_name || '').charAt(0)}${(c?.last_name || '').charAt(0)}`.toUpperCase() || '·';

// ts (ISO|datetime) → texto relativo es-MX corto.
function relWhen(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dd = Math.round(h / 24);
  if (dd < 30) return `hace ${dd} d`;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

// Texto legible de un factor de close_probability (filtra los vacíos · evita viñetas
// en blanco). close_probability devuelve objetos {factor, value, reason?} heterogéneos.
function factorText(f) {
  if (!f) return '';
  if (typeof f === 'string') return f.trim();
  if (f.reason) return String(f.reason).trim();
  if (f.label) return String(f.label).trim();
  if (f.text) return String(f.text).trim();
  const map = {
    buyer_score: f.value != null ? `Score de comprador ${Math.round(Number(f.value))}/100` : '',
    temperatura: f.value ? `Temperatura ${f.value}` : '',
    stage: f.value ? `Etapa de búsqueda: ${f.value}` : '',
    ofertas: f.value != null ? `${f.value} oferta(s) registrada(s)` : '',
  };
  return (map[f.factor] || '').trim();
}

// color del dot del timeline por tipo de evento.
function eventDot(source, kind) {
  if (kind === 'cita' || kind === 'visit' || source === 'busqueda') return 'var(--cold)';
  if (kind === 'tarea' || kind === 'task') return 'var(--warm)';
  if (source === 'operacion') return 'var(--ok)';
  return 'var(--cream-3)';
}

const TABS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'props', label: 'Propiedades' },
  { key: 'conv', label: 'Conversaciones' },
  { key: 'act', label: 'Actividad' },
];

// Color por estatus del tablero de propiedades (demo · mockup).
const DOTC = { cold: 'var(--cold)', warm: 'var(--warm)', ok: 'var(--ok)', hot: 'var(--hot)', theme: 'var(--theme)', gold: '#f5a524', emerald: '#10b981' };
const TONEC = { muted: 'var(--cream-3)', ok: 'var(--ok)', hot: 'var(--hot)' };
// B5.2-A · pipeline de la propiedad dentro del lead (6 etapas · arrastrables).
const BOARD_STATUS = ['por_verificar', 'enviada', 'le_gusto', 'cita', 'visitada', 'oferta', 'descartada'];
const BOARD_META = {
  por_verificar: { label: 'Por verificar',       dot: 'cold' },
  enviada:       { label: 'Enviada al cliente',  dot: 'warm' },
  le_gusto:      { label: 'Le gustó',            dot: 'ok' },
  cita:          { label: 'Cita / visita',       dot: 'theme' },
  visitada:      { label: 'Visitada',            dot: 'emerald' },
  oferta:        { label: 'En oferta',           dot: 'gold' },
  descartada:    { label: 'Descartada',          dot: 'hot' },
};
// Normaliza estatus viejos por si el backend manda alguno sin migrar.
const NORM_STATUS = (s) => ({ dispo: 'por_verificar', gusto: 'le_gusto' }[s] || s);
// B5.2-D · "Siguiente paso" prescriptivo: detecta propiedades atoradas por tiempo-en-etapa.
const DAYS_IN = (item) => (item.updated_at ? Math.floor((Date.now() - new Date(item.updated_at).getTime()) / 86400000) : 0);
const STAGE_NUDGE = (item) => {
  const st = NORM_STATUS(item.status); const d = DAYS_IN(item);
  if (st === 'por_verificar' && d >= 2) return { t: `Esperando dispo. ${d}d · pregúntale al broker`, u: true };
  if (st === 'enviada' && d >= 3) return { t: `${d}d sin reacción · reenvía el link`, u: true };
  if (st === 'cita' && !item.cita_confirmada) return { t: 'Cuadra el horario de la visita', u: false };
  if (st === 'oferta' && d >= 5) return { t: `En oferta ${d}d · da seguimiento`, u: true };
  return null;
};
const FB_LABEL = { encanto: 'Le encantó', gusto: 'Le gustó', no: 'No le convenció' };

// B5.2-B · Captura de feedback de visita (se abre al mover una propiedad a "Visitada").
function VisitFeedbackForm({ item, onSave, onClose }) {
  const [salio, setSalio] = useState('');
  const [nota, setNota] = useState('');
  const opts = [{ k: 'encanto', e: '😍' }, { k: 'gusto', e: '🙂' }, { k: 'no', e: '😕' }];
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', width: '100%', maxWidth: 440, borderRadius: 16, border: '1px solid var(--border)', padding: 18, boxShadow: '0 24px 70px rgba(20,16,60,.28)' }}>
      <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>¿Cómo salió la visita?</div>
      <div style={{ fontSize: 12, color: 'var(--cream-3)', marginBottom: 13 }}>{item.name}</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {opts.map((o) => (
          <button key={o.k} onClick={() => setSalio(o.k)} style={{ flex: 1, padding: '11px 4px', borderRadius: 11, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 11.5, fontWeight: 700, border: `1.5px solid ${salio === o.k ? 'var(--theme)' : 'var(--border)'}`, background: salio === o.k ? 'rgba(var(--theme-rgb),0.10)' : 'var(--surface-2)', color: salio === o.k ? 'var(--theme-2)' : 'var(--cream-2)' }}>
            <div style={{ fontSize: 19 }}>{o.e}</div>{FB_LABEL[o.k]}
          </button>
        ))}
      </div>
      <textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="¿Qué dijo? ¿qué le faltó? (objeciones, precio, etc.)"
        style={{ width: '100%', height: 70, padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--cream)', fontFamily: 'DM Sans, sans-serif', fontSize: 13, outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
      <div style={{ display: 'flex', gap: 9, marginTop: 13 }}>
        <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: 10, background: 'none', border: '1px solid var(--border)', color: 'var(--cream-3)', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Después</button>
        <button onClick={() => onSave(salio, nota)} disabled={!salio} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: salio ? 'var(--grad)' : 'var(--border)', color: '#fff', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: 13.5, cursor: salio ? 'pointer' : 'not-allowed' }}>Guardar feedback</button>
      </div>
    </div>
  );
}

// B5.2-C · Armar recorrido — vista VIVA: ordena por horario confirmado + cercanía,
// avisa conflictos de traslado, y se reordena sola cuando cambia un horario.
const _rcInp = { flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--cream)', fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, outline: 'none', boxSizing: 'border-box' };
const _rcChip = (on) => ({ padding: '6px 11px', borderRadius: 999, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 11.5, fontWeight: 700, border: `1.5px solid ${on ? '#16b364' : 'var(--border)'}`, background: on ? 'rgba(22,179,100,0.10)' : 'var(--surface-2)', color: on ? '#16b364' : 'var(--cream-2)' });
const _fmtHora = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
const _sameDay = (a, b) => a && b && new Date(a).toDateString() === new Date(b).toDateString();
const _travelMin = (a, b) => ((a.colonia || '').toLowerCase() === (b.colonia || '').toLowerCase() && a.colonia) ? 15 : 35;

function ConfirmVisitRow({ item, onConfirm }) {
  const had = item.cita_confirmada ? new Date(item.cita_confirmada) : null;
  const [date, setDate] = useState(had && !isNaN(had) ? had.toISOString().slice(0, 10) : '');
  const [time, setTime] = useState(had && !isNaN(had) ? had.toTimeString().slice(0, 5) : '');
  const cf = item.cita_confirm || {};
  const [parties, setParties] = useState({ cliente: !!cf.cliente, propietario: !!cf.propietario, agenda: !!cf.agenda });
  const tgl = (k) => setParties((p) => ({ ...p, [k]: !p[k] }));
  const ready = date && time && parties.cliente && parties.propietario && parties.agenda;
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginBottom: 9 }}>
      <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 13.5, color: 'var(--cream)' }}>{item.name}</div>
      <div style={{ fontSize: 11.5, color: 'var(--cream-3)', marginBottom: 9 }}>{item.colonia || ''}{item.client_cita ? ` · cliente pidió: ${item.client_cita}` : ''}</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 9 }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={_rcInp} />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={_rcInp} />
      </div>
      <div style={{ display: 'flex', gap: 7, marginBottom: 10, flexWrap: 'wrap' }}>
        {[['cliente', 'Cliente'], ['propietario', 'Propietario / broker'], ['agenda', 'Mi agenda']].map(([k, label]) => (
          <button key={k} onClick={() => tgl(k)} style={_rcChip(parties[k])}>{parties[k] ? '✓ ' : ''}{label}</button>
        ))}
      </div>
      <button onClick={() => onConfirm(item.id, new Date(`${date}T${time}`).toISOString(), parties)} disabled={!date || !time}
        style={{ width: '100%', padding: 9, borderRadius: 9, border: 'none', background: ready ? 'var(--grad)' : (date && time ? 'rgba(var(--theme-rgb),0.55)' : 'var(--border)'), color: '#fff', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: 12.5, cursor: (date && time) ? 'pointer' : 'not-allowed' }}>
        {ready ? '✓ Confirmar y poner en la ruta' : 'Falta cuadrar las 3 partes'}
      </button>
    </div>
  );
}

function RecorridoModal({ items, leadName, onConfirm, onClose }) {
  const confirmadas = items.filter((i) => i.cita_confirmada).sort((a, b) => new Date(a.cita_confirmada) - new Date(b.cita_confirmada));
  const tentativas = items.filter((i) => !i.cita_confirmada);
  const secLbl = { fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 12.5, color: 'var(--cream)', margin: '4px 0 10px' };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,16,40,0.45)', zIndex: Z.MODAL, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', width: '100%', maxWidth: 480, maxHeight: '86vh', borderRadius: 16, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '15px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <b style={{ fontFamily: 'Outfit, sans-serif', fontSize: 15, color: 'var(--cream)' }}>🗺️ Recorrido de {leadName}</b>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cream-3)', padding: 2 }}><X size={18} /></button>
        </div>
        <div style={{ overflowY: 'auto', padding: '14px 16px' }}>
          {confirmadas.length === 0 && tentativas.length === 0 && (
            <div style={{ padding: 28, textAlign: 'center', color: 'var(--cream-3)', fontSize: 13 }}>Cuando tengas propiedades en "Cita" o "Visitada", arma aquí la ruta del día.</div>
          )}
          {confirmadas.length > 0 && (
            <>
              <div style={secLbl}>Ruta confirmada · {confirmadas.length}</div>
              {confirmadas.map((it, i) => {
                const next = confirmadas[i + 1];
                const gapMin = next ? (new Date(next.cita_confirmada) - new Date(it.cita_confirmada)) / 60000 : null;
                const conflict = next && _sameDay(it.cita_confirmada, next.cita_confirmada) && gapMin < _travelMin(it, next);
                return (
                  <div key={it.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', marginBottom: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--grad)', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>{it.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--cream-3)' }}>{it.colonia || ''}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 13.5, color: 'var(--theme-2)' }}>{(_fmtHora(it.cita_confirmada).split(' ').slice(-1)[0]) || ''}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--cream-3)' }}>{_fmtHora(it.cita_confirmada).split(',')[0]}</div>
                      </div>
                    </div>
                    {conflict && <div style={{ fontSize: 11.5, color: '#8a5a00', background: 'rgba(245,165,36,0.12)', border: '1px solid rgba(245,165,36,0.35)', borderRadius: 9, padding: '7px 10px', margin: '-2px 0 9px' }}>⚠️ De {it.colonia} a {next.colonia} no alcanzas en {Math.round(gapMin)} min · ajusta el horario de la #{i + 2}</div>}
                  </div>
                );
              })}
            </>
          )}
          {items.length > 0 && (
            <>
              <div style={{ ...secLbl, marginTop: confirmadas.length ? 16 : 4 }}>{confirmadas.length ? 'Ajustar horarios' : 'Cuadrar visitas'} · {items.length}</div>
              <div style={{ fontSize: 11.5, color: 'var(--cream-3)', marginBottom: 11, lineHeight: 1.5 }}>Cuadra cada visita con las 3 partes (cliente · propietario/broker · tu agenda). Cambia una hora y la ruta de arriba se <b style={{ color: 'var(--cream-2)' }}>reordena sola</b>.</div>
              {items.map((it) => <ConfirmVisitRow key={it.id} item={it} onConfirm={onConfirm} />)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Ficha360({ open, onClose, contact, onOpenArg, onStageChange, onToast, demo, user }) {
  const [tab, setTab] = useState('resumen');
  const [prob, setProb] = useState(null);
  const [intel, setIntel] = useState(null);   // B2 · DISC/riesgo/brief reales (FAIL-OPEN)
  const [tareas, setTareas] = useState([]);
  const [busquedas, setBusquedas] = useState([]);
  const [matches, setMatches] = useState({});      // bid → [matches]
  const [overview, setOverview] = useState(null);
  const [convos, setConvos] = useState(null);
  const [convIntel, setConvIntel] = useState(null);   // B2 · ánimo/sentiment real (client_insights)
  const [convLoading, setConvLoading] = useState(false);
  const [actLoading, setActLoading] = useState(false);
  const [propsLoading, setPropsLoading] = useState(false);
  const [note, setNote] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [stageBusy, setStageBusy] = useState(false);
  // Tab Actividad · botones Nota/Tarea (inline) del mockup.
  const [actMode, setActMode] = useState(null);  // null | 'nota' | 'tarea'
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [convChan, setConvChan] = useState('all');   // filtro de canal de la bandeja
  const [showCita, setShowCita] = useState(false);      // B4 · modal de cita inline
  const [citaProjects, setCitaProjects] = useState([]); // desarrollos para el dropdown del modal
  const [board, setBoard] = useState(null);             // B5.1 · tablero real {items, engagement}
  const [boardLoading, setBoardLoading] = useState(false);
  const [dragId, setDragId] = useState(null);           // id de la propiedad que se arrastra
  const [linkInfo, setLinkInfo] = useState(null);       // B5.2 · link Tinder creado {url, wa_text}
  const [linkBusy, setLinkBusy] = useState(false);
  const [showAddProp, setShowAddProp] = useState(false); // B5.2b · buscador para agregar propiedad
  const [allDevs, setAllDevs] = useState(null);
  const [devQ, setDevQ] = useState('');
  const [feedbackItem, setFeedbackItem] = useState(null); // B5.2-B · prop en captura de feedback de visita
  const [showRecorrido, setShowRecorrido] = useState(false); // B5.2-C · modal de recorrido del día

  const cid = contact?.id;
  const toast = useCallback((k, t) => { if (onToast) onToast(k, t); }, [onToast]);

  // Cerrar con Esc + bloquear scroll del body.
  useEffect(() => {
    if (!open) return undefined;
    const onEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onEsc); document.body.style.overflow = ''; };
  }, [open, onClose]);

  // Al abrir un lead: reset tab + carga lo del Resumen (prob, tareas, búsquedas).
  // En modo DEMO no se llama a la API — todo viene del objeto `demo` hardcodeado.
  useEffect(() => {
    if (!open || !cid) return;
    setTab('resumen');
    setProb(null); setTareas([]); setBusquedas([]); setMatches({});
    setOverview(null); setConvos(null); setIntel(null); setConvIntel(null); setBoard(null); setLinkInfo(null);
    if (demo) return;
    api.getContactoIntel(cid).then(setIntel).catch(() => setIntel(null));
    api.getCloseProbability(cid).then(setProb).catch(() => setProb(null));
    api.listTareas({ contacto_id: cid }).then((t) => setTareas(t || [])).catch(() => setTareas([]));
    api.listBusquedas()
      .then((all) => setBusquedas((all || []).filter((b) => b.contacto_id === cid)))
      .catch(() => setBusquedas([]));
  }, [open, cid, demo]);

  // Lazy-load por tab.
  useEffect(() => {
    if (!open || !cid || demo) return;
    if (tab === 'act' && overview === null && !actLoading) {
      setActLoading(true);
      api.getContactoOverview(cid)
        .then((o) => setOverview(o || { timeline: [] }))
        .catch(() => setOverview({ timeline: [] }))
        .finally(() => setActLoading(false));
    }
    if (tab === 'conv' && convos === null && !convLoading) {
      setConvLoading(true);
      api.getLeadConversations(cid)
        .then((r) => setConvos(r?.conversations || []))
        .catch(() => setConvos([]))
        .finally(() => setConvLoading(false));
      // Ánimo del cliente (sentiment real · client_insights) · FAIL-OPEN.
      api.getLeadInsights(cid).then(setConvIntel).catch(() => setConvIntel(null));
    }
    if (tab === 'props' && board === null && !boardLoading) {
      setBoardLoading(true);
      api.getLeadBoard(cid)
        .then((b) => setBoard(b || { items: [], engagement: {} }))
        .catch(() => setBoard({ items: [], engagement: {} }))
        .finally(() => setBoardLoading(false));
    }
    if (tab === 'props' && busquedas.length > 0 && Object.keys(matches).length === 0 && !propsLoading) {
      setPropsLoading(true);
      Promise.all(busquedas.map((b) =>
        api.getMatches(b.id).then((m) => [b.id, m || []]).catch(() => [b.id, []])
      )).then((pairs) => {
        setMatches(Object.fromEntries(pairs));
      }).finally(() => setPropsLoading(false));
    }
  }, [tab, open, cid, busquedas]); // eslint-disable-line react-hooks/exhaustive-deps

  // B4 · Carga los desarrollos (dropdown del modal de cita) la 1a vez que se abre.
  useEffect(() => {
    if (!showCita || citaProjects.length) return;
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/developments?sort=recent`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setCitaProjects(Array.isArray(d) ? d : (d?.items || [])))
      .catch(() => setCitaProjects([]));
  }, [showCita, citaProjects.length]);

  if (!open || !contact) return null;

  const c = contact;
  const phone = c.phones?.[0] || '';
  const digits = phone.replace(/\D/g, '');
  const waUrl = digits ? `https://wa.me/${digits}?text=${encodeURIComponent('Hola ' + (c.first_name || '') + ', ')}` : null;

  // close_probability devuelve prob en 0-100 (no 0-1). En demo viene de `demo.ready`.
  const probPct = demo ? demo.ready.pct
    : (prob && prob.prob != null ? Math.max(0, Math.min(100, Math.round(Number(prob.prob)))) : null);
  const probReasons = prob?.factors || prob?.reasons || prob?.drivers || [];
  // Líneas legibles (sin vacíos) + frase de cierre según el %.
  const readyLines = demo ? [demo.ready.why]
    : (Array.isArray(probReasons) ? probReasons.map(factorText) : []).filter(Boolean).slice(0, 3);
  const readyCta = demo ? demo.ready.cta
    : probPct == null ? ''
    : probPct >= 70 ? 'Vale la pena darle seguimiento hoy.'
    : probPct >= 45 ? 'Buen momento para nutrirlo y avanzar.'
    : 'Aún frío: nútrelo antes de empujar.';
  const firstBusq = busquedas[0] || null;

  // Mover la ETAPA del pipeline desde los chips del header (como el mockup).
  const etapaActual = c.etapa || 'nuevo';
  const moveEtapa = async (ek) => {
    if (stageBusy || ek === etapaActual) return;
    // En demo no hay lead real en backend → mover solo en memoria (sin API).
    if (demo) { if (onStageChange) onStageChange(ek); toast('success', `Movido a ${etapaMeta(ek).label}`); return; }
    setStageBusy(true);
    try {
      await api.patchContacto(cid, { etapa: ek });
      if (onStageChange) onStageChange(ek);
      toast('success', `Movido a ${etapaMeta(ek).label}`);
    } catch (_) {
      toast('error', 'No se pudo mover');
    } finally { setStageBusy(false); }
  };

  // B4 · Abre el modal de cita prellenado con el lead (sin salir del perfil).
  const openCita = () => {
    if (demo) { toast('success', 'La agenda usa datos reales · apaga el modo ejemplo'); return; }
    setShowCita(true);
  };

  // B5.1 · Arrastrar una propiedad a otra columna (cambia su estatus · optimista).
  const moveBoard = async (id, status) => {
    setDragId(null);
    if (!id || !board) return;
    const it = (board.items || []).find((x) => x.id === id);
    if (!it || it.status === status) return;
    setBoard((b) => ({ ...b, items: b.items.map((x) => (x.id === id ? { ...x, status } : x)) }));
    try { await api.patchLeadBoardItem(id, { status }); }
    catch (_) { toast('error', 'No se pudo mover'); api.getLeadBoard(cid).then(setBoard).catch(() => {}); }
    // B5.2-B · al marcar Visitada, capturar feedback de la visita.
    if (status === 'visitada' && !it.visit_feedback) setFeedbackItem({ ...it, status });
  };

  // B5.2-B · Guarda el feedback de la visita en la propiedad.
  const saveFeedback = async (salio, nota) => {
    const it = feedbackItem; if (!it) return;
    const fb = { salio, nota: (nota || '').slice(0, 300), ts: new Date().toISOString() };
    setBoard((b) => ({ ...b, items: (b?.items || []).map((x) => (x.id === it.id ? { ...x, visit_feedback: fb } : x)) }));
    setFeedbackItem(null);
    try { await api.patchLeadBoardItem(it.id, { visit_feedback: fb }); toast('success', 'Feedback guardado'); }
    catch (_) { toast('error', 'No se pudo guardar'); }
  };

  // B5.2-C · Confirma el horario de una visita (tras coordinar) → entra a la ruta y se reordena sola.
  const confirmVisita = async (id, iso, parties) => {
    setBoard((b) => ({ ...b, items: (b?.items || []).map((x) => (x.id === id ? { ...x, cita_confirmada: iso, cita_confirm: parties } : x)) }));
    try { await api.patchLeadBoardItem(id, { cita_confirmada: iso, cita_confirm: parties }); toast('success', 'Visita confirmada'); }
    catch (_) { toast('error', 'No se pudo confirmar'); }
  };

  // B5.1 · Agregar una coincidencia de búsqueda al tablero (columna 'dispo').
  const addToBoard = async (m) => {
    try {
      const created = await api.addLeadBoardItem(cid, {
        dev_id: m.dev_id, name: m.name || '', price: m.price_from || null,
        colonia: m.colonia || '', addr: m.address || '', specs: m.specs || [], status: 'dispo',
      });
      setBoard((b) => {
        const items = (b?.items || []).filter((x) => x.dev_id !== created.dev_id);
        return { ...(b || { engagement: {} }), items: [created, ...items] };
      });
      toast('success', 'Agregada al tablero');
    } catch (_) { toast('error', 'No se pudo agregar'); }
  };

  // B5.2b · Buscador de inventario para agregar CUALQUIER propiedad (no solo coincidencias).
  const openAddProp = () => {
    setShowAddProp(true);
    if (allDevs === null) {
      fetch(`${process.env.REACT_APP_BACKEND_URL}/api/developments?sort=recent`, { credentials: 'include' })
        .then((r) => r.json())
        .then((d) => setAllDevs(Array.isArray(d) ? d : (d?.items || [])))
        .catch(() => setAllDevs([]));
    }
  };
  const addDevToBoard = (d) => addToBoard({
    dev_id: d.id || d._id,
    name: d.name || d.title || 'Propiedad',
    price_from: d.price_from ?? d.price_min ?? d.price ?? null,
    colonia: d.colonia || d.neighborhood || d.colonia_id || '',
    address: d.address || d.direccion || '',
    specs: d.specs || [],
  });

  // B5.1 · Quitar una propiedad del tablero (optimista · revierte si falla).
  const removeBoard = async (id) => {
    setBoard((b) => ({ ...b, items: (b?.items || []).filter((x) => x.id !== id) }));
    try { await api.deleteLeadBoardItem(id); }
    catch (_) { toast('error', 'No se pudo quitar'); api.getLeadBoard(cid).then(setBoard).catch(() => {}); }
  };

  // B5.2 · Crear el link Tinder del cliente (sus swipes vuelven a este tablero).
  const createLink = async () => {
    setLinkBusy(true);
    try { setLinkInfo(await api.createSwipeLink(cid)); }
    catch (_) { toast('error', 'No se pudo crear el link'); }
    finally { setLinkBusy(false); }
  };
  // Link absoluto con el ORIGEN actual (mismo protocolo/host con el que entró el asesor) —
  // así no depende de FRONTEND_URL del backend ni Chrome fuerza https sobre un host http.
  const linkUrl = (li) => `${window.location.origin}/p/${li.token}`;
  const waLink = (li) => {
    const ph = (c.phones?.[0] || '').replace(/\D/g, '');
    const txt = `Hola ${c.first_name || ''}, te preparé una selección de propiedades. Entra y dime cuáles te laten (deslizas 👍/👎, toma 1 min) 👉 ${linkUrl(li)}`;
    return `https://wa.me/${ph}?text=${encodeURIComponent(txt)}`;
  };

  const completeTarea = async (tid) => {
    try {
      await api.completeTarea(tid);
      setTareas((prev) => prev.filter((t) => t.id !== tid));
      toast('success', 'Pendiente completado');
    } catch (_) { toast('error', 'No se pudo completar'); }
  };

  const submitNote = async () => {
    const body = note.trim();
    if (!body || noteBusy) return;
    setNoteBusy(true);
    try {
      await api.addTimelineEntry(cid, { kind: 'nota', body });
      setNote('');
      // refresca el timeline unificado para que la nota aparezca de inmediato.
      const o = await api.getContactoOverview(cid).catch(() => null);
      if (o) setOverview(o);
      toast('success', 'Nota registrada');
    } catch (_) { toast('error', 'No se pudo guardar la nota'); }
    finally { setNoteBusy(false); }
  };

  // Tarea desde el tab Actividad (createTarea real · scopeada al contacto).
  const submitTarea = async () => {
    const titulo = taskTitle.trim();
    if (!titulo) return;
    if (demo) { setTaskTitle(''); setTaskDue(''); setActMode(null); toast('success', 'Tarea creada'); return; }
    try {
      await api.createTarea({
        titulo, tipo: 'client', entity_id: cid,
        entity_label: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Lead',
        due_at: taskDue ? new Date(taskDue).toISOString() : undefined,
        prioridad: 'media',
      });
      setTaskTitle(''); setTaskDue(''); setActMode(null);
      toast('success', 'Tarea creada');
      api.listTareas({ contacto_id: cid }).then((t) => setTareas(t || [])).catch(() => {});
      const o = await api.getContactoOverview(cid).catch(() => null);
      if (o) setOverview(o);
    } catch (_) { toast('error', 'No se pudo crear la tarea'); }
  };

  // Nota por voz · dictado nativo del navegador (Web Speech API · es-MX) hacia la nota.
  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setActMode('nota');
    if (!SR) { toast('info', 'Dictado no disponible en este navegador · escribe la nota'); return; }
    try {
      const rec = new SR();
      rec.lang = 'es-MX'; rec.interimResults = false; rec.maxAlternatives = 1;
      rec.onresult = (ev) => setNote((p) => (p ? p + ' ' : '') + (ev.results?.[0]?.[0]?.transcript || ''));
      rec.onerror = () => toast('error', 'No se pudo dictar');
      rec.start();
      toast('info', 'Escuchando… habla ahora');
    } catch (_) { toast('error', 'No se pudo iniciar el dictado'); }
  };

  // Bloques de IA del perfil · demo (vista llena) O motor real (intel) · null = se oculta.
  const discData = demo?.disc || intel?.disc || null;
  const briefData = demo?.brief || intel?.brief || null;          // demo: {strong,rest,falta} · real: {text,falta}
  // Señales = demo O motor real (mejor hora + riesgo de enfriamiento). Solo las que existan.
  let signalsData = demo?.signals || null;
  if (!signalsData && intel) {
    const arr = [];
    if (intel.best_time) arr.push({ label: 'Mejor momento', value: intel.best_time.value, sub: intel.best_time.sub });
    if (intel.churn) arr.push({ label: 'Riesgo de enfriamiento', value: intel.churn.level, sub: intel.churn.reason, warn: intel.churn.level !== 'Bajo' });
    signalsData = arr.length ? arr : null;
  }
  const offerData = demo ? null : (intel?.offer || null);   // oferta AVM real (demo usa su bloque avance)

  // Criterios "qué busca" · demo o derivados de la primera búsqueda (datos reales).
  const criterios = demo ? demo.criterios : (firstBusq ? [
    { l: 'Presupuesto', v: firstBusq.precio_max ? `Hasta ${fmtMXN(firstBusq.precio_max)}` : (firstBusq.precio_min ? `Desde ${fmtMXN(firstBusq.precio_min)}` : '—') },
    { l: 'Zona', v: (firstBusq.colonias || []).join(', ') || '—' },
    { l: 'Recámaras', v: firstBusq.recamaras_min ? `${firstBusq.recamaras_min}+` : '—' },
    { l: 'Urgencia', v: firstBusq.urgencia || 'media' },
  ] : []);
  // Pendientes · demo o tareas reales.
  const pendientes = demo ? demo.pendientes : tareas.map((t) => ({
    kind: 'task', title: t.titulo, id: t.id,
    sub: `Tarea${t.due_at ? ` · ${new Date(t.due_at).toLocaleDateString('es-MX')}` : ''}${t.prioridad ? ` · ${t.prioridad}` : ''}`,
    cta: 'Completar', tid: t.id,
  }));

  return (
    <div className="asr-modal-scrim" role="presentation" onClick={onClose} style={{ zIndex: Z.DROPDOWN }}>
      <div
        className="asr-modal"
        data-testid="asr-ficha360"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="asr-modal__wrap">
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
            <div style={{
              width: 62, height: 62, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, rgba(109,74,255,0.30), rgba(120,150,255,0.28))',
              display: 'grid', placeItems: 'center',
              fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 22, color: 'var(--theme-2)',
            }}>
              {initials(c)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 28, letterSpacing: '-0.3px', color: 'var(--cream)', lineHeight: 1.1 }}>
                {c.first_name} {c.last_name || ''}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 6, flexWrap: 'wrap' }}>
                <TemperaturePill temp={c.temperatura} size="sm" />
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--cream-2)' }}>· {etapaMeta(etapaActual).label}</span>
                {c.tipo && <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--cream-2)', textTransform: 'capitalize' }}>· {c.tipo}</span>}
                {demo?.assignedToYou && (
                  <span className="asr-assignee">· <span className="asr-assignee__av">TÚ</span> Asignada a ti</span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {waUrl && (
                <a href={waUrl} target="_blank" rel="noreferrer" data-testid="asr-ficha360-wa" className="asr-hbtn asr-hbtn--key" style={{ textDecoration: 'none' }}>
                  <MessageCircle size={14} /> WhatsApp
                </a>
              )}
              <button onClick={openCita} data-testid="asr-ficha360-agendar" className="asr-hbtn">
                <Calendar size={14} /> Agendar
              </button>
            </div>
            <button onClick={onClose} data-testid="asr-ficha360-close" className="btn-icon-circle" aria-label="Cerrar" style={{ flexShrink: 0 }}>
              <X size={14} />
            </button>
          </div>

          {/* Chips de etapa del pipeline (mueven `etapa` via patchContacto · como el mockup) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 20, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--cream-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginRight: 4 }}>Etapa</span>
            {ETAPA_ORDER.map((ek) => (
              <button
                key={ek}
                data-testid={`asr-ficha360-stage-${ek}`}
                className={`asr-stchip${etapaActual === ek ? ' asr-stchip--on' : ''}`}
                disabled={stageBusy}
                onClick={() => moveEtapa(ek)}
              >
                {ETAPA[ek].label}
              </button>
            ))}
          </div>

          {/* Brief IA · demo (vista llena) o real (intel.brief determinístico) */}
          {briefData && (
            <div className="asr-brief">
              <div className="asr-brief__i">IA</div>
              <div className="asr-brief__t">
                {briefData.strong ? <><b>{briefData.strong}</b>{briefData.rest}</> : briefData.text}
                {briefData.falta ? <> <span className="asr-falta">{briefData.falta}</span></> : null}
              </div>
            </div>
          )}

          {/* Co-piloto contextual · en real, los chips abren el Plan venta IA (argumentario
              RAG con Claude · motor real). En demo es vista (sin lead real en backend). */}
          {(demo?.copilot || !demo) && (
            <div className="asr-copilot">
              <div className="asr-copilot__i">IA</div>
              <input
                className="asr-copilot__in"
                placeholder={`Pregúntale a la IA sobre ${c.first_name || 'el lead'}…`}
                readOnly={!!demo}
                onKeyDown={(e) => { if (!demo && e.key === 'Enter' && onOpenArg) onOpenArg(); }}
              />
              {(demo?.copilot || ['Resumir', 'Redactar seguimiento', '¿Qué le ofrezco?']).map((cp) => (
                <button key={cp} className="asr-cpchip" data-testid={`asr-copilot-${cp}`}
                  onClick={() => { if (!demo && onOpenArg) onOpenArg(); }}>{cp}</button>
              ))}
            </div>
          )}

          {/* Tab bar */}
          <div className="asr-tabbar" role="tablist">
            {TABS.map((tb) => {
              const count = demo
                ? (tb.key === 'conv' ? demo.convCount : tb.key === 'act' ? demo.actCount : null)
                : tb.key === 'props' ? busquedas.length
                : tb.key === 'conv' ? (Array.isArray(convos) ? convos.length : null)
                : tb.key === 'act' ? (overview?.count ?? null)
                : null;
              return (
                <button
                  key={tb.key}
                  role="tab"
                  aria-selected={tab === tb.key}
                  data-testid={`asr-ficha360-tab-${tb.key}`}
                  className={`asr-tab${tab === tb.key ? ' asr-tab--on' : ''}`}
                  onClick={() => setTab(tb.key)}
                >
                  {tb.label}
                  {count ? <span className="asr-tab__count">{count}</span> : null}
                </button>
              );
            })}
          </div>

          {/* ── Pane: Resumen ── */}
          {tab === 'resumen' && (
            <div className="asr-pane" data-testid="asr-ficha360-pane-resumen">
              {/* Datos del cliente (+ enriquecimiento de redes en demo) */}
              <div style={{ marginBottom: 24 }}>
                <div className="asr-sec-h"><span className="asr-sdot" style={{ background: 'var(--cold)' }} />Datos del cliente</div>
                {demo?.redes ? (
                  <div className="asr-datos">
                    <div className="asr-datos__col">
                      <div className="asr-drow"><MessageCircle size={15} color="var(--cream-3)" /> {demo.datos.phone}</div>
                      <div className="asr-drow"><Mail size={15} color="var(--cream-3)" /> {demo.datos.email}</div>
                      <div className="asr-drow"><Globe size={15} color="var(--cream-3)" /> {demo.datos.source}</div>
                      {demo.datos.consent && (
                        <div className="asr-consent"><Check size={13} /> Consentimiento para mensajear · registrado</div>
                      )}
                    </div>
                    <div className="asr-datos__col asr-datos__col--enrich">
                      <div className="asr-enrich-h">Redes sociales<span className="asr-enrich-h__src"><Check size={13} /> verificadas</span></div>
                      {demo.redes.map((r) => (
                        <div className="asr-erow" key={r.text}>
                          <span className="asr-erow__dot" style={{ background: r.color }} />
                          {r.text}
                          <Check className="asr-erow__chk" size={14} />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ border: '1px solid var(--border)', borderLeft: '3px solid var(--cold)', borderRadius: 12, background: 'var(--surface)', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {(c.phones || []).map((p) => (
                      <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--cream)', padding: '6px 0' }}>
                        <PhoneIcon size={15} color="var(--cream-3)" /> {p}
                      </div>
                    ))}
                    {(c.emails || []).map((e) => (
                      <div key={e} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--cream)', padding: '6px 0' }}>
                        <Mail size={15} color="var(--cream-3)" /> {e}
                      </div>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--cream)', padding: '6px 0' }}>
                      <Globe size={15} color="var(--cream-3)" />
                      {c.fuente || c.source ? `Llegó por ${c.fuente || c.source}` : 'Alta manual'}
                      {c.created_at ? ` · ${new Date(c.created_at).toLocaleDateString('es-MX')}` : ''}
                    </div>
                    {(c.tags || []).length > 0 && (
                      <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', paddingTop: 4 }}>{c.tags.join(' · ')}</div>
                    )}
                  </div>
                )}
              </div>

              {/* Cómo tratarla · DISC · demo o motor real (conversation_disc_adapter) */}
              {discData && (
                <div style={{ marginBottom: 24 }}>
                  <div className="asr-sec-h"><span className="asr-sdot" style={{ background: '#7C4DFF' }} />Cómo tratarla <span className="asr-muted">· estilo de comunicación</span></div>
                  <div className="asr-disc">
                    <div className="asr-disc__type">
                      <span className="asr-disc__big">{discData.letter}</span>
                      <div><b className="asr-disc__name">{discData.name}</b><span className="asr-disc__sub">{discData.sub}</span></div>
                    </div>
                    <div className="asr-disc__tips">
                      {discData.tips.map((tp) => <div key={tp}>· {tp}</div>)}
                    </div>
                  </div>
                </div>
              )}

              {/* Qué tan listo está · anillo % cierre */}
              <div style={{ marginBottom: 24 }}>
                <div className="asr-sec-h">Qué tan listo está</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 22, border: '1px solid var(--border)', borderLeft: '3px solid var(--theme)', borderRadius: 12, padding: '18px 20px', background: 'var(--surface)' }}>
                  <ScoreRing value={probPct} />
                  <div style={{ fontSize: 15, color: 'var(--cream-2)', lineHeight: 1.55, borderLeft: '1px solid var(--border)', paddingLeft: 22 }}>
                    {probPct == null ? (
                      <span>Calculando con el historial del lead…</span>
                    ) : (
                      <>
                        {readyLines.length > 0 && <span>{readyLines.join(' · ')}. </span>}
                        <b style={{ color: 'var(--cream)' }}>{readyCta}</b>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Señales IA · demo o motor real (churn_prediction · riesgo de enfriamiento) */}
              {signalsData && (
                <div style={{ marginBottom: 24 }}>
                  <div className="asr-sec-h"><span className="asr-sdot" style={{ background: 'var(--ok)' }} />Señales IA</div>
                  <div className="asr-signals">
                    {signalsData.map((s) => (
                      <div className={`asr-signal${s.warn ? ' asr-signal--warn' : ''}`} key={s.label}>
                        <div className="asr-signal__l">{s.label}</div>
                        <div className="asr-signal__v">{s.value}</div>
                        <div className="asr-signal__s">{s.sub}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Qué busca el cliente (criterios de su búsqueda) */}
              {criterios.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div className="asr-sec-h">Qué busca el cliente</div>
                  <div className="asr-criterios">
                    {criterios.map((cr) => (
                      <div className="asr-cr" key={cr.l}>
                        <div className="asr-crl">{cr.l}</div>
                        <div className="asr-crv">{cr.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Oferta sugerida · valuación AVM REAL de la zona (estimación honesta) */}
              {offerData && (
                <div style={{ marginBottom: 24 }}>
                  <div className="asr-sec-h">Oferta sugerida <span className="asr-muted">· estimación AVM de la zona</span></div>
                  <div className="asr-offsugg">
                    <Sparkles size={15} />
                    <span><b>{fmtMXN(offerData.value)}</b> · {offerData.basis} · {offerData.colonia}</span>
                  </div>
                </div>
              )}

              {/* Pendientes (demo o tareas reales · completar) · se OCULTA si no hay */}
              {pendientes.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div className="asr-sec-h"><span className="asr-sdot" style={{ background: 'var(--warm)' }} />Pendientes <span className="asr-muted">· tareas y citas en proceso</span></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {pendientes.map((p, i) => (
                      <div className="asr-pend" key={p.id || p.title || i} data-testid={`asr-pend-${p.tid || i}`}
                        style={{ borderLeft: `3px solid ${p.kind === 'cita' ? 'var(--cold)' : 'var(--warm)'}` }}>
                        <span className="asr-pend__dot" style={{ background: p.kind === 'cita' ? 'var(--cold)' : 'var(--warm)' }} />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <b style={{ fontSize: 14.5, color: 'var(--cream)', fontWeight: 700 }}>{p.title}</b>
                          <span style={{ fontSize: 12, color: 'var(--cream-3)', marginTop: 2 }}>{p.sub}</span>
                        </div>
                        <button className="asr-donebtn" data-testid={`asr-pend-done-${p.tid || i}`}
                          onClick={() => { if (p.tid) completeTarea(p.tid); }}>
                          {p.cta === 'Ver' ? null : <Check size={13} />} {p.cta || 'Completar'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Automatización del lead (demo · toggle) */}
              {demo?.auto && (
                <div style={{ marginBottom: 24 }}>
                  <div className="asr-sec-h"><span className="asr-sdot" style={{ background: 'var(--ok)' }} />Automatización del lead</div>
                  <div className="asr-autorow">
                    <div className="asr-autorow__i"><Sparkles size={16} /></div>
                    <div className="asr-autorow__t"><b>{demo.auto.title}</b><span>{demo.auto.sub}</span></div>
                    <div className="asr-switch" aria-hidden="true" />
                  </div>
                </div>
              )}

              {/* Avance al cierre + oferta sugerida (demo) */}
              {demo?.avance && (
                <div style={{ marginBottom: 24 }}>
                  <div className="asr-sec-h">Avance al cierre <span className="asr-muted">· en negociación</span></div>
                  <div className="asr-criterios">
                    {demo.avance.map((a) => (
                      <div className="asr-cr" key={a.l}><div className="asr-crl">{a.l}</div><div className="asr-crv">{a.v}</div></div>
                    ))}
                  </div>
                  {demo.oferta && (
                    <div className="asr-offsugg">
                      <Sparkles size={15} />
                      <span><b>{demo.oferta.split(' · ')[0]}</b> · {demo.oferta.split(' · ').slice(1).join(' · ')}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Plan venta IA (reusa Argumentario) */}
              <div style={{ marginTop: 22 }}>
                <button onClick={onOpenArg} data-testid="open-arg" className="asr-hbtn asr-hbtn--key">
                  <Sparkles size={14} /> Plan venta IA
                </button>
              </div>
            </div>
          )}

          {/* ── Pane: Propiedades (read-only · búsquedas + matches) ── */}
          {tab === 'props' && (
            <div className="asr-pane" data-testid="asr-ficha360-pane-props">
              {demo?.board ? (
                <>
                  <div className="asr-sec-h" style={{ fontSize: 13, marginBottom: 14 }}>Propiedades de {c.first_name} <span className="asr-muted">· disponibilidad y avance</span></div>
                  {demo.engage && (
                    <div className="asr-engage">
                      <span className="asr-engage__lv" />
                      <div className="asr-engage__t"><b>{demo.engage.text.split(' · ')[0]}</b> · {demo.engage.text.split(' · ').slice(1).join(' · ')}</div>
                      <div className="asr-engage__es">
                        <span className="vw">{demo.engage.views} vistas</span>
                        <span className="up"><ThumbsUp size={12} /> {demo.engage.up}</span>
                        <span className="dn"><ThumbsDown size={12} /> {demo.engage.down}</span>
                      </div>
                    </div>
                  )}
                  <div className="asr-pk">
                    {demo.board.map((bcol) => (
                      <div className="asr-pkcol" key={bcol.key}>
                        <div className="asr-pkh"><span className="pd" style={{ background: DOTC[bcol.dot] }} />{bcol.label}<span className="pc">{bcol.count}</span></div>
                        {bcol.items.map((p, i) => (
                          <div className="asr-pcard" key={i} style={{ opacity: p.dim ? 0.6 : 1 }}>
                            <div className="asr-pcard__ph"><span className="asr-pcard__pp">{p.price}</span></div>
                            <div className="asr-pcard__pb">
                              <div className="asr-pcard__pt">{p.title}</div>
                              <div className="asr-pcard__paddr">{p.addr}</div>
                              <div className="asr-pcard__specs">{p.specs.map((s) => <span key={s}>{s}</span>)}</div>
                              {p.note && (
                                <div className="asr-pcard__note" style={{ color: TONEC[p.tone] || 'var(--cream-3)', fontWeight: p.tone ? 600 : 400 }}>
                                  {p.thumb === 'up' && <ThumbsUp size={11} />}{p.thumb === 'down' && <ThumbsDown size={11} />}{p.note}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                        {bcol.reco && <div className="asr-reco">{bcol.reco}</div>}
                      </div>
                    ))}
                  </div>
                  {demo.tinder && (
                    <div className="asr-tinder">
                      <div className="asr-tinder__i"><ArrowLeftRight size={19} /></div>
                      <div className="asr-tinder__tx"><b>{demo.tinder.title}</b><p>{demo.tinder.sub}</p></div>
                      <button className="asr-tinder__btn">{demo.tinder.cta}</button>
                    </div>
                  )}
                </>
              ) : boardLoading && board === null ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>Cargando propiedades…</div>
              ) : (
                <>
                  {/* B5.2b · Header: agregar propiedad directo (no solo desde búsquedas) */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
                    <div className="asr-sec-h" style={{ fontSize: 13, margin: 0 }}>Propiedades de {c.first_name} <span className="asr-muted">· arrastra entre columnas</span></div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      {(board?.items || []).some((it) => ['cita', 'visitada'].includes(NORM_STATUS(it.status))) && (
                        <button onClick={() => setShowRecorrido(true)} data-testid="asr-board-recorrido" className="asr-hbtn">🗺️ Recorrido</button>
                      )}
                      <button onClick={openAddProp} data-testid="asr-board-addprop" className="asr-hbtn asr-hbtn--key">+ Agregar propiedad</button>
                    </div>
                  </div>

                  {/* B5.2-D · Resumen prescriptivo: qué propiedades están atoradas */}
                  {(() => {
                    const nd = (board?.items || []).map((it) => STAGE_NUDGE(it)).filter(Boolean);
                    if (!nd.length) return null;
                    const urg = nd.filter((n) => n.u).length;
                    return (
                      <div data-testid="asr-board-nudge-summary" style={{ display: 'flex', alignItems: 'center', gap: 9, background: urg ? 'rgba(232,147,12,0.10)' : 'rgba(var(--theme-rgb),0.08)', border: `1px solid ${urg ? 'rgba(232,147,12,0.32)' : 'rgba(var(--theme-rgb),0.25)'}`, borderRadius: 11, padding: '9px 13px', marginBottom: 13, fontSize: 12.5, color: 'var(--cream-2)' }}>
                        <span style={{ fontSize: 15 }}>🔔</span>
                        <span><b style={{ color: 'var(--cream)' }}>{nd.length} {nd.length > 1 ? 'propiedades' : 'propiedad'} por atender</b> · {nd[0].t}{nd.length > 1 ? ` · +${nd.length - 1} más` : ''}</span>
                      </div>
                    );
                  })()}

                  {/* Engagement del link · real (se llena con los swipes del Tinder · B5.2) */}
                  {board?.engagement?.views > 0 && (
                    <div className="asr-engage">
                      <span className="asr-engage__lv" />
                      <div className="asr-engage__t"><b>Link de propiedades</b> · actividad del cliente</div>
                      <div className="asr-engage__es">
                        <span className="vw">{board.engagement.views} vistas</span>
                        <span className="up"><ThumbsUp size={12} /> {board.engagement.up}</span>
                        <span className="dn"><ThumbsDown size={12} /> {board.engagement.down}</span>
                      </div>
                    </div>
                  )}

                  {/* Tablero por estatus · arrastra las tarjetas entre columnas */}
                  <div className="asr-pk">
                    {BOARD_STATUS.map((st) => {
                      const meta = BOARD_META[st];
                      const col = (board?.items || []).filter((it) => NORM_STATUS(it.status) === st);
                      return (
                        <div className="asr-pkcol" key={st} data-testid={`asr-board-col-${st}`}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => { e.preventDefault(); moveBoard(e.dataTransfer.getData('text/plain') || dragId, st); }}>
                          <div className="asr-pkh"><span className="pd" style={{ background: DOTC[meta.dot] }} />{meta.label}<span className="pc">{col.length}</span></div>
                          {col.map((p) => (
                            <div className="asr-pcard" key={p.id} draggable data-testid={`asr-board-card-${p.id}`}
                              onDragStart={(e) => { setDragId(p.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.id); }} onDragEnd={() => setDragId(null)}
                              style={{ position: 'relative', opacity: dragId === p.id ? 0.45 : (p.status === 'descartada' ? 0.6 : 1), cursor: 'grab' }}>
                              <button onClick={(e) => { e.stopPropagation(); removeBoard(p.id); }} data-testid={`asr-board-remove-${p.id}`} title="Quitar del tablero"
                                style={{ position: 'absolute', top: 3, right: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cream-3)', fontSize: 14, lineHeight: 1, padding: 2, zIndex: 1 }}>×</button>
                              <div className="asr-pcard__ph"><span className="asr-pcard__pp">{p.price ? fmtMXN(p.price) : ''}</span></div>
                              <div className="asr-pcard__pb">
                                <div className="asr-pcard__pt">{p.name}</div>
                                {p.addr && <div className="asr-pcard__paddr">{p.addr}</div>}
                                {(p.specs || []).length > 0 && <div className="asr-pcard__specs">{p.specs.map((s) => <span key={s}>{s}</span>)}</div>}
                                {(p.thumb || p.note) && (
                                  <div className="asr-pcard__note">
                                    {p.thumb === 'up' && <ThumbsUp size={11} />}{p.thumb === 'down' && <ThumbsDown size={11} />}{p.note}
                                  </div>
                                )}
                                {p.client_cita && <div className="asr-pcard__note" style={{ color: 'var(--theme-2)', fontWeight: 600 }}>📅 Pidió: {p.client_cita}</div>}
                                {p.client_note && <div className="asr-pcard__note" style={{ color: 'var(--cream-2)' }}>📝 {p.client_note}</div>}
                                {p.visit_feedback && <div className="asr-pcard__note" style={{ color: '#10b981', fontWeight: 600 }}>✓ {FB_LABEL[p.visit_feedback.salio] || 'Visitada'}{p.visit_feedback.nota ? ` · ${p.visit_feedback.nota}` : ''}</div>}
                                {(() => { const n = STAGE_NUDGE(p); return n ? <div className="asr-pcard__note" style={{ color: n.u ? '#e8930c' : 'var(--theme-2)', fontWeight: 700 }}>{n.u ? '⏳ ' : '📅 '}{n.t}</div> : null; })()}
                                {p.avm && <div className="asr-pcard__note" style={{ color: 'var(--ok)', fontWeight: 700 }}>💰 Sugiere ofertar {fmtMXN(p.avm.sugerido)}{p.avm.arriba ? ' · la listan arriba del estimado' : ''}</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>

                  {/* B5.2 · Crear y enviar el link Tinder al cliente (sus swipes vuelven aquí) */}
                  {(board?.items || []).length > 0 && (
                    linkInfo ? (
                      <div className="asr-tinder" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                        <div className="asr-tinder__tx"><b>Link listo para {c.first_name}</b><p style={{ wordBreak: 'break-all' }}>{linkUrl(linkInfo)}</p></div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <a href={waLink(linkInfo)} target="_blank" rel="noopener noreferrer" className="asr-tinder__btn" style={{ flex: 1, textDecoration: 'none', textAlign: 'center', justifyContent: 'center', marginLeft: 0 }}>Enviar por WhatsApp</a>
                          <a href={linkUrl(linkInfo)} target="_blank" rel="noopener noreferrer" className="asr-hbtn" style={{ textDecoration: 'none' }}>Abrir</a>
                          <button className="asr-hbtn" onClick={() => { try { navigator.clipboard.writeText(linkUrl(linkInfo)); } catch (_) {} toast('success', 'Link copiado'); }}>Copiar</button>
                        </div>
                      </div>
                    ) : (
                      <div className="asr-tinder">
                        <div className="asr-tinder__i"><ArrowLeftRight size={19} /></div>
                        <div className="asr-tinder__tx"><b>Enviar link de propiedades a {c.first_name}</b><p>Un link · el cliente desliza 👍/👎 · cada deslizada vuelve a este tablero.</p></div>
                        <button className="asr-tinder__btn" onClick={createLink} disabled={linkBusy}>{linkBusy ? '…' : 'Crear y enviar'}</button>
                      </div>
                    )
                  )}

                  {/* Fuente: coincidencias de las búsquedas del lead → agregar al tablero */}
                  {busquedas.length > 0 && (
                    <div style={{ marginTop: 18 }}>
                      <div className="asr-sec-h" style={{ fontSize: 12.5, marginBottom: 10 }}>
                        <Building2 size={14} color="var(--cream-3)" /> Coincidencias <span className="asr-muted">· agrégalas al tablero</span>
                      </div>
                      {propsLoading && Object.keys(matches).length === 0 ? (
                        <div style={{ padding: 18, textAlign: 'center', color: 'var(--cream-3)', fontSize: 12.5 }}>Buscando coincidencias…</div>
                      ) : (
                        busquedas.map((b) => {
                          const ms = matches[b.id] || [];
                          if (!ms.length) return null;
                          return (
                            <div key={b.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12, marginBottom: 12 }}>
                              {ms.slice(0, 8).map((m) => {
                                const already = (board?.items || []).some((it) => it.dev_id === m.dev_id);
                                return (
                                  <div className="asr-prop" key={m.dev_id} data-testid={`asr-prop-${m.dev_id}`}>
                                    <div style={{ height: 56, background: 'var(--surface-2)', position: 'relative', borderBottom: '1px solid var(--border)' }}>
                                      <span style={{ position: 'absolute', left: 9, bottom: 6, fontFamily: 'Outfit', fontWeight: 700, fontSize: 12, color: 'var(--theme-2)' }} className="asr-num">
                                        {m.price_from ? fmtMXN(m.price_from) : ''}
                                      </span>
                                    </div>
                                    <div style={{ padding: '9px 11px' }}>
                                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--cream)' }}>{m.name}</div>
                                      <div style={{ fontSize: 11, color: 'var(--cream-3)', marginTop: 2 }}>{m.colonia}</div>
                                      <button onClick={() => addToBoard(m)} disabled={already} data-testid={`asr-board-add-${m.dev_id}`}
                                        style={{ marginTop: 8, width: '100%', padding: '6px 0', borderRadius: 8, border: '1px solid var(--border)',
                                          cursor: already ? 'default' : 'pointer', fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 700,
                                          background: already ? 'transparent' : 'rgba(var(--theme-rgb),0.10)', color: already ? 'var(--cream-3)' : 'var(--theme-2)' }}>
                                        {already ? '✓ En tablero' : '+ Tablero'}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {/* Vacío total: ni tablero ni búsquedas */}
                  {(board?.items || []).length === 0 && busquedas.length === 0 && (
                    <div style={{ padding: '34px 18px', textAlign: 'center', color: 'var(--cream-3)', fontSize: 13.5, border: '1px dashed var(--border-2)', borderRadius: 12, marginTop: 14 }}>
                      Aún no hay propiedades en el tablero. Usa <b>+ Agregar propiedad</b> (arriba) para buscarlas en el inventario, o cuando el lead tenga una búsqueda sus coincidencias aparecerán aquí.
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Pane: Conversaciones (hilo real o empty) ── */}
          {tab === 'conv' && (
            <div className="asr-pane" data-testid="asr-ficha360-pane-conv">
              {/* Bandeja DEMO (espejo del mockup) · multicanal + ánimo + objeción + hilo + sugerencia */}
              {demo?.conversation && (() => {
                const cv = demo.conversation;
                const ch = convChan;
                const visible = cv.thread.filter((m) => m.sys || ch === 'all' || m.ch === ch);
                return (
                  <>
                    <div className="asr-convhint"><MessageSquare size={14} /> {cv.hint}</div>
                    <div className="asr-convmeta">
                      <div className="cm"><span className="cml">Ánimo del cliente</span>
                        <span className="cmv" style={{ color: 'var(--ok)' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)' }} />{cv.mood.label}</span>
                        <span className="cmh">{cv.mood.sub}</span></div>
                      <div className="cm"><span className="cml">Estado</span>
                        <span className="cmv"><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warm)' }} />{cv.estado.label}</span>
                        <span className="cmh">{cv.estado.sub}</span></div>
                    </div>
                    {cv.objection && (
                      <div className="asr-objbar"><AlertTriangle size={16} color="var(--hot)" />
                        <span><b>Objeción detectada:</b> {cv.objection}</span><span className="obfix">Cómo responder →</span></div>
                    )}
                    <div className="asr-chanfilter">
                      {cv.channels.map((c) => (
                        <button key={c.key} className={ch === c.key ? 'on' : ''} onClick={() => setConvChan(c.key)}>
                          {c.color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />}{c.label}
                        </button>
                      ))}
                      <button style={{ borderStyle: 'dashed' }}>+ canal</button>
                    </div>
                    <div className="asr-thread">
                      {visible.map((m, i) => m.sys ? (
                        <div className="asr-sysline" key={i}>— {m.sys} —</div>
                      ) : (
                        <div className={`asr-msg ${m.dir}`} key={i}>
                          {m.prop ? (
                            <div className="asr-propmsg"><div className="pmh"><span className="pp">{m.prop.price}</span></div>
                              <div className="pmb"><div className="pmt">{m.prop.title}</div><div className="pms">{m.prop.specs}</div></div></div>
                          ) : <div className="asr-bubble">{m.text}</div>}
                          <div className="asr-mmeta">{m.dot && <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.dot }} />}{m.meta}</div>
                        </div>
                      ))}
                    </div>
                    {cv.suggestion && (
                      <div className="asr-aisugg"><div className="asr-aisugg__i"><Sparkles size={15} /></div>
                        <span><b>Sugerencia:</b> "{cv.suggestion}"</span><button className="asr-usebtn">Usar</button></div>
                    )}
                    <div className="asr-compose">
                      <button className="asr-attachbtn"><Building2 size={15} /> Propiedad</button>
                      <button className="asr-attachbtn"><MessageSquare size={15} /> Plantillas</button>
                      <span className="asr-replyon">Respondes por <span className="asr-rchan"><span style={{ width: 8, height: 8, borderRadius: '50%', background: cv.replyChannel.color }} />{cv.replyChannel.label}</span></span>
                      <input placeholder="Escribe tu respuesta…" readOnly />
                      <button className="asr-hbtn asr-hbtn--key"><Send size={14} /> Enviar</button>
                    </div>
                  </>
                );
              })()}

              {/* Ánimo del cliente (sentiment REAL · client_insights) · solo si hay señal */}
              {!demo && convIntel?.sentiment && convIntel.sentiment !== 'neutral' && (
                <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 11, overflow: 'hidden', marginBottom: 16, background: 'var(--surface)' }}>
                  <div style={{ flex: 1, padding: '11px 15px', borderRight: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--cream-3)', display: 'block', marginBottom: 5 }}>Ánimo del cliente</span>
                    <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6, color: convIntel.sentiment === 'positivo' ? 'var(--ok)' : 'var(--hot)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: convIntel.sentiment === 'positivo' ? 'var(--ok)' : 'var(--hot)' }} />
                      {convIntel.sentiment === 'positivo' ? 'Positivo' : 'Negativo'}
                    </span>
                  </div>
                  {convIntel.next_action?.text && (
                    <div style={{ flex: 1, padding: '11px 15px' }}>
                      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--cream-3)', display: 'block', marginBottom: 5 }}>Próximo paso (IA)</span>
                      <span style={{ fontSize: 13, color: 'var(--cream-2)' }}>{convIntel.next_action.text}</span>
                    </div>
                  )}
                </div>
              )}
              {!demo?.conversation && (convLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>Cargando conversaciones…</div>
              ) : !convos || convos.length === 0 ? (
                <div style={{ padding: '40px 18px', textAlign: 'center', color: 'var(--cream-3)', fontSize: 13.5, border: '1px dashed var(--border-2)', borderRadius: 12 }}>
                  <MessageSquare size={22} color="var(--cream-3)" style={{ margin: '0 auto 10px' }} />
                  Aún no hay conversaciones registradas con este lead.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                  {convos.map((cv, i) => (
                    <div key={cv.id || cv.conversation_id || i} style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: '13px 15px', boxShadow: 'var(--asr-shadow)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: cv.sentiment === 'negative' ? 'var(--hot)' : cv.sentiment === 'positive' ? 'var(--ok)' : 'var(--cream-3)' }} />
                        <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13.5, color: 'var(--cream)', textTransform: 'capitalize' }}>
                          {cv.channel || cv.canal || 'Conversación'}
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--cream-3)' }}>
                          {relWhen(cv.last_message_at || cv.updated_at || cv.created_at)}
                        </span>
                      </div>
                      <div style={{ fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.5 }}>
                        {cv.last_message_text || cv.last_message || cv.summary || cv.resumen || `${cv.message_count || cv.messages_count || 0} mensajes`}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* ── Pane: Actividad (timeline unificado /overview + nota) ── */}
          {tab === 'act' && (
            <div className="asr-pane" data-testid="asr-ficha360-pane-act">
              {/* 4 acciones del mockup: Nota · Tarea · Cita · Nota por voz */}
              <div className="asr-actbtns" style={{ display: 'flex', gap: 9, marginBottom: 18, flexWrap: 'wrap' }}>
                <button className="asr-ctxbtn" data-testid="asr-act-nota" onClick={() => setActMode((m) => (m === 'nota' ? null : 'nota'))}><Pencil size={15} /> Nota</button>
                <button className="asr-ctxbtn" data-testid="asr-act-tarea" onClick={() => setActMode((m) => (m === 'tarea' ? null : 'tarea'))}><ListChecks size={15} /> Tarea</button>
                <button className="asr-ctxbtn" data-testid="asr-act-cita" onClick={openCita}><Calendar size={15} /> Cita</button>
                <button className="asr-ctxbtn" data-testid="asr-act-voz" onClick={startVoice}><Mic size={15} /> Nota por voz</button>
              </div>

              {/* Form inline · Nota */}
              {actMode === 'nota' && (
                <div style={{ display: 'flex', gap: 9, marginBottom: 18 }}>
                  <input data-testid="add-note-input" value={note} autoFocus
                    onChange={(e) => setNote(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submitNote(); }}
                    placeholder="Escribe la nota…"
                    style={{ flex: 1, padding: '11px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 14, outline: 'none' }} />
                  <button className="asr-hbtn asr-hbtn--key" data-testid="asr-ficha360-note-save" onClick={submitNote} disabled={noteBusy || !note.trim()} style={{ opacity: (noteBusy || !note.trim()) ? 0.6 : 1 }}>Guardar</button>
                </div>
              )}

              {/* Form inline · Tarea */}
              {actMode === 'tarea' && (
                <div style={{ display: 'flex', gap: 9, marginBottom: 18, flexWrap: 'wrap' }}>
                  <input value={taskTitle} autoFocus onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="Título de la tarea…"
                    style={{ flex: '1 1 200px', padding: '11px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 14, outline: 'none' }} />
                  <input type="datetime-local" value={taskDue} onChange={(e) => setTaskDue(e.target.value)}
                    style={{ padding: '11px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none' }} />
                  <button className="asr-hbtn asr-hbtn--key" data-testid="asr-act-tarea-save" onClick={submitTarea} disabled={!taskTitle.trim()} style={{ opacity: taskTitle.trim() ? 1 : 0.6 }}>Crear tarea</button>
                </div>
              )}

              {/* Timeline · demo (mockup) o real (/overview) */}
              {(() => {
                const rows = demo?.activity
                  || (overview?.timeline || []).map((e) => ({ kind: e.kind, source: e.source, title: e.title || e.kind, body: (e.body && e.body !== e.title) ? e.body : '', when: relWhen(e.ts) }));
                if (!demo && actLoading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>Cargando actividad…</div>;
                if (!rows.length) return (
                  <div style={{ padding: '34px 18px', textAlign: 'center', color: 'var(--cream-3)', fontSize: 13.5, border: '1px dashed var(--border-2)', borderRadius: 12 }}>
                    Sin actividad registrada aún. Tu primera nota aparecerá aquí.
                  </div>
                );
                return (
                  <div className="asr-tl">
                    {rows.slice(0, 40).map((r, i) => (
                      <div className="asr-tlrow" key={i} data-testid="asr-tlrow">
                        <span className="asr-tlrow__dot" style={{ background: eventDot(r.source, r.kind) }} />
                        <span><b style={{ textTransform: 'capitalize' }}>{r.title}</b>{r.body ? ` · ${r.body}` : ''}
                          {r.badge && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 9999, background: 'rgba(var(--theme-rgb),0.12)', color: 'var(--theme-2)' }}>{r.badge}</span>}
                        </span>
                        <span className="asr-when">{r.when}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* B4 · Agendar cita inline · mismo modal que la página de Citas, prellenado con el lead */}
      {showCita && (
        <NewCitaModal
          user={user}
          prefilledContact={{
            name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
            phone: c.phones?.[0] || '',
            email: c.emails?.[0] || '',
          }}
          projects={citaProjects}
          onClose={() => setShowCita(false)}
          onSuccess={() => toast('success', 'Cita agendada')}
        />
      )}

      {/* B5.2-B · Feedback de visita (al mover a "Visitada") */}
      {feedbackItem && (
        <div onClick={() => setFeedbackItem(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,16,40,0.45)', zIndex: Z.MODAL, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <VisitFeedbackForm item={feedbackItem} onSave={saveFeedback} onClose={() => setFeedbackItem(null)} />
        </div>
      )}

      {/* B5.2-C · Armar recorrido (vista viva del día) */}
      {showRecorrido && (
        <RecorridoModal
          items={(board?.items || []).filter((it) => ['cita', 'visitada'].includes(NORM_STATUS(it.status)))}
          leadName={c.first_name}
          onConfirm={confirmVisita}
          onClose={() => setShowRecorrido(false)}
        />
      )}

      {/* B5.2b · Buscador de inventario para agregar propiedad al tablero */}
      {showAddProp && (
        <div onClick={() => setShowAddProp(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,16,40,0.45)', zIndex: Z.MODAL, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', width: '100%', maxWidth: 560, maxHeight: '82vh', borderRadius: '18px 18px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border)' }}>
            <div style={{ padding: '15px 18px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <b style={{ fontFamily: 'Outfit, sans-serif', fontSize: 15, color: 'var(--cream)' }}>Agregar propiedad al tablero</b>
              <button onClick={() => setShowAddProp(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cream-3)', padding: 2 }}><X size={18} /></button>
            </div>
            <div style={{ padding: '12px 18px' }}>
              <input autoFocus value={devQ} onChange={(e) => setDevQ(e.target.value)} placeholder="Buscar por nombre o colonia…"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--cream)', fontFamily: 'DM Sans, sans-serif', fontSize: 13.5, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ overflowY: 'auto', padding: '0 14px 16px' }}>
              {allDevs === null ? (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--cream-3)', fontSize: 13 }}>Cargando inventario…</div>
              ) : (() => {
                const onBoard = new Set((board?.items || []).map((it) => it.dev_id));
                const q = devQ.trim().toLowerCase();
                const list = (allDevs || []).filter((d) => !q || `${d.name || d.title || ''} ${d.colonia || d.neighborhood || ''}`.toLowerCase().includes(q));
                if (!list.length) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--cream-3)', fontSize: 13 }}>Sin resultados.</div>;
                return list.slice(0, 40).map((d) => {
                  const did = d.id || d._id;
                  const already = onBoard.has(did);
                  const price = d.price_from ?? d.price_min ?? d.price;
                  return (
                    <div key={did} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 4px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, fontSize: 13.5, color: 'var(--cream)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name || d.title || 'Propiedad'}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--cream-3)' }}>{d.colonia || d.neighborhood || 'CDMX'}{price ? ` · ${fmtMXN(price)}` : ''}</div>
                      </div>
                      <button onClick={() => addDevToBoard(d)} disabled={already} data-testid={`asr-addprop-${did}`}
                        style={{ flexShrink: 0, padding: '7px 13px', borderRadius: 8, border: '1px solid var(--border)', cursor: already ? 'default' : 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700, background: already ? 'transparent' : 'rgba(var(--theme-rgb),0.10)', color: already ? 'var(--cream-3)' : 'var(--theme-2)' }}>
                        {already ? '✓ En tablero' : '+ Agregar'}
                      </button>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
