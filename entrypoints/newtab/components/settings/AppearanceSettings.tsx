import type { ChangeEvent } from 'react';
import type { PublicGistSettings } from '@/src/messaging/protocol';
import type { ThemeMode } from '@/src/storage/settings';
import { useSettings } from '../../hooks/useSettings';

type AppearanceSettingsProps = {
  settings: PublicGistSettings;
};

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Compact controls for local appearance preferences. */
export default function AppearanceSettings({ settings }: AppearanceSettingsProps) {
  const { saveSettings } = useSettings();

  function handleThemeChange(event: ChangeEvent<HTMLSelectElement>) {
    void saveSettings({ themeMode: event.target.value as ThemeMode });
  }

  return (
    <section className="settings-section">
      <h3>Appearance</h3>
      <label className="field-row">
        <span>Theme</span>
        <select
          className="select-input"
          value={settings.themeMode}
          onChange={handleThemeChange}
        >
          {THEME_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
