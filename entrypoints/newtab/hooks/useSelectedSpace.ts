import { useCallback, useEffect, useState } from 'react';
import { storage } from 'wxt/utils/storage';
import type { Workspace } from '@/src/domain/types';

// UI-only key, kept separate from workspace/sync/settings storage.
const SELECTED_SPACE_KEY = 'local:ui.selectedSpaceId';

/**
 * Tracks the currently selected space. Selection is UI-local state persisted to
 * `chrome.storage.local`, and always falls back to the first space in
 * `spaceOrder` when the stored id is missing or no longer exists.
 */
export function useSelectedSpace(workspace: Workspace | null): {
  selectedSpaceId: string | null;
  selectSpace: (id: string) => void;
} {
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);

  // Restore the persisted selection once on mount.
  useEffect(() => {
    void storage
      .getItem<string>(SELECTED_SPACE_KEY)
      .then((stored) => {
        if (stored) setSelectedSpaceId(stored);
      })
      .catch(() => undefined);
  }, []);

  // Coerce the selection to a valid space whenever the workspace changes.
  useEffect(() => {
    if (!workspace || workspace.spaceOrder.length === 0) return;
    if (!selectedSpaceId || !workspace.spaceOrder.includes(selectedSpaceId)) {
      setSelectedSpaceId(workspace.spaceOrder[0]);
    }
  }, [workspace, selectedSpaceId]);

  const selectSpace = useCallback((id: string) => {
    setSelectedSpaceId(id);
    void storage.setItem(SELECTED_SPACE_KEY, id).catch(() => undefined);
  }, []);

  return { selectedSpaceId, selectSpace };
}
