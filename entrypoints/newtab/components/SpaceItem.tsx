import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Space } from '@/src/domain/types';
import { encodeSpaceId, type DndDragData } from '../dnd/dnd-config';
import InlineEditable from './common/InlineEditable';

type SpaceItemProps = {
  space: Space;
  orderedIds: string[];
  selected: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onRequestDelete: () => void;
};

/**
 * A single space row in the left sidebar: drag handle, icon, inline-editable
 * name, and a `...` menu (rename/delete). Clicking the row selects the space;
 * rename/delete are surfaced to the parent sidebar.
 */
export default function SpaceItem({
  space,
  orderedIds,
  selected,
  onSelect,
  onRename,
  onRequestDelete,
}: SpaceItemProps) {
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const sortable = useSortable({
    id: encodeSpaceId(space.id),
    data: { kind: 'space', orderedIds } satisfies DndDragData,
  });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={[
        'space-item',
        selected ? 'space-item--selected' : '',
        sortable.isDragging ? 'space-item--dragging' : '',
      ].filter(Boolean).join(' ')}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <button
        type="button"
        className="drag-handle drag-handle--button"
        aria-label={`Reorder ${space.name}`}
        onClick={(event) => event.stopPropagation()}
        {...sortable.attributes}
        {...sortable.listeners}
      >
        ⋮⋮
      </button>
      <span className="space-icon" aria-hidden="true">▢</span>
      <InlineEditable
        className="space-name"
        value={space.name}
        editing={renaming}
        onEditingChange={setRenaming}
        onCommit={onRename}
        inputAriaLabel="Rename space"
      />
      <div className="menu">
        <button
          type="button"
          className="icon-btn"
          aria-label={`Actions for ${space.name}`}
          aria-haspopup="menu"
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((open) => !open);
          }}
        >
          ⋯
        </button>
        {menuOpen ? (
          <>
            <button
              type="button"
              className="menu-backdrop"
              aria-hidden="true"
              tabIndex={-1}
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen(false);
              }}
            />
            <div className="menu-list" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  setMenuOpen(false);
                  setRenaming(true);
                }}
              >
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={(event) => {
                  event.stopPropagation();
                  setMenuOpen(false);
                  onRequestDelete();
                }}
              >
                Delete
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
