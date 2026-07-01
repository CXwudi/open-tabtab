import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CommandBus } from '@/src/messaging/protocol';
import type { Group } from '@/src/domain/types';
import { CommandBusProvider } from '../hooks/useSnapshot';
import GroupRow from './GroupRow';

afterEach(cleanup);

function makeBus(dispatch: ReturnType<typeof vi.fn>): CommandBus {
  return { dispatch, subscribe: () => () => {} } as unknown as CommandBus;
}

const group: Group = {
  id: 'g1',
  name: 'Tools',
  tabs: [{ id: 't1', title: 'Example', url: 'https://example.com', kind: 'record' }],
};

function renderRow() {
  const dispatch = vi.fn(async () => ({ ok: true }));
  render(
    <CommandBusProvider bus={makeBus(dispatch)}>
      <GroupRow
        spaceId="s1"
        group={group}
        tabs={group.tabs}
        groupOrder={['g1']}
        groupTabOrders={{ 's1:g1': ['t1'] }}
      />
    </CommandBusProvider>,
  );
  return dispatch;
}

describe('GroupRow', () => {
  it('dispatches renameGroup after inline editing', async () => {
    const user = userEvent.setup();
    const dispatch = renderRow();

    await user.click(screen.getByRole('button', { name: 'Actions for Tools' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'Utilities{Enter}');

    expect(dispatch).toHaveBeenCalledWith({
      type: 'renameGroup',
      spaceId: 's1',
      groupId: 'g1',
      name: 'Utilities',
    });
  });

  it('dispatches deleteGroup after confirming', async () => {
    const user = userEvent.setup();
    const dispatch = renderRow();

    await user.click(screen.getByRole('button', { name: 'Actions for Tools' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(dispatch).toHaveBeenCalledWith({ type: 'deleteGroup', spaceId: 's1', groupId: 'g1' });
  });

  it('opens the form and dispatches createSavedTab on submit', async () => {
    const user = userEvent.setup();
    const dispatch = renderRow();

    await user.click(screen.getByRole('button', { name: '+ add tab' }));
    await user.type(screen.getByLabelText('Tab URL'), 'https://new.example');
    await user.type(screen.getByLabelText('Tab title'), 'New Tab');
    await user.click(screen.getByRole('button', { name: 'Add tab' }));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'createSavedTab',
      spaceId: 's1',
      groupId: 'g1',
      title: 'New Tab',
      url: 'https://new.example',
    });
  });
});
