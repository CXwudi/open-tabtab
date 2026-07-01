import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CommandBus } from '@/src/messaging/protocol';
import { CommandBusProvider } from '../../hooks/useSnapshot';
import ConflictBanner from './ConflictBanner';

afterEach(cleanup);

function renderBanner() {
  const dispatch = vi.fn(async () => ({ ok: true }));
  const bus = { dispatch, subscribe: () => () => {} } as unknown as CommandBus;
  render(
    <CommandBusProvider bus={bus}>
      <ConflictBanner lastError="Both sides changed" />
    </CommandBusProvider>,
  );
  return dispatch;
}

describe('ConflictBanner', () => {
  it('dispatches useLocal resolution', async () => {
    const user = userEvent.setup();
    const dispatch = renderBanner();

    await user.click(screen.getByRole('button', { name: 'Replace remote with local' }));

    expect(dispatch).toHaveBeenCalledWith({ type: 'resolveConflict', resolution: 'useLocal' });
  });

  it('dispatches useRemote resolution', async () => {
    const user = userEvent.setup();
    const dispatch = renderBanner();

    await user.click(screen.getByRole('button', { name: 'Replace local with remote' }));

    expect(dispatch).toHaveBeenCalledWith({ type: 'resolveConflict', resolution: 'useRemote' });
  });
});
