/**
 * CatalogoQuickSearch — el buscador del Catálogo en la Home (Fase B del rebuild UX).
 * "Pregunta y filtra": el founder escribe lo que quiere saber y ve las herramientas que responden,
 * sin recorrer 24 tabs. Reusa GET /catalogo (server-driven) y lleva al detalle con un clic.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, Sparkles } from 'lucide-react';
import { getCatalogo } from '../../api/superadminMetricsCube';
import { preguntarAlCopilot } from '../../hooks/useAICopilot';

const SUGERENCIAS = ['absorción', 'renta', 'escasez', 'plusvalía', 'quién busca', 'riesgo'];

export default function CatalogoQuickSearch() {
  const nav = useNavigate();
  const [cat, setCat] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => { getCatalogo().then(setCat).catch(() => setCat({ piezas: [], n_piezas: 0 })); }, []);

  const res = useMemo(() => {
    if (!cat || !q.trim()) return [];
    const t = q.trim().toLowerCase();
    return cat.piezas
      .filter((p) => [p.titulo, p.que_es, p.que_dice, p.que_hago, ...(p.temas || [])].join(' ').toLowerCase().includes(t))
      .slice(0, 6);
  }, [cat, q]);

  return (
    <div data-testid="home-catalogo-search" style={{ marginBottom: 22, padding: 18, borderRadius: 16, background: 'linear-gradient(135deg, rgba(var(--theme-rgb),0.08), rgba(255,255,255,0.02))', border: '1px solid rgba(var(--theme-rgb),0.22)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)' }}>Encuentra tu herramienta</span>
        <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.55)' }}>
          {cat ? `${cat.n_piezas} herramientas en 6 áreas` : 'cargando…'} · escribe y te llevo · ¿es una pregunta? te la responde el <b>Copilot DMX</b>
        </span>
        <button onClick={() => nav('/superadmin/catalogo')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--theme)', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Ver todo →</button>
      </div>
      <div style={{ position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', left: 14, top: 13, color: 'rgba(240,235,224,0.4)' }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} data-testid="home-cat-input"
          placeholder="ej: absorción, cap rate, screener, quién busca, salud del dato…"
          onKeyDown={(e) => { if (e.key === 'Enter') { if (res[0]) nav(res[0].ruta_ui); else if (q.trim()) preguntarAlCopilot(q.trim()); } }}
          style={{ width: '100%', padding: '11px 14px 11px 40px', borderRadius: 12, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.14)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 14 }} />
      </div>
      {/* sugerencias cuando no hay texto */}
      {!q.trim() && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {SUGERENCIAS.map((s) => (
            <button key={s} onClick={() => setQ(s)} style={{ padding: '4px 11px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(240,235,224,0.75)', fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer' }}>{s}</button>
          ))}
        </div>
      )}
      {/* resultados en vivo */}
      {res.length > 0 && (
        <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
          {res.map((p) => (
            <button key={p.id} onClick={() => nav(p.ruta_ui)} data-testid={`home-res-${p.id}`}
              style={{ textAlign: 'left', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '9px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>{p.titulo}</span>
                <span style={{ display: 'block', fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.que_es}</span>
              </span>
              <ArrowRight size={14} color="var(--theme)" />
            </button>
          ))}
        </div>
      )}
      {/* HANDOFF: 0 herramientas coinciden → suena a PREGUNTA → se la lleva al Copilot DMX (Atlax) */}
      {q.trim() && res.length === 0 && (
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.7)' }}>
            No es el nombre de una herramienta — suena a una <b>pregunta</b>.
          </span>
          <button onClick={() => preguntarAlCopilot(q.trim())} data-testid="home-handoff-copilot"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, background: 'rgba(var(--theme-rgb),0.16)', border: '1px solid rgba(var(--theme-rgb),0.4)', color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
            <Sparkles size={13} /> Pregúntale al Copilot DMX
          </button>
        </div>
      )}
    </div>
  );
}
