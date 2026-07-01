import { openAsTabGroup } from '@/src/browser/tab-groups';
import { openTab, openTabs } from '@/src/browser/tabs';

export type OpenSavedTabOptions = {
  background?: boolean;
};

/** Opens one saved tab, optionally in the background for Ctrl/Cmd-click. */
export async function openSavedTab(url: string, options: OpenSavedTabOptions = {}): Promise<void> {
  await openTab(url, { active: !(options.background ?? false) });
}

/** Opens every saved tab URL in a collection. */
export async function openSavedGroup(urls: string[]): Promise<void> {
  if (urls.length === 0) return;

  await openTabs(urls);
}

/** Opens saved tab URLs as a native Chromium tab group. */
export async function openSavedGroupAsNativeGroup(name: string, urls: string[]): Promise<void> {
  if (urls.length === 0) return;

  await openAsTabGroup(name, urls);
}
