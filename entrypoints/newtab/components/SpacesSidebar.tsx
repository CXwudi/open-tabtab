import { useState } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Space, Workspace } from '@/src/domain/types';
import { encodeSpaceId } from '../dnd/dnd-config';
import { useDispatch } from '../hooks/useSnapshot';
import SpaceItem from './SpaceItem';
import ConfirmDialog from './common/ConfirmDialog';

type SpacesSidebarProps = {
  workspace: Workspace;
  selectedSpaceId: string | null;
  onSelectSpace: (id: string) => void;
  onOpenSettings: () => void;
};

/**
 * Left sidebar listing spaces in `spaceOrder`. Creating adds a default-named
 * space (renamed inline afterwards); rename/delete are dispatched here, with
 * delete gated behind a {@link ConfirmDialog}.
 */
export default function SpacesSidebar({
  workspace,
  selectedSpaceId,
  onSelectSpace,
  onOpenSettings,
}: SpacesSidebarProps) {
  const dispatch = useDispatch();
  const [pendingDelete, setPendingDelete] = useState<Space | null>(null);

  const spaces = workspace.spaceOrder
    .map((id) => workspace.spaces[id])
    .filter((space): space is Space => Boolean(space));
  const sortableIds = spaces.map((space) => encodeSpaceId(space.id));

  return (
    <aside className="spaces-sidebar">
      <div className="sidebar-brand">
        <span className="brand-title">Open TabTab</span>
        <button type="button" className="icon-btn" title="Collapse sidebar">«</button>
      </div>

      <div className="sidebar-section-header">
        <span>Spaces</span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Add space"
          onClick={() => dispatch({ type: 'createSpace', name: 'New Space' })}
        >
          +
        </button>
      </div>

      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <div className="space-list">
          {spaces.map((space) => (
            <SpaceItem
              key={space.id}
              space={space}
              orderedIds={workspace.spaceOrder}
              selected={space.id === selectedSpaceId}
              onSelect={() => onSelectSpace(space.id)}
              onRename={(name) => dispatch({ type: 'renameSpace', spaceId: space.id, name })}
              onRequestDelete={() => setPendingDelete(space)}
            />
          ))}
        </div>
      </SortableContext>

      <div className="sidebar-footer">
        <button type="button" className="text-btn" onClick={onOpenSettings}>⚙ Settings</button>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete "${pendingDelete?.name ?? ''}"?`}
        message="This removes the space and all of its collections."
        onConfirm={() => {
          if (pendingDelete) dispatch({ type: 'deleteSpace', spaceId: pendingDelete.id });
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </aside>
  );
}
