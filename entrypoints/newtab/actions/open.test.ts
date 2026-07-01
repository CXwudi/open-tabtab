import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openAsTabGroup } from '@/src/browser/tab-groups';
import { openTab, openTabs } from '@/src/browser/tabs';
import { openSavedGroup, openSavedGroupAsNativeGroup, openSavedTab } from './open';

vi.mock('@/src/browser/tabs', () => ({
  openTab: vi.fn(),
  openTabs: vi.fn(),
}));

vi.mock('@/src/browser/tab-groups', () => ({
  openAsTabGroup: vi.fn(),
}));

describe('open actions', () => {
  beforeEach(() => {
    vi.mocked(openTab).mockReset();
    vi.mocked(openTabs).mockReset();
    vi.mocked(openAsTabGroup).mockReset();
  });

  it('opens saved tabs active by default and in the background when requested', async () => {
    await openSavedTab('https://example.com');
    await openSavedTab('https://example.com/bg', { background: true });

    expect(openTab).toHaveBeenNthCalledWith(1, 'https://example.com', { active: true });
    expect(openTab).toHaveBeenNthCalledWith(2, 'https://example.com/bg', { active: false });
  });

  it('opens saved groups and skips empty groups', async () => {
    await openSavedGroup([]);
    await openSavedGroup(['https://example.com/one']);

    expect(openTabs).toHaveBeenCalledTimes(1);
    expect(openTabs).toHaveBeenCalledWith(['https://example.com/one']);
  });

  it('opens native tab groups and skips empty groups', async () => {
    await openSavedGroupAsNativeGroup('Empty', []);
    await openSavedGroupAsNativeGroup('Docs', ['https://example.com/docs']);

    expect(openAsTabGroup).toHaveBeenCalledTimes(1);
    expect(openAsTabGroup).toHaveBeenCalledWith('Docs', ['https://example.com/docs']);
  });
});
