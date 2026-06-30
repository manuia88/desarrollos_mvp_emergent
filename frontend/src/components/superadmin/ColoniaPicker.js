import React, { useEffect, useRef, useState } from 'react';
import { getColonias } from '../../api/superadminDemandIntel';

// COLONIA PICKER — selector con búsqueda. Reemplaza los inputs de texto donde se tecleaba el slug a mano.
// Devuelve el id (slug) de la colonia. Cache del catálogo a nivel módulo (se pide una vez).
let _cache = null;

export default function ColoniaPicker({ value, onChange, placeholder = 'Busca una colonia…', allowCity = false, style }) {
  const [cols, setCols] = useState(_cache || []);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const boxRef = useRef(null);

  useEffect(() => {
    if (_cache) { setCols(_cache); return; }
    getColonias().then((d) => { _cache = d.colonias || []; setCols(_cache); }).catch(() => {});
  }, []);

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const sel = cols.find((c) => c.id === value);
  const ql = q.trim().toLowerCase();
  let opts = ql
    ? cols.filter((c) => (c.nombre + ' ' + (c.alcaldia || '') + ' ' + c.id).toLowerCase().includes(ql))
    : cols;
  opts = opts.slice(0, 40);
  const cityOpt = allowCity ? [{ id: '', nombre: 'Toda la ciudad (CDMX)', alcaldia: '', _city: true }] : [];
  const lista = [...cityOpt, ...opts];

  const pick = (c) => { onChange(c.id); setQ(''); setOpen(false); };

  const inp = {
    width: '100%', padding: '7px 11px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.04)', color: '#e6e6ea', fontSize: 12.5, outline: 'none',
  };

  return (
    <div ref={boxRef} style={{ position: 'relative', minWidth: 220, ...style }}>
      <input
        value={open ? q : (sel ? `${sel.nombre}${sel.alcaldia ? ' · ' + sel.alcaldia : ''}` : (value === '' && allowCity ? 'Toda la ciudad (CDMX)' : q))}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => { setQ(''); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, lista.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter' && lista[hi]) { e.preventDefault(); pick(lista[hi]); }
          else if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={placeholder} style={inp} />
      {open && lista.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 50, maxHeight: 280, overflowY: 'auto',
          background: '#0d1119', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 9, boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
          {lista.map((c, i) => (
            <button key={c.id || '__city'} onMouseEnter={() => setHi(i)} onClick={() => pick(c)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', textAlign: 'left',
                padding: '7px 11px', cursor: 'pointer', border: 'none', fontSize: 12.5,
                background: i === hi ? 'rgba(255,255,255,0.08)' : 'transparent', color: c._city ? '#9aa' : '#ddd' }}>
              <span>{c.nombre}{c.alcaldia ? <span style={{ color: '#888' }}> · {c.alcaldia}</span> : null}</span>
              {c.n_unidades != null && <span style={{ color: '#777', fontSize: 11 }}>{c.n_unidades} u.</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
