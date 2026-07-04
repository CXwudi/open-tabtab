import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CommandBus, PublicGistSettings } from '@/src/messaging/protocol';
import { CommandBusProvider } from '../../hooks/useSnapshot';
import AppearanceSettings from './AppearanceSettings';

afterEach(cleanup);

const settings: PublicGistSettings = {
  enabled: true,
  gistId: 'gist-1',
  filename: 'backup.json',
  themeMode: 'system',
  hasToken: true,
};

function renderAppearance(overrides: Partial<PublicGistSettings> = {}) {
  const dispatch = vi.fn(async () => ({ ok: true }));
  const bus = { dispatch, subscribe: () => () => {} } as unknown as CommandBus;

  render(
    <CommandBusProvider bus={bus}>
      <AppearanceSettings settings={{ ...settings, ...overrides }} />
    </CommandBusProvider>,
  );

  return dispatch;
}

describe('AppearanceSettings', () => {
  it('selects the current theme mode from settings', () => {
    renderAppearance({ themeMode: 'light' });

    expect((screen.getByLabelText('Theme') as HTMLSelectElement).value).toBe('light');
  });

  it('dispatches only a theme mode patch when choosing dark', async () => {
    const user = userEvent.setup();
    const dispatch = renderAppearance();

    await user.selectOptions(screen.getByLabelText('Theme'), 'dark');

    expect(dispatch).toHaveBeenCalledWith({
      type: 'setGistSettings',
      patch: { themeMode: 'dark' },
    });
  });
});
