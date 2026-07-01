export type SyncStatus = 'idle' | 'syncing' | 'dirty' | 'error' | 'conflict';

export type SyncState = {
  status: SyncStatus;
  lastSyncedVersion?: number;
  pendingVersion?: number;
  lastError?: string;
  updatedAt?: number;
};
