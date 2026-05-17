/**
 * W5.12 Parte 2 — Tab Preguntas: dropdown plantillas + form dinamico + tabla resultados.
 *
 * Lee /templates al montar, renderiza un <select> con 12 plantillas.
 * Al elegir, pinta inputs dinamicos basados en required_params + param_validators_summary.
 * Ejecuta POST /query y renderiza una tabla columnas dinamicas + export CSV.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Download, FileText, Loader2, Play, RefreshCw } from 'lucide-react';
import { getKgTemplates, runKgQuery } from '../../api/knowledge_graph';

const cardStyle = {
  background: 'rgba(13,16,23,0.92)',
  backdropFilter: 'blur(24px)',
  border: '1px solid var(--border, rgba(255,255,255,0.08))',
  borderRadius: 16,
  padding: '20px 22px',
};

const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 9999,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid var(--border, rgba(255,255,255,0.12))',
  color: 'var(--cream, #F0EBE0)',
  fontFamily: 'DM Sans',
  fontSize: 13,
  outline: 'none',
};

const labelStyle = {
  display: 'block',
  fontFamily: 'DM Mono, monospace',
  fontSize: 10,
  color: 'var(--cream-3, rgba(240,235,224,0.55))',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 6,
};

function PillBtn({ children, onClick, kind = 'ghost', disabled, testid }) {
  const palettes = {
    primary: { background: 'linear-gradient(90deg, var(--theme, #7c2fff), var(--theme-2, #c026d3))', color: '#fff', border: '1px solid transparent' },
    ghost:   { background: 'rgba(255,255,255,0.04)', color: 'var(--cream-2, #d6d2c4)', border: '1px solid var(--border, rgba(255,255,255,0.10))' },
  };
  const p = palettes[kind] || palettes.ghost;
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '9px 18px', borderRadius: 9999,
        fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        transition: 'transform 200ms', ...p,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}>
      {children}
    </button>
  );
}

function _isIntHintRange(hint) {
  if (!hint) return null;
  const m = /(\d+)\s*-\s*(\d+)/.exec(hint);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
}

function ParamInput({ name, value, hint, onChange }) {
  const range = _isIntHintRange(hint);
  if (range) {
    return (
      <input
        type="number"
        min={range[0]}
        max={range[1]}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
        data-testid={`param-${name}`}
        placeholder={`${range[0]}-${range[1]}`}
        style={inputStyle}
      />
    );
  }
  if (hint && hint.includes('|')) {
    const opts = hint.split('|').map(s => s.trim());
    return (
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        data-testid={`param-${name}`}
        style={inputStyle}>
        <option value="">— sin filtro —</option>
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      data-testid={`param-${name}`}
      placeholder={hint || ''}
      style={inputStyle}
    />
  );
}

function ResultsTable({ rows }) {
  const [page, setPage] = useState(0);
  if (!rows || rows.length === 0) return null;
  const columns = Array.from(rows.reduce((acc, r) => { Object.keys(r).forEach(k => acc.add(k)); return acc; }, new Set()));
  const PAGE = 50;
  const slice = rows.slice(page * PAGE, page * PAGE + PAGE);
  const totalPages = Math.ceil(rows.length / PAGE);

  return (
    <div data-testid="kg-results-table" style={{ overflowX: 'auto', marginTop: 14 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border, rgba(255,255,255,0.10))' }}>
            {columns.map(c => (
              <th key={c} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--cream-3, rgba(240,235,224,0.55))', fontWeight: 600, fontFamily: 'DM Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slice.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border, rgba(255,255,255,0.06))' }}>
              {columns.map(c => (
                <td key={c} style={{ padding: '8px 12px', color: 'var(--cream-2, rgba(240,235,224,0.85))', fontFamily: 'DM Mono, monospace', fontSize: 11 }}>
                  {row[c] === null || row[c] === undefined ? '—' : (typeof row[c] === 'object' ? JSON.stringify(row[c]) : String(row[c]))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3, rgba(240,235,224,0.55))' }}>
          <span>{rows.length} resultados · pag {page + 1}/{totalPages}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <PillBtn disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} testid="results-prev-btn">Anterior</PillBtn>
            <PillBtn disabled={page + 1 >= totalPages} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} testid="results-next-btn">Siguiente</PillBtn>
          </div>
        </div>
      )}
    </div>
  );
}

function exportCsv(template, rows) {
  if (!rows || rows.length === 0) return;
  const cols = Array.from(rows.reduce((acc, r) => { Object.keys(r).forEach(k => acc.add(k)); return acc; }, new Set()));
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kg_${template}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export default function KGQueryTemplates() {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState([]);
  const [loadingTpls, setLoadingTpls] = useState(true);
  const [selected, setSelected] = useState('');
  const [params, setParams] = useState({});
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [latency, setLatency] = useState(null);
  const [error, setError] = useState(null);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);

  const loadTemplates = async () => {
    setLoadingTpls(true);
    const r = await getKgTemplates();
    if (r.ok) {
      setTemplates(r.body.templates || []);
      setServiceUnavailable(false);
    } else {
      setTemplates([]);
    }
    setLoadingTpls(false);
  };
  useEffect(() => { loadTemplates(); }, []);

  const currentTpl = useMemo(
    () => templates.find(t => t.key === selected) || null,
    [templates, selected],
  );

  useEffect(() => {
    if (currentTpl) {
      const init = {};
      [...(currentTpl.required_params || []), ...(currentTpl.optional_params || [])].forEach(p => { init[p] = ''; });
      setParams(init);
      setResults(null);
      setError(null);
    }
  }, [currentTpl]);

  const handleParamChange = (name, value) => {
    setParams(p => ({ ...p, [name]: value }));
  };

  const handleRun = async () => {
    if (!currentTpl) return;
    setError(null);
    setResults(null);
    // Client-side required-check
    const missing = (currentTpl.required_params || []).filter(p => params[p] === '' || params[p] === null || params[p] === undefined);
    if (missing.length > 0) {
      setError(t('knowledge_graph.errors.missing_params', { params: missing.join(', ') }));
      return;
    }
    setBusy(true);
    // Strip empty optional params
    const cleanParams = {};
    Object.entries(params).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) cleanParams[k] = v; });

    const r = await runKgQuery(currentTpl.key, cleanParams);
    setBusy(false);

    if (r.status === 503) {
      setServiceUnavailable(true);
      setError(t('knowledge_graph.fallback_message', 'Knowledge Graph no disponible. Usando fallback relacional.'));
      return;
    }
    if (!r.ok) {
      const detail = r.body?.detail;
      const msg = typeof detail === 'string' ? detail : (detail?.errors?.join(' · ') || `Error ${r.status}`);
      setError(msg);
      return;
    }
    setResults(r.body.rows || []);
    setLatency(r.body.latency_ms);
  };

  return (
    <div data-testid="kg-tab-preguntas" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px' }}>
            <label style={labelStyle}>{t('knowledge_graph.templates_select_label', 'Plantilla')}</label>
            <select
              data-testid="template-select"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              style={inputStyle}
              disabled={loadingTpls}>
              <option value="">— {t('knowledge_graph.choose_template', 'Elige una plantilla')} —</option>
              {templates.map(tp => (
                <option key={tp.key} value={tp.key}>{tp.description || tp.key}</option>
              ))}
            </select>
          </div>
          <PillBtn onClick={loadTemplates} testid="reload-templates-btn" disabled={loadingTpls}>
            <RefreshCw size={11} /> {t('knowledge_graph.actions.refresh', 'Recargar')}
          </PillBtn>
        </div>

        {currentTpl && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3, rgba(240,235,224,0.65))', marginBottom: 12 }}>
              {currentTpl.description}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {(currentTpl.required_params || []).map(p => (
                <div key={p}>
                  <label style={labelStyle}>
                    {p}
                    <span style={{ color: '#fda4af', marginLeft: 6 }}>*</span>
                  </label>
                  <ParamInput name={p} value={params[p]} hint={currentTpl.param_validators_summary?.[p]} onChange={(v) => handleParamChange(p, v)} />
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--cream-3, rgba(240,235,224,0.45))', marginTop: 4 }}>
                    {currentTpl.param_validators_summary?.[p] || ''}
                  </div>
                </div>
              ))}
              {(currentTpl.optional_params || []).map(p => (
                <div key={p}>
                  <label style={labelStyle}>{p} <span style={{ color: 'var(--cream-3, rgba(240,235,224,0.45))', fontSize: 8 }}>(opcional)</span></label>
                  <ParamInput name={p} value={params[p]} hint={currentTpl.param_validators_summary?.[p]} onChange={(v) => handleParamChange(p, v)} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
              <PillBtn kind="primary" onClick={handleRun} disabled={busy} testid="run-query-btn">
                {busy ? <Loader2 size={11} className="spin" /> : <Play size={11} />}
                {t('knowledge_graph.actions.ejecutar', 'Ejecutar query')}
              </PillBtn>
              {results && results.length > 0 && (
                <PillBtn onClick={() => exportCsv(currentTpl.key, results)} testid="export-csv-btn">
                  <Download size={11} /> {t('knowledge_graph.actions.export_csv', 'Exportar CSV')}
                </PillBtn>
              )}
              {latency != null && results && (
                <span style={{ alignSelf: 'center', fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--cream-3, rgba(240,235,224,0.55))' }}>
                  {results.length} resultados · {latency} ms
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div data-testid="kg-error" style={{
          ...cardStyle,
          display: 'flex', alignItems: 'flex-start', gap: 10,
          background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.25)',
        }}>
          <AlertTriangle size={14} color="#fda4af" style={{ flexShrink: 0, marginTop: 2 }} />
          <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: '#fecaca', lineHeight: 1.5 }}>{error}</span>
          {serviceUnavailable && (
            <PillBtn onClick={handleRun} testid="kg-retry-btn">
              <RefreshCw size={11} /> {t('knowledge_graph.actions.retry', 'Reintentar')}
            </PillBtn>
          )}
        </div>
      )}

      {results && results.length === 0 && (
        <div data-testid="kg-empty-results" style={{ ...cardStyle, textAlign: 'center', padding: '40px 22px' }}>
          <FileText size={22} color="var(--cream-3, rgba(240,235,224,0.45))" />
          <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3, rgba(240,235,224,0.55))', marginTop: 10 }}>
            {t('knowledge_graph.empty_states.no_results', 'Sin resultados')}
          </div>
        </div>
      )}

      {results && results.length > 0 && (
        <div style={cardStyle}>
          <ResultsTable rows={results} />
        </div>
      )}
    </div>
  );
}
