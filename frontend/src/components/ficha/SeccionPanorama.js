/**
 * SeccionPanorama — WIZARD "para vivir" traído de la página de zona (PerfilFamilia/WizardPrimera) pero RE-SKINEADO a nuestro
 * diseño y SCOPED a la unidad elegida. Reusa la MISMA matemática (alcance 30% ingreso, préstamo a 20a, rentar-vs-comprar,
 * enganche) pero el reporte responde "¿te queda ESTA unidad?" con sus números. Upgrades: #4 recomienda la mejor unidad de
 * ESTE desarrollo, #5 las respuestas = lead caliente al asesor. Solo dato real; cero inventado.
 */
import React, { useState } from 'react';
import { Card, SERIF, SANS, HEAD } from './ui';

const money = (n) => (n != null && !isNaN(n) ? `$${Math.round(n).toLocaleString('es-MX')}` : '—');
const TASA = 0.1145, IM = TASA / 12, NP = 240;
const mensualidadDe = (principal) => (principal > 0 ? principal * IM / (1 - Math.pow(1 + IM, -NP)) : 0);
const prestamoDe = (pago) => (pago > 0 ? pago * (1 - Math.pow(1 + IM, -NP)) / IM : 0);

const QS = [
  { k: 'personas', icon: '👥', q: '¿Quién la habitaría?', opts: [['Solo yo', 1], ['Pareja', 2], ['Familia', 3]] },
  { k: 'ingreso', icon: '💵', q: '¿Cuál es su ingreso mensual (juntos)?', input: true, ph: 'ej. 80000', sub: 'Para ver para qué te alcanza con una mensualidad sana.' },
  { k: 'ahorro', icon: '🏦', q: '¿Cuánto tienes para el enganche?', input: true, ph: 'ej. 1500000', sub: 'El pago inicial de tu bolsa.' },
  { k: 'renta', icon: '🏚️', q: '¿Cuánto pagas de renta hoy?', input: true, ph: 'ej. 25000', sub: 'Para comparar contra tu mensualidad. Pon 0 si no rentas.' },
  { k: 'credito', icon: '🏛️', q: '¿Cómo piensas el crédito?', opts: [['Banco', 'banco'], ['Infonavit / Cofinavit', 'infonavit'], ['Aún no sé', 'nose']] },
];
const CRED = { banco: 'crédito bancario', infonavit: 'Infonavit/Cofinavit', nose: 'crédito por definir' };

