import type { SyncState } from '../storage/sync-state';
import type { RemoteBackupResult } from './gist-client';

export type ReconcileRemote = Extract<RemoteBackupResult, { kind: 'found' | 'missing' }>;
export type ReconcileDecision = 'noop' | 'pushLocal' | 'replaceLocal' | 'conflict';

type ReconcileInput = {
  syncState: SyncState;
  remote: ReconcileRemote;
};

/** Decides the next sync action from local dirty state and remote movement. */
export function decideReconcile({ syncState, remote }: ReconcileInput): ReconcileDecision {
  const localDirty = syncState.pendingVersion != null;
  const remoteMoved = remote.kind === 'found'
    && remote.remoteVersion !== syncState.lastSyncedVersion;

  if (localDirty && remoteMoved) {
    return 'conflict';
  }

  if (localDirty) {
    return 'pushLocal';
  }

  if (remoteMoved) {
    return 'replaceLocal';
  }

  return 'noop';
}
