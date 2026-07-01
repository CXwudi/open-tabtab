import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { Workspace } from '../domain/types';
import type { CommandResult } from '../messaging/protocol';
import { StorageRepository } from '../storage/repository';
import { handleCommand, type SyncEngine } from './handler';

function makeWorkspace(version = 10_000): Workspace {
  return {
    version,
    spaceOrder: ['space-1'],
    spaces: {
      'space-1': {
        id: 'space-1',
        name: 'Default',
        groups: [],
        pins: {},
      },
    },
  };
}

function makeSyncEngine(): SyncEngine {
  return {
    enqueuePush: vi.fn(),
    reconcile: vi.fn(),
    setSettings: vi.fn(),
    testConnection: vi.fn(),
    createGist: vi.fn(),
    pull: vi.fn(),
    push: vi.fn(),
    resolveConflict: vi.fn(),
  };
}

function expectOk(result: CommandResult): asserts result is Extract<CommandResult, { ok: true }> {
  expect(result.ok).toBe(true);
}

describe('handleCommand', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    fakeBrowser.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('bootstraps workspace on getState without marking sync dirty', async () => {
    const repository = new StorageRepository();
    const syncEngine = makeSyncEngine();

    const result = await handleCommand({ type: 'getState' }, { repository, syncEngine });

    expectOk(result);
    expect(result.snapshot.workspace.spaceOrder.length).toBe(1);
    expect(result.snapshot.syncState).toEqual({ status: 'idle' });
    expect(syncEngine.enqueuePush).not.toHaveBeenCalled();
  });

  it('persists mutations and enqueues when sync is enabled and configured', async () => {
    const repository = new StorageRepository();
    const syncEngine = makeSyncEngine();
    await repository.setWorkspace(makeWorkspace());
    await repository.setSettings({
      enabled: true,
      token: 'secret-token',
      gistId: 'gist-1',
      filename: 'open-tabtab-backup.json',
    });

    const result = await handleCommand({ type: 'createSpace', name: 'Research' }, {
      repository,
      syncEngine,
      now: () => 123,
    });

    expectOk(result);
    expect(result.snapshot.workspace.version).toBe(10_001);
    expect(result.snapshot.workspace.spaceOrder.length).toBe(2);
    expect(result.snapshot.syncState).toEqual({
      status: 'dirty',
      pendingVersion: 10_001,
      updatedAt: 123,
    });
    expect(syncEngine.enqueuePush).toHaveBeenCalledTimes(1);
  });

  it('bumps version once for each committed mutation', async () => {
    const repository = new StorageRepository();
    const syncEngine = makeSyncEngine();
    await repository.setWorkspace(makeWorkspace());
    await repository.setSettings({
      enabled: true,
      token: 'secret-token',
      gistId: 'gist-1',
      filename: 'open-tabtab-backup.json',
    });

    const first = await handleCommand({ type: 'createSpace', name: 'A' }, { repository, syncEngine });
    const second = await handleCommand({ type: 'createSpace', name: 'B' }, { repository, syncEngine });
    const third = await handleCommand({ type: 'createSpace', name: 'C' }, { repository, syncEngine });

    expectOk(first);
    expectOk(second);
    expectOk(third);
    expect([
      first.snapshot.workspace.version,
      second.snapshot.workspace.version,
      third.snapshot.workspace.version,
    ]).toEqual([10_001, 10_002, 10_003]);
    expect(syncEngine.enqueuePush).toHaveBeenCalledTimes(3);
  });

  it('leaves sync clean and does not enqueue when sync is disabled', async () => {
    const repository = new StorageRepository();
    const syncEngine = makeSyncEngine();
    await repository.setWorkspace(makeWorkspace());
    await repository.setSettings({
      enabled: false,
      token: 'secret-token',
      gistId: 'gist-1',
      filename: 'open-tabtab-backup.json',
    });

    const result = await handleCommand({ type: 'createSpace', name: 'Local only' }, {
      repository,
      syncEngine,
    });

    expectOk(result);
    expect(result.snapshot.workspace.version).toBe(10_001);
    expect(result.snapshot.syncState).toEqual({ status: 'idle' });
    expect(syncEngine.enqueuePush).not.toHaveBeenCalled();
  });

  it('wraps invalid backup imports as command errors', async () => {
    const repository = new StorageRepository();
    const syncEngine = makeSyncEngine();
    await repository.setWorkspace(makeWorkspace());

    const result = await handleCommand({ type: 'importBackup', backup: {} }, {
      repository,
      syncEngine,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('version');
    expect(result.snapshot?.workspace.version).toBe(10_000);
  });
});
