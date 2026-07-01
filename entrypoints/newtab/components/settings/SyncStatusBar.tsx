import type { Workspace } from '@/src/domain/types';
import type { SyncState } from '@/src/storage/sync-state';
import { useSettings } from '../../hooks/useSettings';

type SyncStatusBarProps = {
  workspace: Workspace;
  syncState: SyncState;
};

/** Displays sync state and exposes manual pull/push controls. */
export default function SyncStatusBar({ workspace, syncState }: SyncStatusBarProps) {
  const { pullNow, pushNow } = useSettings();

  return (
    <section className="settings-section settings-status">
      <h3>Sync Status</h3>
      <dl className="status-grid">
        <div>
          <dt>Local version</dt>
          <dd>{workspace.version}</dd>
        </div>
        <div>
          <dt>Last synced</dt>
          <dd>{syncState.lastSyncedVersion ?? 'Never'}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{syncState.status}</dd>
        </div>
        <div>
          <dt>Pending version</dt>
          <dd>{syncState.pendingVersion ?? 'None'}</dd>
        </div>
      </dl>
      {syncState.lastError ? <p className="settings-error">{syncState.lastError}</p> : null}
      <div className="settings-actions">
        <button type="button" className="btn" onClick={() => void pullNow()}>Pull Gist to local</button>
        <button type="button" className="btn" onClick={() => void pushNow()}>Push local to Gist</button>
      </div>
    </section>
  );
}
