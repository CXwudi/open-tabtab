import { useState } from 'react';
import type { SavedTab } from '@/src/domain/types';

type SavedTabCardProps = {
  tab: SavedTab;
  onEdit: () => void;
  onDelete: () => void;
};

/**
 * Compact saved-tab card: favicon + title with a `...` menu exposing edit and
 * delete. Opening the tab on click is wired later (Task 9); this component only
 * renders content and surfaces edit/delete intents to its parent.
 */
export default function SavedTabCard({ tab, onEdit, onDelete }: SavedTabCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="tab-card" title={tab.url}>
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
              <button
                type="button"
                role="menuitem"
                onClick={() => {
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
                onClick={() => {
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
