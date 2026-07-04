import { useEffect } from 'react';
import type { ThemeMode } from '@/src/storage/settings';

/**
 * Resolves a theme mode + OS preference into a concrete light/dark value.
 *
 * Explicit `light`/`dark` overrides always win. `system` delegates to the
 * OS-level preference.
 */
export function resolveThemeMode(
  mode: ThemeMode,
  prefersDark: boolean,
): 'light' | 'dark' {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  // system: fall back to light when OS preference is not available
  return prefersDark ? 'dark' : 'light';
}

/** Writes the resolved theme to `document.documentElement.dataset.theme`. */
function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.dataset.theme = theme;
}

/**
 * React hook that keeps `document.documentElement.dataset.theme` in sync
 * with the chosen {@link ThemeMode}.
 *
 * - `system`: listens for live OS changes via `matchMedia`; cleans up on unmount.
 * - `light` / `dark`: applies immediately and ignores OS changes.
 * - Missing `matchMedia` (non-browser env) resolves `system` -> `light`.
 */
export function useThemeMode(mode: ThemeMode): void {
  useEffect(() => {
    if (mode === 'light' || mode === 'dark') {
      applyTheme(mode);
      return;
    }

    // system mode
    if (typeof window === 'undefined' || !window.matchMedia) {
      applyTheme('light');
      return;
    }

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    applyTheme(resolveThemeMode('system', mql.matches));

    const onChange = (e: MediaQueryListEvent) => {
      applyTheme(resolveThemeMode('system', e.matches));
    };

    mql.addEventListener('change', onChange);

    return () => {
      mql.removeEventListener('change', onChange);
    };
  }, [mode]);
}
