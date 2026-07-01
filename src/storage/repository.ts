import { storage } from '#imports';
import type { Workspace } from '../domain/types';
import type { GistSettings } from './settings';
import { STORAGE_KEYS } from './keys';
import type { SyncState } from './sync-state';

const DEFAULT_SETTINGS: GistSettings = {
  enabled: false,
  filename: 'open-tabtab-backup.json',
};

const DEFAULT_SYNC_STATE: SyncState = {
  status: 'idle',
};

/** Wraps extension storage for workspace, sync state, and Gist settings. */
export class StorageRepository {
  /** Returns the saved workspace, or undefined before bootstrap. */
  async getWorkspace(): Promise<Workspace | undefined> {
    return (await storage.getItem<Workspace>(STORAGE_KEYS.workspace)) ?? undefined;
  }

  /** Persists the full workspace snapshot. */
  async setWorkspace(workspace: Workspace): Promise<void> {
    await storage.setItem(STORAGE_KEYS.workspace, workspace);
  }

  /** Returns stored sync state, defaulting to clean idle state. */
  async getSyncState(): Promise<SyncState> {
    const syncState = await storage.getItem<SyncState>(STORAGE_KEYS.syncState);

    return syncState ?? { ...DEFAULT_SYNC_STATE };
  }

  /** Persists the full sync state. */
  async setSyncState(syncState: SyncState): Promise<void> {
    await storage.setItem(STORAGE_KEYS.syncState, syncState);
  }

  /** Returns stored Gist settings with MVP defaults filled in. */
  async getSettings(): Promise<GistSettings> {
    const settings = await storage.getItem<GistSettings>(STORAGE_KEYS.settings);

    return { ...DEFAULT_SETTINGS, ...settings };
  }

  /** Persists the full Gist settings object. */
  async setSettings(settings: GistSettings): Promise<void> {
    await storage.setItem(STORAGE_KEYS.settings, settings);
  }
}
