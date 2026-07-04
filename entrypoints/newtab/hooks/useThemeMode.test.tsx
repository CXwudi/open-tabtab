import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { resolveThemeMode, useThemeMode } from './useThemeMode';
import type { ThemeMode } from '@/src/storage/settings';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

// helpers

type MatchMediaMock = ReturnType<typeof createMatchMediaMock>;

function createMatchMediaMock(initialMatches: boolean) {
  // jsdom provides window.matchMedia but returns a stub that does nothing.
  // We replace it so we can fire change events and assert on listeners.
  const listeners = new Set<(e: MediaQueryListEvent) => void>();

  // Use a mutable matches field (MediaQueryList.matches is read-only in TS).
  let _matches = initialMatches;

  const mql = {
    get matches() { return _matches; },
    media: '(prefers-color-scheme: dark)',
    onchange: null as ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null,
    addEventListener: vi.fn((_type: string, fn: EventListenerOrEventListenerObject) => {
      listeners.add(fn as (e: MediaQueryListEvent) => void);
    }),
    removeEventListener: vi.fn((_type: string, fn: EventListenerOrEventListenerObject) => {
      listeners.delete(fn as (e: MediaQueryListEvent) => void);
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  } as MediaQueryList;

  const fireChange = (matches: boolean) => {
    _matches = matches;
    // jsdom doesn't expose MediaQueryListEvent; a plain object with .matches
    // is enough -- the listener only destructures e.matches.
    const event = { matches, media: mql.media } as MediaQueryListEvent;
    for (const listener of listeners) {
      listener(event);
    }
  };

  return { mql, fireChange, listeners };
}

function installMatchMedia(mock: MatchMediaMock) {
  vi.stubGlobal('matchMedia', vi.fn(() => mock.mql));
}

// resolveThemeMode (pure helper)

describe('resolveThemeMode', () => {
  it('returns light for explicit light mode regardless of OS', () => {
    expect(resolveThemeMode('light', false)).toBe('light');
    expect(resolveThemeMode('light', true)).toBe('light');
  });

  it('returns dark for explicit dark mode regardless of OS', () => {
    expect(resolveThemeMode('dark', false)).toBe('dark');
    expect(resolveThemeMode('dark', true)).toBe('dark');
  });

  it('returns light for system mode when OS is light', () => {
    expect(resolveThemeMode('system', false)).toBe('light');
  });

  it('returns dark for system mode when OS is dark', () => {
    expect(resolveThemeMode('system', true)).toBe('dark');
  });
});

// useThemeMode hook

describe('useThemeMode', () => {
  it('sets data-theme="light" for explicit light mode', () => {
    renderHook(() => useThemeMode('light'));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('sets data-theme="dark" for explicit dark mode', () => {
    renderHook(() => useThemeMode('dark'));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('sets data-theme="light" for system mode when OS is light', () => {
    const mock = createMatchMediaMock(false);
    installMatchMedia(mock);
    renderHook(() => useThemeMode('system'));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('sets data-theme="dark" for system mode when OS is dark', () => {
    const mock = createMatchMediaMock(true);
    installMatchMedia(mock);
    renderHook(() => useThemeMode('system'));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('updates data-theme on OS change while in system mode', () => {
    const mock = createMatchMediaMock(false);
    installMatchMedia(mock);
    renderHook(() => useThemeMode('system'));

    expect(document.documentElement.dataset.theme).toBe('light');

    // Simulate OS switching to dark.
    mock.fireChange(true);
    expect(document.documentElement.dataset.theme).toBe('dark');

    // Simulate OS switching back to light.
    mock.fireChange(false);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('registers a change listener on matchMedia when in system mode', () => {
    const mock = createMatchMediaMock(false);
    installMatchMedia(mock);
    renderHook(() => useThemeMode('system'));
    expect(mock.mql.addEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
  });

  it('removes the change listener on unmount', () => {
    const mock = createMatchMediaMock(false);
    installMatchMedia(mock);
    const { unmount } = renderHook(() => useThemeMode('system'));

    expect(mock.mql.removeEventListener).not.toHaveBeenCalled();

    unmount();

    expect(mock.mql.removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
  });

  it('removes the change listener when switching from system to explicit mode', () => {
    const mock = createMatchMediaMock(false);
    installMatchMedia(mock);
    const { rerender } = renderHook(({ mode }: { mode: ThemeMode }) => useThemeMode(mode), {
      initialProps: { mode: 'system' },
    });

    expect(mock.mql.addEventListener).toHaveBeenCalledTimes(1);
    expect(mock.mql.removeEventListener).not.toHaveBeenCalled();

    // Switch to explicit light.
    rerender({ mode: 'light' });

    expect(mock.mql.removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
    expect(document.documentElement.dataset.theme).toBe('light');

    // OS changes should be ignored.
    mock.fireChange(true);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('does not register a listener for explicit light mode', () => {
    const mock = createMatchMediaMock(false);
    installMatchMedia(mock);
    renderHook(() => useThemeMode('light'));
    expect(mock.mql.addEventListener).not.toHaveBeenCalled();
  });

  it('does not register a listener for explicit dark mode', () => {
    const mock = createMatchMediaMock(false);
    installMatchMedia(mock);
    renderHook(() => useThemeMode('dark'));
    expect(mock.mql.addEventListener).not.toHaveBeenCalled();
  });

  it('falls back to light when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    renderHook(() => useThemeMode('system'));
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
