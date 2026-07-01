import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { encodeBrowserTabId, type DndDragData } from '../dnd/dnd-config';
import type { BrowserTabView } from './CurrentTabsSidebar';

/**
 * A single row in the current-tabs sidebar: favicon, title, and URL. Draggable
 * save-to-group behavior is wired in Task 8; live data replaces the mock source
 * in Task 9.
 */
export default function CurrentTabItem({ tab }: { tab: BrowserTabView }) {
  const draggable = useDraggable({
    id: encodeBrowserTabId(tab.id),
    data: {
      kind: 'browserTab',
      tab: { title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl },
    } satisfies DndDragData,
  });
  const style = {
    transform: CSS.Translate.toString(draggable.transform),
  };

  return (
    <div
      ref={draggable.setNodeRef}
      style={style}
      className={`current-tab ${draggable.isDragging ? 'current-tab--dragging' : ''}`}
      title={tab.url}
      {...draggable.attributes}
      {...draggable.listeners}
    >
      <span className="drag-handle" aria-hidden="true">⋮⋮</span>
      {tab.favIconUrl ? (
        <img className="current-tab-icon" src={tab.favIconUrl} alt="" loading="lazy" />
      ) : (
        <span className="current-tab-icon current-tab-icon--fallback" aria-hidden="true" />
      )}
      <span className="current-tab-body">
        <span className="current-tab-title">{tab.title || tab.url}</span>
        <span className="current-tab-url">{tab.url}</span>
      </span>
      {tab.pinned ? <span className="pin-badge" title="Pinned">📌</span> : null}
    </div>
  );
}
