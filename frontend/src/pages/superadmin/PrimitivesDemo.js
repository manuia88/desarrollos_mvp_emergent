/**
 * Phase 4 B0 Sub-chunk B — Primitives Demo
 * Route: /superadmin/primitives-demo
 * Showcases: EntityDrawer, HealthScore, DragDropZone,
 *            InlineEditField, UndoSnackbar, SmartWizard
 */
import React, { useState } from 'react';
import { PortalLayout } from '../../components/shared/PortalLayout';
import { EntityDrawer } from '../../components/shared/EntityDrawer';
import { HealthScore } from '../../components/shared/HealthScore';
import { DragDropZone } from '../../components/shared/DragDropZone';
import { InlineEditField } from '../../components/shared/InlineEditField';
import { SmartWizard } from '../../components/shared/SmartWizard';
import { useUndo } from '../../components/shared/UndoSnackbar';
import {
  Building2, MapPin, Users, FileText, Star, Info,
  CheckCircle2, Layers, Zap,
} from 'lucide-react';

/* ─── Demo helpers ────────────────────────────────────────────────── */
function Section({ id, title, children }) {
  return (
    <div id={id} className="bg-[#0d1022] rounded-2xl border border-[rgba(240,235,224,0.08)] overflow-hidden">
      <div className="px-6 py-4 border-b border-[rgba(240,235,224,0.08)]">
        <h2 className="text-[var(--cream)] font-semibold font-[Outfit] text-base">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}
function Label({ children }) {
  return <p className="text-[rgba(240,235,224,0.4)] text-xs uppercase tracking-widest mb-3">{children}</p>;
}

/* ─── SmartWizard step components ────────────────────────────────── */
function Step1({ data = {}, onChange, ia_prefill }) {
  const update = (k, v) => onChange({ ...data, [k]: v });
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-[rgba(240,235,224,0.6)] text-xs mb-1.5">
          Nombre del proyecto
          {ia_prefill?.nombre && (
            <span className="ml-2 inline-flex items-center gap-0.5 text-amber-400 text-[9px]">
              <Star size={9} /> Sugerido por IA
            </span>
          )}
        </label>
        <input
          value={data.nombre || ia_prefill?.nombre?.value || ''}
          onChange={(e) => update('nombre', e.target.value)}
          placeholder="Ej. Torre Polanco Residencial"
          className="w-full bg-[rgba(240,235,224,0.07)] border border-[rgba(240,235,224,0.15)] rounded-lg px-3 py-2 text-[var(--cream)] text-sm outline-none focus:border-[rgba(240,235,224,0.4)] transition-colors"
          data-testid="wizard-step1-nombre"
        />
      </div>
      <div>
        <label className="block text-[rgba(240,235,224,0.6)] text-xs mb-1.5">Descripción breve</label>
        <textarea
          value={data.descripcion || ''}
          onChange={(e) => update('descripcion', e.target.value)}
          rows={3}
          placeholder="Proyecto residencial de lujo en Polanco..."
          className="w-full bg-[rgba(240,235,224,0.07)] border border-[rgba(240,235,224,0.15)] rounded-lg px-3 py-2 text-[var(--cream)] text-sm outline-none focus:border-[rgba(240,235,224,0.4)] transition-colors resize-none"
          data-testid="wizard-step1-desc"
        />
      </div>
    </div>
  );
}

function Step2({ data = {}, onChange }) {
  const update = (k, v) => onChange({ ...data, [k]: v });
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-[rgba(240,235,224,0.6)] text-xs mb-1.5">Colonia</label>
        <select
          value={data.colonia || ''}
          onChange={(e) => update('colonia', e.target.value)}
          className="w-full bg-[rgba(240,235,224,0.07)] border border-[rgba(240,235,224,0.15)] rounded-lg px-3 py-2 text-[var(--cream)] text-sm outline-none focus:border-[rgba(240,235,224,0.4)]"
          data-testid="wizard-step2-colonia"
        >
          <option value="">Seleccionar colonia…</option>
          <option value="polanco">Polanco</option>
          <option value="roma-norte">Roma Norte</option>
          <option value="condesa">Condesa</option>
          <option value="santa-fe">Santa Fe</option>
        </select>
      </div>
      <div>
        <label className="block text-[rgba(240,235,224,0.6)] text-xs mb-1.5">Precio desde (MXN)</label>
        <input
          type="number"
          value={data.precio || ''}
          onChange={(e) => update('precio', e.target.value)}
          placeholder="5000000"
          className="w-full bg-[rgba(240,235,224,0.07)] border border-[rgba(240,235,224,0.15)] rounded-lg px-3 py-2 text-[var(--cream)] text-sm outline-none focus:border-[rgba(240,235,224,0.4)]"
          data-testid="wizard-step2-precio"
        />
      </div>
    </div>
  );
}

