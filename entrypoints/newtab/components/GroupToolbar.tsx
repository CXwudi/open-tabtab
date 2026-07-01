type GroupToolbarProps = {
  search: string;
  onSearch: (value: string) => void;
  onAddCollection: () => void;
  onToggleTabs?: () => void;
};

/**
 * Toolbar under the space title: search saved tabs, add a collection, and
 * toggle the right current-tabs sidebar. The `...` overflow is a placeholder
 * for future space-level actions.
 */
export default function GroupToolbar({
  search,
  onSearch,
  onAddCollection,
  onToggleTabs,
}: GroupToolbarProps) {
  return (
    <div className="group-toolbar">
      <input
        className="text-input search-input"
        type="search"
        aria-label="Search tabs"
        placeholder="Search Tabs"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
      />
      <button type="button" className="btn btn-primary" onClick={onAddCollection}>
        + Add collection
      </button>
      <button type="button" className="icon-btn" title="More actions">
        ⋯
      </button>
      {onToggleTabs ? (
        <button
          type="button"
          className="icon-btn"
          aria-label="Toggle current tabs sidebar"
          onClick={onToggleTabs}
        >
          ▐
        </button>
      ) : null}
    </div>
  );
}
