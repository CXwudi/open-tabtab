import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SavedTab } from '@/src/domain/types';
import SavedTabCard from './SavedTabCard';

afterEach(cleanup);

const tab: SavedTab = {
  id: 't1',
  title: 'Example',
  url: 'https://example.com',
  kind: 'record',
};

describe('SavedTabCard', () => {
  it('invokes onOpen when the card is clicked', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <SavedTabCard
        spaceId="s1"
        groupId="g1"
        tab={tab}
        orderedIds={['t1']}
        groupTabOrders={{ 's1:g1': ['t1'] }}
        onOpen={onOpen}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );

    await user.click(screen.getByText('Example'));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('invokes onEdit from the menu', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onEdit = vi.fn();
    render(
      <SavedTabCard
        spaceId="s1"
        groupId="g1"
        tab={tab}
        orderedIds={['t1']}
        groupTabOrders={{ 's1:g1': ['t1'] }}
        onOpen={onOpen}
        onEdit={onEdit}
        onDelete={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions for Example' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('invokes onDelete from the menu', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    render(
      <SavedTabCard
        spaceId="s1"
        groupId="g1"
        tab={tab}
        orderedIds={['t1']}
        groupTabOrders={{ 's1:g1': ['t1'] }}
        onOpen={onOpen}
        onEdit={() => {}}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions for Example' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
