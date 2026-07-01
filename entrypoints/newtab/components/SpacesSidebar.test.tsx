import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CommandBus } from '@/src/messaging/protocol';
import type { Workspace } from '@/src/domain/types';
import { CommandBusProvider } from '../hooks/useSnapshot';
import SpacesSidebar from './SpacesSidebar';

afterEach(cleanup);

function makeBus(dispatch = vi.fn(async () => ({ ok: true }))): CommandBus {
  return { dispatch, subscribe: () => () => {} } as unknown as CommandBus;
}

const workspace: Workspace = {
  version: 1,
  spaceOrder: ['s1', 's2'],
  spaces: {
    s1: { id: 's1', name: 'Alpha', groups: [] },
    s2: { id: 's2', name: 'Beta', groups: [] },
  },
};

function renderSidebar(dispatch = vi.fn(async () => ({ ok: true }))) {
  const bus = makeBus(dispatch);
  render(
    <CommandBusProvider bus={bus}>
      <SpacesSidebar workspace={workspace} selectedSpaceId="s1" onSelectSpace={() => {}} />
    </CommandBusProvider>,
  );
  return dispatch;
}

describe('SpacesSidebar', () => {
  it('dispatches createSpace when adding a space', async () => {
    const user = userEvent.setup();
    const dispatch = renderSidebar();

    await user.click(screen.getByRole('button', { name: 'Add space' }));

    expect(dispatch).toHaveBeenCalledWith({ type: 'createSpace', name: 'New Space' });
  });

  it('dispatches renameSpace after inline editing', async () => {
    const user = userEvent.setup();
    const dispatch = renderSidebar();

    await user.click(screen.getByRole('button', { name: 'Actions for Alpha' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'Renamed{Enter}');

    expect(dispatch).toHaveBeenCalledWith({ type: 'renameSpace', spaceId: 's1', name: 'Renamed' });
  });

  it('dispatches deleteSpace after confirming', async () => {
    const user = userEvent.setup();
    const dispatch = renderSidebar();

    await user.click(screen.getByRole('button', { name: 'Actions for Beta' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(dispatch).toHaveBeenCalledWith({ type: 'deleteSpace', spaceId: 's2' });
  });
});
