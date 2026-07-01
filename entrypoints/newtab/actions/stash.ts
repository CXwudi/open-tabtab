import type { BrowserTab } from '@/src/browser/tabs';

export type StashPlan = {
  groupName: string;
  tabs: { title: string; url: string; favIconUrl?: string }[];
  idsToClose: number[];
};

/** Builds the save payload and close list for the stash-all action. */
export function buildStashPlan(
  liveTabs: BrowserTab[],
  selfTabId: number | undefined,
  now = new Date(),
): StashPlan {
  const stashed = liveTabs.filter((tab) => {
    if (tab.pinned) return false;
    if (tab.id == null) return false;
    if (tab.id === selfTabId) return false;
    return tab.url.trim().length > 0;
  });

  return {
    groupName: `Stash ${formatTimestamp(now)}`,
    tabs: stashed.map((tab) => ({
      title: tab.title || tab.url,
      url: tab.url,
      favIconUrl: tab.favIconUrl,
    })),
    idsToClose: stashed.map((tab) => tab.id!).filter((id): id is number => typeof id === 'number'),
  };
}

/** Formats a local timestamp for stash group names. */
function formatTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/** Pads a timestamp component to two digits. */
function pad(value: number): string {
  return String(value).padStart(2, '0');
}
