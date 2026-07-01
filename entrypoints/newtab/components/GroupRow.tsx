import { useState } from 'react';
import type { Group, SavedTab } from '@/src/domain/types';
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
};

type FormState = { mode: 'add' } | { mode: 'edit'; tab: SavedTab } | null;

/**
 * A single collection row: drag handle, collapse chevron, inline-editable name,
 * hover actions (open / open-as-group — wired in Task 9), a `...` menu
 * (rename/delete), an "add tab" affordance, and the grid of saved-tab cards.
 */
export default function GroupRow({ spaceId, group, tabs }: GroupRowProps) {
  const dispatch = useDispatch();
  const [collapsed, setCollapsed] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState<FormState>(null);
  const [pendingDeleteTab, setPendingDeleteTab] = useState<SavedTab | null>(null);

  function submitForm(values: { title: string; url: string }) {
    if (form?.mode === 'edit') {
      void dispatch({ type: 'editSavedTab', spaceId, groupId: group.id, tabId: form.tab.id, ...values });
    } else {
      void dispatch({ type: 'createSavedTab', spaceId, groupId: group.id, ...values });
    }
    setForm(null);
  }

  return (
    <section className="group-row">
      <header className="group-header">
        <span className="drag-handle" aria-hidden="true">⋮⋮</span>
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
          {/* Open actions are wired in Task 9. */}
          <button type="button" className="icon-btn" title="Open all tabs (Task 9)">↗</button>
          <button type="button" className="icon-btn" title="Open as tab group (Task 9)">▦</button>
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
          <div className="tab-grid">
            {tabs.map((tab) => (
              <SavedTabCard
                key={tab.id}
                tab={tab}
                onEdit={() => setForm({ mode: 'edit', tab })}
                onDelete={() => setPendingDeleteTab(tab)}
              />
            ))}
          </div>
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
