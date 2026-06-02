/**
 * Tu Asistente — la cara del Cerebro, en lenguaje de persona normal.
 * Muchas opciones agrupadas (incl. "Solo en DMX" = info game-changer), tarjetas
 * que el dev arma combinando acciones, y el flujo obvio (hace el trabajo → te pide
 * permiso para lo importante). Detrás de CEREBRO_ENABLED.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import {
  getCerebroStatus, getCerebroTasks, runCerebroGoal, approveCerebroTask, rejectCerebroTask,
  getCerebroConfig, saveCerebroConfig, getCerebroCatalog, createCustomGoal, deleteCustomGoal,
  getCerebroScopes, askCopilot, getCerebroLearning, cerebroLearningDemo,
} from '../../api/cerebro';
import { Sparkles, Check, X, Hand, Settings, Plus, Trash2, Star, MessageCircle, Send } from 'lucide-react';

// Metas → palabras de persona normal
const GOALS = {
  sell_project:     { emoji: '🏡', title: 'Conseguir compradores', desc: 'Reviso competencia, calculo ventas, sugiero precio, preparo tu anuncio y lo publico.' },
  price_project:    { emoji: '💲', title: 'Revisar mis precios',    desc: 'Comparo el mercado de tu zona y te sugiero el mejor precio.' },
  make_marketing:   { emoji: '🎨', title: 'Prepararme el material',  desc: 'Te armo el anuncio y la página de tu proyecto.' },
  attract_buyers:   { emoji: '📣', title: 'Atraer más gente',        desc: 'Material, redes y lo publico para que llegue más gente.' },
  check_competition:{ emoji: '🔭', title: 'Espiar a mi competencia', desc: 'Qué hacen los proyectos parecidos al tuyo.' },
  forecast_sales:   { emoji: '📊', title: 'Cuánto voy a vender',     desc: 'Cuántas unidades puedes mover y en cuánto tiempo.' },
  zone_intel:       { emoji: '🗺️', title: 'Inteligencia de mi zona', desc: 'Pulso, precios, riesgo y competencia, todo junto.' },
  where_next:       { emoji: '🧭', title: 'Dónde construir',         desc: 'La mejor zona para tu próximo proyecto.' },
  project_health:   { emoji: '🩺', title: 'Cómo va mi proyecto',     desc: 'Qué va bien, qué está atorado y qué arreglar.' },
  money_review:     { emoji: '💰', title: 'Revisar mi dinero',       desc: 'Tu flujo de dinero y la absorción.' },
  investor_report:  { emoji: '📄', title: 'Reporte inversionistas',  desc: 'Un reporte listo para compartir.' },
  team_review:      { emoji: '👥', title: 'Cómo va mi equipo',       desc: 'Tus asesores y a quién asignar.' },
  // 🔥 Solo en DMX (game-changers)
  real_prices:      { emoji: '💵', title: '¿A qué precio SÍ se vende?', desc: 'Precios REALES de cierre — no los de publicación. Nadie más tiene esto.' },
  time_to_sell:     { emoji: '⏱️', title: '¿En cuántos días se vende?', desc: 'Lo que tarda en venderse algo como lo tuyo, de verdad.' },
  true_value:       { emoji: '🎯', title: '¿Cuánto vale de verdad?',  desc: 'El valor real de tu unidad, con margen.' },
  what_if:          { emoji: '🔮', title: '¿Y si cambio el precio?',  desc: 'Si bajas 5% o agregas promo, cuánto más vendes.' },
  who_buys:         { emoji: '🧑‍🤝‍🧑', title: '¿Quién compra en mi zona?', desc: 'El perfil de quién busca comprar cerca de ti.' },
  winning_amenity:  { emoji: '🏊', title: '¿Qué amenidad vende más?', desc: 'Qué hace que digan que sí más rápido.' },
  value_check:      { emoji: '⚖️', title: '¿Estoy caro o barato?',    desc: 'Si tu precio va bien para lo que ofreces.' },
  price_timing:     { emoji: '📅', title: '¿Cuándo subo el precio?',  desc: 'El mejor momento para subir, según el mercado.' },
  hot_leads:        { emoji: '🔥', title: '¿Quién está por comprar?', desc: 'Qué clientes están a punto de decidir.' },
  rising_zone:      { emoji: '🚀', title: '¿Qué zona va a subir?',    desc: 'Dónde va a subir la plusvalía.' },
  my_profit:        { emoji: '🤑', title: '¿Cuánto voy a ganar?',     desc: 'Tu ganancia proyectada al final.' },
  beat_competition: { emoji: '🏆', title: '¿Cómo le hacen los que venden?', desc: 'Qué hacen distinto los devs que sí venden.' },
  compare_projects: { emoji: '⚖️', title: 'Comparar mis proyectos', desc: 'Elige 2 o más y míralos lado a lado. Atajo: el botón ⚖️ Comparar de arriba.' },
  // otros perfiles
  work_lead: { emoji: '🤝', title: 'Atender un cliente', desc: 'Investigo, escribo el primer mensaje y lo dejo listo.' },
  work_pipeline: { emoji: '📋', title: 'Ordenar mis clientes', desc: 'A quién llamar hoy.' },
  find_home: { emoji: '🔎', title: 'Buscarme una casa', desc: 'Busco y comparo a tu gusto.' },
  watch_market: { emoji: '📈', title: 'Vigilar el mercado', desc: 'Te aviso la oportunidad.' },
  monitor_network: { emoji: '🩺', title: 'Revisar la red', desc: 'Cómo va todo.' },
  improve_model: { emoji: '🧠', title: 'Mejorar el sistema', desc: 'Aprende de resultados.' },
};

// Orden y agrupación de las tarjetas
const GROUPS = [
  { area: 'Vender y promocionar', hot: false, ids: ['sell_project', 'price_project', 'make_marketing', 'attract_buyers'] },
  { area: '🔥 Solo en DMX · info que nadie más tiene', hot: true, ids: ['compare_projects', 'real_prices', 'time_to_sell', 'true_value', 'what_if', 'who_buys', 'winning_amenity', 'value_check', 'price_timing', 'hot_leads', 'rising_zone', 'my_profit', 'beat_competition'] },
  { area: 'Mi mercado', hot: false, ids: ['check_competition', 'forecast_sales', 'zone_intel', 'where_next'] },
  { area: 'Mi proyecto y dinero', hot: false, ids: ['project_health', 'money_review'] },
  { area: 'Equipo y reportes', hot: false, ids: ['investor_report', 'team_review'] },
  { area: 'Para clientes', hot: false, ids: ['work_lead', 'work_pipeline', 'find_home', 'watch_market', 'monitor_network', 'improve_model'] },
];

// Acciones → frase humana (lo que hizo · lo que pide permiso)
const PHRASE = {
  'dev.competitor_scan': { done: 'Revisé a tu competencia' },
  'dev.forecast': { done: 'Calculé cuánto puedes vender' },
  'dev.price_suggest': { done: 'Te sugerí un precio' },
  'dev.zone_price': { done: 'Revisé los precios de tu zona' },
  'dev.market_pulse': { done: 'Tomé el pulso de tu zona' },
  'dev.zone_risk': { done: 'Revisé el riesgo de la zona' },
  'dev.where_to_build': { done: 'Busqué la mejor zona para tu próximo proyecto' },
  'dev.generate_marketing': { done: 'Preparé tu material de promoción' },
  'dev.update_landing': { done: 'Actualicé la página de tu proyecto' },
  'dev.social_cards': { done: 'Armé tarjetas para redes' },
  'dev.auto_content': { done: 'Preparé contenido para redes' },
  'dev.health_alert': { done: 'Revisé la salud de tu proyecto' },
  'dev.inventory_check': { done: 'Revisé tu inventario' },
  'dev.cashflow': { done: 'Revisé tu flujo de dinero' },
  'dev.weekly_report': { done: 'Armé tu reporte' },
  'dev.team_metrics': { done: 'Revisé a tu equipo' },
  'dev.assign_advisors': { done: 'Vi a qué asesor asignar' },
  'dev.closing_prices': { done: 'Saqué los precios reales de cierre' },
  'dev.days_on_market': { done: 'Calculé los días reales en venta' },
  'dev.avm_value': { done: 'Calculé cuánto vale de verdad' },
  'dev.what_if': { done: 'Simulé el cambio' },
  'dev.who_buys': { done: 'Vi quién compra en tu zona' },
  'dev.best_amenity': { done: 'Encontré qué amenidad vende más' },
  'dev.value_index': { done: 'Revisé si estás caro o barato' },
  'dev.price_timing': { done: 'Calculé el mejor momento para subir el precio' },
  'dev.hot_leads': { done: 'Encontré a tus clientes más calientes' },
  'dev.zone_trend': { done: 'Vi qué zona va a subir' },
  'dev.profit_projection': { done: 'Proyecté cuánto vas a ganar' },
  'dev.lookalike': { done: 'Comparé con los que sí venden' },
  'content.publish_public': { done: 'Publiqué tu proyecto', ask: 'publicar tu proyecto para que lo vea la gente' },
  'deal.change_price': { done: 'Actualicé el precio', ask: 'cambiar el precio que ve la gente' },
  'comm.send_external': { done: 'Envié el mensaje', ask: 'enviarle el mensaje a tu cliente', editable: true },
  'ops.spend_budget': { done: 'Usé presupuesto', ask: 'gastar en publicidad' },
};
const phraseDone = (a) => (PHRASE[a] && PHRASE[a].done) || 'Trabajé en tu proyecto';
const phraseAsk = (a) => (PHRASE[a] && PHRASE[a].ask) || 'hacer este paso';
const isEditable = (a) => !!(PHRASE[a] && PHRASE[a].editable);

const HELP_LEVELS = [
  { key: 'suggest', label: 'Solo dame ideas', hint: 'Yo decido todo' },
  { key: 'semi', label: 'Hazlo y pregúntame lo importante', hint: 'Recomendado' },
  { key: 'pilot', label: 'Hazlo casi todo', hint: 'Solo me frenas en lo delicado' },
];

function GoalCard({ gid, label, custom, onRun, onDelete, onFav, fav, disabled }) {
  const g = GOALS[gid] || { emoji: custom?.emoji || '⭐', title: custom?.label || label, desc: 'Tu tarjeta' };
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => onRun(gid)} disabled={disabled} data-testid={`goal-${gid}`}
        style={{ width: '100%', height: '100%', textAlign: 'left', background: 'rgba(var(--cream-rgb),0.04)', border: '1px solid rgba(var(--cream-rgb),0.13)', borderRadius: 12, padding: 14, paddingRight: 30, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1, transition: 'border-color .15s' }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(167,139,250,0.5)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(var(--cream-rgb),0.13)'}>
        <div style={{ fontSize: 22, marginBottom: 5 }}>{g.emoji}</div>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif', lineHeight: 1.25 }}>{g.title}</div>
        <div style={{ fontSize: 12, color: 'var(--cream-3)', marginTop: 5, lineHeight: 1.4 }}>{g.desc}</div>
      </button>
      <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
        <button onClick={() => onFav(gid)} title={fav ? 'Quitar de favoritas' : 'Hacer favorita'} data-testid={`fav-${gid}`}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0 }}>
          <Star size={14} color={fav ? '#fcd34d' : 'rgba(var(--cream-rgb),0.35)'} fill={fav ? '#fcd34d' : 'none'} />
        </button>
        {custom && (
          <button onClick={() => onDelete(gid)} title="Borrar tarjeta" data-testid={`del-${gid}`}
            style={{ background: 'transparent', border: 'none', color: 'var(--cream-4)', cursor: 'pointer', padding: 2, lineHeight: 0 }}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function SalaDeControl({ user, onLogout }) {
  const [status, setStatus] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [config, setConfig] = useState(null);
  const [learning, setLearning] = useState(null);   // E4 · {calibration, lessons, retrains}
  const [learnBusy, setLearnBusy] = useState(false);
  const [edits, setEdits] = useState({});
  const [toast, setToast] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [lastRun, setLastRun] = useState(null);
  // alcance (sobre qué pregunta: todo / proyecto / zona / precio)
  const [scope, setScope] = useState({ type: 'all', label: 'Todo mi portafolio' });
  const [scopes, setScopes] = useState({ projects: [], zones: [], price_bands: [] });
  const [scopeOpen, setScopeOpen] = useState(false);
  const [scopeTab, setScopeTab] = useState('all');   // all | project | zone | price | compare
  const [projQuery, setProjQuery] = useState('');
  const [zoneSel, setZoneSel] = useState([]);            // multi-zona
  const [priceRanges, setPriceRanges] = useState([{ from: '', to: '' }]);   // multi-rango {from,to} en pesos
  // builder de tarjetas
  const [builder, setBuilder] = useState(false);
  const [catalog, setCatalog] = useState({});
  const [picked, setPicked] = useState([]);
  const [cardName, setCardName] = useState('');
  const [cardEmoji, setCardEmoji] = useState('⭐');
  const scopeRef = useRef(null);
  // comparar (multi-select de proyectos)
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareSel, setCompareSel] = useState([]);
  // chat sobre el resultado (reusa Copilot)
  const [chat, setChat] = useState([]);   // [{role:'user'|'ai', text}]
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatConv, setChatConv] = useState(null);

  const load = useCallback(async () => {
    try {
      const st = await getCerebroStatus();
      setStatus(st);
      if (st.enabled) {
        const [t, c, s, lr] = await Promise.all([getCerebroTasks(), getCerebroConfig().catch(() => null), getCerebroScopes().catch(() => null), getCerebroLearning().catch(() => null)]);
        setTasks(t.tasks || []);
        setConfig(c?.config || null);
        if (s) setScopes(s);
        if (lr) setLearning(lr);
      }
    } catch (e) { setStatus({ enabled: false, error: e.message }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  // cerrar el dropdown de alcance al hacer clic fuera (quita fricción)
  useEffect(() => {
    if (!scopeOpen) return;
    const onDown = (e) => { if (scopeRef.current && !scopeRef.current.contains(e.target)) setScopeOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [scopeOpen]);

  const run = async (goalId, overrideScope) => {
    // Comparar abre primero el selector múltiple de proyectos
    if (goalId === 'compare_projects' && !overrideScope) { setCompareSel([]); setCompareOpen(true); return; }
    const useScope = overrideScope || scope;
    setRunning(true); setToast(''); setChat([]); setChatConv(null);
    try {
      const r = await runCerebroGoal(goalId, { scope: useScope, project_id: useScope.type === 'project' ? useScope.value : undefined });
      setLastRun({ goalId, status: r.status, results: r.results || [], scopeLabel: useScope.label });
      await load();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { setToast('Algo falló: ' + e.message); }
    finally { setRunning(false); }
  };
  const runCompare = () => {
    if (compareSel.length < 2) { setToast('Elige al menos 2 proyectos para comparar.'); return; }
    setCompareOpen(false); setScopeOpen(false);
    // fija el enfoque a esos proyectos → cualquier tarjeta luego responde por-proyecto para ellos
    const sc = { type: 'projects', value: compareSel, label: `${compareSel.length} proyectos elegidos` };
    setScope(sc);
    run('compare_projects', sc);
  };
  const toggleCompare = (id) => setCompareSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const ask = async (textArg) => {
    const q = ((typeof textArg === 'string' ? textArg : chatInput) || '').trim(); if (!q || chatBusy) return;
    setChat(c => [...c, { role: 'user', text: q }]); setChatInput(''); setChatBusy(true);
    const ctx = lastRun ? lastRun.results.map(r => `${phraseDone(r.action)}: ${(r.result && (r.result.answer || r.result.summary)) || ''} ${(r.result && r.result.meaning) || ''}`).join(' · ') : '';
    const question = ctx ? `Contexto que le mostré al desarrollador (${titleOf(lastRun.goalId)}): ${ctx}. Su pregunta: ${q}` : q;
    try {
      const res = await askCopilot(question, chatConv);
      if (res.conversation_id) setChatConv(res.conversation_id);
      const answer = res.fallback
        ? 'Para responderte con IA (explicaciones, gráficas, “¿y si…?”) necesito tu modelo conectado. Ya está todo cableado — al conectar la llave, aquí mismo te respondo.'
        : (res.response_markdown || res.answer || res.reply || res.message || res.text || 'Listo.');
      setChat(c => [...c, { role: 'ai', text: answer }]);
    } catch (e) { setChat(c => [...c, { role: 'ai', text: 'No pude responder ahora (' + e.message + ').' }]); }
    finally { setChatBusy(false); }
  };
  const approve = async (t) => {
    try { await approveCerebroTask(t.id, edits[t.id] ? { text: edits[t.id] } : null); setToast('¡Hecho! Seguí adelante. ✅'); await load(); }
    catch (e) { setToast('Algo falló: ' + e.message); }
  };
  const reject = async (t) => {
    try { await rejectCerebroTask(t.id); setToast('Ok, no lo hice.'); await load(); }
    catch (e) { setToast('Algo falló: ' + e.message); }
  };
  const setHelp = async (lvl) => {
    try { const r = await saveCerebroConfig({ autonomy: lvl }); setConfig(r.config); setToast('Listo, lo guardé.'); }
    catch (e) { setToast('Algo falló: ' + e.message); }
  };
  const openBuilder = async () => {
    setBuilder(true); setPicked([]); setCardName(''); setCardEmoji('⭐');
    try { const c = await getCerebroCatalog(); setCatalog(c.areas || {}); } catch { setCatalog({}); }
  };
  const createCard = async () => {
    try { await createCustomGoal(cardName || 'Mi tarjeta', cardEmoji, picked); setBuilder(false); setToast('¡Tu tarjeta está lista! 🎉'); await load(); }
    catch (e) { setToast('Algo falló: ' + e.message); }
  };
  const removeCard = async (gid) => {
    try { await deleteCustomGoal(gid); await load(); } catch (e) { setToast('Algo falló: ' + e.message); }
  };
  const favorites = config?.favorites || [];
  const toggleFav = async (gid) => {
    const next = favorites.includes(gid) ? favorites.filter(x => x !== gid) : [...favorites, gid];
    try { const r = await saveCerebroConfig({ favorites: next }); setConfig(r.config); }
    catch (e) { setToast('Algo falló: ' + e.message); }
  };
  const pickScope = (s) => { setScope(s); setScopeOpen(false); };

  // ── multi-zona / multi-precio / formato $ ──────────────────────────────
  const money = (n) => (n === '' || n === null || n === undefined || isNaN(n)) ? '' : '$' + Number(n).toLocaleString('en-US');
  const onlyDigits = (s) => { const d = String(s).replace(/[^\d]/g, ''); return d === '' ? '' : parseInt(d, 10); };
  const zoneLabel = (zs) => zs.length === 0 ? 'Todo mi portafolio' : zs.length === 1 ? ('Zona: ' + zs[0]) : (zs.length + ' zonas');
  const priceLabel = (rs) => {
    const valid = rs.filter(r => r.from !== '' || r.to !== '');
    if (valid.length === 0) return 'Todo mi portafolio';
    if (valid.length === 1) {
      const r = valid[0];
      if (r.from !== '' && r.to !== '') return `${money(r.from)} – ${money(r.to)}`;
      if (r.from !== '') return `desde ${money(r.from)}`;
      return `hasta ${money(r.to)}`;
    }
    return valid.length + ' rangos de precio';
  };
  const toggleZone = (z) => {
    setZoneSel(prev => {
      const next = prev.includes(z) ? prev.filter(x => x !== z) : [...prev, z];
      if (next.length === 0) setScope({ type: 'all', label: 'Todo mi portafolio' });
      else setScope({ type: 'zone', value: next, label: zoneLabel(next) });
      return next;
    });
  };
  const setRange = (i, key, raw) => {
    setPriceRanges(prev => {
      const next = prev.map((r, k) => k === i ? { ...r, [key]: onlyDigits(raw) } : r);
      const valid = next.map(r => ({ from: r.from === '' ? null : r.from, to: r.to === '' ? null : r.to })).filter(r => r.from !== null || r.to !== null);
      if (valid.length === 0) setScope({ type: 'all', label: 'Todo mi portafolio' });
      else setScope({ type: 'price', value: valid, label: priceLabel(next) });
      return next;
    });
  };
  const addRange = () => setPriceRanges(prev => [...prev, { from: '', to: '' }]);
  const removeRange = (i) => setPriceRanges(prev => {
    const next = prev.filter((_, k) => k !== i);
    const arr = next.length ? next : [{ from: '', to: '' }];
    const valid = arr.map(r => ({ from: r.from === '' ? null : r.from, to: r.to === '' ? null : r.to })).filter(r => r.from !== null || r.to !== null);
    if (valid.length === 0) setScope({ type: 'all', label: 'Todo mi portafolio' });
    else setScope({ type: 'price', value: valid, label: priceLabel(arr) });
    return arr;
  });
  const clearScope = () => {
    setZoneSel([]); setPriceRanges([{ from: '', to: '' }]); setProjQuery('');
    setScope({ type: 'all', label: 'Todo mi portafolio' });
  };

  // E4 · ver el loop de aprendizaje cerrarse (cierre de ejemplo)
  const tryLearningDemo = async () => {
    setLearnBusy(true); setToast('');
    try {
      await cerebroLearningDemo();
      const lr = await getCerebroLearning(); setLearning(lr);
      setToast('Listo · cerré un trato de ejemplo para que veas cómo aprendo.');
    } catch (e) { setToast('Algo falló: ' + e.message); }
    finally { setLearnBusy(false); }
  };

  const pending = tasks.filter(t => t.status === 'awaiting_approval');
  const done = tasks.filter(t => t.status === 'done').slice(0, 18);
  const available = status?.goals || {};
  const customGoals = status?.custom_goals || {};
  const helpLevel = config?.autonomy || 'semi';
  const learnEmpty = !learning || ((learning.calibration || []).every(c => !c.n) && !(learning.lessons || []).length && !(learning.retrains || []).length);
  const titleOf = (gid) => (GOALS[gid] && GOALS[gid].title) || (customGoals[gid] && customGoals[gid].label) || available[gid] || 'tu tarjeta';
  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(228px,1fr))', gap: 12 };

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <div style={{ maxWidth: 1340, margin: '0 auto', padding: '0 4px 56px' }}>
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif', display: 'flex', alignItems: 'center', gap: 9 }}>
            <Sparkles size={25} color="#a78bfa" /> Tu asistente
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 15.5, color: 'var(--cream-3)', lineHeight: 1.55 }}>
            Hace el trabajo pesado por ti. Cuando algo es importante, <strong style={{ color: 'var(--cream-2)' }}>te pide permiso primero</strong>.
          </p>
        </div>

        {loading ? <p style={{ color: 'var(--cream-3)' }}>Un momento…</p>
        : !status?.enabled ? (
          <div style={{ padding: 22, borderRadius: 14, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: 'var(--cream-2)' }}>
            Tu asistente está <strong>en pausa</strong>.
          </div>
        ) : (
          <>
            {/* BARRA · sobre qué pregunto + botón Comparar (siempre visible) */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
              <div ref={scopeRef} style={{ position: 'relative' }}>
                <button onClick={() => setScopeOpen(o => { if (!o) setScopeTab(scope.type === 'all' ? 'all' : scope.type); return !o; })} data-testid="scope-btn"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.32)', borderRadius: 10, padding: '9px 16px', cursor: 'pointer', color: 'var(--cream)', fontSize: 14 }}>
                  🎯 <span style={{ color: 'var(--cream-3)' }}>Mi enfoque:</span> <strong>{scope.label}</strong>
                  <span style={{ color: 'var(--cream-3)', transform: scopeOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s', display: 'inline-block' }}>▾</span>
                </button>
                {scopeOpen && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 80, width: 'min(420px,92vw)', background: 'var(--surface, #11151d)', border: '1px solid rgba(167,139,250,0.4)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,.7)' }}>
                    {/* pestañas */}
                    <div style={{ display: 'flex', gap: 3, padding: 8, background: 'rgba(167,139,250,0.07)', borderBottom: '1px solid rgba(var(--cream-rgb),0.1)' }}>
                      {[['all', 'Todo'], ['project', 'Proyecto'], ['zone', 'Zona'], ['price', 'Precio'], ['compare', '⚖️ Comparar']].map(([k, lbl]) => {
                        const active = scopeTab === k;
                        return (
                          <button key={k} onClick={() => setScopeTab(k)}
                            style={{ flex: k === 'compare' ? '0 0 auto' : 1, whiteSpace: 'nowrap', background: active ? 'rgba(167,139,250,0.85)' : 'transparent', border: 'none', borderRadius: 8, padding: k === 'compare' ? '7px 11px' : '7px 4px', cursor: 'pointer', color: active ? '#0e1219' : 'var(--cream-2)', fontSize: k === 'compare' ? 12.5 : 13, fontWeight: active ? 800 : 600, transition: 'all .12s' }}>{lbl}</button>
                        );
                      })}
                    </div>
                    <div style={{ padding: 10, maxHeight: '50vh', overflow: 'auto' }}>
                      {scopeTab === 'all' && (
                        <button onClick={() => pickScope({ type: 'all', label: 'Todo mi portafolio' })} data-testid="scope-all"
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: scope.type === 'all' ? 'rgba(167,139,250,0.18)' : 'rgba(var(--cream-rgb),0.04)', border: scope.type === 'all' ? '1px solid rgba(167,139,250,0.6)' : '1px solid rgba(var(--cream-rgb),0.12)', borderRadius: 12, padding: '14px 16px', cursor: 'pointer', color: 'var(--cream)', fontSize: 15, fontWeight: 700 }}>
                          <span style={{ fontSize: 22 }}>🏢</span>
                          <span>Todo mi portafolio<br /><span style={{ fontSize: 12, fontWeight: 500, color: 'var(--cream-3)' }}>Pregunto sobre todos mis proyectos juntos</span></span>
                          {scope.type === 'all' && <span style={{ marginLeft: 'auto', color: '#a78bfa', fontSize: 18 }}>✓</span>}
                        </button>
                      )}
                      {scopeTab === 'project' && (
                        <div>
                          <input value={projQuery} onChange={e => setProjQuery(e.target.value)} placeholder="🔎 Busca un proyecto…" autoFocus
                            style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(var(--cream-rgb),0.06)', border: '1px solid rgba(var(--cream-rgb),0.16)', borderRadius: 10, padding: '10px 12px', color: 'var(--cream)', fontSize: 13.5, marginBottom: 8, outline: 'none' }} />
                          {scopes.projects.filter(p => !projQuery || (p.name + ' ' + p.zone).toLowerCase().includes(projQuery.toLowerCase())).map(p => {
                            const on = scope.value === p.id;
                            return (
                              <button key={p.id} onClick={() => pickScope({ type: 'project', value: p.id, label: p.name })}
                                onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'rgba(167,139,250,0.16)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = on ? 'rgba(167,139,250,0.18)' : 'transparent'; }}
                                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', background: on ? 'rgba(167,139,250,0.18)' : 'transparent', border: 'none', borderRadius: 10, padding: '10px 12px', marginBottom: 2, cursor: 'pointer', color: 'var(--cream)', fontSize: 14, transition: 'background .12s' }}>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                  <span style={{ display: 'block', fontWeight: 600 }}>{p.name}</span>
                                  <span style={{ display: 'block', fontSize: 12, color: 'var(--cream-4)', marginTop: 1 }}>{p.zone}{p.price_display ? ' · desde ' + p.price_display : ''}</span>
                                </span>
                                {on && <span style={{ color: '#a78bfa', fontSize: 16, flexShrink: 0 }}>✓</span>}
                              </button>
                            );
                          })}
                          {scopes.projects.filter(p => !projQuery || (p.name + ' ' + p.zone).toLowerCase().includes(projQuery.toLowerCase())).length === 0 && (
                            <div style={{ color: 'var(--cream-4)', fontSize: 13, padding: '12px 4px', textAlign: 'center' }}>Sin proyectos que coincidan</div>
                          )}
                        </div>
                      )}
                      {scopeTab === 'zone' && (
                        <div>
                          <div style={{ fontSize: 12.5, color: 'var(--cream-3)', margin: '0 2px 10px' }}>Elige una o varias zonas.</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {scopes.zones.length === 0 && <div style={{ color: 'var(--cream-4)', fontSize: 13, padding: '8px 4px' }}>Aún no hay zonas en tu inventario.</div>}
                            {scopes.zones.map(z => {
                              const on = zoneSel.includes(z);
                              return (
                                <button key={z} onClick={() => toggleZone(z)}
                                  onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'rgba(167,139,250,0.16)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = on ? 'rgba(167,139,250,0.22)' : 'rgba(var(--cream-rgb),0.06)'; }}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: on ? 'rgba(167,139,250,0.22)' : 'rgba(var(--cream-rgb),0.06)', border: on ? '1px solid rgba(167,139,250,0.6)' : '1px solid rgba(var(--cream-rgb),0.16)', borderRadius: 10, padding: '9px 14px', cursor: 'pointer', color: 'var(--cream)', fontSize: 13.5, transition: 'background .12s' }}>
                                  <span>{on ? '✓' : '📍'}</span> {z}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {scopeTab === 'price' && (
                        <div>
                          <div style={{ fontSize: 12.5, color: 'var(--cream-3)', margin: '0 2px 10px' }}>
                            Escribe un rango de precio. Puedes agregar más de uno.
                            {(scopes.price_min != null && scopes.price_max != null) && (
                              <span style={{ display: 'block', color: 'var(--cream-4)', fontSize: 11.5, marginTop: 3 }}>Tu inventario va de {money(scopes.price_min)} a {money(scopes.price_max)}.</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {priceRanges.map((r, i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 10.5, color: 'var(--cream-4)', marginBottom: 3, letterSpacing: '.04em' }}>DESDE</div>
                                  <input inputMode="numeric" value={money(r.from)} onChange={e => setRange(i, 'from', e.target.value)} placeholder="$0"
                                    style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(var(--cream-rgb),0.06)', border: '1px solid rgba(var(--cream-rgb),0.18)', borderRadius: 9, padding: '9px 11px', color: 'var(--cream)', fontSize: 14, outline: 'none' }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 10.5, color: 'var(--cream-4)', marginBottom: 3, letterSpacing: '.04em' }}>HASTA</div>
                                  <input inputMode="numeric" value={money(r.to)} onChange={e => setRange(i, 'to', e.target.value)} placeholder="$ sin límite"
                                    style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(var(--cream-rgb),0.06)', border: '1px solid rgba(var(--cream-rgb),0.18)', borderRadius: 9, padding: '9px 11px', color: 'var(--cream)', fontSize: 14, outline: 'none' }} />
                                </div>
                                {priceRanges.length > 1 && (
                                  <button onClick={() => removeRange(i)} title="Quitar este rango"
                                    style={{ alignSelf: 'flex-end', background: 'transparent', border: '1px solid rgba(var(--cream-rgb),0.18)', borderRadius: 9, color: 'var(--cream-3)', cursor: 'pointer', padding: '9px 11px', fontSize: 13 }}>✕</button>
                                )}
                              </div>
                            ))}
                          </div>
                          <button onClick={addRange}
                            style={{ marginTop: 10, background: 'rgba(167,139,250,0.12)', border: '1px dashed rgba(167,139,250,0.5)', borderRadius: 9, color: 'var(--cream)', cursor: 'pointer', padding: '8px 12px', fontSize: 13, fontWeight: 600 }}>＋ Agregar otro rango</button>
                        </div>
                      )}
                      {scopeTab === 'compare' && (
                        <div>
                          <div style={{ fontSize: 12.5, color: 'var(--cream-3)', margin: '0 2px 10px' }}>Palomea 2 o más proyectos y míralos lado a lado.</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {(scopes.projects || []).map(p => {
                              const on = compareSel.includes(p.id);
                              return (
                                <button key={p.id} onClick={() => toggleCompare(p.id)}
                                  onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'rgba(167,139,250,0.12)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = on ? 'rgba(167,139,250,0.16)' : 'rgba(var(--cream-rgb),0.04)'; }}
                                  style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: on ? 'rgba(167,139,250,0.16)' : 'rgba(var(--cream-rgb),0.04)', border: on ? '1px solid rgba(167,139,250,0.55)' : '1px solid rgba(var(--cream-rgb),0.1)', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', transition: 'background .12s' }}>
                                  <span style={{ width: 18, height: 18, borderRadius: 5, border: '1.5px solid', borderColor: on ? '#a78bfa' : 'var(--cream-4)', background: on ? '#a78bfa' : 'transparent', color: '#0e1219', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 800 }}>{on ? '✓' : ''}</span>
                                  <span style={{ flex: 1, fontSize: 14, color: 'var(--cream)' }}>{p.name}</span>
                                  <span style={{ fontSize: 12, color: 'var(--cream-4)', background: 'rgba(var(--cream-rgb),0.06)', borderRadius: 6, padding: '2px 8px' }}>{p.zone}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                    {scopeTab === 'compare' && (
                      <div style={{ padding: 10, borderTop: '1px solid rgba(var(--cream-rgb),0.1)', background: 'rgba(167,139,250,0.06)' }}>
                        <button onClick={runCompare} disabled={compareSel.length < 2} data-testid="run-compare"
                          style={{ width: '100%', background: compareSel.length >= 2 ? 'linear-gradient(135deg,#a78bfa,#7c5cff)' : 'rgba(var(--cream-rgb),0.1)', color: compareSel.length >= 2 ? '#0e1219' : 'var(--cream-4)', border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 800, cursor: compareSel.length >= 2 ? 'pointer' : 'default' }}>
                          ⚖️ Comparar {compareSel.length >= 2 ? `(${compareSel.length})` : 'proyectos'}
                        </button>
                      </div>
                    )}
                    {scopeTab !== 'compare' && scope.type !== 'all' && (
                      <div style={{ padding: 10, borderTop: '1px solid rgba(var(--cream-rgb),0.1)', background: 'rgba(167,139,250,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <button onClick={clearScope} data-testid="clear-scope"
                          style={{ background: 'transparent', border: '1px solid rgba(var(--cream-rgb),0.22)', borderRadius: 9, color: 'var(--cream-2)', cursor: 'pointer', padding: '9px 14px', fontSize: 13, fontWeight: 600 }}>↺ Limpiar filtros</button>
                        <button onClick={() => setScopeOpen(false)}
                          style={{ background: 'linear-gradient(135deg,#a78bfa,#7c5cff)', border: 'none', borderRadius: 9, color: '#0e1219', cursor: 'pointer', padding: '9px 18px', fontSize: 13, fontWeight: 800 }}>Listo</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ✋ TU TURNO */}
            {pending.map(t => (
              <div key={t.id} data-testid={`pending-${t.id}`} style={{ marginBottom: 16, padding: 18, borderRadius: 16, background: 'linear-gradient(180deg, rgba(245,158,11,0.12), rgba(245,158,11,0.05))', border: '1px solid rgba(245,158,11,0.4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Hand size={18} color="#fcd34d" />
                  <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>Tu turno</span>
                </div>
                <p style={{ margin: '0 0 14px', fontSize: 15, color: 'var(--cream)', lineHeight: 1.5 }}>
                  Ya hice todo lo que podía solo. Para seguir, ¿me das permiso de <strong>{phraseAsk(t.action)}</strong>?
                </p>
                {isEditable(t.action) && (
                  <textarea placeholder="Si quieres, cámbiale algo antes…" onChange={e => setEdits(p => ({ ...p, [t.id]: e.target.value }))}
                    style={{ width: '100%', marginBottom: 12, minHeight: 54, background: 'rgba(var(--bg-rgb),0.45)', color: 'var(--cream)', border: '1px solid rgba(var(--cream-rgb),0.16)', borderRadius: 10, padding: 10, fontSize: 13, fontFamily: 'DM Sans,sans-serif' }} />
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => approve(t)} data-testid={`approve-${t.id}`} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--green)', color: '#05210f', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}><Check size={16} /> Sí, dale</button>
                  <button onClick={() => reject(t)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: 'var(--cream-2)', border: '1px solid rgba(var(--cream-rgb),0.22)', borderRadius: 10, padding: '10px 18px', fontSize: 14, cursor: 'pointer' }}><X size={15} /> Ahora no</button>
                </div>
              </div>
            ))}

            {running && <p style={{ fontSize: 13, color: '#a78bfa', margin: '0 2px 10px' }}>Trabajando… ⏳</p>}
            {toast && <p style={{ fontSize: 14, color: 'var(--cream-2)', margin: '0 2px 12px' }}>{toast}</p>}

            {/* RESULTADO — insight con estructura: respuesta + qué significa + de dónde sale + qué hacer */}
            {lastRun && lastRun.results.length > 0 && (
              <div style={{ marginBottom: 22, padding: 20, borderRadius: 18, background: 'rgba(99,102,241,0.09)', border: '1px solid rgba(99,102,241,0.34)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>✨ Esto encontré · {titleOf(lastRun.goalId)}</div>
                    {lastRun.scopeLabel && <div style={{ fontSize: 12.5, color: 'var(--cream-3)', marginTop: 3 }}>📍 {lastRun.scopeLabel}</div>}
                  </div>
                  <button onClick={() => setLastRun(null)} style={{ background: 'none', border: 'none', color: 'var(--cream-3)', cursor: 'pointer' }}><X size={16} /></button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {lastRun.results.map((r, i) => {
                    const res = r.result || {};
                    const structured = !!res.answer;
                    return (
                      <div key={i} style={{ padding: 16, borderRadius: 14, background: 'rgba(var(--bg-rgb),0.35)', border: '1px solid rgba(var(--cream-rgb),0.1)' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{phraseDone(r.action)}</div>
                        {structured ? (
                          <>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', margin: '8px 0 10px' }}>
                              <span style={{ fontSize: 27, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif', lineHeight: 1.1 }}>{res.answer}</span>
                              {res.detail && <span style={{ fontSize: 13.5, color: 'var(--cream-3)' }}>{res.detail}</span>}
                              {res.example && <span style={{ fontSize: 10.5, color: 'var(--amber)', border: '1px solid rgba(252,211,77,0.4)', borderRadius: 6, padding: '2px 7px' }}>ejemplo · se llena con tus datos</span>}
                            </div>
                            {res.comparison && res.comparison.rows && res.comparison.rows.length > 0 && (
                              <div style={{ overflowX: 'auto', marginBottom: 11 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                  <thead><tr>{res.comparison.columns.map(c => (
                                    <th key={c} style={{ textAlign: 'left', padding: '7px 10px', color: 'var(--cream-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.03em', borderBottom: '1px solid rgba(var(--cream-rgb),0.14)' }}>{c}</th>
                                  ))}</tr></thead>
                                  <tbody>{res.comparison.rows.map((row, ri) => (
                                    <tr key={ri}>{res.comparison.columns.map((c, ci) => (
                                      <td key={c} style={{ padding: '8px 10px', color: ci === 0 ? 'var(--cream)' : 'var(--cream-2)', fontWeight: ci === 0 ? 700 : 400, borderBottom: '1px solid rgba(var(--cream-rgb),0.07)' }}>{row[c]}</td>
                                    ))}</tr>
                                  ))}</tbody>
                                </table>
                              </div>
                            )}
                            {res.meaning && <div style={{ fontSize: 15, color: 'var(--cream)', lineHeight: 1.55, marginBottom: 11 }}>{res.meaning}</div>}
                            {res.basis && <div style={{ fontSize: 12.5, color: 'var(--cream-3)', marginBottom: 11, lineHeight: 1.5 }}>📊 <strong style={{ color: 'var(--cream-2)' }}>De dónde sale:</strong> {res.basis}</div>}
                            {(res.action || res.verdict) && (
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '11px 13px', borderRadius: 11, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.24)' }}>
                                <span style={{ fontSize: 15 }}>👉</span>
                                <span style={{ fontSize: 14, color: 'var(--cream)', lineHeight: 1.5 }}><strong>{res.action ? 'Qué hacer:' : 'Conclusión:'}</strong> {res.action || res.verdict}</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <div style={{ fontSize: 15, color: 'var(--cream)', marginTop: 5 }}>{res.summary || '—'}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {lastRun.status === 'paused' && <p style={{ fontSize: 13, color: 'var(--amber)', margin: '12px 2px 0' }}>Para terminar, dame tu OK arriba 👆</p>}

                {/* Chat: profundiza sobre el resultado (reusa el Copilot) */}
                <div style={{ marginTop: 16, borderTop: '1px solid rgba(99,102,241,0.22)', paddingTop: 13 }}>
                  <div style={{ fontSize: 13, color: 'var(--cream-2)', display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10, fontWeight: 700 }}>
                    <MessageCircle size={15} color="#a78bfa" /> ¿Quieres profundizar? Pregúntame lo que sea sobre esto.
                  </div>
                  {chat.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10, maxHeight: 300, overflowY: 'auto' }}>
                      {chat.map((m, i) => (
                        <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%', padding: '10px 13px', borderRadius: 13, fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', background: m.role === 'user' ? 'rgba(167,139,250,0.2)' : 'rgba(var(--cream-rgb),0.06)', border: '1px solid ' + (m.role === 'user' ? 'rgba(167,139,250,0.3)' : 'rgba(var(--cream-rgb),0.1)'), color: 'var(--cream)' }}>{m.text}</div>
                      ))}
                      {chatBusy && <div style={{ alignSelf: 'flex-start', fontSize: 12.5, color: 'var(--cream-3)' }}>pensando… ⏳</div>}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ask(); }}
                      data-testid="chat-input" placeholder="Ej: ¿por qué ese precio? · hazme una gráfica · ¿y si bajo 5%?"
                      style={{ flex: 1, background: 'rgba(var(--bg-rgb),0.45)', color: 'var(--cream)', border: '1px solid rgba(var(--cream-rgb),0.16)', borderRadius: 10, padding: '11px 14px', fontSize: 13.5 }} />
                    <button onClick={() => ask()} disabled={chatBusy || !chatInput.trim()} data-testid="chat-send"
                      style={{ background: 'linear-gradient(90deg,#6366F1,#EC4899)', color: '#fff', border: 'none', borderRadius: 10, padding: '0 16px', cursor: chatInput.trim() ? 'pointer' : 'default', opacity: chatInput.trim() ? 1 : 0.5, display: 'flex', alignItems: 'center' }}><Send size={16} /></button>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
                    {['¿Por qué?', 'Hazme una gráfica', '¿Y si bajo el precio 5%?', '¿Qué me recomiendas?'].map(s => (
                      <button key={s} onClick={() => ask(s)} style={{ background: 'rgba(var(--cream-rgb),0.05)', border: '1px solid rgba(var(--cream-rgb),0.13)', borderRadius: 99, padding: '5px 11px', fontSize: 11.5, color: 'var(--cream-2)', cursor: 'pointer' }}>{s}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* FAVORITAS */}
            {favorites.filter(gid => gid in available || gid in customGoals).length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber)', margin: '4px 0 8px' }}>⭐ Favoritas</div>
                <div style={gridStyle}>
                  {favorites.filter(gid => gid in available || gid in customGoals).map(gid => (
                    <GoalCard key={gid} gid={gid} label={available[gid]} custom={customGoals[gid]} onRun={run} onDelete={removeCard} onFav={toggleFav} fav={true} disabled={running} />
                  ))}
                </div>
              </div>
            )}

            {/* TUS TARJETAS (custom) + crear */}
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream-2)', margin: '4px 0 8px', textTransform: 'uppercase', letterSpacing: '.04em' }}>Mis tarjetas</div>
            <div style={{ ...gridStyle, marginBottom: 20 }}>
              {Object.keys(customGoals).map(gid => (
                <GoalCard key={gid} gid={gid} custom={customGoals[gid]} onRun={run} onDelete={removeCard} onFav={toggleFav} fav={favorites.includes(gid)} disabled={running} />
              ))}
              <button onClick={openBuilder} data-testid="new-card"
                style={{ textAlign: 'left', background: 'transparent', border: '1.5px dashed rgba(167,139,250,0.5)', borderRadius: 12, padding: 13, cursor: 'pointer', color: 'var(--cream-2)' }}>
                <div style={{ fontSize: 19, marginBottom: 4 }}><Plus size={19} color="#a78bfa" /></div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>Crea tu propia tarjeta</div>
                <div style={{ fontSize: 11, color: 'var(--cream-3)', marginTop: 4 }}>Combina las acciones que quieras.</div>
              </button>
            </div>

            {/* GRUPOS de opciones */}
            {GROUPS.map(grp => {
              const ids = grp.ids.filter(id => id in available);
              if (!ids.length) return null;
              return (
                <div key={grp.area} style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: grp.hot ? '#fcd34d' : 'var(--cream-2)', margin: '4px 0 8px', textTransform: grp.hot ? 'none' : 'uppercase', letterSpacing: '.04em' }}>{grp.area}</div>
                  <div style={gridStyle}>
                    {ids.map(gid => <GoalCard key={gid} gid={gid} label={available[gid]} onRun={run} onFav={toggleFav} fav={favorites.includes(gid)} disabled={running} />)}
                  </div>
                </div>
              );
            })}

            {/* LO QUE YA HICE */}
            {done.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream-2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>Lo que ya hice por ti</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {done.map(t => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.14)' }}>
                      <Check size={15} color="var(--green)" /><span style={{ fontSize: 13.5, color: 'var(--cream)' }}>{phraseDone(t.action)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 🌱 CÓMO VOY APRENDIENDO (E4 · loop de aprendizaje) */}
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream-2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>🌱 Cómo voy aprendiendo</div>
              <div style={{ padding: 16, borderRadius: 14, background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.2)' }}>
                {learnEmpty ? (
                  <div>
                    <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.55 }}>
                      Cada vez que cierras o pierdes una venta, me califico (¿le atiné a lo que predije?) y saco una lección para la próxima. Aún no tengo resultados — <strong>se llena con tus cierres</strong>.
                    </p>
                    <button onClick={tryLearningDemo} disabled={learnBusy} data-testid="learn-demo"
                      style={{ background: 'linear-gradient(135deg,#a78bfa,#7c5cff)', border: 'none', borderRadius: 9, color: '#0e1219', cursor: learnBusy ? 'default' : 'pointer', padding: '9px 16px', fontSize: 13, fontWeight: 800 }}>
                      {learnBusy ? 'Un momento…' : 'Ver cómo funciona (ejemplo)'}
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cream-3)', marginBottom: 8 }}>Qué tan bien le atino</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8, marginBottom: 14 }}>
                      {(learning.calibration || []).map(c => (
                        <div key={c.kind} style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(var(--cream-rgb),0.04)', border: '1px solid rgba(var(--cream-rgb),0.1)' }}>
                          <div style={{ fontSize: 12, color: 'var(--cream-3)' }}>{c.label}</div>
                          <div style={{ fontSize: 13.5, color: c.n ? 'var(--cream)' : 'var(--cream-4)', marginTop: 2 }}>{c.summary}</div>
                        </div>
                      ))}
                    </div>
                    {(learning.lessons || []).length > 0 && (
                      <>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cream-3)', marginBottom: 8 }}>Lecciones recientes</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                          {(learning.lessons || []).map((l, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13.5, color: 'var(--cream)', lineHeight: 1.4, padding: '9px 12px', borderRadius: 10, background: l.outcome === 'won' ? 'rgba(34,197,94,0.06)' : 'rgba(245,158,11,0.06)', border: '1px solid ' + (l.outcome === 'won' ? 'rgba(34,197,94,0.16)' : 'rgba(245,158,11,0.16)') }}>
                              <span>{l.outcome === 'won' ? '✅' : '📉'}</span><span>{l.text}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    {(learning.retrains || []).length > 0 && (
                      <div style={{ fontSize: 12, color: 'var(--cream-4)' }}>🔄 {learning.retrains[0].summary}</div>
                    )}
                    <button onClick={tryLearningDemo} disabled={learnBusy} data-testid="learn-demo"
                      style={{ marginTop: 12, background: 'transparent', border: '1px dashed rgba(167,139,250,0.4)', borderRadius: 9, color: 'var(--cream-3)', cursor: learnBusy ? 'default' : 'pointer', padding: '7px 12px', fontSize: 12 }}>
                      {learnBusy ? 'Un momento…' : 'Ver otro cierre de ejemplo'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* ¿Cuánto quieres que haga solo? */}
            <div style={{ marginTop: 28, borderTop: '1px solid rgba(var(--cream-rgb),0.08)', paddingTop: 14 }}>
              <button onClick={() => setShowHelp(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--cream-3)', fontSize: 13, cursor: 'pointer', padding: 0 }}>
                <Settings size={13} /> ¿Cuánto quieres que haga solo? {showHelp ? '▲' : '▼'}
              </button>
              {showHelp && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                  {HELP_LEVELS.map(l => {
                    const on = helpLevel === l.key;
                    return (
                      <button key={l.key} onClick={() => setHelp(l.key)} data-testid={`help-${l.key}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: on ? 'rgba(167,139,250,0.12)' : 'rgba(var(--cream-rgb),0.04)', border: on ? '1px solid rgba(167,139,250,0.5)' : '1px solid rgba(var(--cream-rgb),0.12)', borderRadius: 10, padding: '10px 14px', cursor: 'pointer' }}>
                        <span style={{ width: 16, height: 16, borderRadius: 99, border: '2px solid', borderColor: on ? '#a78bfa' : 'var(--cream-4)', background: on ? '#a78bfa' : 'transparent', flexShrink: 0 }} />
                        <span style={{ flex: 1 }}>
                          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--cream)' }}>{l.label}</span>
                          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--cream-3)' }}>{l.hint}</span>
                        </span>
                      </button>
                    );
                  })}
                  <p style={{ fontSize: 11.5, color: 'var(--cream-4)', margin: '2px 2px 0' }}>Tranquilo: <strong>gastar dinero o firmar siempre te lo pregunta</strong>.</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* MODAL · crear tarjeta */}
        {builder && (
          <div onClick={() => setBuilder(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(var(--bg-rgb),0.7)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div onClick={e => e.stopPropagation()} style={{ width: 'min(620px,96vw)', maxHeight: '86vh', overflow: 'auto', background: 'var(--frame-pop, #11151f)', border: '1px solid rgba(var(--cream-rgb),0.16)', borderRadius: 16, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>Crea tu tarjeta</h2>
                <button onClick={() => setBuilder(false)} style={{ background: 'none', border: 'none', color: 'var(--cream-3)', cursor: 'pointer' }}><X size={18} /></button>
              </div>
              <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--cream-3)' }}>Ponle nombre y elige las cosas que quieres que haga, en orden.</p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input value={cardEmoji} onChange={e => setCardEmoji(e.target.value.slice(0, 2))} style={{ width: 46, textAlign: 'center', background: 'rgba(var(--cream-rgb),0.06)', color: 'var(--cream)', border: '1px solid rgba(var(--cream-rgb),0.14)', borderRadius: 9, padding: '9px', fontSize: 16 }} />
                <input value={cardName} onChange={e => setCardName(e.target.value)} placeholder="Nombre (ej. Mi rutina de lunes)" data-testid="card-name"
                  style={{ flex: 1, background: 'rgba(var(--cream-rgb),0.06)', color: 'var(--cream)', border: '1px solid rgba(var(--cream-rgb),0.14)', borderRadius: 9, padding: '9px 12px', fontSize: 14 }} />
              </div>
              {Object.entries(catalog).map(([area, items]) => (
                <div key={area} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>{area}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 6 }}>
                    {items.map(it => {
                      const on = picked.includes(it.action);
                      const idx = picked.indexOf(it.action);
                      return (
                        <button key={it.action} onClick={() => setPicked(p => on ? p.filter(x => x !== it.action) : [...p, it.action])}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', background: on ? 'rgba(167,139,250,0.14)' : 'rgba(var(--cream-rgb),0.04)', border: on ? '1px solid rgba(167,139,250,0.5)' : '1px solid rgba(var(--cream-rgb),0.1)', borderRadius: 8, padding: '7px 10px', cursor: 'pointer' }}>
                          <span style={{ width: 18, height: 18, borderRadius: 5, border: '1.5px solid', borderColor: on ? '#a78bfa' : 'var(--cream-4)', background: on ? '#a78bfa' : 'transparent', color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 800 }}>{on ? idx + 1 : ''}</span>
                          <span style={{ fontSize: 12, color: 'var(--cream)' }}>{it.label}{it.delicate && <span style={{ color: 'var(--amber)', fontSize: 10 }}> · te pregunta</span>}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 10, marginTop: 14, position: 'sticky', bottom: 0, background: 'var(--frame-pop,#11151f)', paddingTop: 10 }}>
                <button onClick={createCard} disabled={!picked.length} data-testid="create-card"
                  style={{ background: picked.length ? 'linear-gradient(90deg,#6366F1,#EC4899)' : 'rgba(var(--cream-rgb),0.1)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 800, cursor: picked.length ? 'pointer' : 'default' }}>
                  Crear tarjeta {picked.length ? `(${picked.length} pasos)` : ''}
                </button>
                <button onClick={() => setBuilder(false)} style={{ background: 'transparent', color: 'var(--cream-2)', border: '1px solid rgba(var(--cream-rgb),0.2)', borderRadius: 10, padding: '10px 18px', fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL · comparar (elegir múltiples proyectos) */}
        {compareOpen && (
          <div onClick={() => setCompareOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(var(--bg-rgb),0.72)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div onClick={e => e.stopPropagation()} style={{ width: 'min(560px,96vw)', maxHeight: '86vh', overflow: 'auto', background: '#0e1219', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 16, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>⚖️ ¿Cuáles comparo?</h2>
                <button onClick={() => setCompareOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--cream-3)', cursor: 'pointer' }}><X size={18} /></button>
              </div>
              <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--cream-3)' }}>Elige 2 o más proyectos (idealmente parecidos / misma zona) para verlos lado a lado.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(scopes.projects || []).map(p => {
                  const on = compareSel.includes(p.id);
                  return (
                    <button key={p.id} onClick={() => setCompareSel(s => on ? s.filter(x => x !== p.id) : [...s, p.id])}
                      onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'rgba(167,139,250,0.1)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = on ? 'rgba(167,139,250,0.14)' : 'rgba(var(--cream-rgb),0.04)'; }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: on ? 'rgba(167,139,250,0.14)' : 'rgba(var(--cream-rgb),0.04)', border: on ? '1px solid rgba(167,139,250,0.5)' : '1px solid rgba(var(--cream-rgb),0.1)', borderRadius: 9, padding: '10px 12px', cursor: 'pointer', transition: 'background .12s' }}>
                      <span style={{ width: 18, height: 18, borderRadius: 5, border: '1.5px solid', borderColor: on ? '#a78bfa' : 'var(--cream-4)', background: on ? '#a78bfa' : 'transparent', color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 800 }}>{on ? '✓' : ''}</span>
                      <span style={{ flex: 1, fontSize: 13.5, color: 'var(--cream)' }}>{p.name}</span>
                      <span style={{ fontSize: 11.5, color: 'var(--cream-4)' }}>{p.zone}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16, position: 'sticky', bottom: 0, background: '#0e1219', paddingTop: 10 }}>
                <button onClick={runCompare} disabled={compareSel.length < 2} data-testid="run-compare"
                  style={{ background: compareSel.length >= 2 ? 'linear-gradient(90deg,#6366F1,#EC4899)' : 'rgba(var(--cream-rgb),0.1)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 20px', fontSize: 14, fontWeight: 800, cursor: compareSel.length >= 2 ? 'pointer' : 'default' }}>
                  Comparar {compareSel.length >= 2 ? `(${compareSel.length})` : ''}
                </button>
                <button onClick={() => setCompareOpen(false)} style={{ background: 'transparent', color: 'var(--cream-2)', border: '1px solid rgba(var(--cream-rgb),0.2)', borderRadius: 10, padding: '11px 18px', fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DeveloperLayout>
  );
}
