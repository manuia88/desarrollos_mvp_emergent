// ActionBar — fila de herramientas del header de Leads (patrón del mockup .head .tools).
// QUÉ ES: el grupo de controles alineado a la derecha del título: Ordenar · toggle de
//         vista (Pipeline|Lista) · "+ Nuevo lead" (único primario violeta · hero).
// CUÁNDO: en el header de la pantalla de Leads (a la derecha del título "Leads").
// El filtrado vive ahora en los CHIPS horizontales (no aquí) · la búsqueda en el shell.
// Props (todas opcionales · se ocultan los huecos vacíos):
//   sort (node) · view (node · normalmente <ViewToggle/>) · onNew/newLabel · right (extra)
import React from 'react';
import { Plus } from 'lucide-react';

export default function ActionBar({ sort, view, onNew, newLabel = 'Nuevo', right }) {
  return (
    <div
      data-testid="asr-action-bar"
      style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}
    >
      {sort && <div data-testid="asr-ab-sort" style={{ display: 'flex', alignItems: 'center' }}>{sort}</div>}
      {view && <div data-testid="asr-ab-view">{view}</div>}
      {onNew && (
        <button
          type="button"
          onClick={onNew}
          data-testid="asr-ab-new"
          className="btn btn-primary"
          style={{ borderRadius: 9 }}
        >
          <Plus size={14} /> {newLabel.replace(/^\+\s*/, '')}
        </button>
      )}
      {right}
    </div>
  );
}
