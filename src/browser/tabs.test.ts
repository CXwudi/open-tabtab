import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser, type Browser } from 'wxt/browser';
import { closeTabs, getSelfTabId, openTab, openTabs, queryCurrentWindowTabs } from './tabs';
import { subscribeToTabChanges } from './live-tabs';

describe('browser tab wrappers', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
    vi.stubGlobal('browser', fakeBrowser);
  });

  it('queries and normalizes current-window tabs', async () => {
    await fakeBrowser.windows.create({ focused: true });
    const first = await fakeBrowser.tabs.create({ url: 'https://example.com/a', pinned: true });
    const updateTab = fakeBrowser.tabs.update as unknown as (
      tabId: number,
      updateProperties: Record<string, unknown>,
    ) => Promise<Browser.tabs.Tab>;

    await updateTab(first.id!, {
      title: 'Example A',
      favIconUrl: 'https://example.com/favicon.ico',
    });
    await fakeBrowser.tabs.create({ url: 'https://example.com/b' });

    const tabs = await queryCurrentWindowTabs();

    expect(tabs).toEqual(
      expect.arrayContaining([
        {
          id: first.id,
          title: 'Example A',
          url: 'https://example.com/a',
          favIconUrl: 'https://example.com/favicon.ico',
          pinned: true,
        },
        expect.objectContaining({
          title: 'https://example.com/b',
          url: 'https://example.com/b',
          pinned: false,
        }),
      ]),
    );
  });

  it('opens and closes tabs', async () => {
    await fakeBrowser.windows.create({ focused: true });
    const opened = await openTab('https://example.com/new', { active: false });
    const group = await openTabs(['https://example.com/one', 'https://example.com/two']);

    expect(opened.url).toBe('https://example.com/new');
    expect(group.map((tab) => tab.url)).toEqual(['https://example.com/one', 'https://example.com/two']);

    const remove = vi.spyOn(browser.tabs, 'remove').mockResolvedValue(undefined);
    const ids = group.map((tab) => tab.id!);

    await closeTabs(ids);

    expect(remove).toHaveBeenCalledWith(ids);
  });

  it('finds the current extension tab before scanning URLs', async () => {
    vi.spyOn(browser.tabs, 'getCurrent').mockImplementation(
      () => Promise.resolve({ id: 42 } as Browser.tabs.Tab) as never,
    );

    await expect(getSelfTabId()).resolves.toBe(42);
  });

  it('falls back to extension and chrome new-tab URLs', async () => {
    await fakeBrowser.windows.create({ focused: true });
    vi.spyOn(browser.tabs, 'getCurrent').mockImplementation(() => Promise.resolve(undefined) as never);
    const extensionTab = await fakeBrowser.tabs.create({ url: browser.runtime.getURL('/newtab.html') });

    await expect(getSelfTabId()).resolves.toBe(extensionTab.id);
  });

  it('debounces live tab change notifications', async () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    const unsubscribe = subscribeToTabChanges(cb);

    await fakeBrowser.tabs.onCreated.trigger({ id: 99, windowId: 1, index: 0, pinned: false } as Browser.tabs.Tab);
    await fakeBrowser.tabs.onUpdated.trigger(99, {}, { id: 99 } as Browser.tabs.Tab);

    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(cb).toHaveBeenCalledTimes(1);

    unsubscribe();
    vi.useRealTimers();
  });
});
