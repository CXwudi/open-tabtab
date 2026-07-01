import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SavedTab } from '@/src/domain/types';
import { encodeTabId, type DndDragData } from '../dnd/dnd-config';

type SavedTabCardProps = {
  spaceId: string;
  groupId: string;
  tab: SavedTab;
  orderedIds: string[];
  groupTabOrders: Record<string, string[]>;
  onOpen: (event: MouseEvent<HTMLDivElement>) => void;
  onEdit: () => void;
  onDelete: () => void;
};

/**
 * Compact saved-tab card: favicon + title with a `...` menu exposing edit and
 * delete. Opening the tab on click is wired later (Task 9); this component only
 * renders content and surfaces edit/delete intents to its parent.
 */
export default function SavedTabCard({
  spaceId,
  groupId,
  tab,
  orderedIds,
  groupTabOrders,
  onOpen,
  onEdit,
  onDelete,
}: SavedTabCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const suppressOpenRef = useRef(false);
  const sortable = useSortable({
    id: encodeTabId(spaceId, groupId, tab.id),
    data: { kind: 'tab', spaceId, groupId, orderedIds, groupTabOrders } satisfies DndDragData,
  });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  useEffect(() => {
    if (sortable.isDragging) {
      suppressOpenRef.current = true;
      return;
    }

    if (!suppressOpenRef.current) return;
    const timer = setTimeout(() => {
      suppressOpenRef.current = false;
    }, 0);

    return () => clearTimeout(timer);
  }, [sortable.isDragging]);

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (suppressOpenRef.current) {
      suppressOpenRef.current = false;
      return;
    }

    onOpen(event);
  }

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={`tab-card ${sortable.isDragging ? 'tab-card--dragging' : ''}`}
      title={tab.url}
      onClick={handleClick}
      {...sortable.attributes}
      {...sortable.listeners}
    >
      {tab.favIconUrl ? (
        <img className="tab-card-icon" src={tab.favIconUrl} alt="" loading="lazy" />
      ) : (
        <span className="tab-card-icon tab-card-icon--fallback" aria-hidden="true" />
      )}
      <span className="tab-card-title">{tab.title || tab.url}</span>
      <div className="menu">
        <button
          type="button"
          className="icon-btn tab-card-menu-btn"
          aria-label={`Actions for ${tab.title || tab.url}`}
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
                  onEdit();
                }}
              >
                Edit
              </button>
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={(event) => {
                  event.stopPropagation();
                  setMenuOpen(false);
                  onDelete();
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
