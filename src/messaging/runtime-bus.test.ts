import { storage } from '#imports';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { Workspace } from '../domain/types';
import { STORAGE_KEYS } from '../storage/keys';
import type { CommandResult } from './protocol';
import { messaging } from './messaging';
import { RuntimeCommandBus } from './runtime-bus';

vi.mock('./messaging', () => ({
  messaging: {
    sendMessage: vi.fn(),
  },
}));

const workspace: Workspace = {
  version: 1,
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

describe('RuntimeCommandBus', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.mocked(messaging.sendMessage).mockReset();
  });

  it('sends commands through the typed runtime channel', async () => {
    const result: CommandResult = {
      ok: true,
      snapshot: {
        workspace,
        syncState: { status: 'idle' },
        settings: {
          enabled: false,
          filename: 'open-tabtab-backup.json',
          themeMode: 'system',
          hasToken: false,
        },
      },
    };
    vi.mocked(messaging.sendMessage).mockResolvedValue(result);

    await expect(new RuntimeCommandBus().dispatch({ type: 'getState' })).resolves.toBe(result);

    expect(messaging.sendMessage).toHaveBeenCalledWith('dispatchCommand', { type: 'getState' });
  });

  it('notifies subscribers with redacted snapshots when watched storage changes', async () => {
    await storage.setItem(STORAGE_KEYS.settings, {
      enabled: true,
      token: 'secret-token',
      gistId: 'gist-1',
      filename: 'backup.json',
      themeMode: 'dark',
    });
    await storage.setItem(STORAGE_KEYS.syncState, {
      status: 'dirty',
      pendingVersion: 2,
    });

    const listener = vi.fn();
    const unsubscribe = new RuntimeCommandBus().subscribe(listener);

    await storage.setItem(STORAGE_KEYS.workspace, workspace);

    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    expect(listener).toHaveBeenCalledWith({
      workspace,
      syncState: {
        status: 'dirty',
        pendingVersion: 2,
      },
      settings: {
        enabled: true,
        gistId: 'gist-1',
        filename: 'backup.json',
        themeMode: 'dark',
        hasToken: true,
      },
    });
    expect(listener.mock.calls[0]?.[0].settings).not.toHaveProperty('token');

    unsubscribe();
    await storage.setItem(STORAGE_KEYS.syncState, { status: 'idle' });
    await settleWatchers();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

/** Gives fake-browser storage listeners one turn to run after writes. */
async function settleWatchers(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
