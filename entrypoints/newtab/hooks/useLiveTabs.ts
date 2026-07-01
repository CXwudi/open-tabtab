import { useEffect, useState } from 'react';
import { queryCurrentWindowTabs, type BrowserTab } from '@/src/browser/tabs';
import { subscribeToTabChanges } from '@/src/browser/live-tabs';

/** Keeps a React view of the current browser window's tabs. */
export function useLiveTabs(): BrowserTab[] {
  const [tabs, setTabs] = useState<BrowserTab[]>([]);

  useEffect(() => {
    let active = true;

    const refresh = () => {
      void queryCurrentWindowTabs()
        .then((next) => {
          if (active) setTabs(next);
        })
        .catch(() => {
          if (active) setTabs([]);
        });
    };

    refresh();
    const unsubscribe = subscribeToTabChanges(refresh);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return tabs;
}
