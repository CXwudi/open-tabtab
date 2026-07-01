import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { Workspace } from '../domain/types';
import type { GistSettings } from './settings';
import { StorageRepository } from './repository';
import type { SyncState } from './sync-state';

const workspace: Workspace = {
  version: 1,
  spaceOrder: ['space-1'],
  spaces: {
    'space-1': {
      id: 'space-1',
      name: 'Default',
      groups: [],
    },
  },
};

describe('StorageRepository', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('returns defaults when sync state and settings are unset', async () => {
    const repository = new StorageRepository();

    await expect(repository.getWorkspace()).resolves.toBeUndefined();
    await expect(repository.getSyncState()).resolves.toEqual({ status: 'idle' });
    await expect(repository.getSettings()).resolves.toEqual({
      enabled: false,
      filename: 'open-tabtab-backup.json',
    });
  });

  it('round-trips a workspace through extension storage', async () => {
    const repository = new StorageRepository();

    await repository.setWorkspace(workspace);

    await expect(repository.getWorkspace()).resolves.toEqual(workspace);
  });

  it('round-trips sync state through extension storage', async () => {
    const repository = new StorageRepository();
    const syncState: SyncState = {
      status: 'dirty',
      lastSyncedVersion: 1,
      pendingVersion: 2,
      updatedAt: 3,
    };

    await repository.setSyncState(syncState);

    await expect(repository.getSyncState()).resolves.toEqual(syncState);
  });

  it('round-trips Gist settings through extension storage', async () => {
    const repository = new StorageRepository();
    const settings: GistSettings = {
      enabled: true,
      token: 'secret-token',
      gistId: 'gist-1',
      filename: 'backup.json',
    };

    await repository.setSettings(settings);

    await expect(repository.getSettings()).resolves.toEqual(settings);
  });
});
