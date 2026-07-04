/** Theme mode: follows the OS, or forces light/dark. */
export type ThemeMode = 'system' | 'light' | 'dark';

export type GistSettings = {
  enabled: boolean;
  token?: string;
  gistId?: string;
  filename: string;
  /** Preferred theme mode. Defaults to 'system' for existing users. */
  themeMode: ThemeMode;
};
