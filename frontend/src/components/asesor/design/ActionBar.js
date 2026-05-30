// ActionBar — la barra de acción IDÉNTICA en cada pantalla (patrón EB #1).
// QUÉ ES: el esqueleto repetido que da el "se siente fácil": +Nuevo · Buscar ·
//         Filtros · Toggle de vista · Ordenar — siempre en el mismo lugar/orden.
// CUÁNDO: arriba de cualquier pantalla del asesor con lista/colección.
// Jerarquía EB #10: UN solo primario aurora (+Nuevo); el resto neutro.
// Props (todas opcionales · se ocultan los huecos vacíos):
//   onNew, newLabel        → botón primario aurora
//   search, onSearch, searchPlaceholder
//   filters (node)         → dropdowns de filtro (se renderizan tal cual)
//   view (node)            → normalmente un <ViewToggle/>
//   sort (node)            → control de ordenar
//   right (node)           → extra alineado a la derecha
import React from 'react';
import { Plus, Search } from 'lucide-react';

export default function ActionBar({
  onNew, newLabel = '+ Nuevo',
  search, onSearch, searchPlaceholder = 'Buscar…',
  filters, view, sort, right,
}) {
  return (
    <div
      data-testid="asr-action-bar"
      style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: 12, marginBottom: 16,
        background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 12,
        boxShadow: 'var(--asr-shadow)',
      }}
    >
      {onNew && (
        <button
          type="button"
          onClick={onNew}
          data-testid="asr-ab-new"
          className="btn btn-primary"
          style={{ borderRadius: 9999 }}
        >
          <Plus size={14} /> {newLabel.replace(/^\+\s*/, '')}
        </button>
      )}

      {onSearch && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 200,
          padding: '8px 14px', background: 'var(--surface-2)',
          border: '1px solid var(--border)', borderRadius: 9,
        }}>
          <Search size={14} color="var(--cream-3)" />
          <input
            data-testid="asr-ab-search"
            placeholder={searchPlaceholder}
            value={search || ''}
            onChange={(e) => onSearch(e.target.value)}
            style={{
              background: 'none', border: 'none', outline: 'none',
              color: 'var(--cream)', fontFamily: 'DM Sans, sans-serif',
              fontSize: 13, flex: 1, minWidth: 0,
            }}
          />
        </div>
      )}

      {filters && (
        <div data-testid="asr-ab-filters" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {filters}
        </div>
      )}

      <div style={{ flex: onSearch ? '0 0 auto' : 1 }} />

      {sort && <div data-testid="asr-ab-sort" style={{ display: 'flex', alignItems: 'center' }}>{sort}</div>}
      {view && <div data-testid="asr-ab-view">{view}</div>}
      {right}
    </div>
  );
}
