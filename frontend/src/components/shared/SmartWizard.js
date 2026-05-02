/**
 * Phase 4 Batch 0 — SmartWizard
 * Multi-step wizard with auto-save draft, IA prefill, optional steps.
 * Props:
 *   steps: [{ key, label, component: Component, optional?, validate?: fn(data) => string|null }]
 *   on_complete: fn(finalData)
 *   draft_key: string (localStorage key prefix)
 *   ia_prefill_data: { [field]: { value, source, confidence } } | null
 *   title: string
 *   on_cancel: fn
 */
import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Check, Sparkles, X, SkipForward, Save } from 'lucide-react';

const DRAFT_PREFIX = 'dmx_wizard_draft_';

function StepDot({ index, currentIndex, label, done }) {
  const state = done ? 'done' : index === currentIndex ? 'active' : index < currentIndex ? 'passed' : 'pending';
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
          ${state === 'done' || state === 'passed' ? 'bg-emerald-500 text-white'
            : state === 'active' ? 'bg-[var(--cream)] text-[var(--navy)]'
            : 'bg-[rgba(240,235,224,0.1)] text-[rgba(240,235,224,0.3)]'}`}
      >
        {state === 'done' || state === 'passed' ? <Check size={13} /> : index + 1}
      </div>
      <span className={`text-[9px] text-center max-w-[60px] truncate
        ${state === 'active' ? 'text-[var(--cream)]' : 'text-[rgba(240,235,224,0.35)]'}`}>
        {label}
      </span>
    </div>
  );
}

export function SmartWizard({
  steps = [],
  on_complete,
  draft_key = 'default',
  ia_prefill_data = null,
  title = 'Asistente',
  on_cancel,
}) {
  const storageKey = `${DRAFT_PREFIX}${draft_key}`;
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState({});
  const [errors, setErrors] = useState({});
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const autoSaveRef = useRef(null);

  // Check for existing draft on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setShowDraftBanner(true);
      }
    } catch (_) {}
  }, [storageKey]);

  const loadDraft = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      setData(saved.data || {});
      setCurrentStep(saved.step || 0);
      setDraftLoaded(true);
    } catch (_) {}
    setShowDraftBanner(false);
  };

  const discardDraft = () => {
    localStorage.removeItem(storageKey);
    setShowDraftBanner(false);
  };

  // Auto-save draft on data change
  useEffect(() => {
    clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ data, step: currentStep }));
      } catch (_) {}
    }, 500);
    return () => clearTimeout(autoSaveRef.current);
  }, [data, currentStep, storageKey]);

  const updateData = (stepKey, stepData) => {
    setData(prev => ({ ...prev, [stepKey]: stepData }));
  };

  const validate = () => {
    const step = steps[currentStep];
    if (!step?.validate) return true;
    const err = step.validate(data[step.key]);
    if (err) {
      setErrors(prev => ({ ...prev, [step.key]: err }));
      return false;
    }
    setErrors(prev => ({ ...prev, [step.key]: null }));
    return true;
  };

  const goNext = () => {
    if (!validate()) return;
    if (currentStep < steps.length - 1) setCurrentStep(i => i + 1);
  };

  const goPrev = () => {
    if (currentStep > 0) setCurrentStep(i => i - 1);
  };

  const skip = () => {
    if (currentStep < steps.length - 1) setCurrentStep(i => i + 1);
  };

  const complete = () => {
    if (!validate()) return;
    localStorage.removeItem(storageKey);
    on_complete?.(data);
  };

  const step = steps[currentStep];
  const StepComponent = step?.component;
  const progressPct = ((currentStep) / Math.max(steps.length - 1, 1)) * 100;

  return (
    <div className="flex flex-col h-full" data-testid="smart-wizard">
      {/* Progress bar */}
      <div className="h-1 bg-[rgba(240,235,224,0.08)] rounded-full overflow-hidden mx-6 mt-4">
        <div
          className="h-full bg-[var(--cream)] rounded-full transition-all duration-400"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Step dots */}
      <div className="flex items-start justify-between px-6 py-3">
        {steps.map((s, i) => (
          <button
            key={s.key}
            onClick={() => i < currentStep && setCurrentStep(i)}
            disabled={i >= currentStep}
            className="flex-1"
          >
            <StepDot index={i} currentIndex={currentStep} label={s.label} done={i < currentStep} />
          </button>
        ))}
      </div>

      {/* Draft recovery banner */}
      {showDraftBanner && !draftLoaded && (
        <div className="mx-6 mb-3 p-3 rounded-xl bg-[rgba(240,235,224,0.08)] border border-[rgba(240,235,224,0.12)] flex items-center gap-3">
          <Save size={15} className="text-[rgba(240,235,224,0.6)] shrink-0" />
          <span className="flex-1 text-sm text-[rgba(240,235,224,0.7)]">Tienes un borrador guardado. ¿Continuar donde quedaste?</span>
          <button onClick={loadDraft} className="text-[var(--cream)] text-sm font-semibold hover:opacity-80 whitespace-nowrap">Continuar</button>
          <button onClick={discardDraft} className="text-[rgba(240,235,224,0.4)] hover:text-[var(--cream)]"><X size={13} /></button>
        </div>
      )}

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-6 py-2">
        {/* IA prefill badge */}
        {ia_prefill_data && step && (
          <div className="flex items-center gap-1.5 mb-3 text-amber-400 text-xs">
            <Sparkles size={12} />
            Algunos campos pre-completados por IA — revisa antes de continuar
          </div>
        )}

        {/* Step error */}
        {step && errors[step.key] && (
          <p className="text-red-400 text-xs mb-2">{errors[step.key]}</p>
        )}

        {/* Step component */}
        {StepComponent && (
          <StepComponent
            data={data[step.key]}
            onChange={(d) => updateData(step.key, d)}
            ia_prefill={ia_prefill_data}
          />
        )}
      </div>

      {/* Footer navigation */}
      <div className="px-6 py-4 border-t border-[rgba(240,235,224,0.08)] flex items-center gap-3 shrink-0">
        {on_cancel && currentStep === 0 && (
          <button
            onClick={on_cancel}
            className="px-4 py-2 rounded-lg text-[rgba(240,235,224,0.55)] hover:text-[var(--cream)] text-sm transition-colors"
            data-testid="wizard-cancel-btn"
          >
            Cancelar
          </button>
        )}
        {currentStep > 0 && (
          <button
            onClick={goPrev}
            className="flex items-center gap-1 px-4 py-2 rounded-lg text-[rgba(240,235,224,0.55)] hover:text-[var(--cream)] text-sm transition-colors"
            data-testid="wizard-back-btn"
          >
            <ChevronLeft size={14} />
            Atrás
          </button>
        )}
        <div className="flex-1" />
        {step?.optional && currentStep < steps.length - 1 && (
          <button
            onClick={skip}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-[rgba(240,235,224,0.4)] hover:text-[var(--cream)] text-sm transition-colors"
            data-testid="wizard-skip-btn"
          >
            <SkipForward size={13} />
            Saltar
          </button>
        )}
        {currentStep < steps.length - 1 ? (
          <button
            onClick={goNext}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[var(--cream)] text-[var(--navy)] font-semibold text-sm hover:opacity-90 transition-opacity"
            data-testid="wizard-next-btn"
          >
            Siguiente
            <ChevronRight size={14} />
          </button>
        ) : (
          <button
            onClick={complete}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[var(--cream)] text-[var(--navy)] font-semibold text-sm hover:opacity-90 transition-opacity"
            data-testid="wizard-complete-btn"
          >
            <Check size={14} />
            Completar
          </button>
        )}
      </div>
    </div>
  );
}

export default SmartWizard;
