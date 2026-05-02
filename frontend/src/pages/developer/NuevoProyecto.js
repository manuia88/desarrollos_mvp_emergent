/**
 * Phase 4 Batch 12 — NuevoProyecto wizard page.
 * 3 modes: manual | IA upload | Drive import. All converge into the same 7-step wizard.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DeveloperLayout from '../../components/shared/DeveloperLayout';
import { SmartWizard } from '../../components/shared/SmartWizard';
import { DragDropZone } from '../../components/shared/DragDropZone';
import MapboxPicker from '../../components/developer/MapboxPicker';
import {
  getWizardSmartDefaults, createWizardProject,
  uploadWizardFiles, getDriveStatus, processDriveUrl,
} from '../../api/wizard';
import { Sparkles, UploadCloud, Cloud, FileText, Check, AlertCircle, X } from 'lucide-react';

// ═══ STEP 1 — Categoría ═══════════════════════════════════════════════════
function Step1Categoria({ data = {}, onChange, ia_prefill }) {
  const set = (k, v) => onChange({ ...data, [k]: v });
  const optTipo = [
    { v: 'residencial_vertical',  label: 'Residencial vertical' },
    { v: 'residencial_horizontal', label: 'Residencial horizontal' },
    { v: 'mixto',                   label: 'Usos mixtos' },
    { v: 'comercial',               label: 'Comercial' },
  ];
  const optSeg = [
    { v: 'NSE_AB', label: 'NSE A/B (premium)' },
    { v: 'NSE_C+', label: 'NSE C+ (alto-medio)' },
    { v: 'NSE_C',  label: 'NSE C (medio)' },
    { v: 'NSE_D',  label: 'NSE D (medio-bajo)' },
  ];
  const optEtapa = [
    { v: 'preventa',        label: 'Preventa' },
    { v: 'en_construccion', label: 'En construcción' },
    { v: 'entregado',       label: 'Entregado' },
  ];
  return (
    <div className="space-y-5">
      <Field label="Tipo de proyecto" ia={ia_prefill?.tipo_proyecto}>
        <RadioGrid value={data.tipo_proyecto} onChange={v => set('tipo_proyecto', v)} opts={optTipo} tid="tipo" />
      </Field>
      <Field label="Segmento NSE target" ia={ia_prefill?.segmento}>
        <RadioGrid value={data.segmento} onChange={v => set('segmento', v)} opts={optSeg} tid="seg" />
      </Field>
      <Field label="Etapa actual" ia={ia_prefill?.etapa}>
        <RadioGrid value={data.etapa} onChange={v => set('etapa', v)} opts={optEtapa} tid="etapa" />
      </Field>
    </div>
  );
}

// ═══ STEP 2 — Operación y Datos ═══════════════════════════════════════════
function Step2Operacion({ data = {}, onChange, ia_prefill }) {
  const set = (k, v) => onChange({ ...data, [k]: v });
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Nombre del proyecto *" ia={ia_prefill?.nombre}>
        <Input value={data.nombre || ''} onChange={v => set('nombre', v)} tid="name" />
      </Field>
      <Field label="Slug (auto)" hint={`URL: /proyectos/${slugify(data.nombre || '')}`}>
        <Input value={data.slug || slugify(data.nombre || '')}
          onChange={v => set('slug', v)} tid="slug" disabled={!data.slug} />
      </Field>
      <Field label="Total de unidades target" ia={ia_prefill?.total_unidades}>
        <Input type="number" value={data.total_unidades || ''} onChange={v => set('total_unidades', Number(v))} tid="total-units" />
      </Field>
      <Field label="Construction cost (MXN)" ia={ia_prefill?.construction_cost}>
        <Input type="number" value={data.construction_cost || ''} onChange={v => set('construction_cost', Number(v))} tid="construction-cost" />
      </Field>
      <Field label="Precio promedio per unidad (MXN)" ia={ia_prefill?.target_price}>
        <Input type="number" value={data.target_price || ''} onChange={v => set('target_price', Number(v))} tid="target-price" />
      </Field>
      <Field label="Absorción target (meses)" ia={ia_prefill?.target_absorption_months}>
        <Input type="number" value={data.target_absorption_months || ''} onChange={v => set('target_absorption_months', Number(v))} tid="absorption" />
      </Field>
    </div>
  );
}

// ═══ STEP 3 — Ubicación ═══════════════════════════════════════════════════
function Step3Ubicacion({ data = {}, onChange, ia_prefill }) {
  const set = (k, v) => onChange({ ...data, [k]: v });
  const uia = ia_prefill?.ubicacion || {};
  const handleMapSave = (lat, lng) => {
    onChange({ ...data, lat, lng });
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Estado *" ia={uia.estado}>
          <Input value={data.estado || ''} onChange={v => set('estado', v)} tid="estado" />
        </Field>
        <Field label="Municipio *" ia={uia.municipio}>
          <Input value={data.municipio || ''} onChange={v => set('municipio', v)} tid="municipio" />
        </Field>
        <Field label="Colonia *" ia={uia.colonia}>
          <Input value={data.colonia || ''} onChange={v => set('colonia', v)} tid="colonia" />
        </Field>
        <Field label="Calle y número" ia={uia.calle}>
          <Input value={data.calle || ''} onChange={v => set('calle', v)} tid="calle" />
        </Field>
        <Field label="Código postal" ia={uia.cp}>
          <Input value={data.cp || ''} onChange={v => set('cp', v)} tid="cp" />
        </Field>
        <Field label="Coordenadas (lat, lng)" hint="Click en el mapa para fijar el marker">
          <div className="text-xs text-[var(--cream-2)] font-mono px-3 py-2 bg-[rgba(240,235,224,0.04)] rounded-lg border border-[rgba(240,235,224,0.12)]">
            {data.lat && data.lng ? `${Number(data.lat).toFixed(5)}, ${Number(data.lng).toFixed(5)}` : 'Sin definir'}
          </div>
        </Field>
      </div>
      <div className="rounded-xl overflow-hidden border border-[rgba(240,235,224,0.12)]">
        <MapboxPicker
          lat={data.lat || 19.4326}
          lng={data.lng || -99.1332}
          zoom={13}
          onSave={handleMapSave}
          height={300}
        />
      </div>
    </div>
  );
}

// ═══ STEP 4 — Amenidades ══════════════════════════════════════════════════
const AMENITY_CATS = {
  comunes:        ['gym', 'alberca', 'spa', 'sauna', 'jacuzzi', 'terraza', 'salon_eventos'],
  internas:       ['lobby', 'cowork', 'biblioteca', 'cine', 'game_room', 'bar'],
  exteriores:     ['jardin', 'parque', 'cancha_padel', 'cancha_tenis', 'pista_jogging', 'area_mascotas'],
  premium:        ['valet_parking', 'concierge_24h', 'helipuerto', 'wine_cellar', 'private_dining'],
};
function Step4Amenidades({ data = [], onChange, ia_prefill }) {
  const selected = new Set(data || []);
  const iaSet = new Set((ia_prefill?.amenidades_sugeridas || []).map(a => typeof a === 'string' ? a : a.value));
  const toggle = (a) => {
    const next = new Set(selected);
    next.has(a) ? next.delete(a) : next.add(a);
    onChange([...next]);
  };
  return (
    <div className="space-y-5">
      <div className="text-xs text-[rgba(240,235,224,0.55)]">
        Selecciona amenidades disponibles. <strong className="text-[var(--cream)]">{selected.size}</strong> activas.
      </div>
      {Object.entries(AMENITY_CATS).map(([cat, list]) => (
        <div key={cat}>
          <h4 className="text-[10px] font-bold tracking-wider uppercase text-[rgba(240,235,224,0.5)] mb-2">{cat}</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {list.map(a => (
              <label key={a} data-testid={`amenity-${a}`}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors
                  ${selected.has(a)
                    ? 'bg-[rgba(240,235,224,0.12)] border-[rgba(240,235,224,0.3)] text-[var(--cream)]'
                    : 'bg-[rgba(240,235,224,0.03)] border-[rgba(240,235,224,0.08)] text-[rgba(240,235,224,0.65)]'}`}>
                <input type="checkbox" checked={selected.has(a)} onChange={() => toggle(a)}
                  className="accent-[var(--cream)]" />
                <span className="text-xs capitalize">{a.replace('_', ' ')}</span>
                {iaSet.has(a) && <Sparkles size={10} className="text-amber-400 ml-auto" />}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══ STEP 5 — Contenido y Fotos ═══════════════════════════════════════════
function Step5Contenido({ data = {}, onChange }) {
  const [uploaded, setUploaded] = useState(data.files || []);
  const handleDrop = (files) => {
    const newList = [...uploaded, ...files.map(f => ({
      name: f.name, size: f.size, type: f.type,
      ext: f.name.split('.').pop().toLowerCase(),
    }))];
    setUploaded(newList);
    onChange({ ...data, files: newList });
  };
  return (
    <div>
      <p className="text-xs text-[rgba(240,235,224,0.55)] mb-3">
        Fotos cover, planos, renders, brochure, video y tour 360°. Mínimo <strong>1 foto cover</strong>.
      </p>
      <DragDropZone
        accept="image/*,.pdf,.mp4,.mov"
        maxSizeMB={50}
        maxFiles={20}
        onUpload={handleDrop}
        label="Arrastra fotos, planos o videos"
      />
      {uploaded.length > 0 && (
        <div className="mt-3 text-xs text-[var(--cream-2)]" data-testid="content-uploaded-count">
          {uploaded.length} archivo(s) preparados (se subirán al crear el proyecto).
        </div>
      )}
    </div>
  );
}

// ═══ STEP 6 — Legal ═══════════════════════════════════════════════════════
function Step6Legal({ data = {}, onChange }) {
  const set = (k, v) => onChange({ ...data, [k]: v });
  const estados = [
    { v: 'sin_contrato',   label: 'Sin contrato' },
    { v: 'docs_pendientes', label: 'Docs pendientes' },
    { v: 'en_revision',    label: 'En revisión' },
    { v: 'aprobado',       label: 'Aprobado' },
    { v: 'rechazado',      label: 'Rechazado' },
  ];
  const [docs, setDocs] = useState(data.documents || []);
  const onDrop = (files) => {
    const next = [...docs, ...files.map(f => ({ name: f.name, size: f.size }))];
    setDocs(next);
    set('documents', next);
  };
  return (
    <div className="space-y-5">
      <Field label="Estado proceso legal">
        <RadioGrid value={data.estado || 'sin_contrato'} onChange={v => set('estado', v)} opts={estados} tid="legal-status" />
      </Field>
      <div>
        <h4 className="text-[10px] font-bold tracking-wider uppercase text-[rgba(240,235,224,0.5)] mb-2">Documentos legales</h4>
        <DragDropZone
          accept=".pdf,.docx,.xlsx"
          maxSizeMB={20}
          maxFiles={15}
          onUpload={onDrop}
          label="Uso de suelo, SEDUVI, planos aprobados, contratos…"
        />
        {docs.length > 0 && (
          <div className="mt-2 text-xs text-[var(--cream-2)]" data-testid="legal-docs-count">
            {docs.length} documento(s) listos · Se categorizarán automáticamente con IA tras crear el proyecto.
          </div>
        )}
      </div>
    </div>
  );
}

// ═══ STEP 7 — Comercialización ════════════════════════════════════════════
function Step7Comercializacion({ data = {}, onChange, ia_prefill }) {
  const cm = ia_prefill?.comercializacion || {};
  const set = (k, v) => onChange({ ...data, [k]: v });
  const works = data.works_with_brokers ?? cm.works_with_brokers ?? false;
  const commission = data.default_commission_pct ?? cm.default_commission_pct ?? 3.0;
  return (
    <div className="space-y-5">
      <Toggle label="¿Trabajar con brokers externos?" tid="works-brokers"
        value={works} onChange={v => set('works_with_brokers', v)} />

      {works && (
        <div className="pl-4 border-l-2 border-[rgba(240,235,224,0.12)] space-y-4">
          <Field label={`Comisión default: ${commission}%`}>
            <input type="range" min="1" max="10" step="0.5" value={commission}
              onChange={e => set('default_commission_pct', Number(e.target.value))}
              className="w-full accent-[var(--cream)]" data-testid="commission-slider" />
          </Field>
          <Toggle label="IVA incluido en comisión" tid="iva"
            value={data.iva_included || false} onChange={v => set('iva_included', v)} />
          <div>
            <label className="text-xs text-[rgba(240,235,224,0.55)] block mb-2">Términos adicionales (opcional)</label>
            <textarea value={data.broker_terms || ''} onChange={e => set('broker_terms', e.target.value)}
              rows={3} data-testid="broker-terms"
              placeholder="Política de exclusividad, co-brokerage, plazos de pago…"
              className="w-full px-3 py-2 rounded-lg bg-[rgba(240,235,224,0.06)] border border-[rgba(240,235,224,0.12)] text-[var(--cream)] text-sm" />
          </div>
        </div>
      )}

      <Toggle label="Solo in-house (sin brokers externos)" tid="inhouse-only"
        value={!works && (data.in_house_only ?? true)}
        onChange={v => set('in_house_only', v)}
        disabled={works} />

      <div className="text-[10px] text-[rgba(240,235,224,0.35)] italic">
        Pre-asignación de asesores internos se puede configurar después desde la pestaña Comercialización.
      </div>
    </div>
  );
}

// ═══ REUSABLES ════════════════════════════════════════════════════════════
function Field({ label, hint, ia, children }) {
  const iaValue = ia && typeof ia === 'object' ? ia.value : null;
  const iaConf = ia?.confidence;
  const iaSource = ia?.source;
  return (
    <div>
      <label className="text-xs text-[rgba(240,235,224,0.65)] block mb-1.5 flex items-center gap-1.5">
        {label}
        {iaValue != null && <Sparkles size={10} className="text-amber-400"
          title={`Detectado por IA (${iaConf || '?'}% conf) · ${iaSource || ''}`} />}
      </label>
      {children}
      {hint && <div className="text-[10px] text-[rgba(240,235,224,0.35)] mt-1">{hint}</div>}
    </div>
  );
}

function Input({ value, onChange, type = 'text', tid, disabled }) {
  return (
    <input value={value ?? ''} onChange={e => onChange(e.target.value)} type={type}
      data-testid={`wizard-input-${tid}`} disabled={disabled}
      className="w-full px-3 py-2 rounded-lg bg-[rgba(240,235,224,0.06)] border border-[rgba(240,235,224,0.12)] text-[var(--cream)] text-sm disabled:opacity-60" />
  );
}

function RadioGrid({ value, onChange, opts, tid }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {opts.map(o => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)}
          data-testid={`${tid}-opt-${o.v}`}
          className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-colors
            ${value === o.v
              ? 'bg-[rgba(240,235,224,0.14)] border-[rgba(240,235,224,0.4)] text-[var(--cream)]'
              : 'bg-[rgba(240,235,224,0.03)] border-[rgba(240,235,224,0.08)] text-[rgba(240,235,224,0.65)]'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ label, value, onChange, tid, disabled }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[var(--cream-2)]">{label}</span>
      <button type="button" disabled={disabled}
        onClick={() => onChange(!value)}
        data-testid={`wizard-toggle-${tid}`}
        className={`relative w-10 h-5 rounded-full transition-colors disabled:opacity-40
          ${value ? 'bg-[var(--cream)]' : 'bg-[rgba(240,235,224,0.14)]'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-[var(--navy)] transition-all
          ${value ? 'left-5' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

function slugify(name) {
  if (!name) return '';
  return name.toLowerCase().trim()
    .replace(/[áà]/g, 'a').replace(/[éè]/g, 'e').replace(/[íì]/g, 'i')
    .replace(/[óò]/g, 'o').replace(/[úù]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, '-').slice(0, 60);
}

// ═══ IA UPLOAD TAB ════════════════════════════════════════════════════════
function IaUploadTab({ onPrefillReady }) {
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const process = async () => {
    if (files.length === 0) return;
    setProcessing(true); setError(null);
    try {
      const r = await uploadWizardFiles(files);
      setResult(r);
    } catch (e) {
      setError(e.message || 'Error al procesar');
    } finally { setProcessing(false); }
  };

  const proceedToWizard = () => {
    onPrefillReady(result);
  };

  return (
    <div>
      <p className="text-sm text-[rgba(240,235,224,0.6)] mb-3">
        Sube PDFs, Excel, Word o CSV con info del proyecto. La IA extraerá campos y pre-llenará el wizard.
      </p>
      <DragDropZone
        accept=".pdf,.xlsx,.xls,.csv,.docx,.txt,.md"
        maxSizeMB={20} maxFiles={10}
        onUpload={newFiles => setFiles([...files, ...newFiles])}
        label="Arrastra tus documentos (brochure, tablas de unidades, fichas técnicas…)"
      />
      {files.length > 0 && (
        <div className="mt-3 text-xs text-[var(--cream-2)]" data-testid="ia-files-count">
          {files.length} archivo(s) listos
        </div>
      )}
      {files.length > 0 && !result && (
        <div className="mt-4">
          <button onClick={process} disabled={processing}
            data-testid="ia-process-btn"
            className="px-5 py-2 rounded-full bg-gradient-to-r from-indigo-500 to-pink-500 text-white text-sm font-semibold">
            <Sparkles size={14} className="inline mr-1" />
            {processing ? 'Analizando con IA…' : 'Procesar con IA'}
          </button>
        </div>
      )}
      {error && <div className="mt-3 p-3 rounded-lg bg-red-500/10 text-red-400 text-xs">{error}</div>}
      {result && <IaResultSummary result={result} onProceed={proceedToWizard} />}
    </div>
  );
}

function IaResultSummary({ result, onProceed }) {
  const flat = useMemo(() => flattenExtraction(result?.extraction || {}), [result]);
  const confColor = (c) => c >= 80 ? 'text-emerald-400' : c >= 50 ? 'text-amber-400' : 'text-red-400';
  return (
    <div className="mt-6 p-4 rounded-xl bg-[rgba(240,235,224,0.04)] border border-[rgba(240,235,224,0.12)]">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} className="text-amber-400" />
        <h4 className="text-sm font-bold text-[var(--cream)]">Resumen de extracción</h4>
        {result.is_ai_fallback_stub && (
          <span className="text-[9px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded">FALLBACK STUB</span>
        )}
      </div>
      <div className="text-xs text-[rgba(240,235,224,0.65)] mb-3">
        {result.fields_extracted_count} campo(s) detectado(s) ·
        confianza promedio <span className={confColor(result.avg_confidence)}>{result.avg_confidence}%</span> ·
        desde {result.files?.length || 0} archivo(s)
      </div>
      <div className="max-h-52 overflow-y-auto border border-[rgba(240,235,224,0.06)] rounded-lg">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[rgba(240,235,224,0.04)] text-[rgba(240,235,224,0.5)]">
              <th className="text-left px-3 py-1.5">Campo</th>
              <th className="text-left px-3 py-1.5">Valor</th>
              <th className="text-right px-3 py-1.5">Conf</th>
            </tr>
          </thead>
          <tbody>
            {flat.slice(0, 15).map((f, i) => (
              <tr key={i} className="border-t border-[rgba(240,235,224,0.04)]">
                <td className="px-3 py-1.5 text-[rgba(240,235,224,0.7)]">{f.key}</td>
                <td className="px-3 py-1.5 text-[var(--cream)] truncate max-w-xs">
                  {String(f.value ?? '—').slice(0, 50)}
                </td>
                <td className={`px-3 py-1.5 text-right font-bold ${confColor(f.conf || 0)}`}>
                  {f.conf ?? '—'}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={onProceed}
          data-testid="ia-proceed-btn"
          className="px-5 py-2 rounded-full bg-[var(--cream)] text-[var(--navy)] text-sm font-bold">
          Continuar al wizard pre-llenado
        </button>
      </div>
    </div>
  );
}

function flattenExtraction(obj, prefix = '') {
  const out = [];
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('_')) continue;
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && 'value' in v && 'confidence' in v) {
      out.push({ key: path, value: v.value, conf: v.confidence, source: v.source });
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item && typeof item === 'object' && 'value' in item) {
          out.push({ key: `${path}[${i}]`, value: item.value, conf: item.confidence });
        }
      });
    } else if (v && typeof v === 'object') {
      out.push(...flattenExtraction(v, path));
    }
  }
  return out;
}

// ═══ DRIVE IMPORT TAB ═════════════════════════════════════════════════════
function DriveImportTab() {
  const [status, setStatus] = useState(null);
  const [url, setUrl] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { getDriveStatus().then(setStatus).catch(() => {}); }, []);

  const submit = async () => {
    if (!url) return;
    setLoading(true);
    try {
      const r = await processDriveUrl(url);
      setResult(r);
    } catch (e) {
      setResult({ ok: false, message: e.message });
    } finally { setLoading(false); }
  };

  return (
    <div>
      <p className="text-sm text-[rgba(240,235,224,0.6)] mb-4">
        Conecta tu Google Drive o pega una URL de folder público con los documentos del proyecto.
      </p>

      {status && !status.oauth_configured && (
        <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs flex gap-2">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <div>
            <strong>Google OAuth no configurado.</strong> Para integración completa, configura
            <code className="mx-1 px-1 bg-black/20 rounded">GOOGLE_OAUTH_CLIENT_ID</code> y
            <code className="mx-1 px-1 bg-black/20 rounded">GOOGLE_OAUTH_CLIENT_SECRET</code> en el .env.
            Mientras tanto, puedes descargar archivos y subirlos en "Cargar con IA".
          </div>
        </div>
      )}

      <div className="p-5 rounded-xl bg-[rgba(240,235,224,0.04)] border border-[rgba(240,235,224,0.1)]">
        <h4 className="text-sm font-bold text-[var(--cream)] mb-2 flex items-center gap-2">
          <Cloud size={14} /> Pegar URL de carpeta
        </h4>
        <p className="text-xs text-[rgba(240,235,224,0.5)] mb-3">
          Ej: <code>https://drive.google.com/drive/folders/1a2b3c…</code>
        </p>
        <div className="flex gap-2">
          <input value={url} onChange={e => setUrl(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            data-testid="drive-url-input"
            className="flex-1 px-3 py-2 rounded-lg bg-[rgba(240,235,224,0.06)] border border-[rgba(240,235,224,0.12)] text-[var(--cream)] text-sm" />
          <button onClick={submit} disabled={!url || loading}
            data-testid="drive-process-btn"
            className="px-4 py-2 rounded-lg bg-[var(--cream)] text-[var(--navy)] text-sm font-bold disabled:opacity-40">
            {loading ? 'Procesando…' : 'Procesar'}
          </button>
        </div>
        {result && (
          <div className={`mt-3 p-3 rounded-lg text-xs ${result.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>
            {result.message || JSON.stringify(result)}
          </div>
        )}
      </div>

      <div className="mt-4 p-5 rounded-xl bg-[rgba(240,235,224,0.02)] border border-[rgba(240,235,224,0.06)]">
        <h4 className="text-sm font-bold text-[rgba(240,235,224,0.5)] mb-2">Conectar Drive personal (OAuth)</h4>
        <p className="text-xs text-[rgba(240,235,224,0.4)]">
          Próximamente integrado con la conexión global del portal de desarrollador.
          Ve a Drive → Conectar en el sidebar para configurar tu cuenta Google.
        </p>
      </div>
    </div>
  );
}

// ═══ MAIN PAGE ════════════════════════════════════════════════════════════
export default function NuevoProyectoPage({ user, onLogout }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState('manual'); // manual | ia | drive
  const [iaPrefill, setIaPrefill] = useState(null);
  const [smartDefaults, setSmartDefaults] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getWizardSmartDefaults().then(setSmartDefaults).catch(() => {});
  }, []);

  // Merge IA prefill + smart defaults
  const prefill = useMemo(() => {
    if (iaPrefill?.extraction) {
      return {
        ...smartDefaults,
        ...iaPrefill.extraction,
        _source: 'ia',
        _run_id: iaPrefill.run_id,
      };
    }
    return smartDefaults;
  }, [iaPrefill, smartDefaults]);

  const steps = [
    { id: 'categoria',    title: 'Categoría',      component: Step1Categoria,
      validate: v => (!v?.tipo_proyecto ? 'Selecciona un tipo de proyecto' : null) },
    { id: 'operacion',    title: 'Operación',      component: Step2Operacion,
      validate: v => (!v?.nombre ? 'Nombre requerido' : null) },
    { id: 'ubicacion',    title: 'Ubicación',      component: Step3Ubicacion,
      validate: v => (!v?.colonia ? 'Colonia requerida' : null) },
    { id: 'amenidades',   title: 'Amenidades',     component: Step4Amenidades, optional: true },
    { id: 'contenido',    title: 'Contenido',      component: Step5Contenido,  optional: true },
    { id: 'legal',        title: 'Legal',          component: Step6Legal,      optional: true },
    { id: 'comercializacion', title: 'Comercialización', component: Step7Comercializacion },
  ];

  const handleComplete = async (allData) => {
    setSubmitting(true); setSubmitError(null);
    try {
      const payload = {
        categoria: allData.categoria || {},
        operacion: allData.operacion || {},
        ubicacion: allData.ubicacion || {},
        amenidades: allData.amenidades || [],
        contenido: allData.contenido || {},
        legal: allData.legal || {},
        comercializacion: allData.comercializacion || {},
        ia_source: iaPrefill ? 'ia_upload' : (mode === 'drive' ? 'drive' : 'manual'),
        ia_extraction_id: iaPrefill?.run_id || null,
      };
      const r = await createWizardProject(payload);
      navigate(r.redirect || `/desarrollador/proyectos/${r.project_id}`);
    } catch (e) {
      setSubmitError(e.message || 'Error al crear el proyecto');
      setSubmitting(false);
    }
  };

  const tabs = [
    { v: 'manual', label: 'Wizard manual',     icon: FileText },
    { v: 'ia',     label: 'Cargar con IA',     icon: Sparkles },
    { v: 'drive',  label: 'Importar de Drive', icon: Cloud },
  ];

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <div className="max-w-5xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-[var(--cream)] font-[Outfit]">Nuevo proyecto</h1>
          <p className="text-sm text-[rgba(240,235,224,0.55)] mt-1">
            Crea un proyecto nuevo en 7 pasos. Puedes usar IA para pre-llenar desde documentos existentes.
          </p>
        </div>

        <div className="flex gap-1 p-1 rounded-xl bg-[rgba(240,235,224,0.04)] border border-[rgba(240,235,224,0.08)] mb-6 w-fit">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.v} onClick={() => setMode(t.v)}
                data-testid={`wizard-tab-${t.v}`}
                className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors
                  ${mode === t.v
                    ? 'bg-[var(--cream)] text-[var(--navy)]'
                    : 'text-[rgba(240,235,224,0.6)] hover:text-[var(--cream)]'}`}>
                <Icon size={12} /> {t.label}
              </button>
            );
          })}
        </div>

        {mode === 'ia' && !iaPrefill && (
          <div className="p-6 rounded-2xl bg-[rgba(240,235,224,0.02)] border border-[rgba(240,235,224,0.08)]">
            <IaUploadTab onPrefillReady={(r) => { setIaPrefill(r); setMode('manual'); }} />
          </div>
        )}

        {mode === 'drive' && (
          <div className="p-6 rounded-2xl bg-[rgba(240,235,224,0.02)] border border-[rgba(240,235,224,0.08)]">
            <DriveImportTab />
          </div>
        )}

        {mode === 'manual' && (
          <div className="h-[72vh] rounded-2xl overflow-hidden border border-[rgba(240,235,224,0.08)]">
            <SmartWizard
              title={iaPrefill ? 'Wizard (pre-llenado por IA)' : 'Crear proyecto'}
              steps={steps}
              onComplete={handleComplete}
              draft_key="new_project"
              ia_prefill={iaPrefill ? prefill : null}
              onCancel={() => navigate('/desarrollador/proyectos')}
            />
          </div>
        )}

        {submitting && (
          <div className="fixed inset-0 bg-black/60 z-[1500] flex items-center justify-center">
            <div className="bg-[var(--navy)] border border-[rgba(240,235,224,0.2)] rounded-xl p-6 text-[var(--cream)]">
              Creando proyecto…
            </div>
          </div>
        )}

        {submitError && (
          <div className="fixed top-4 right-4 bg-red-500/20 text-red-300 border border-red-500/40 rounded-lg px-4 py-2 text-sm z-[1600] flex items-center gap-2">
            <AlertCircle size={14} /> {submitError}
            <button onClick={() => setSubmitError(null)}><X size={14} /></button>
          </div>
        )}
      </div>
    </DeveloperLayout>
  );
}
