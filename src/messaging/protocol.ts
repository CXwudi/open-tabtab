import type { Workspace } from '../domain/types';
import type { GistSettings, ThemeMode } from '../storage/settings';
import type { SyncState } from '../storage/sync-state';

export type Command =
  | { type: 'getState' }
  | { type: 'createSpace'; name: string }
  | { type: 'renameSpace'; spaceId: string; name: string }
  | { type: 'deleteSpace'; spaceId: string }
  | { type: 'reorderSpaces'; orderedIds: string[] }
  | { type: 'createGroup'; spaceId: string; name: string }
  | { type: 'renameGroup'; spaceId: string; groupId: string; name: string }
  | { type: 'deleteGroup'; spaceId: string; groupId: string }
  | { type: 'reorderGroups'; spaceId: string; orderedIds: string[] }
  | { type: 'createSavedTab'; spaceId: string; groupId: string; title: string; url: string }
  | { type: 'editSavedTab'; spaceId: string; groupId: string; tabId: string; title: string; url: string }
  | { type: 'deleteSavedTab'; spaceId: string; groupId: string; tabId: string }
  | { type: 'reorderSavedTabs'; spaceId: string; groupId: string; orderedIds: string[] }
  | {
    type: 'moveSavedTab';
    from: { spaceId: string; groupId: string };
    to: { spaceId: string; groupId: string; index: number };
    tabId: string;
  }
  | {
    type: 'saveBrowserTab';
    spaceId: string;
    groupId: string;
    index?: number;
    tab: { title: string; url: string; favIconUrl?: string };
  }
  | {
    type: 'stashCurrentTabs';
    spaceId: string;
    groupName: string;
    tabs: { title: string; url: string; favIconUrl?: string }[];
  }
  | { type: 'importBackup'; backup: unknown }
  | { type: 'reconcile' }
  | { type: 'setGistSettings'; patch: GistSettingsPatch }
  | { type: 'testConnection' }
  | { type: 'createGist' }
  | { type: 'pullNow' }
  | { type: 'pushNow' }
  | { type: 'resolveConflict'; resolution: 'useLocal' | 'useRemote' };

export type GistSettingsPatch = {
  enabled?: boolean;
  token?: string;
  clearToken?: boolean;
  gistId?: string;
  filename?: string;
  themeMode?: ThemeMode;
};

export type PublicGistSettings = Omit<GistSettings, 'token'> & {
  hasToken: boolean;
};

export type Snapshot = {
  workspace: Workspace;
  syncState: SyncState;
  settings: PublicGistSettings;
};

export type CommandResult =
  | { ok: true; snapshot: Snapshot; data?: unknown }
  | { ok: false; error: string; snapshot?: Snapshot };

export interface CommandBus {
  dispatch(cmd: Command): Promise<CommandResult>;
  subscribe(listener: (snapshot: Snapshot) => void): () => void;
}