function Step3({ data: _d }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 p-4 rounded-xl bg-[rgba(240,235,224,0.06)] border border-[rgba(240,235,224,0.1)]">
        <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-[var(--cream)] text-sm font-medium">Listo para crear</p>
          <p className="text-[rgba(240,235,224,0.55)] text-xs mt-1">
            Revisa los datos y haz clic en <strong>Finalizar</strong> para crear el proyecto.
          </p>
        </div>
      </div>
    </div>
  );
}

const WIZARD_STEPS = [
  {
    id: 'basicos', title: 'Datos básicos', component: Step1,
    validate: (d) => (!d?.nombre || d.nombre.trim() === '') ? 'El nombre es requerido' : null,
  },
  {
    id: 'ubicacion', title: 'Ubicación', component: Step2, optional: true,
  },
  {
    id: 'confirmacion', title: 'Confirmar', component: Step3,
  },
];

const IA_PREFILL = {
  nombre: { value: 'Torre Polanco Residencial', source: 'gpt-4o', confidence: 0.91 },
};

/* ─── EntityDrawer demo sections ─────────────────────────────────── */
const DEMO_SECTIONS = [
  {
    id: 'info-general',
    title: 'Información General',
    defaultOpen: true,
    content: (
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-[rgba(240,235,224,0.5)]">Proyecto</span>
          <span className="text-[var(--cream)]">Altavista Polanco</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-[rgba(240,235,224,0.5)]">Desarrolladora</span>
          <span className="text-[var(--cream)]">Quattro Capital</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-[rgba(240,235,224,0.5)]">Estado</span>
          <span className="text-emerald-400 font-medium">En construcción</span>
        </div>
      </div>
    ),
  },
  {
    id: 'metricas',
    title: 'Métricas IE',
    defaultOpen: true,
    content: (
      <div className="space-y-1.5">
        {[['Score IE', '78/100'], ['ROI Proyectado', '-43.25%'], ['Absorción', '28.57%']].map(([k, v]) => (
          <div key={k} className="flex justify-between text-xs">
            <span className="text-[rgba(240,235,224,0.5)]">{k}</span>
            <span className="text-[var(--cream)] font-medium tabular-nums">{v}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'acceso-admin',
    title: 'Acciones Admin',
    defaultOpen: false,
    role_visible: ['superadmin'],
    content: (
      <p className="text-xs text-amber-400">Sección visible solo para superadmin.</p>
    ),
  },
  {
    id: 'documentos',
    title: 'Documentos',
    defaultOpen: false,
    content: (
      <p className="text-[rgba(240,235,224,0.45)] text-xs">Sin documentos adjuntos.</p>
    ),
  },
];

/* ─── Main Component ─────────────────────────────────────────────── */
export default function PrimitivesDemo({ user, onLogout }) {
  const { showUndo } = useUndo();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [wizardDone, setWizardDone] = useState(null);
  const [editValues, setEditValues] = useState({
    nombre: 'Altavista Polanco',
    precio: 8500000,
    etapa: 'construccion',
    fecha: '2025-12-01',
  });

  const triggerUndo = () => {
    const prev = { ...editValues };
    setEditValues(v => ({ ...v, nombre: 'Nombre modificado' }));
    showUndo({
      message: 'Nombre actualizado',
      onUndo: () => setEditValues(v => ({ ...v, nombre: prev.nombre })),
      timeout: 8000,
    });
  };

  const triggerUndoStack = () => {
    ['Elemento A eliminado', 'Elemento B archivado', 'Lead desvinculado'].forEach((msg, i) => {
      setTimeout(() => showUndo({ message: msg, onUndo: () => {}, timeout: 12000 }), i * 300);
    });
  };

  return (
    <PortalLayout role={user?.role || 'superadmin'} user={user} onLogout={onLogout}>
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8" data-testid="primitives-demo">

        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-[var(--cream)] font-bold text-3xl font-[Outfit]" data-testid="primitives-demo-h1">
            Primitivas UI — B0 Sub-chunk B
          </h1>
          <p className="text-[rgba(240,235,224,0.45)] text-sm">
            Demo interactivo de los 6 componentes compartidos.
          </p>
        </div>

        {/* 1. EntityDrawer */}
        <Section id="entity-drawer" title="1. EntityDrawer">
          <Label>Desktop: panel lateral 520px · Mobile: bottom-sheet 90vh</Label>
          <button
            onClick={() => setDrawerOpen(true)}
            className="px-5 py-2.5 rounded-full bg-[var(--cream)] text-[var(--navy)] font-semibold text-sm hover:opacity-90 transition-opacity"
            data-testid="open-drawer-btn"
          >
            Abrir drawer — Altavista Polanco
          </button>
          <p className="mt-3 text-[rgba(240,235,224,0.35)] text-xs">
            Sección "Acciones Admin" solo visible como superadmin · ESC o backdrop cierra · estado secciones en localStorage
          </p>
          <EntityDrawer
            isOpen={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            title="Altavista Polanco"
            entity_type="demo_development"
            sections={DEMO_SECTIONS}
            user={user}
          />
        </Section>

        {/* 2. HealthScore */}
        <Section id="health-score" title="2. HealthScore">
          <Label>Rojo {'<'}50 · Ámbar 50–79 · Verde ≥80 · Click abre popover</Label>
          <div className="flex items-start gap-10 flex-wrap">
            <div className="flex flex-col items-center gap-2">
              <span className="text-[rgba(240,235,224,0.4)] text-[10px] uppercase tracking-wider">Bajo (25)</span>
              <HealthScore
                score={25} size="lg" variant="project"
                breakdown={[
                  { label: 'Ventas', weight: 0.4, score: 18, status: 'red' },
                  { label: 'Precios', weight: 0.3, score: 40, status: 'red' },
                  { label: 'Reputación', weight: 0.3, score: 22, status: 'red' },
                ]}
                data-testid="health-score-low"
              />
            </div>
            <div className="flex flex-col items-center gap-2">
              <span className="text-[rgba(240,235,224,0.4)] text-[10px] uppercase tracking-wider">Medio (65)</span>
              <HealthScore
                score={65} size="lg" variant="asesor"
                breakdown={[
                  { label: 'Contactos', weight: 0.35, score: 72, status: 'amber' },
                  { label: 'Cierres', weight: 0.4, score: 58, status: 'amber' },
                  { label: 'Actividad', weight: 0.25, score: 70, status: 'amber' },
                ]}
                data-testid="health-score-mid"
              />
            </div>
            <div className="flex flex-col items-center gap-2">
              <span className="text-[rgba(240,235,224,0.4)] text-[10px] uppercase tracking-wider">Alto (92)</span>
              <HealthScore
                score={92} size="lg" variant="client"
                breakdown={[
                  { label: 'Perfil', weight: 0.3, score: 95, status: 'green' },
                  { label: 'Intención', weight: 0.4, score: 90, status: 'green' },
                  { label: 'Historial', weight: 0.3, score: 91, status: 'green' },
                ]}
                data-testid="health-score-high"
              />
            </div>
            <div className="flex flex-col items-center gap-2">
              <span className="text-[rgba(240,235,224,0.4)] text-[10px] uppercase tracking-wider">sm</span>
              <HealthScore score={78} size="sm" breakdown={[{ label: 'Score', score: 78, status: 'amber' }]} />
            </div>
            <div className="flex flex-col items-center gap-2">
              <span className="text-[rgba(240,235,224,0.4)] text-[10px] uppercase tracking-wider">md</span>
              <HealthScore score={55} size="md" breakdown={[{ label: 'Score', score: 55, status: 'amber' }]} />
            </div>
          </div>
        </Section>

        {/* 3. DragDropZone */}
        <Section id="drag-drop" title="3. DragDropZone">
          <Label>Multi-file · Máx 5 MB · Preview thumbnails · Validación inline</Label>
          <DragDropZone
            accept="image/*,.pdf"
            maxSizeMB={5}
            maxFiles={4}
            onUpload={(files) => console.log('Archivos:', files.map(f => f.name))}
            data-testid="demo-drag-drop"
          />
        </Section>

        {/* 4. InlineEditField */}
        <Section id="inline-edit" title="4. InlineEditField">
          <Label>Click para editar · ESC cancela · Enter/blur guarda · Revert en error</Label>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-[rgba(240,235,224,0.5)] text-xs mb-1.5">Texto (editable)</p>
                <InlineEditField
                  value={editValues.nombre}
                  type="text"
                  onSave={async (v) => setEditValues(e => ({ ...e, nombre: v }))}
                  placeholder="Nombre del proyecto"
                  data-testid="inline-nombre"
                />
              </div>
              <div>
                <p className="text-[rgba(240,235,224,0.5)] text-xs mb-1.5">Moneda (editable)</p>
                <InlineEditField
                  value={editValues.precio}
                  type="currency"
                  onSave={async (v) => setEditValues(e => ({ ...e, precio: v }))}
                  validate={(v) => isNaN(v) || v <= 0 ? 'Precio inválido' : null}
                  data-testid="inline-precio"
                />
              </div>
              <div>
                <p className="text-[rgba(240,235,224,0.5)] text-xs mb-1.5">Select (editable)</p>
                <InlineEditField
                  value={editValues.etapa}
                  type="select"
                  options={[
                    { value: 'preventa', label: 'Pre-venta' },
                    { value: 'construccion', label: 'En construcción' },
                    { value: 'entrega', label: 'Entrega' },
                  ]}
                  onSave={async (v) => setEditValues(e => ({ ...e, etapa: v }))}
                  data-testid="inline-etapa"
                />
              </div>
              <div>
                <p className="text-[rgba(240,235,224,0.5)] text-xs mb-1.5">Fecha (editable)</p>
                <InlineEditField
                  value={editValues.fecha}
                  type="date"
                  onSave={async (v) => setEditValues(e => ({ ...e, fecha: v }))}
                  data-testid="inline-fecha"
                />
              </div>
            </div>
            <div>
              <p className="text-[rgba(240,235,224,0.5)] text-xs mb-1.5">Read-only (user_can_edit=false)</p>
              <InlineEditField
                value="Quattro Capital S.A. de C.V."
                type="text"
                user_can_edit={false}
                data-testid="inline-readonly"
              />
            </div>
          </div>
        </Section>

        {/* 5. UndoSnackbar */}
        <Section id="undo-snackbar" title="5. UndoSnackbar">
          <Label>Stackable bottom-right · Countdown bar · Auto-dismiss 8s en demo</Label>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={triggerUndo}
              className="px-4 py-2 rounded-full bg-[rgba(240,235,224,0.1)] border border-[rgba(240,235,224,0.15)] text-[var(--cream)] text-sm hover:bg-[rgba(240,235,224,0.15)] transition-colors"
              data-testid="trigger-undo-btn"
            >
              Disparar 1 undo
            </button>
            <button
              onClick={triggerUndoStack}
              className="px-4 py-2 rounded-full bg-[rgba(240,235,224,0.1)] border border-[rgba(240,235,224,0.15)] text-[var(--cream)] text-sm hover:bg-[rgba(240,235,224,0.15)] transition-colors"
              data-testid="trigger-undo-stack-btn"
            >
              Disparar 3 undos (stack)
            </button>
          </div>
        </Section>

        {/* 6. SmartWizard */}
        <Section id="smart-wizard" title="6. SmartWizard">
          <Label>3 pasos · Borrador auto-guardado · IA prefill · Paso opcional</Label>
          {wizardDone ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                <CheckCircle2 size={16} />
                Wizard completado
              </div>
              <pre className="text-xs text-[rgba(240,235,224,0.5)] bg-[rgba(240,235,224,0.04)] rounded-lg p-3 overflow-auto">
                {JSON.stringify(wizardDone, null, 2)}
              </pre>
              <button
                onClick={() => setWizardDone(null)}
                className="text-xs text-[rgba(240,235,224,0.5)] hover:text-[var(--cream)] underline"
                data-testid="wizard-restart-btn"
              >
                Reiniciar wizard
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-[rgba(240,235,224,0.1)] overflow-hidden" style={{ height: 460 }}>
              <SmartWizard
                steps={WIZARD_STEPS}
                draft_key="primitives_demo_v1"
                ia_prefill={IA_PREFILL}
                title="Nuevo Proyecto"
                onComplete={(d) => setWizardDone(d)}
              />
            </div>
          )}
        </Section>

      </div>
    </PortalLayout>
  );
}
