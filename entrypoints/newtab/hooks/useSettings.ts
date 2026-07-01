import { useCallback } from 'react';
import type { CommandResult, GistSettingsPatch } from '@/src/messaging/protocol';
import { useDispatch } from './useSnapshot';

/** Returns command helpers for settings and sync controls. */
export function useSettings(): {
  saveSettings: (patch: GistSettingsPatch) => Promise<CommandResult>;
  createGist: () => Promise<CommandResult>;
  testConnection: () => Promise<CommandResult>;
  pullNow: () => Promise<CommandResult>;
  pushNow: () => Promise<CommandResult>;
} {
  const dispatch = useDispatch();

  return {
    saveSettings: useCallback((patch) => dispatch({ type: 'setGistSettings', patch }), [dispatch]),
    createGist: useCallback(() => dispatch({ type: 'createGist' }), [dispatch]),
    testConnection: useCallback(() => dispatch({ type: 'testConnection' }), [dispatch]),
    pullNow: useCallback(() => dispatch({ type: 'pullNow' }), [dispatch]),
    pushNow: useCallback(() => dispatch({ type: 'pushNow' }), [dispatch]),
  };
}
