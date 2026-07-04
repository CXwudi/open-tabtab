import { useState, type MouseEvent } from 'react';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Group, SavedTab } from '@/src/domain/types';
import { encodeGroupId, encodeTabId, type DndDragData } from '../dnd/dnd-config';
import { openSavedGroup, openSavedGroupAsNativeGroup, openSavedTab } from '../actions/open';
import { useDispatch } from '../hooks/useSnapshot';
import InlineEditable from './common/InlineEditable';
import ConfirmDialog from './common/ConfirmDialog';
import SavedTabCard from './SavedTabCard';
import SavedTabForm from './SavedTabForm';

type GroupRowProps = {
  spaceId: string;
  group: Group;
  /** Tabs to render — may be a search-filtered subset of `group.tabs`. */
  tabs: SavedTab[];
  groupOrder: string[];
  groupTabOrders: Record<string, string[]>;
};

type FormState = { mode: 'add' } | { mode: 'edit'; tab: SavedTab } | null;

/**
 * A single collection row: drag handle, collapse chevron, inline-editable name,
 * hover actions (open / open-as-group — wired in Task 9), a `...` menu
 * (rename/delete), an "add tab" affordance, and the grid of saved-tab cards.
 */
export default function GroupRow({ spaceId, group, tabs, groupOrder, groupTabOrders }: GroupRowProps) {
  const dispatch = useDispatch();
  const [collapsed, setCollapsed] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState<FormState>(null);
  const [pendingDeleteTab, setPendingDeleteTab] = useState<SavedTab | null>(null);
  const sortable = useSortable({
    id: encodeGroupId(spaceId, group.id),
    data: { kind: 'group', spaceId, orderedIds: groupOrder } satisfies DndDragData,
  });
  const style = {
    transform: sortable.isDragging ? undefined : CSS.Translate.toString(sortable.transform),
    transition: sortable.transition,
  };
  const sortableTabIds = tabs.map((tab) => encodeTabId(spaceId, group.id, tab.id));
  const orderedTabIds = group.tabs.map((tab) => tab.id);

  function submitForm(values: { title: string; url: string }) {
    if (form?.mode === 'edit') {
      void dispatch({ type: 'editSavedTab', spaceId, groupId: group.id, tabId: form.tab.id, ...values });
    } else {
      void dispatch({ type: 'createSavedTab', spaceId, groupId: group.id, ...values });
    }
    setForm(null);
  }

  async function handleOpenTab(tab: SavedTab, event: MouseEvent<HTMLDivElement>) {
    const deleteAfterOpen = event.altKey;
    const background = event.ctrlKey || event.metaKey;

    await openSavedTab(tab.url, { background });
    if (deleteAfterOpen) {
      void dispatch({ type: 'deleteSavedTab', spaceId, groupId: group.id, tabId: tab.id });
    }
  }

  async function handleOpenGroup(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const deleteAfterOpen = event.altKey;

    await openSavedGroup(group.tabs.map((tab) => tab.url));
    if (deleteAfterOpen) {
      void dispatch({ type: 'deleteGroup', spaceId, groupId: group.id });
    }
  }

  async function handleOpenAsGroup(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const deleteAfterOpen = event.altKey;

    await openSavedGroupAsNativeGroup(group.name, group.tabs.map((tab) => tab.url));
    if (deleteAfterOpen) {
      void dispatch({ type: 'deleteGroup', spaceId, groupId: group.id });
    }
  }

  return (
    <section
      ref={sortable.setNodeRef}
      style={style}
      className={`group-row ${sortable.isDragging ? 'group-row--dragging' : ''}`}
    >
      <header className="group-header">
        <button
          type="button"
          className="drag-handle drag-handle--button"
          aria-label={`Reorder ${group.name}`}
          {...sortable.attributes}
          {...sortable.listeners}
        >
          ⋮⋮
        </button>
        <button
          type="button"
          className="icon-btn chevron"
          aria-label={collapsed ? 'Expand collection' : 'Collapse collection'}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? '▸' : '▾'}
        </button>
        <InlineEditable
          className="group-name"
          value={group.name}
          editing={renaming}
          onEditingChange={setRenaming}
          onCommit={(name) => dispatch({ type: 'renameGroup', spaceId, groupId: group.id, name })}
          inputAriaLabel="Rename collection"
        />
        <span className="group-count">{group.tabs.length}</span>
        <div className="group-actions">
          <button type="button" className="icon-btn" title="Open all tabs" onClick={(event) => void handleOpenGroup(event)}>↗</button>
          <button type="button" className="icon-btn" title="Open as tab group" onClick={(event) => void handleOpenAsGroup(event)}>▦</button>
          <button
            type="button"
            className="text-btn"
            onClick={() => setForm({ mode: 'add' })}
          >
            + add tab
          </button>
          <div className="menu">
            <button
              type="button"
              className="icon-btn"
              aria-label={`Actions for ${group.name}`}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((open) => !open)}
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
                  onClick={() => setMenuOpen(false)}
                />
                <div className="menu-list" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setRenaming(true); }}>
                    Rename
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="danger"
                    onClick={() => { setMenuOpen(false); setConfirmDelete(true); }}
                  >
                    Delete
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {collapsed ? null : (
        <div className="group-body">
          {form ? (
            <SavedTabForm
              mode={form.mode}
              initialTitle={form.mode === 'edit' ? form.tab.title : ''}
              initialUrl={form.mode === 'edit' ? form.tab.url : ''}
              onSubmit={submitForm}
              onCancel={() => setForm(null)}
            />
          ) : null}
          <SortableContext items={sortableTabIds} strategy={rectSortingStrategy}>
            <div className="tab-grid">
              {tabs.map((tab) => (
                <SavedTabCard
                  key={tab.id}
                  spaceId={spaceId}
                  groupId={group.id}
                  tab={tab}
                  orderedIds={orderedTabIds}
                  groupTabOrders={groupTabOrders}
                  onOpen={(event) => void handleOpenTab(tab, event)}
                  onEdit={() => setForm({ mode: 'edit', tab })}
                  onDelete={() => setPendingDeleteTab(tab)}
                />
              ))}
            </div>
          </SortableContext>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete "${group.name}"?`}
        message="This removes the collection and all its saved tabs."
        onConfirm={() => {
          setConfirmDelete(false);
          void dispatch({ type: 'deleteGroup', spaceId, groupId: group.id });
        }}
        onCancel={() => setConfirmDelete(false)}
      />
      <ConfirmDialog
        open={pendingDeleteTab !== null}
        title="Delete saved tab?"
        message={pendingDeleteTab?.title}
        onConfirm={() => {
          if (pendingDeleteTab) {
            void dispatch({ type: 'deleteSavedTab', spaceId, groupId: group.id, tabId: pendingDeleteTab.id });
          }
          setPendingDeleteTab(null);
        }}
        onCancel={() => setPendingDeleteTab(null)}
      />
    </section>
  );
}
