/**
 * Phase 4 Batch 17 — useInlineSaver hook
 *
 * Returns a save fn bound to (entityType, entityId) that:
 *   · calls PATCH /api/inline/{entityType}/{entityId}
 *   · shows a server-persisted undo toast on success
 *   · throws on error (so InlineEditField reverts)
 *
 * Usage:
 *   const save = useInlineSaver('unit', unit.id);
 *   <InlineEditField onSave={(v) => save('price', v)} />
 */
import { useCallback } from 'react';
import { inlineEdit } from '../api/batch17';
import { useServerUndo } from '../components/shared/UndoSnackbar';

export function useInlineSaver(entityType, entityId, {
  onUpdated, toastMessage, undoTimeout = 8000,
} = {}) {
  const { showServerUndo } = useServerUndo();

  const save = useCallback(async (field, value) => {
    const parsed = (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value))
      ? Number(value)
      : value;
    const res = await inlineEdit(entityType, entityId, field, parsed);
    try {
      const apiBase = process.env.REACT_APP_BACKEND_URL;
      const recent = await fetch(`${apiBase}/api/undo/recent?limit=1`,
        { credentials: 'include' });
      if (recent.ok) {
        const j = await recent.json();
        const last = j.items?.[0];
        if (last && last.action === 'inline_edit' && last.entity_id === entityId) {
          showServerUndo({
            message: toastMessage || `Campo ${field} actualizado`,
            undoId: last.id,
            onRestored: () => onUpdated?.(),
            timeout: undoTimeout,
          });
        }
      }
    } catch {}
    onUpdated?.(res.doc);
    return res;
  }, [entityType, entityId, onUpdated, toastMessage, undoTimeout, showServerUndo]);

  return save;
}

export default useInlineSaver;
