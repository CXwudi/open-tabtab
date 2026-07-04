import { bootstrapWorkspace, serializeBackup } from '../domain/backup';
import type { Workspace } from '../domain/types';
import type { GistSettingsPatch } from '../messaging/protocol';
import { StorageRepository } from '../storage/repository';
import type { GistSettings } from '../storage/settings';
import type { SyncState } from '../storage/sync-state';
import { GistClient, type RemoteBackupResult } from '../sync/gist-client';
import { decideReconcile, type ReconcileRemote } from '../sync/reconcile';
import { SerialPushQueue } from '../sync/queue';

type SyncEngineDeps = {
  repository: StorageRepository;
  gistClient: GistClient;
  queue?: SerialPushQueue;
  now?: () => number;
};

type SyncResult = { ok: true; skipped?: boolean; data?: unknown } | { ok: false; error: string };

/** Coordinates local workspace storage with the configured GitHub Gist. */
export class SyncEngine {
  private readonly repository: StorageRepository;
  private readonly gistClient: GistClient;
  private readonly queue: SerialPushQueue;
  private readonly now: () => number;

  constructor(deps: SyncEngineDeps) {
    this.repository = deps.repository;
    this.gistClient = deps.gistClient;
    this.now = deps.now ?? Date.now;
    this.queue = deps.queue ?? new SerialPushQueue(() => this.push().then(() => undefined));
  }

  /** Enqueues a background push without awaiting it. */
  enqueuePush(): void {
    this.queue.enqueue();
  }

  /** Pushes the latest local workspace to the configured Gist. */
  async push(): Promise<SyncResult> {
    return this.pushWithFailureStatus('error');
  }

  /** Reconciles local and remote state using the pure reconciliation table. */
  async reconcile(): Promise<SyncResult> {
    const settings = await this.repository.getSettings();
    if (!isConfigured(settings)) {
      return { ok: true, skipped: true };
    }

    const remote = await this.gistClient.getGist(settings.gistId, settings.token, settings.filename);
    if (remote.kind === 'invalid') {
      await this.setError(remote.error);
      return { ok: false, error: remote.error };
    }

    const syncState = await this.repository.getSyncState();
    const decision = decideReconcile({ syncState, remote });

    if (decision === 'pushLocal') {
      this.enqueuePush();
      return { ok: true, data: decision };
    }

    if (decision === 'replaceLocal' && remote.kind === 'found') {
      await this.replaceLocal(remote.workspace, remote.remoteVersion);
      return { ok: true, data: decision };
    }

    if (decision === 'conflict') {
      await this.repository.setSyncState({
        ...syncState,
        status: 'conflict',
        lastError: 'Local and remote backups both changed',
        updatedAt: this.now(),
      });
      return { ok: true, data: decision };
    }

    return { ok: true, data: decision };
  }

  /** Pulls the configured remote backup into local storage. */
  async pull(): Promise<SyncResult> {
    const remote = await this.readRemote();
    if (remote.kind !== 'found') {
      const error = remote.kind === 'invalid' ? remote.error : 'Remote backup is missing';
      await this.setError(error);
      return { ok: false, error };
    }

    await this.replaceLocal(remote.workspace, remote.remoteVersion);
    return { ok: true };
  }

  /** Merges and stores Gist settings without exposing or clobbering the PAT. */
  async setSettings(patch: GistSettingsPatch): Promise<SyncResult> {
    const settings = await this.repository.getSettings();
    await this.repository.setSettings(mergeSettings(settings, patch));
    return { ok: true };
  }

  /** Validates the token, and optionally checks the configured Gist file. */
  async testConnection(): Promise<SyncResult> {
    const settings = await this.repository.getSettings();
    if (!settings.token) {
      return { ok: false, error: 'Missing token' };
    }

    const tokenOk = await this.gistClient.validateToken(settings.token);
    if (!tokenOk) {
      return { ok: false, error: 'Token validation failed' };
    }

    if (!settings.gistId) {
      return { ok: true };
    }

    return { ok: true, data: await this.gistClient.getGist(settings.gistId, settings.token, settings.filename) };
  }

