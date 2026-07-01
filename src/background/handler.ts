import { bootstrapWorkspace, parseBackup } from '../domain/backup';
import {
  createSpace,
  renameSpace,
  deleteSpace,
  reorderSpaces,
  createGroup,
  renameGroup,
  deleteGroup,
  reorderGroups,
  createSavedTab,
  editSavedTab,
  deleteSavedTab,
  reorderSavedTabs,
  moveSavedTab,
  saveBrowserTab,
  stashCurrentTabs,
} from '../domain/operations';
import type { Workspace } from '../domain/types';
import { nextVersion } from '../domain/version';
import type {
  Command,
  CommandResult,
  GistSettingsPatch,
  PublicGistSettings,
  Snapshot,
} from '../messaging/protocol';
import { StorageRepository } from '../storage/repository';
import type { GistSettings } from '../storage/settings';
import type { SyncState } from '../storage/sync-state';

export type SyncEngine = {
  enqueuePush(): void | Promise<void>;
  reconcile(): unknown | Promise<unknown>;
  setSettings(patch: GistSettingsPatch): unknown | Promise<unknown>;
  testConnection(): unknown | Promise<unknown>;
  createGist(): unknown | Promise<unknown>;
  pull(): unknown | Promise<unknown>;
  push(): unknown | Promise<unknown>;
  resolveConflict(resolution: 'useLocal' | 'useRemote'): unknown | Promise<unknown>;
};

export type HandlerDeps = {
  repository: StorageRepository;
  syncEngine: SyncEngine;
  now?: () => number;
};

/** Handles a command at the background boundary and never throws to callers. */
export async function handleCommand(cmd: Command, deps: HandlerDeps): Promise<CommandResult> {
  try {
    const data = await handleCommandUnsafe(cmd, deps);
    return { ok: true, snapshot: await readSnapshot(deps), data };
  } catch (error) {
    const snapshot = await readSnapshot(deps).catch(() => undefined);
    return { ok: false, error: errorMessage(error), snapshot };
  }
}

async function handleCommandUnsafe(cmd: Command, deps: HandlerDeps): Promise<unknown> {
  if (cmd.type === 'getState') {
    await ensureWorkspace(deps.repository);
    return undefined;
  }

  const syncResult = await handleSyncCommand(cmd, deps.syncEngine);
  if (syncResult.handled) {
    return syncResult.data;
  }

  const current = await ensureWorkspace(deps.repository);
  const mutated = applyMutation(current, cmd);
  const versioned = { ...mutated, version: nextVersion(current.version) };

  await deps.repository.setWorkspace(versioned);
  await updateSyncStateAfterMutation(deps, versioned.version);

  return undefined;
}

async function handleSyncCommand(
  cmd: Command,
  syncEngine: SyncEngine,
): Promise<{ handled: true; data: unknown } | { handled: false }> {
  switch (cmd.type) {
    case 'reconcile':
      return { handled: true, data: await syncEngine.reconcile() };
    case 'setGistSettings':
      return { handled: true, data: await syncEngine.setSettings(cmd.patch) };
    case 'testConnection':
      return { handled: true, data: await syncEngine.testConnection() };
    case 'createGist':
      return { handled: true, data: await syncEngine.createGist() };
    case 'pullNow':
      return { handled: true, data: await syncEngine.pull() };
    case 'pushNow':
      return { handled: true, data: await syncEngine.push() };
    case 'resolveConflict':
      return { handled: true, data: await syncEngine.resolveConflict(cmd.resolution) };
    default:
      return { handled: false };
  }
}

function applyMutation(workspace: Workspace, cmd: Command): Workspace {
  switch (cmd.type) {
    case 'createSpace':
      return createSpace(workspace, cmd.name);
    case 'renameSpace':
      return renameSpace(workspace, cmd.spaceId, cmd.name);
    case 'deleteSpace':
      return deleteSpace(workspace, cmd.spaceId);
    case 'reorderSpaces':
      return reorderSpaces(workspace, cmd.orderedIds);
    case 'createGroup':
      return createGroup(workspace, cmd.spaceId, cmd.name);
    case 'renameGroup':
      return renameGroup(workspace, cmd.spaceId, cmd.groupId, cmd.name);
    case 'deleteGroup':
      return deleteGroup(workspace, cmd.spaceId, cmd.groupId);
    case 'reorderGroups':
      return reorderGroups(workspace, cmd.spaceId, cmd.orderedIds);
    case 'createSavedTab':
      return createSavedTab(workspace, cmd.spaceId, cmd.groupId, cmd.title, cmd.url);
    case 'editSavedTab':
      return editSavedTab(workspace, cmd.spaceId, cmd.groupId, cmd.tabId, cmd.title, cmd.url);
    case 'deleteSavedTab':
      return deleteSavedTab(workspace, cmd.spaceId, cmd.groupId, cmd.tabId);
    case 'reorderSavedTabs':
      return reorderSavedTabs(workspace, cmd.spaceId, cmd.groupId, cmd.orderedIds);
    case 'moveSavedTab':
      return moveSavedTab(workspace, cmd.from, cmd.to, cmd.tabId);
    case 'saveBrowserTab':
      return saveBrowserTab(workspace, cmd.spaceId, cmd.groupId, cmd.tab, cmd.index);
    case 'stashCurrentTabs':
      return stashCurrentTabs(workspace, cmd.spaceId, cmd.groupName, cmd.tabs);
    case 'importBackup': {
      const parsed = parseBackup(cmd.backup);
      if (!parsed.ok) throw new Error(parsed.error);
      return parsed.workspace;
    }
    default:
      throw new Error(`Unsupported command: ${cmd.type}`);
  }
}

async function ensureWorkspace(repository: StorageRepository): Promise<Workspace> {
  const existing = await repository.getWorkspace();
  if (existing) {
    return existing;
  }

  const workspace = bootstrapWorkspace();
  await repository.setWorkspace(workspace);
  await repository.setSyncState({ status: 'idle' });

  return workspace;
}

async function updateSyncStateAfterMutation(deps: HandlerDeps, version: number): Promise<void> {
  const [settings, previous] = await Promise.all([
    deps.repository.getSettings(),
    deps.repository.getSyncState(),
  ]);

  if (!settings.enabled) {
    await deps.repository.setSyncState(cleanSyncState(previous));
    return;
  }

  await deps.repository.setSyncState(dirtySyncState(previous, version, deps.now?.() ?? Date.now()));

  if (settings.token && settings.gistId) {
    await deps.syncEngine.enqueuePush();
  }
}

async function readSnapshot(deps: HandlerDeps): Promise<Snapshot> {
  const workspace = await ensureWorkspace(deps.repository);
  const [syncState, settings] = await Promise.all([
    deps.repository.getSyncState(),
    deps.repository.getSettings(),
  ]);

  return {
    workspace,
    syncState,
    settings: toPublicSettings(settings),
  };
}

function cleanSyncState(previous: SyncState): SyncState {
  return {
    status: 'idle',
    lastSyncedVersion: previous.lastSyncedVersion,
  };
}

function dirtySyncState(previous: SyncState, version: number, now: number): SyncState {
  return {
    status: 'dirty',
    lastSyncedVersion: previous.lastSyncedVersion,
    pendingVersion: version,
    updatedAt: now,
  };
}

function toPublicSettings(settings: GistSettings): PublicGistSettings {
  const { token: _token, ...publicSettings } = settings;
  return {
    ...publicSettings,
    hasToken: Boolean(settings.token),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
