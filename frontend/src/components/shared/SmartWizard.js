/**
 * Phase 4 B0 Sub-chunk B — SmartWizard
 * Multi-step wizard: progress bar, draft auto-save, IA prefill, optional steps.
 * Props:
 *   steps        — [{id, title, component, optional?, validate?: fn(data)=>string|null}]
 *   onComplete   — fn(allData)
 *   draft_key    — string (localStorage namespace)
 *   ia_prefill   — { [fieldKey]: { value, source, confidence } } | null
 *   title        — string
 *   onCancel     — fn
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Check, Sparkles, X, SkipForward, Save } from 'lucide-react';

const LS_PREFIX = 'dmx_wiz_';

function loadDraft(key) {
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveDraft(key, data, step) {
  try { localStorage.setItem(`${LS_PREFIX}${key}`, JSON.stringify({ data, step, ts: Date.now() })); } catch {}
}
function clearDraft(key) {
  try { localStorage.removeItem(`${LS_PREFIX}${key}`); } catch {}
}

function StepDot({ index, currentIndex, step, isPassed }) {
  const state = isPassed ? 'done' : index === currentIndex ? 'active' : 'pending';
  return (
    <div className="flex flex-col items-center gap-1 flex-1" data-testid={`wizard-step-dot-${index}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300
        ${state === 'done'   ? 'bg-emerald-500 text-white'
        : state === 'active' ? 'bg-[var(--cream)] text-[var(--navy)]'
        : 'bg-[rgba(240,235,224,0.1)] text-[rgba(240,235,224,0.3)]'}`}>
        {state === 'done' ? <Check size={13} /> : index + 1}
      </div>
      <span className={`text-[9px] text-center max-w-[64px] truncate leading-tight
        ${state === 'active' ? 'text-[var(--cream)]' : 'text-[rgba(240,235,224,0.35)]'}`}>
        {step.title}
        {step.optional && <span className="block text-[8px] text-[rgba(240,235,224,0.25)]">opcional</span>}
      </span>
    </div>
  );
}

export function SmartWizard({
  steps = [],
  onComplete,
  draft_key = 'default',
  ia_prefill = null,
  title = 'Asistente',
  onCancel,
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState({});
  const [stepError, setStepError] = useState(null);
  const [draftBanner, setDraftBanner] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const autoSaveTimer = useRef(null);

  // Detect existing draft on mount
  useEffect(() => {
    const d = loadDraft(draft_key);
    if (d) setDraftBanner(true);
  }, [draft_key]);

  // Auto-save draft on every change
  useEffect(() => {
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => saveDraft(draft_key, data, currentStep), 600);
    return () => clearTimeout(autoSaveTimer.current);
  }, [data, currentStep, draft_key]);

  const resumeDraft = () => {
    const d = loadDraft(draft_key);
    if (d) { setData(d.data || {}); setCurrentStep(d.step || 0); }
    setDraftBanner(false);
  };

  const discardDraft = () => {
    clearDraft(draft_key);
    setDraftBanner(false);
  };

  const updateStepData = useCallback((stepId, val) => {
    setData(prev => ({ ...prev, [stepId]: val }));
    setStepError(null);
  }, []);

  const validateCurrent = () => {
    const step = steps[currentStep];
    if (!step?.validate) return true;
    const err = step.validate(data[step.id]);
    if (err) { setStepError(err); return false; }
    return true;
  };

  const goNext = () => {
    if (!validateCurrent()) return;
    setStepError(null);
    setCurrentStep(i => Math.min(i + 1, steps.length - 1));
  };

  const goPrev = () => {
    setStepError(null);
    setCurrentStep(i => Math.max(i - 1, 0));
  };

  const skipStep = () => {
    setStepError(null);
    setCurrentStep(i => Math.min(i + 1, steps.length - 1));
  };

  const saveDraftManual = () => {
    saveDraft(draft_key, data, currentStep);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  const complete = () => {
    if (!validateCurrent()) return;
    clearDraft(draft_key);
    onComplete?.(data);
  };

  const step = steps[currentStep];
  const StepComponent = step?.component;
  const progressPct = steps.length <= 1 ? 100 : (currentStep / (steps.length - 1)) * 100;

  return (
    <div className="flex flex-col h-full bg-[#0d1022]" data-testid="smart-wizard">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[rgba(240,235,224,0.08)]">
        <h3 className="text-[var(--cream)] font-semibold font-[Outfit]">{title}</h3>
        {onCancel && (
          <button onClick={onCancel} className="text-[rgba(240,235,224,0.35)] hover:text-[var(--cream)] transition-colors" data-testid="wizard-cancel-btn">
            <X size={17} />
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-[3px] bg-[rgba(240,235,224,0.07)] mx-5 mt-3 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-400"
          style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #6366F1, #EC4899)' }}
        />
      </div>

      {/* Step dots */}
      <div className="flex items-start px-5 pt-3 pb-2">
        {steps.map((s, i) => (
          <React.Fragment key={s.id}>
            <StepDot index={i} currentIndex={currentStep} step={s} isPassed={i < currentStep} />
            {i < steps.length - 1 && (
              <div className="flex-1 h-[1px] bg-[rgba(240,235,224,0.08)] mt-3.5 mx-1" />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Draft recovery banner */}
      {draftBanner && (
        <div className="mx-5 mb-2 p-3 rounded-xl bg-[rgba(240,235,224,0.07)] border border-[rgba(240,235,224,0.1)] flex items-center gap-3">
          <Save size={14} className="text-[rgba(240,235,224,0.5)] shrink-0" />
          <span className="flex-1 text-xs text-[rgba(240,235,224,0.7)]">Tienes un borrador guardado — ¿Continuar?</span>
          <button onClick={resumeDraft} className="text-[var(--cream)] text-xs font-semibold hover:opacity-80 whitespace-nowrap" data-testid="wizard-resume-draft-btn">Continuar</button>
          <button onClick={discardDraft} className="text-[rgba(240,235,224,0.35)] hover:text-[var(--cream)]" data-testid="wizard-discard-draft-btn"><X size={12} /></button>
        </div>
      )}

      {/* IA prefill badge */}
      {ia_prefill && step && (
        <div className="mx-5 mb-2 flex items-center gap-1.5 text-amber-400 text-xs">
          <Sparkles size={12} />
          <span>Campos pre-completados por IA — revisa antes de continuar</span>
        </div>
      )}

      {/* Step error */}
      {stepError && (
        <p className="mx-5 mb-1 text-red-400 text-xs" data-testid="wizard-step-error">{stepError}</p>
      )}

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-5 py-3" data-testid={`wizard-step-content-${step?.id}`}>
        {StepComponent && (
          <StepComponent
            data={data[step?.id]}
            onChange={(d) => updateStepData(step.id, d)}
            ia_prefill={ia_prefill}
          />
        )}
      </div>

      {/* Footer navigation */}
      <div className="px-5 py-4 border-t border-[rgba(240,235,224,0.08)] flex items-center gap-2 shrink-0">
        {/* Back */}
        {currentStep > 0 ? (
          <button
            onClick={goPrev}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-[rgba(240,235,224,0.55)] hover:text-[var(--cream)] text-sm transition-colors"
            data-testid="wizard-back-btn"
          >
            <ChevronLeft size={14} />
            Atrás
          </button>
        ) : (
          onCancel && <div />
        )}

        <div className="flex-1" />

        {/* Save draft */}
        <button
          onClick={saveDraftManual}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all
            ${savedFlash ? 'text-emerald-400' : 'text-[rgba(240,235,224,0.4)] hover:text-[rgba(240,235,224,0.7)]'}`}
          data-testid="wizard-save-draft-btn"
        >
          {savedFlash ? <Check size={13} /> : <Save size={13} />}
          {savedFlash ? 'Guardado' : 'Guardar borrador'}
        </button>

        {/* Skip (optional) */}
        {step?.optional && currentStep < steps.length - 1 && (
          <button
            onClick={skipStep}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-[rgba(240,235,224,0.35)] hover:text-[rgba(240,235,224,0.6)] text-sm transition-colors"
            data-testid="wizard-skip-btn"
          >
            <SkipForward size={13} />
            Llenar después
          </button>
        )}

        {/* Next / Finish */}
        {currentStep < steps.length - 1 ? (
          <button
            onClick={goNext}
            className="flex items-center gap-1.5 px-5 py-2 rounded-full bg-[var(--cream)] text-[var(--navy)] font-semibold text-sm hover:opacity-90 transition-opacity"
            data-testid="wizard-next-btn"
          >
            Siguiente <ChevronRight size={14} />
          </button>
        ) : (
          <button
            onClick={complete}
            className="flex items-center gap-1.5 px-5 py-2 rounded-full font-semibold text-sm hover:opacity-90 transition-opacity"
            style={{ background: 'linear-gradient(90deg, #6366F1, #EC4899)', color: 'white' }}
            data-testid="wizard-complete-btn"
          >
            <Check size={14} />
            Finalizar
          </button>
        )}
      </div>
    </div>
  );
}

export default SmartWizard;
