import { useEffect, useState, type FormEvent } from 'react';
import type { PublicGistSettings } from '@/src/messaging/protocol';
import { useSettings } from '../../hooks/useSettings';

type GistConfigFormProps = {
  settings: PublicGistSettings;
};

/** Form for sync enablement and Gist credentials without revealing the PAT. */
export default function GistConfigForm({ settings }: GistConfigFormProps) {
  const { saveSettings, createGist, testConnection } = useSettings();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [gistId, setGistId] = useState(settings.gistId ?? '');
  const [filename, setFilename] = useState(settings.filename);
  const [token, setToken] = useState('');

  useEffect(() => {
    setEnabled(settings.enabled);
    setGistId(settings.gistId ?? '');
    setFilename(settings.filename);
    setToken('');
  }, [settings]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const patch = {
      enabled,
      gistId: gistId.trim(),
      filename: filename.trim() || 'open-tabtab-backup.json',
      ...(token.trim() ? { token: token.trim() } : {}),
    };

    void saveSettings(patch);
    setToken('');
  }

  return (
    <form className="settings-section" onSubmit={handleSubmit}>
      <h3>Gist Sync</h3>
      <label className="field-row">
        <span>Enable sync</span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
      </label>
      <label className="field-stack">
        <span>GitHub token</span>
        <input
          className="text-input"
          type="password"
          autoComplete="off"
          placeholder={settings.hasToken ? 'Token saved' : 'Paste fine-grained PAT'}
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
      </label>
      <div className="settings-actions">
        <span className="settings-hint">{settings.hasToken ? 'Token saved' : 'No token saved'}</span>
        {settings.hasToken ? (
          <button type="button" className="text-btn danger" onClick={() => void saveSettings({ clearToken: true })}>
            Clear token
          </button>
        ) : null}
      </div>
      <label className="field-stack">
        <span>Gist ID</span>
        <input
          className="text-input"
          value={gistId}
          placeholder="Paste existing Gist ID"
          onChange={(event) => setGistId(event.target.value)}
        />
      </label>
      <label className="field-stack">
        <span>Backup filename</span>
        <input
          className="text-input"
          value={filename}
          onChange={(event) => setFilename(event.target.value)}
        />
      </label>
      <div className="settings-actions">
        <button type="submit" className="btn btn-primary">Save sync settings</button>
        <button type="button" className="btn" onClick={() => void testConnection()}>Test connection</button>
        <button type="button" className="btn" onClick={() => void createGist()}>Create new private Gist</button>
      </div>
    </form>
  );
}
