import { useState } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Space } from '@/src/domain/types';
import { encodeGroupId, groupTabOrderKey } from '../dnd/dnd-config';
import { useDispatch } from '../hooks/useSnapshot';
import InlineEditable from './common/InlineEditable';
import GroupToolbar from './GroupToolbar';
import GroupRow from './GroupRow';

type WorkspaceViewProps = {
  space: Space;
  onToggleTabs?: () => void;
};

/** Case-insensitive match of a saved tab against the center search box. */
function matchesSearch(title: string, url: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return title.toLowerCase().includes(needle) || url.toLowerCase().includes(needle);
}

/**
 * Center column for the selected space: inline-editable title, toolbar, and the
 * list of collections. Search filters saved-tab cards by title/url and hides
 * collections with no matches while a query is active.
 */
export default function WorkspaceView({ space, onToggleTabs }: WorkspaceViewProps) {
  const dispatch = useDispatch();
  const [renaming, setRenaming] = useState(false);
  const [search, setSearch] = useState('');

  function addCollection() {
    void dispatch({ type: 'createGroup', spaceId: space.id, name: 'New Collection' });
  }

  const searching = search.trim().length > 0;
  const groups = space.groups
    .map((group) => ({
      group,
      tabs: group.tabs.filter((tab) => matchesSearch(tab.title, tab.url, search)),
    }))
    .filter((entry) => !searching || entry.tabs.length > 0);
  const groupOrder = space.groups.map((group) => group.id);
  const groupTabOrders = Object.fromEntries(
    space.groups.map((group) => [
      groupTabOrderKey(space.id, group.id),
      group.tabs.map((tab) => tab.id),
    ]),
  );
  const sortableGroupIds = space.groups.map((group) => encodeGroupId(space.id, group.id));

  return (
    <div className="workspace-view">
      <header className="workspace-header">
        <h1 className="workspace-title">
          <InlineEditable
            value={space.name}
            editing={renaming}
            onEditingChange={setRenaming}
            onCommit={(name) => dispatch({ type: 'renameSpace', spaceId: space.id, name })}
            inputAriaLabel="Rename space"
          />
        </h1>
        <GroupToolbar
          search={search}
          onSearch={setSearch}
          onAddCollection={addCollection}
          onToggleTabs={onToggleTabs}
        />
      </header>

      {space.groups.length === 0 ? (
        <div className="empty-state">
          <p>This space has no collections yet.</p>
          <button type="button" className="btn btn-primary" onClick={addCollection}>
            + Add collection
          </button>
        </div>
      ) : (
        <SortableContext items={sortableGroupIds} strategy={verticalListSortingStrategy}>
          <div className="group-list">
            {groups.map(({ group, tabs }) => (
              <GroupRow
                key={group.id}
                spaceId={space.id}
                group={group}
                tabs={tabs}
                groupOrder={groupOrder}
                groupTabOrders={groupTabOrders}
              />
            ))}
            {searching && groups.length === 0 ? (
              <p className="empty-state">No tabs match “{search}”.</p>
            ) : null}
          </div>
        </SortableContext>
      )}
    </div>
  );
}
