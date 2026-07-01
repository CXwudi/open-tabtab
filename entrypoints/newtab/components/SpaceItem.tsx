import { useState } from 'react';
import type { Space } from '@/src/domain/types';
import InlineEditable from './common/InlineEditable';

type SpaceItemProps = {
  space: Space;
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
  selected,
  onSelect,
  onRename,
  onRequestDelete,
}: SpaceItemProps) {
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className={`space-item ${selected ? 'space-item--selected' : ''}`}
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
      <span className="drag-handle" aria-hidden="true">⋮⋮</span>
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
