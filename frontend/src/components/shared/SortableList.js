/**
 * Phase 4 Batch 17 · Sub-Chunk A — <SortableList>
 *
 * Reorderable list primitive built on @dnd-kit.
 *
 * Props:
 *   items: Array<{ id, ...any }>
 *   onReorder: (newOrderIds: string[], newItems: Array) => void | Promise
 *   renderItem: (item, { isDragging, listeners, attributes }) => ReactNode
 *   axis: 'vertical' | 'horizontal' | 'grid'
 *   disabled: boolean
 *   keyField: string  (default 'id')
 *   gap: number (px)
 *
 * Keyboard: Space to pick up / drop, arrow keys to move.
 * Mobile: long-press (250ms) to start drag.
 */
import React, { useState, useCallback } from 'react';
import {
  DndContext, closestCenter, useSensor, useSensors,
  PointerSensor, KeyboardSensor, TouchSensor,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy, horizontalListSortingStrategy,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableItem({ id, children, disabled }) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    cursor: disabled ? 'default' : (isDragging ? 'grabbing' : 'grab'),
    userSelect: 'none',
    touchAction: 'none',
  };

  return (
    <div ref={setNodeRef} style={style} data-testid={`sortable-item-${id}`}>
      {typeof children === 'function'
        ? children({ isDragging, listeners, attributes })
        : React.cloneElement(children, { ...listeners, ...attributes })}
    </div>
  );
}

export function SortableList({
  items = [],
  onReorder,
  renderItem,
  axis = 'vertical',
  disabled = false,
  keyField = 'id',
  gap = 8,
  testId = 'sortable-list',
}) {
  const [localItems, setLocalItems] = useState(items);

  // Keep local synced when parent items change (e.g., after fetch)
  React.useEffect(() => { setLocalItems(items); }, [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const strategy = axis === 'horizontal'
    ? horizontalListSortingStrategy
    : axis === 'grid'
      ? rectSortingStrategy
      : verticalListSortingStrategy;

  const handleDragEnd = useCallback(async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = localItems.findIndex((i) => i[keyField] === active.id);
    const newIndex = localItems.findIndex((i) => i[keyField] === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const moved = arrayMove(localItems, oldIndex, newIndex);
    setLocalItems(moved);
    const newOrderIds = moved.map((i) => i[keyField]);
    try {
      await onReorder?.(newOrderIds, moved);
    } catch (e) {
      // Revert on error
      setLocalItems(items);
    }
  }, [localItems, items, onReorder, keyField]);

  const layoutStyle = axis === 'horizontal'
    ? { display: 'flex', flexDirection: 'row', gap }
    : axis === 'grid'
      ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap }
      : { display: 'flex', flexDirection: 'column', gap };

  const ids = localItems.map((i) => i[keyField]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={strategy} disabled={disabled}>
        <div data-testid={testId} style={layoutStyle}>
          {localItems.map((item) => (
            <SortableItem key={item[keyField]} id={item[keyField]} disabled={disabled}>
              {(slotProps) => renderItem(item, slotProps)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

export default SortableList;
