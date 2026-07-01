import { openTabs } from './tabs';

export type TabGroupColor = 'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan' | 'orange';

type ChromeTabGroupApi = {
  tabs: {
    group(options: { tabIds: number[] }): Promise<number> | number;
  };
  tabGroups: {
    update(groupId: number, options: { title: string; color: TabGroupColor }): Promise<unknown> | unknown;
  };
};

/**
 * Opens URLs and restores them as one native Chromium tab group.
 *
 * `@webext-core/fake-browser` does not model `chrome.tabs.group` or
 * `chrome.tabGroups`; Brave validation is deferred to Task 11.
 */
export async function openAsTabGroup(
  name: string,
  urls: string[],
  color: TabGroupColor = 'blue',
): Promise<number | undefined> {
  const tabs = await openTabs(urls);
  const tabIds = tabs
    .map((tab) => tab.id)
    .filter((id): id is number => typeof id === 'number');

  if (tabIds.length === 0) {
    return undefined;
  }

  const chromeApi = (globalThis as typeof globalThis & { chrome: ChromeTabGroupApi }).chrome;
  const groupId = await chromeApi.tabs.group({ tabIds });
  await chromeApi.tabGroups.update(groupId, { title: name, color });

  return groupId;
}
