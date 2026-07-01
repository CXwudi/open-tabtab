import { useRef, useState, type ChangeEvent } from 'react';
import { serializeBackup } from '@/src/domain/backup';
import type { Workspace } from '@/src/domain/types';
import { useDispatch } from '../../hooks/useSnapshot';

type BackupImportExportProps = {
  workspace: Workspace;
};

/** Export/import controls for full workspace backup replacement. */
export default function BackupImportExport({ workspace }: BackupImportExportProps) {
  const dispatch = useDispatch();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState('');

  function exportBackup() {
    const blob = new Blob([serializeBackup(workspace)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `open-tabtab-backup-${workspace.version}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const backup = JSON.parse(await file.text()) as unknown;
      const result = await dispatch({ type: 'importBackup', backup });
      setMessage(result.ok ? 'Backup imported.' : result.error);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <section className="settings-section">
      <h3>Backup</h3>
      <p>Import replaces the whole workspace.</p>
      <div className="settings-actions">
        <button type="button" className="btn" onClick={exportBackup}>Export local backup</button>
        <button type="button" className="btn" onClick={() => inputRef.current?.click()}>Import backup file</button>
      </div>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="application/json,.json"
        onChange={(event) => void importBackup(event)}
      />
      {message ? <p className="settings-hint">{message}</p> : null}
    </section>
  );
}
