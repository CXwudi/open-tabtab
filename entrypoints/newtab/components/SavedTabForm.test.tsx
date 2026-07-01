import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SavedTabForm from './SavedTabForm';

afterEach(cleanup);

describe('SavedTabForm', () => {
  it('submits trimmed title and url in create mode', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SavedTabForm mode="add" onSubmit={onSubmit} onCancel={() => {}} />);

    await user.type(screen.getByLabelText('Tab URL'), 'https://example.com');
    await user.type(screen.getByLabelText('Tab title'), 'Example');
    await user.click(screen.getByRole('button', { name: 'Add tab' }));

    expect(onSubmit).toHaveBeenCalledWith({ title: 'Example', url: 'https://example.com' });
  });

  it('does not submit without a url', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SavedTabForm mode="add" onSubmit={onSubmit} onCancel={() => {}} />);

    await user.type(screen.getByLabelText('Tab title'), 'Only title');
    await user.click(screen.getByRole('button', { name: 'Add tab' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<SavedTabForm mode="add" onSubmit={() => {}} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
