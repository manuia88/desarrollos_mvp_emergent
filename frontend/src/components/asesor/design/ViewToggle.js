// ViewToggle — toggle Lista | Pipeline (patrón EB #2: misma data, mismo lugar).
// QUÉ ES: control segmentado redondeado para alternar la vista de Leads sin perder
//         nada (la lista clásica sigue a un click).
// CUÁNDO: dentro de la ActionBar de cada pantalla del asesor con doble vista.
// Props: value ('pipeline'|'lista') · onChange(next) · options (override opcional).
import React from 'react';
import { LayoutGrid, List } from 'lucide-react';

const DEFAULTS = [
  { key: 'pipeline', label: 'Pipeline', Icon: LayoutGrid },
  { key: 'lista',    label: 'Lista',    Icon: List },
];

export default function ViewToggle({ value, onChange, options = DEFAULTS }) {
  return (
    <div className="asr-seg" role="tablist" aria-label="Cambiar vista" data-testid="asr-view-toggle">
      {options.map(({ key, label, Icon }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={`asr-view-${key}`}
            className={`asr-seg__btn${active ? ' asr-seg__btn--active' : ''}`}
            onClick={() => onChange(key)}
          >
            {Icon && <Icon size={13} />} {label}
          </button>
        );
      })}
    </div>
  );
}
