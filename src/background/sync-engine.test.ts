import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { handleCommand } from './handler';
import { SyncEngine } from './sync-engine';
import type { Workspace } from '../domain/types';
import { serializeBackup } from '../domain/backup';
import { StorageRepository } from '../storage/repository';
import type { GistClient, RemoteBackupResult } from '../sync/gist-client';

type GistClientMock = {
  updateGist: ReturnType<typeof vi.fn>;
  getGist: ReturnType<typeof vi.fn>;
  validateToken: ReturnType<typeof vi.fn>;
  createGist: ReturnType<typeof vi.fn>;
};

function makeWorkspace(version = 10, name = 'Local'): Workspace {
  return {
    version,
    spaceOrder: ['space-1'],
    spaces: {
      'space-1': {
        id: 'space-1',
        name,
        groups: [],
        pins: {},
      },
    },
  };
}

function found(workspace: Workspace): RemoteBackupResult {
  return {
    kind: 'found',
    workspace,
    remoteVersion: workspace.version,
  };
}

function makeGistClient(): GistClientMock {
  return {
    updateGist: vi.fn(),
    getGist: vi.fn(),
    validateToken: vi.fn(),
    createGist: vi.fn(),
  };
}

async function seedConfigured(repository: StorageRepository, workspace = makeWorkspace()): Promise<void> {
  await repository.setWorkspace(workspace);
  await repository.setSettings({
    enabled: true,
    token: 'secret-token',
    gistId: 'gist-1',
    filename: 'open-tabtab-backup.json',
    themeMode: 'system',
  });
}

function makeEngine(repository: StorageRepository, gistClient: GistClientMock): SyncEngine {
  return new SyncEngine({
    repository,
    gistClient: gistClient as unknown as GistClient,
    now: () => 123,
  });
}

