import { browser, type Browser } from 'wxt/browser';

export type BrowserTab = {
  id?: number;
  title: string;
  url: string;
  favIconUrl?: string;
  pinned: boolean;
};

export type OpenTabOptions = {
  active?: boolean;
};

/** Returns normalized tabs for the current browser window. */
export async function queryCurrentWindowTabs(): Promise<BrowserTab[]> {
  const tabs = await browser.tabs.query({ currentWindow: true });

  return tabs.map(toBrowserTab);
}

/** Opens one URL in a browser tab. */
export async function openTab(url: string, options: OpenTabOptions = {}): Promise<Browser.tabs.Tab> {
  return browser.tabs.create({
    url,
    active: options.active ?? true,
  });
}

/** Opens URLs sequentially so created tab ids preserve URL order. */
export async function openTabs(urls: string[]): Promise<Browser.tabs.Tab[]> {
  const opened: Browser.tabs.Tab[] = [];

  for (const url of urls) {
    opened.push(await openTab(url, { active: false }));
  }

  return opened;
}

/** Closes browser tabs by id. */
export async function closeTabs(ids: number[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  await browser.tabs.remove(ids);
}

/** Resolves the extension page tab id when running from the new-tab page. */
export async function getSelfTabId(): Promise<number | undefined> {
  const current = await browser.tabs.getCurrent?.();

  if (current?.id != null) {
    return current.id;
  }

  const extensionNewTabUrl = browser.runtime.getURL('/newtab.html');
  const tabs = await browser.tabs.query({ currentWindow: true });
  const selfTab = tabs.find((tab) => tab.url === extensionNewTabUrl || tab.url === 'chrome://newtab/');

  return selfTab?.id;
}

function toBrowserTab(tab: Browser.tabs.Tab): BrowserTab {
  return {
    id: tab.id,
    title: tab.title || tab.url || 'Untitled',
    url: tab.url || '',
    favIconUrl: tab.favIconUrl,
    pinned: tab.pinned ?? false,
  };
}