export default function SeccionPanorama({ dev, unit, onSelectUnit }) {
  const [ans, setAns] = useState({});
  const [draft, setDraft] = useState('');
  const plus = ((dev.config || {}).plusvalia_desde_lanzamiento_pct != null ? dev.config.plusvalia_desde_lanzamiento_pct : 4) / 100;

  // unidad de referencia: la elegida, o la más barata disponible
  const dispo = (dev.units || []).filter((u) => u.status === 'disponible');
  const ref = unit || dispo.slice().sort((a, b) => (a.price || 0) - (b.price || 0))[0] || null;

  const step = QS.findIndex((q) => ans[q.k] === undefined);
  const done = step === -1;
  const cur = done ? null : QS[step];

  const ing = Number(ans.ingreso) || 0;
  const ahorro = Number(ans.ahorro) || 0;
  const renta = Number(ans.renta) || 0;
  const recNec = Math.min(3, Math.max(1, Number(ans.personas) || 1));
  const pagoMax = Math.round(ing * 0.30);
  const precioMax = Math.round(prestamoDe(pagoMax) + ahorro);

  // números de ESTA unidad
  const uPrice = ref ? ref.price : dev.price_from;
  const uEnganche = Math.round(uPrice * 0.20);
  const uMensual = Math.round(mensualidadDe(uPrice - uEnganche));
  const alcanza = precioMax >= uPrice;
  const faltaPrecio = Math.max(0, uPrice - precioMax);
  const faltaEng = Math.max(0, uEnganche - ahorro);
  const mesesEng = renta > 0 && faltaEng > 0 ? Math.ceil(faltaEng / renta) : 0;
  const proj = [1, 3, 5, 10].map((y) => ({ y, tirado: renta * 12 * y, valor: Math.round(uPrice * Math.pow(1 + plus, y)) }));

  // #4 — la unidad de ESTE desarrollo que mejor le queda (cabe en presupuesto + recámaras suficientes), la más barata que cumple
  const mejor = dispo
    .filter((u) => (u.bedrooms || 0) >= recNec && (u.price || 0) <= precioMax)
    .sort((a, b) => (a.price || 0) - (b.price || 0))[0]
    || dispo.filter((u) => (u.price || 0) <= precioMax).sort((a, b) => (b.price || 0) - (a.price || 0))[0]
    || null;
  const mejorEsOtra = mejor && ref && mejor.id !== ref.id;

  const lead = () => {
    try {
      window.dispatchEvent(new CustomEvent('dmx:lead', { detail: { source: 'wizard_vivir', devId: dev.id, devName: dev.name, unit: ref && ref.unit_number, perfil: { ...ans, recamaras: recNec, precio_max: precioMax, presupuesto: precioMax } } }));
      window.dispatchEvent(new CustomEvent('dmx:ask-atlax', { detail: { devId: dev.id, devName: dev.name, intent: 'asesor_vivir', unit: ref && ref.unit_number, perfil: ans } }));
    } catch (e) { /* noop */ }
  };

  const commit = () => { const v = parseInt(String(draft).replace(/\D/g, ''), 10); if (v >= 0 && draft !== '') { setAns({ ...ans, [cur.k]: v }); setDraft(''); } };

  // ——— wizard (preguntas) ———
  if (!done) {
    return (
      <Card>
        <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 'clamp(20px,2.4vw,26px)', color: 'var(--cream)' }}>Veamos tus números</div>
        <div style={{ fontFamily: SANS, fontSize: 13, color: 'var(--cream-3)', margin: '6px 0 18px' }}>5 preguntas rápidas → tu panorama para {ref ? `la ${ref.unit_number}` : 'esta propiedad'}.</div>
        <div style={{ display: 'flex', gap: 5, marginBottom: 20 }}>
          {QS.map((q, i) => <span key={q.k} style={{ flex: 1, height: 5, borderRadius: 9999, background: i <= step ? 'var(--grad)' : 'var(--card-border, var(--border))' }} />)}
        </div>
        <div style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: 'var(--cream-3)' }}>Pregunta {step + 1} de {QS.length}</div>
        <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(18px,2.4vw,23px)', color: 'var(--cream)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 9 }}><span style={{ fontSize: 24 }}>{cur.icon}</span>{cur.q}</div>
        {cur.sub && <div style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-3)', marginTop: 7, maxWidth: 470, lineHeight: 1.45 }}>{cur.sub}</div>}
        {!cur.input ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
            {cur.opts.map(([label, val]) => (
              <button key={label} onClick={() => setAns({ ...ans, [cur.k]: val })} style={{ padding: '12px 20px', borderRadius: 12, cursor: 'pointer', border: '1px solid var(--card-border, var(--border))', background: 'var(--surface-card)', color: 'var(--cream)', fontFamily: SANS, fontWeight: 700, fontSize: 14.5 }}>{label}</button>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 16 }}>
            <input autoFocus inputMode="numeric" value={draft ? `$${Number(String(draft).replace(/\D/g, '') || 0).toLocaleString('es-MX')}` : ''} onChange={(e) => setDraft(String(e.target.value).replace(/\D/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} placeholder={cur.ph} style={{ flex: '1 1 220px', minWidth: 0, padding: '12px 15px', borderRadius: 12, border: '1.5px solid var(--card-border, var(--border))', fontFamily: HEAD, fontWeight: 800, fontSize: 16, color: 'var(--cream)', outline: 'none', background: 'var(--surface-card)' }} />
            <button onClick={commit} style={{ padding: '12px 22px', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'var(--grad)', color: '#fff', fontFamily: HEAD, fontWeight: 800, fontSize: 14.5 }}>Continuar →</button>
          </div>
        )}
        {step > 0 && <button onClick={() => { const c = { ...ans }; delete c[QS[step - 1].k]; setAns(c); setDraft(''); }} style={{ marginTop: 18, background: 'none', border: 'none', color: 'var(--cream-3)', fontFamily: SANS, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>← atrás</button>}
      </Card>
    );
  }

  // ——— reporte ———
  const Row = ({ op, label, val, strong }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: strong ? '12px 14px' : '8px 14px', borderRadius: 11, background: strong ? 'rgba(16,185,129,0.08)' : 'var(--surface-card)', border: strong ? '1.5px solid rgba(16,185,129,0.28)' : '1px solid var(--card-border, var(--border))' }}>
      <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: strong ? 13.5 : 12.5, color: strong ? 'var(--cream)' : 'var(--cream-2)' }}>{op ? <span style={{ color: 'var(--cream-3)', fontWeight: 800, marginRight: 7 }}>{op}</span> : null}{label}</span>
      <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: strong ? 'clamp(17px,2.4vw,22px)' : 15, color: strong ? '#059669' : 'var(--cream)', whiteSpace: 'nowrap' }}>{val}</span>
    </div>
  );

  return (
    <Card>
      <div style={{ fontFamily: SANS, fontSize: 13, color: 'var(--cream-2)', lineHeight: 1.6, padding: '12px 16px', borderRadius: 12, background: 'var(--surface-card)', border: '1px solid var(--card-border, var(--border))' }}>
        <b style={{ color: 'var(--cream)' }}>Tu perfil:</b> {recNec > 1 ? `${recNec} personas` : 'para ti'}, ingreso {money(ing)}/mes, con {CRED[ans.credito] || 'crédito'}{renta > 0 ? `. Hoy pagas ${money(renta)} de renta` : ''}. <button onClick={() => setAns({})} style={{ background: 'none', border: 'none', color: 'var(--theme)', fontFamily: SANS, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', padding: 0 }}>cambiar</button>
      </div>

      {/* ¿te alcanza ESTA unidad? */}
      {ref && (
        <div style={{ marginTop: 16, padding: '18px 20px', borderRadius: 14, background: alcanza ? 'rgba(16,185,129,0.06)' : 'rgba(180,83,9,0.06)', border: `1.5px solid ${alcanza ? 'rgba(16,185,129,0.3)' : 'rgba(180,83,9,0.28)'}` }}>
        <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(18px,2.6vw,24px)', color: alcanza ? '#059669' : '#B45309' }}>
          {alcanza ? `✓ Sí te alcanza la ${ref.unit_number}` : `Te falta un poco para la ${ref.unit_number}`}
        </div>
        <div style={{ fontFamily: SANS, fontSize: 13.5, color: 'var(--cream-2)', marginTop: 4 }}>
          {alcanza ? `Tu presupuesto da hasta ${money(precioMax)} y esta unidad cuesta ${money(uPrice)}.` : `Esta unidad cuesta ${money(uPrice)} y tu presupuesto hoy llega a ${money(precioMax)} (faltarían ~${money(faltaPrecio)}).`}
        </div>
        </div>
      )}

      {/* alcance */}
      {pagoMax > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>💵 Para qué te alcanza</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <Row label="Tu ingreso mensual" val={`${money(ing)}`} />
            <Row op="× 30%" label="Mensualidad sana" val={`${money(pagoMax)}`} />
            <Row op="→" label="El banco te presta (20 años)" val={money(prestamoDe(pagoMax))} />
            <Row op="+" label="Tu enganche" val={money(ahorro)} />
            <Row strong op="=" label="Precio máximo" val={money(precioMax)} />
          </div>
        </div>
      )}

      {/* cambia tu renta + enganche para esta unidad */}
      {ref && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginTop: 16 }}>
          {renta > 0 && (
            <div style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--surface-card)', border: '1px solid var(--card-border, var(--border))' }}>
              <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: 'var(--cream-3)' }}>Cambias tu renta de</div>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22, color: '#DC2626' }}>{money(renta)}<span style={{ fontSize: 12, color: 'var(--cream-3)', fontWeight: 600 }}>/mes</span></div>
              <div style={{ fontFamily: SANS, fontSize: 12, color: 'var(--cream-3)', margin: '6px 0 2px' }}>por la mensualidad de la {ref.unit_number}</div>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22, color: '#059669' }}>{money(uMensual)}<span style={{ fontSize: 12, color: 'var(--cream-3)', fontWeight: 600 }}>/mes</span></div>
              <div style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-3)', marginTop: 4 }}>y es tuya · enganche 20%</div>
            </div>
          )}
          <div style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--surface-card)', border: '1px solid var(--card-border, var(--border))' }}>
            <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: 'var(--cream-3)' }}>Enganche de la {ref.unit_number} (20%)</div>
            <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22, color: 'var(--cream)' }}>{money(uEnganche)}</div>
            {faltaEng > 0
              ? <div style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-2)', marginTop: 6 }}>Te faltan <b style={{ color: '#B45309' }}>{money(faltaEng)}</b>{mesesEng > 0 ? <> · ahorrando tu renta los juntas en <b style={{ color: 'var(--cream)' }}>~{mesesEng} meses</b></> : ''}.</div>
              : <div style={{ fontFamily: SANS, fontSize: 12.5, color: '#059669', fontWeight: 700, marginTop: 6 }}>✓ Ya tienes el enganche completo.</div>}
          </div>
        </div>
      )}

      {/* rentar vs comprar */}
      {renta > 0 && ref && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Rentar vs comprar la {ref.unit_number}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10 }}>
            {proj.map((p) => (
              <div key={p.y} style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid var(--card-border, var(--border))', background: 'var(--surface-card)' }}>
                <div style={{ fontFamily: SANS, fontSize: 11, color: 'var(--cream-3)', fontWeight: 700 }}>A {p.y} año{p.y > 1 ? 's' : ''}</div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: '#DC2626', marginTop: 4 }}>Rentando tiras {money(p.tirado)}</div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: '#059669' }}>Comprando vale {money(p.valor)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* #4 — la que mejor te queda */}
      {mejorEsOtra && (
        <div style={{ marginTop: 16, padding: '14px 18px', borderRadius: 13, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.25)' }}>
          <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: 'var(--theme)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>💡 La que mejor te queda aquí</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
            <div style={{ fontFamily: SANS, fontSize: 13.5, color: 'var(--cream-2)' }}>Para {recNec > 1 ? `${recNec} personas` : 'ti'} y tu presupuesto, la <b style={{ color: 'var(--cream)' }}>{mejor.unit_number}</b> ({mejor.bedrooms} rec · {money(mejor.price)}) te cuadra mejor.</div>
            <button onClick={() => onSelectUnit && onSelectUnit(mejor)} style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: 'var(--grad)', color: '#fff', fontFamily: HEAD, fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>Ver la {mejor.unit_number} →</button>
          </div>
        </div>
      )}

      {/* #5 — lead caliente al asesor */}
      <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--card-border, var(--border))', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={lead} style={{ padding: '13px 22px', borderRadius: 12, border: 'none', background: 'var(--grad)', color: '#fff', fontFamily: HEAD, fontWeight: 800, fontSize: 14.5, cursor: 'pointer' }}>Quiero que un asesor me arme el plan →</button>
        <span style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-3)' }}>Le llega tu perfil y tus números — sin volver a explicar.</span>
      </div>
    </Card>
  );
}