describe('SyncEngine', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('keeps local mutation saved and pending when an enqueued push fails', async () => {
    const repository = new StorageRepository();
    const gistClient = makeGistClient();
    await seedConfigured(repository, makeWorkspace(10_000));
    gistClient.updateGist.mockRejectedValueOnce(new Error('network secret-token failure'));
    const syncEngine = makeEngine(repository, gistClient);

    const result = await handleCommand({ type: 'createSpace', name: 'Saved anyway' }, {
      repository,
      syncEngine,
      now: () => 123,
    });

    expect(result.ok).toBe(true);
    await vi.waitFor(async () => {
      expect((await repository.getSyncState()).status).toBe('error');
    });

    const workspace = await repository.getWorkspace();
    const syncState = await repository.getSyncState();

    expect(workspace?.spaceOrder.length).toBe(2);
    expect(syncState.pendingVersion).toBe(result.snapshot?.workspace.version);
    expect(syncState.lastError).toContain('[redacted]');
  });

  it('reconciles clean unchanged remotes as a noop', async () => {
    const repository = new StorageRepository();
    const gistClient = makeGistClient();
    const workspace = makeWorkspace(10);
    await seedConfigured(repository, workspace);
    await repository.setSyncState({ status: 'idle', lastSyncedVersion: 10 });
    gistClient.getGist.mockResolvedValueOnce(found(workspace));
    const syncEngine = makeEngine(repository, gistClient);

    await expect(syncEngine.reconcile()).resolves.toEqual({ ok: true, data: 'noop' });
    expect(gistClient.updateGist).not.toHaveBeenCalled();
  });

  it('reconciles dirty unchanged remotes by pushing local', async () => {
    const repository = new StorageRepository();
    const gistClient = makeGistClient();
    const workspace = makeWorkspace(11);
    await seedConfigured(repository, workspace);
    await repository.setSyncState({ status: 'dirty', lastSyncedVersion: 10, pendingVersion: 11 });
    gistClient.getGist.mockResolvedValueOnce(found(makeWorkspace(10, 'Remote unchanged')));
    gistClient.updateGist.mockResolvedValueOnce(undefined);
    const syncEngine = makeEngine(repository, gistClient);

    await expect(syncEngine.reconcile()).resolves.toEqual({ ok: true, data: 'pushLocal' });
    await vi.waitFor(() => expect(gistClient.updateGist).toHaveBeenCalledTimes(1));

    expect((await repository.getSyncState()).lastSyncedVersion).toBe(11);
  });

  it('reconciles clean moved remotes by replacing local', async () => {
    const repository = new StorageRepository();
    const gistClient = makeGistClient();
    const remoteWorkspace = makeWorkspace(20, 'Remote');
    await seedConfigured(repository, makeWorkspace(10));
    await repository.setSyncState({ status: 'idle', lastSyncedVersion: 10 });
    gistClient.getGist.mockResolvedValueOnce(found(remoteWorkspace));
    const syncEngine = makeEngine(repository, gistClient);

    await expect(syncEngine.reconcile()).resolves.toEqual({ ok: true, data: 'replaceLocal' });

    expect(await repository.getWorkspace()).toEqual(remoteWorkspace);
    expect(await repository.getSyncState()).toMatchObject({
      status: 'idle',
      lastSyncedVersion: 20,
    });
  });

  it('reconciles dirty moved remotes as conflict without overwriting local', async () => {
    const repository = new StorageRepository();
    const gistClient = makeGistClient();
    const localWorkspace = makeWorkspace(11, 'Local dirty');
    await seedConfigured(repository, localWorkspace);
    await repository.setSyncState({ status: 'dirty', lastSyncedVersion: 10, pendingVersion: 11 });
    gistClient.getGist.mockResolvedValueOnce(found(makeWorkspace(20, 'Remote moved')));
    const syncEngine = makeEngine(repository, gistClient);

    await expect(syncEngine.reconcile()).resolves.toEqual({ ok: true, data: 'conflict' });

    expect(await repository.getWorkspace()).toEqual(localWorkspace);
    expect(await repository.getSyncState()).toMatchObject({
      status: 'conflict',
      pendingVersion: 11,
    });
  });

  it('maps invalid remote backups to error, never conflict', async () => {
    const repository = new StorageRepository();
    const gistClient = makeGistClient();
    await seedConfigured(repository);
    await repository.setSyncState({ status: 'dirty', lastSyncedVersion: 10, pendingVersion: 11 });
    gistClient.getGist.mockResolvedValueOnce({ kind: 'invalid', error: 'bad backup' });
    const syncEngine = makeEngine(repository, gistClient);

    await expect(syncEngine.reconcile()).resolves.toEqual({ ok: false, error: 'bad backup' });
    expect(await repository.getSyncState()).toMatchObject({
      status: 'error',
      pendingVersion: 11,
      lastError: 'bad backup',
    });
  });

  it('preserves stored token when patching settings unless clearToken is set', async () => {
    const repository = new StorageRepository();
    const gistClient = makeGistClient();
    await seedConfigured(repository);
    const syncEngine = makeEngine(repository, gistClient);

    await syncEngine.setSettings({ enabled: false, filename: 'next.json' });
    expect(await repository.getSettings()).toMatchObject({
      enabled: false,
      token: 'secret-token',
      gistId: 'gist-1',
      filename: 'next.json',
    });

    await syncEngine.setSettings({ clearToken: true });
    expect((await repository.getSettings()).token).toBeUndefined();
  });

  it('preserves token, gistId, filename, and enabled on theme-only patches', async () => {
    const repository = new StorageRepository();
    const gistClient = makeGistClient();
    await seedConfigured(repository);
    const syncEngine = makeEngine(repository, gistClient);

    await syncEngine.setSettings({ themeMode: 'dark' });

    const settings = await repository.getSettings();
    expect(settings).toMatchObject({
      enabled: true,
      token: 'secret-token',
      gistId: 'gist-1',
      filename: 'open-tabtab-backup.json',
      themeMode: 'dark',
    });
  });

  it('resolves useLocal only after a successful remote update', async () => {
    const repository = new StorageRepository();
    const gistClient = makeGistClient();
    const workspace = makeWorkspace(11);
    await seedConfigured(repository, workspace);
    await repository.setSyncState({ status: 'conflict', lastSyncedVersion: 10, pendingVersion: 11 });
    gistClient.updateGist.mockResolvedValueOnce(undefined);
    const syncEngine = makeEngine(repository, gistClient);

    await expect(syncEngine.resolveConflict('useLocal')).resolves.toEqual({ ok: true });

    expect(gistClient.updateGist).toHaveBeenCalledWith(
      'gist-1',
      'secret-token',
      'open-tabtab-backup.json',
      serializeBackup(workspace),
    );
    expect(await repository.getSyncState()).toMatchObject({
      status: 'idle',
      lastSyncedVersion: 11,
    });
  });

  it('keeps conflict state when useLocal push fails', async () => {
    const repository = new StorageRepository();
    const gistClient = makeGistClient();
    await seedConfigured(repository, makeWorkspace(11));
    await repository.setSyncState({ status: 'conflict', lastSyncedVersion: 10, pendingVersion: 11 });
    gistClient.updateGist.mockRejectedValueOnce(new Error('push failed'));
    const syncEngine = makeEngine(repository, gistClient);

    await expect(syncEngine.resolveConflict('useLocal')).resolves.toMatchObject({ ok: false });
    expect(await repository.getSyncState()).toMatchObject({
      status: 'conflict',
      pendingVersion: 11,
      lastError: 'push failed',
    });
  });

  it('resolves useRemote by refetching and replacing local without pushing', async () => {
    const repository = new StorageRepository();
    const gistClient = makeGistClient();
    const remoteWorkspace = makeWorkspace(20, 'Remote winner');
    await seedConfigured(repository, makeWorkspace(11));
    await repository.setSyncState({ status: 'conflict', lastSyncedVersion: 10, pendingVersion: 11 });
    gistClient.getGist.mockResolvedValueOnce(found(remoteWorkspace));
    const syncEngine = makeEngine(repository, gistClient);

    await expect(syncEngine.resolveConflict('useRemote')).resolves.toEqual({ ok: true });

    expect(await repository.getWorkspace()).toEqual(remoteWorkspace);
    expect(gistClient.updateGist).not.toHaveBeenCalled();
    expect(await repository.getSyncState()).toMatchObject({
      status: 'idle',
      lastSyncedVersion: 20,
    });
  });
});
