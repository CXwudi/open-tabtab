import { storage } from '#imports';
import type { Workspace } from '../domain/types';
import { STORAGE_KEYS } from '../storage/keys';
import type { GistSettings } from '../storage/settings';
import type { SyncState } from '../storage/sync-state';
import { messaging } from './messaging';
import type {
  Command,
  CommandBus,
  CommandResult,
  PublicGistSettings,
  Snapshot,
} from './protocol';

const DEFAULT_SETTINGS: GistSettings = {
  enabled: false,
  filename: 'open-tabtab-backup.json',
  themeMode: 'system',
};

const DEFAULT_SYNC_STATE: SyncState = {
  status: 'idle',
};

/** Runtime-backed command bus used by the extension UI. */
export class RuntimeCommandBus implements CommandBus {
  /** Sends commands to the background worker over the typed runtime channel. */
  async dispatch(cmd: Command): Promise<CommandResult> {
    return messaging.sendMessage('dispatchCommand', cmd);
  }

  /** Watches persisted app state and emits fresh redacted snapshots. */
  subscribe(listener: (snapshot: Snapshot) => void): () => void {
    let active = true;
    let sequence = 0;

    const notify = () => {
      const current = ++sequence;
      void readSnapshot().then((snapshot) => {
        if (active && current === sequence && snapshot) listener(snapshot);
      }).catch(() => undefined);
    };

    const unwatchers = [
      storage.watch<Workspace>(STORAGE_KEYS.workspace, notify),
      storage.watch<SyncState>(STORAGE_KEYS.syncState, notify),
      storage.watch<GistSettings>(STORAGE_KEYS.settings, notify),
    ];

    return () => {
      active = false;
      sequence += 1;
      unwatchers.forEach((unwatch) => unwatch());
    };
  }
}

/** Reads the persisted app state into a UI-safe snapshot. */
async function readSnapshot(): Promise<Snapshot | undefined> {
  const [workspace, syncState, settings] = await Promise.all([
    storage.getItem<Workspace>(STORAGE_KEYS.workspace),
    storage.getItem<SyncState>(STORAGE_KEYS.syncState),
    storage.getItem<GistSettings>(STORAGE_KEYS.settings),
  ]);

  if (!workspace) return undefined;

  return {
    workspace,
    syncState: syncState ?? { ...DEFAULT_SYNC_STATE },
    settings: toPublicSettings({ ...DEFAULT_SETTINGS, ...settings }),
  };
}

/** Removes the secret token while preserving whether one is configured. */
function toPublicSettings(settings: GistSettings): PublicGistSettings {
  const { token: _token, ...publicSettings } = settings;
  return {
    ...publicSettings,
    hasToken: Boolean(settings.token),
  };
}
