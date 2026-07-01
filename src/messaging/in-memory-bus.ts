import { fromTabTab, parseBackup } from '@/src/domain/backup';
import * as ops from '@/src/domain/operations';
import { nextVersion } from '@/src/domain/version';
import type { Workspace } from '@/src/domain/types';
import type { SyncState } from '@/src/storage/sync-state';
import { sampleTabTabBackup } from '@/src/testing/sample-backup';
import type {
  Command,
  CommandBus,
  CommandResult,
  GistSettingsPatch,
  PublicGistSettings,
  Snapshot,
} from './protocol';

const DEFAULT_FILENAME = 'open-tabtab-backup.json';

/**
 * In-memory {@link CommandBus} for standalone UI development (Phase 1).
 *
 * Seeds a workspace from the captured TabTab backup via `fromTabTab`, applies
 * the pure Task 1 operation matching each mutation command, bumps the version
 * monotonically, fakes a "dirty" sync state, and notifies subscribers. It is
 * swapped for `RuntimeCommandBus` in Task 7 with no UI changes.
 */
export class InMemoryCommandBus implements CommandBus {
  private workspace: Workspace;
  private syncState: SyncState = { status: 'idle' };
  private settings: PublicGistSettings = {
    enabled: false,
    filename: DEFAULT_FILENAME,
    hasToken: false,
  };
  private readonly listeners = new Set<(snapshot: Snapshot) => void>();

  constructor() {
    this.workspace = fromTabTab(sampleTabTabBackup);
  }

  /** Applies a command and resolves to the resulting snapshot. Never throws. */
  async dispatch(cmd: Command): Promise<CommandResult> {
    try {
      const mutated = this.applyMutation(cmd);
      if (mutated) {
        this.workspace = { ...mutated, version: nextVersion(this.workspace.version) };
        this.markDirty();
        this.notify();
      } else if (cmd.type === 'setGistSettings') {
        this.applySettingsPatch(cmd.patch);
        this.notify();
      }
      return { ok: true, snapshot: this.snapshot() };
    } catch (error) {
      return { ok: false, error: (error as Error).message, snapshot: this.snapshot() };
    }
  }

  /** Registers a snapshot listener and returns an unsubscribe function. */
  subscribe(listener: (snapshot: Snapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Maps a mutation command to its Task 1 operation and returns the new
   * workspace, or `null` for non-mutation commands (getState / sync / settings).
   */
  private applyMutation(cmd: Command): Workspace | null {
    const ws = this.workspace;
    switch (cmd.type) {
      case 'createSpace':
        return ops.createSpace(ws, cmd.name);
      case 'renameSpace':
        return ops.renameSpace(ws, cmd.spaceId, cmd.name);
      case 'deleteSpace':
        return ops.deleteSpace(ws, cmd.spaceId);
      case 'reorderSpaces':
        return ops.reorderSpaces(ws, cmd.orderedIds);
      case 'createGroup':
        return ops.createGroup(ws, cmd.spaceId, cmd.name);
      case 'renameGroup':
        return ops.renameGroup(ws, cmd.spaceId, cmd.groupId, cmd.name);
      case 'deleteGroup':
        return ops.deleteGroup(ws, cmd.spaceId, cmd.groupId);
      case 'reorderGroups':
        return ops.reorderGroups(ws, cmd.spaceId, cmd.orderedIds);
      case 'createSavedTab':
        return ops.createSavedTab(ws, cmd.spaceId, cmd.groupId, cmd.title, cmd.url);
      case 'editSavedTab':
        return ops.editSavedTab(ws, cmd.spaceId, cmd.groupId, cmd.tabId, cmd.title, cmd.url);
      case 'deleteSavedTab':
        return ops.deleteSavedTab(ws, cmd.spaceId, cmd.groupId, cmd.tabId);
      case 'reorderSavedTabs':
        return ops.reorderSavedTabs(ws, cmd.spaceId, cmd.groupId, cmd.orderedIds);
      case 'moveSavedTab':
        return ops.moveSavedTab(ws, cmd.from, cmd.to, cmd.tabId);
      case 'saveBrowserTab':
        return ops.saveBrowserTab(ws, cmd.spaceId, cmd.groupId, cmd.tab, cmd.index);
      case 'stashCurrentTabs':
        return ops.stashCurrentTabs(ws, cmd.spaceId, cmd.groupName, cmd.tabs);
      case 'importBackup': {
        const result = parseBackup(cmd.backup);
        if (!result.ok) throw new Error(result.error);
        return result.workspace;
      }
      default:
        return null;
    }
  }

  /** Fakes the "unpushed local changes" state produced by a real mutation. */
  private markDirty(): void {
    this.syncState = {
      status: 'dirty',
      pendingVersion: this.workspace.version,
      updatedAt: Date.now(),
    };
  }

  /** Applies a partial settings update, preserving the token unless cleared. */
  private applySettingsPatch(patch: GistSettingsPatch): void {
    this.settings = {
      enabled: patch.enabled ?? this.settings.enabled,
      filename: patch.filename ?? this.settings.filename,
      gistId: patch.gistId ?? this.settings.gistId,
      hasToken: patch.clearToken ? false : patch.token ? true : this.settings.hasToken,
    };
  }

  private snapshot(): Snapshot {
    return { workspace: this.workspace, syncState: this.syncState, settings: this.settings };
  }

  private notify(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
