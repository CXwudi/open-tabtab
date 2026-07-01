import { describe, expect, it } from 'vitest';
import type { BrowserTab } from '@/src/browser/tabs';
import { buildStashPlan } from './stash';

describe('buildStashPlan', () => {
  it('excludes pinned tabs, the extension tab, tabs without ids, and tabs without URLs', () => {
    const tabs: BrowserTab[] = [
      { id: 1, title: 'Self', url: 'chrome://newtab/', pinned: false },
      { id: 2, title: 'Pinned', url: 'https://pinned.example', pinned: true },
      { id: 3, title: 'Keep', url: 'https://keep.example', favIconUrl: 'https://keep.example/icon.png', pinned: false },
      { title: 'No id', url: 'https://no-id.example', pinned: false },
      { id: 4, title: 'No URL', url: '', pinned: false },
    ];

    const plan = buildStashPlan(tabs, 1, new Date(2026, 6, 1, 9, 5));

    expect(plan).toEqual({
      groupName: 'Stash 2026-07-01 09:05',
      idsToClose: [3],
      tabs: [
        {
          title: 'Keep',
          url: 'https://keep.example',
          favIconUrl: 'https://keep.example/icon.png',
        },
      ],
    });
  });

  it('falls back to the URL when a tab title is empty', () => {
    const tabs: BrowserTab[] = [
      { id: 1, title: '', url: 'https://untitled.example', pinned: false },
    ];

    expect(buildStashPlan(tabs, undefined, new Date(2026, 0, 2, 3, 4)).tabs).toEqual([
      {
        title: 'https://untitled.example',
        url: 'https://untitled.example',
        favIconUrl: undefined,
      },
    ]);
  });
});
