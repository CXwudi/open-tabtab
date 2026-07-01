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
  it('invokes onEdit from the menu', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<SavedTabCard tab={tab} onEdit={onEdit} onDelete={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'Actions for Example' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));

    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('invokes onDelete from the menu', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<SavedTabCard tab={tab} onEdit={() => {}} onDelete={onDelete} />);

    await user.click(screen.getByRole('button', { name: 'Actions for Example' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
