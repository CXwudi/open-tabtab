import { describe, expect, it } from 'vitest';
import type { Workspace } from '../domain/types';
import type { SyncState } from '../storage/sync-state';
import { decideReconcile, type ReconcileDecision, type ReconcileRemote } from './reconcile';

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

function found(remoteVersion: number): ReconcileRemote {
  return {
    kind: 'found',
    workspace: { ...workspace, version: remoteVersion },
    remoteVersion,
  };
}

describe('decideReconcile', () => {
  it.each<{
    name: string;
    syncState: SyncState;
    remote: ReconcileRemote;
    expected: ReconcileDecision;
  }>([
    {
      name: 'clean local and unchanged remote no-ops',
      syncState: { status: 'idle', lastSyncedVersion: 1 },
      remote: found(1),
      expected: 'noop',
    },
    {
      name: 'dirty local and unchanged remote pushes local',
      syncState: { status: 'dirty', lastSyncedVersion: 1, pendingVersion: 2 },
      remote: found(1),
      expected: 'pushLocal',
    },
    {
      name: 'clean local and moved remote replaces local',
      syncState: { status: 'idle', lastSyncedVersion: 1 },
      remote: found(2),
      expected: 'replaceLocal',
    },
    {
      name: 'dirty local and moved remote conflicts',
      syncState: { status: 'dirty', lastSyncedVersion: 1, pendingVersion: 2 },
      remote: found(3),
      expected: 'conflict',
    },
    {
      name: 'clean local and missing remote no-ops',
      syncState: { status: 'idle', lastSyncedVersion: 1 },
      remote: { kind: 'missing' },
      expected: 'noop',
    },
    {
      name: 'dirty local and missing remote pushes local',
      syncState: { status: 'dirty', lastSyncedVersion: 1, pendingVersion: 2 },
      remote: { kind: 'missing' },
      expected: 'pushLocal',
    },
    {
      name: 'clean local without prior sync treats found remote as moved',
      syncState: { status: 'idle' },
      remote: found(1),
      expected: 'replaceLocal',
    },
  ])('$name', ({ syncState, remote, expected }) => {
    expect(decideReconcile({ syncState, remote })).toBe(expected);
  });
});
