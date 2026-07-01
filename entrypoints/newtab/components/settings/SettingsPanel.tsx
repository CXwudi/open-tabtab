import type { Snapshot } from '@/src/messaging/protocol';
import ConflictBanner from './ConflictBanner';
import GistConfigForm from './GistConfigForm';
import SyncStatusBar from './SyncStatusBar';
import BackupImportExport from './BackupImportExport';

type SettingsPanelProps = {
  snapshot: Snapshot;
  onClose: () => void;
};

/** Modal settings surface for Gist sync, backup import/export, and conflicts. */
export default function SettingsPanel({ snapshot, onClose }: SettingsPanelProps) {
  return (
    <div className="settings-overlay" role="presentation">
      <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="settings-header">
          <div>
            <h2 id="settings-title">Settings</h2>
            <p>Sync, backup, and recovery controls.</p>
          </div>
          <button type="button" className="icon-btn" aria-label="Close settings" onClick={onClose}>
            ×
          </button>
        </header>

        {snapshot.syncState.status === 'conflict' ? (
          <ConflictBanner lastError={snapshot.syncState.lastError} />
        ) : null}

        <SyncStatusBar workspace={snapshot.workspace} syncState={snapshot.syncState} />
        <GistConfigForm settings={snapshot.settings} />
        <BackupImportExport workspace={snapshot.workspace} />
      </section>
    </div>
  );
}
