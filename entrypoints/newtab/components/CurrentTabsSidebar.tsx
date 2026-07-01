import { useMemo, useState } from 'react';
import type { BrowserTab } from '@/src/browser/tabs';
import CurrentTabItem from './CurrentTabItem';

/** Lightweight view of a browser tab rendered in the current-tabs sidebar. */
export type BrowserTabView = BrowserTab;

type CurrentTabsSidebarProps = {
  tabs: BrowserTabView[];
  onSaveAll?: () => void;
};

/**
 * Right sidebar showing the current window's tabs with count, sort toggle,
 * save-all affordance, and a title/url filter.
 */
export default function CurrentTabsSidebar({ tabs, onSaveAll }: CurrentTabsSidebarProps) {
  const [search, setSearch] = useState('');
  const [sorted, setSorted] = useState(false);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = tabs.filter(
      (tab) =>
        !needle ||
        tab.title.toLowerCase().includes(needle) ||
        tab.url.toLowerCase().includes(needle),
    );
    if (!sorted) return filtered;
    return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
  }, [tabs, search, sorted]);

  return (
    <aside className="current-tabs-sidebar">
      <div className="sidebar-section-header">
        <span>Tabs ({tabs.length})</span>
        <div className="current-tabs-actions">
          <button
            type="button"
            className={`icon-btn ${sorted ? 'icon-btn--active' : ''}`}
            aria-label="Sort tabs by title"
            aria-pressed={sorted}
            onClick={() => setSorted((value) => !value)}
          >
            ↕
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Save all tabs"
            title="Save all tabs"
            disabled={!onSaveAll}
            onClick={onSaveAll}
          >
            ⤓
          </button>
        </div>
      </div>

      <input
        className="text-input search-input"
        type="search"
        aria-label="Search current tabs"
        placeholder="Search open tabs"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      <div className="current-tab-list">
        {visible.map((tab, index) => (
          <CurrentTabItem key={tab.id ?? `${tab.url}:${index}`} tab={tab} />
        ))}
        {visible.length === 0 ? <p className="empty-hint">No open tabs match.</p> : null}
      </div>
    </aside>
  );
}