  /** Creates a private Gist seeded with the current workspace backup. */
  async createGist(): Promise<SyncResult> {
    const settings = await this.repository.getSettings();
    if (!settings.token) {
      return { ok: false, error: 'Missing token' };
    }

    const workspace = await this.ensureWorkspace();
    const gistId = await this.gistClient.createGist(settings.token, {
      filename: settings.filename,
      content: serializeBackup(workspace),
      description: 'Open TabTab backup',
      public: false,
    });

    await this.repository.setSettings({ ...settings, gistId });
    await this.repository.setSyncState({
      status: 'idle',
      lastSyncedVersion: workspace.version,
      updatedAt: this.now(),
    });

    return { ok: true, data: { gistId } };
  }

  /** Resolves an existing conflict by replacing either remote or local state. */
  async resolveConflict(resolution: 'useLocal' | 'useRemote'): Promise<SyncResult> {
    if (resolution === 'useLocal') {
      return this.pushWithFailureStatus('conflict');
    }

    return this.replaceLocalFromFreshRemote();
  }

  private async pushWithFailureStatus(failureStatus: 'error' | 'conflict'): Promise<SyncResult> {
    const [workspace, settings, previous] = await Promise.all([
      this.repository.getWorkspace(),
      this.repository.getSettings(),
      this.repository.getSyncState(),
    ]);

    if (!workspace || !isConfigured(settings)) {
      return { ok: true, skipped: true };
    }

    await this.repository.setSyncState({
      ...previous,
      status: 'syncing',
      updatedAt: this.now(),
    });

    try {
      await this.gistClient.updateGist(
        settings.gistId,
        settings.token,
        settings.filename,
        serializeBackup(workspace),
      );
      await this.repository.setSyncState({
        status: 'idle',
        lastSyncedVersion: workspace.version,
        updatedAt: this.now(),
      });
      return { ok: true };
    } catch (error) {
      const message = sanitizeError(error, settings.token);
      await this.repository.setSyncState({
        ...previous,
        status: failureStatus,
        pendingVersion: previous.pendingVersion ?? workspace.version,
        lastError: message,
        updatedAt: this.now(),
      });
      return { ok: false, error: message };
    }
  }

  private async replaceLocalFromFreshRemote(): Promise<SyncResult> {
    try {
      const remote = await this.readRemote();
      if (remote.kind !== 'found') {
        const error = remote.kind === 'invalid' ? remote.error : 'Remote backup is missing';
        await this.setError(error);
        return { ok: false, error };
      }

      await this.replaceLocal(remote.workspace, remote.remoteVersion);
      return { ok: true };
    } catch (error) {
      const settings = await this.repository.getSettings();
      const message = sanitizeError(error, settings.token);
      await this.setError(message);
      return { ok: false, error: message };
    }
  }

  private async readRemote(): Promise<RemoteBackupResult> {
    const settings = await this.repository.getSettings();
    if (!isConfigured(settings)) {
      return { kind: 'missing' };
    }

    return this.gistClient.getGist(settings.gistId, settings.token, settings.filename);
  }

  private async replaceLocal(workspace: Workspace, remoteVersion: number): Promise<void> {
    await this.repository.setWorkspace(workspace);
    await this.repository.setSyncState({
      status: 'idle',
      lastSyncedVersion: remoteVersion,
      updatedAt: this.now(),
    });
  }

  private async ensureWorkspace(): Promise<Workspace> {
    const existing = await this.repository.getWorkspace();
    if (existing) {
      return existing;
    }

    const workspace = bootstrapWorkspace();
    await this.repository.setWorkspace(workspace);
    return workspace;
  }

  private async setError(error: string): Promise<void> {
    const previous = await this.repository.getSyncState();
    await this.repository.setSyncState({
      ...previous,
      status: 'error',
      lastError: error,
      updatedAt: this.now(),
    });
  }
}

function isConfigured(settings: GistSettings): settings is GistSettings & { token: string; gistId: string } {
  return settings.enabled && Boolean(settings.token) && Boolean(settings.gistId);
}

function mergeSettings(settings: GistSettings, patch: GistSettingsPatch): GistSettings {
  const next: GistSettings = {
    ...settings,
    enabled: patch.enabled ?? settings.enabled,
    gistId: patch.gistId ?? settings.gistId,
    filename: patch.filename ?? settings.filename,
    themeMode: patch.themeMode ?? settings.themeMode,
  };

  if (patch.clearToken) {
    delete next.token;
  } else if (patch.token !== undefined) {
    next.token = patch.token;
  }

  return next;
}

function sanitizeError(error: unknown, token?: string): string {
  const message = error instanceof Error ? error.message : String(error);
  return token ? message.replaceAll(token, '[redacted]') : message;
}
