/**
 * Phase 4 Batch 17 · Sub-Chunk B — <FilterPresetsBar>
 *
 * Companion component to <FilterChipsBar> that loads, saves and deletes
 * server-persisted filter presets per route.
 *
 * Props:
 *   route: string (e.g. '/desarrollador/crm')
 *   currentFilters: object
 *   onLoadPreset: (filters) => void
 */
import React, { useEffect, useState, useCallback } from 'react';
import { listPresets, createPreset, deletePreset } from '../../api/batch17';
import { Bookmark, Trash, Plus } from '../icons';

export function FilterPresetsBar({ route, currentFilters, onLoadPreset }) {
  const [presets, setPresets] = useState([]);
  const [savingName, setSavingName] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listPresets(route);
      setPresets(data.items || []);
    } catch {
      setPresets([]);
    }
  }, [route]);

  useEffect(() => { load(); }, [load]);

  const activeCount = Object.values(currentFilters || {}).filter(
    (v) => v !== null && v !== undefined && v !== ''
  ).length;

  const onSave = async () => {
    const name = savingName.trim();
    if (!name || activeCount === 0) return;
    try {
      setSaving(true);
      await createPreset({ route, name, filters: currentFilters });
      setSavingName('');
      setShowSaveForm(false);
      await load();
    } catch {} finally {
      setSaving(false);
    }
  };

  const onDelete = async (id) => {
    try {
      await deletePreset(id);
      await load();
    } catch {}
  };

  return (
    <div
      data-testid="filter-presets-bar"
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        flexWrap: 'wrap', fontFamily: 'DM Sans',
      }}
    >
      {presets.map((p) => (
        <div key={p.id}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 10px 4px 8px', borderRadius: 9999,
            background: 'rgba(99,102,241,0.12)',
            border: '1px solid rgba(99,102,241,0.30)',
            fontSize: 11, color: 'var(--cream, #F0EBE0)',
          }}
        >
          <button
            data-testid={`preset-load-${p.id}`}
            onClick={() => onLoadPreset?.(p.filters || {})}
            style={{ background: 'transparent', border: 0, color: 'inherit',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                      fontFamily: 'inherit', fontSize: 'inherit' }}
          >
            <Bookmark size={11} /> {p.name}
          </button>
          <button
            data-testid={`preset-delete-${p.id}`}
            onClick={() => onDelete(p.id)}
            aria-label="Eliminar preset"
            style={{ background: 'transparent', border: 0, cursor: 'pointer',
                      color: 'rgba(240,235,224,0.55)', padding: 0,
                      display: 'flex', alignItems: 'center' }}
          >
            <Trash size={10} />
          </button>
        </div>
      ))}
      {activeCount > 0 && !showSaveForm && (
        <button
          data-testid="preset-save-toggle"
          onClick={() => setShowSaveForm(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 9999,
            background: 'transparent',
            border: '1px dashed rgba(240,235,224,0.25)',
            color: 'rgba(240,235,224,0.6)', fontSize: 11,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <Plus size={11} /> Guardar preset
        </button>
      )}
      {showSaveForm && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            data-testid="preset-save-input"
            value={savingName}
            onChange={(e) => setSavingName(e.target.value)}
            placeholder="Nombre del preset"
            onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') setShowSaveForm(false); }}
            autoFocus
            style={{
              padding: '4px 10px', borderRadius: 9999, fontSize: 11,
              background: 'rgba(240,235,224,0.08)',
              border: '1px solid rgba(240,235,224,0.2)',
              color: 'var(--cream, #F0EBE0)', outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            data-testid="preset-save-confirm"
            onClick={onSave}
            disabled={saving || !savingName.trim()}
            style={{
              padding: '4px 10px', borderRadius: 9999, fontSize: 11,
              background: 'var(--cream, #F0EBE0)', color: 'var(--bg, #06080F)',
              border: 0, cursor: 'pointer', fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            {saving ? '…' : 'OK'}
          </button>
        </div>
      )}
    </div>
  );
}

export default FilterPresetsBar;
